const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middleware/authMiddleware'); 
const crypto = require('crypto'); 

// Fungsi ini menerima dbPool
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar untuk menguji koneksi
    router.get('/', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Order Service siap digunakan." });
    });

    // =======================================================
    // 1. POST /orders: MEMBUAT PESANAN BARU (CHECKOUT)
    // =======================================================
    router.post('/orders', authenticateToken, async (req, res) => {
        // Asumsi body berisi { items: [{ product_id, quantity }], address_id, shipping_provider }
        const { items, address_id, shipping_provider } = req.body;
        const user_id = req.user.id;
        
        if (!items || items.length === 0 || !address_id) {
            return res.status(400).json({ status: "Gagal", error: "Item pesanan dan alamat wajib diisi." });
        }
        
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');

            // 1. Ambil detail alamat user
            const addressResult = await client.query('SELECT address_line, city, postal_code FROM addresses WHERE id = $1 AND user_id = $2', [address_id, user_id]);
            
            if (addressResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ status: "Gagal", error: "Alamat tidak ditemukan atau bukan milik Anda." });
            }
            
            const shipping_address_snapshot = `${addressResult.rows[0].address_line}, ${addressResult.rows[0].city}, ${addressResult.rows[0].postal_code}`;
            let total_amount = 0;
            // Generate ID pesanan unik
            const order_id = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            
            const orderItemsToInsert = [];

            // 2. Loop, cek stok, dan hitung total
            for (const item of items) {
                const productResult = await client.query('SELECT store_id, price, stock_quantity, is_active FROM products WHERE id = $1', [item.product_id]);
                const product = productResult.rows[0];

                if (!product || !product.is_active || product.stock_quantity < item.quantity) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ status: "Gagal", error: `Stok atau ketersediaan produk ID ${item.product_id} tidak valid.` });
                }

                const price_per_item = parseFloat(product.price);
                total_amount += price_per_item * item.quantity;

                orderItemsToInsert.push({
                    order_id,
                    product_id: item.product_id,
                    store_id: product.store_id,
                    quantity: item.quantity,
                    price_per_item: price_per_item
                });

                // 3. Kurangi stok produk
                await client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [item.quantity, item.product_id]);
            }

            // 4. Masukkan ke Tabel orders (Default status: pending)
            const orderQuery = `
                INSERT INTO orders (id, user_id, total_amount, shipping_address, shipping_provider, status, created_at)
                VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
                RETURNING id, total_amount, status, created_at;
            `;
            const orderValues = [order_id, user_id, total_amount, shipping_address_snapshot, shipping_provider || 'default_courier'];
            const orderResult = await client.query(orderQuery, orderValues);

            // 5. Masukkan ke Tabel order_items
            const itemInserts = orderItemsToInsert.map(item =>
                client.query(
                    `INSERT INTO order_items (order_id, product_id, store_id, quantity, price_per_item) VALUES ($1, $2, $3, $4, $5)`,
                    [item.order_id, item.product_id, item.store_id, item.quantity, item.price_per_item]
                )
            );
            await Promise.all(itemInserts);
            
            await client.query('COMMIT');

            res.status(201).json({ 
                status: "Sukses", 
                message: "Pesanan berhasil dibuat. Status: pending.",
                order: orderResult.rows[0],
                items_count: orderItemsToInsert.length
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error saat membuat pesanan:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan transaksi server saat checkout.", details: err.message });
        } finally {
            client.release();
        }
    });

    router.get('/orders', authenticateToken, async (req, res) => {
        const user_id = req.user.id;
        try {
            const queryText = `
                SELECT id, total_amount, status, created_at 
                FROM orders 
                WHERE user_id = $1 
                ORDER BY created_at DESC;
            `;
            const result = await dbPool.query(queryText, [user_id]);

            res.status(200).json({
                status: "Sukses",
                total_orders: result.rowCount,
                orders: result.rows
            });

        } catch (err) {
            console.error('Error saat mengambil pesanan user:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil daftar pesanan.", details: err.message });
        }
    });

    // =======================================================
    // 3. PUT /orders/:id/status: UPDATE STATUS PESANAN (Seller/Admin)
    // =======================================================
    router.put('/orders/:id/status', authenticateToken, authorizeRole(['seller', 'admin']), async (req, res) => {
        const orderId = req.params.id;
        const { new_status } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');

            const orderInfoQuery = `
                SELECT 
                    o.status, o.total_amount, o.user_id, oi.id as item_id,
                    oi.store_id, oi.price_per_item, oi.quantity, p.id as product_id
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.id = $1;
            `;
            const orderItems = (await client.query(orderInfoQuery, [orderId])).rows;
            if (orderItems.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ status: "Gagal", error: "Pesanan tidak ditemukan." });
            }

            // Cek Otorisasi Penjual: Jika bukan Admin, pastikan user memiliki item di pesanan ini
            if (userRole === 'seller') {
                const sellerHasItems = orderItems.some(item => item.store_id === userId); 
                if (!sellerHasItems) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ status: "Gagal", error: "Akses ditolak. Anda bukan pemilik toko dari item di pesanan ini." });
                }
            }
            
            // Logika Keuangan KRITIS: Jika status berubah menjadi 'delivered'
            if (new_status === 'delivered') {
                for (const item of orderItems) {
                    const creditAmount = item.price_per_item * item.quantity;
                    
                    // A. Kredit Saldo Penjual
                    await client.query(
                        'INSERT INTO seller_balances (store_id, available_balance, pending_balance, last_updated) VALUES ($1, $2, 0, NOW()) ON CONFLICT (store_id) DO UPDATE SET available_balance = seller_balances.available_balance + $2, last_updated = NOW()',
                        [item.store_id, creditAmount]
                    );

                    // B. Catat Transaksi 'sale'
                    await client.query(
                        `INSERT INTO transactions (store_id, order_item_id, type, amount, description, created_at)
                         VALUES ($1, $2, 'sale', $3, $4, NOW())`,
                        [item.store_id, item.item_id, creditAmount, `Penjualan Item Order ${orderId}`] // Menggunakan item_id dari order_items
                    );
                }
            }

            // Update Status Pesanan Utama
            const updateOrderQuery = `
                UPDATE orders 
                SET status = $1 
                WHERE id = $2 
                RETURNING id, status;
            `;
            const updateResult = await client.query(updateOrderQuery, [new_status, orderId]);

            await client.query('COMMIT');
            
            res.status(200).json({ 
                status: "Sukses", 
                message: `Status pesanan ${orderId} berhasil diperbarui menjadi ${new_status}.`,
                order_id: orderId,
                new_status: new_status
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error saat update status pesanan:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat memproses update status pesanan.", details: err.message });
        } finally {
            client.release();
        }
    });
// orderRoutes.js (di dalam module.exports = (dbPool) => { ... })

// ... (Router GET /orders, POST /orders, PUT /orders/:id/status yang sudah ada)

// =======================================================
// 4. GET /orders/debug-create: MEMBUAT PESANAN DUMMY UNTUK DEBUG
// =======================================================
router.get('/orders/debug-create', authenticateToken, async (req, res) => {
    // **GANTI ID INI** dengan ID Produk, Alamat, dan Pengguna yang ADA di database Anda
    const DEBUG_PRODUCT_ID = 1; 
    const DEBUG_ADDRESS_ID = 5;
    const user_id = req.user.id;
    
    // Data dummy untuk checkout
    const items = [{ product_id: DEBUG_PRODUCT_ID, quantity: 2 }];
    const address_id = DEBUG_ADDRESS_ID;
    const shipping_provider = 'JNE-Express';

    if (!user_id || !items || items.length === 0 || !address_id) {
         return res.status(400).json({ status: "Gagal", error: "Data debug (Product ID/Address ID) harus diset valid dan user harus terautentikasi." });
    }

    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');

        // --- Logika Checkout Disalin dari POST /orders ---

        // 1. Ambil detail alamat user
        const addressResult = await client.query('SELECT address_line, city, postal_code FROM addresses WHERE id = $1 AND user_id = $2', [address_id, user_id]);
        
        if (addressResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: "Gagal", error: "Alamat debug tidak ditemukan atau bukan milik Anda." });
        }
        
        const shipping_address_snapshot = `${addressResult.rows[0].address_line}, ${addressResult.rows[0].city}, ${addressResult.rows[0].postal_code}`;
        let total_amount = 0;
        const order_id = `DEBUG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; // ID unik
        const orderItemsToInsert = [];

        // 2. Loop, cek stok, dan hitung total
        for (const item of items) {
            const productResult = await client.query('SELECT store_id, price, stock_quantity, is_active FROM products WHERE id = $1', [item.product_id]);
            const product = productResult.rows[0];

            if (!product || !product.is_active || product.stock_quantity < item.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: "Gagal", error: `Stok produk ID ${item.product_id} tidak valid untuk debug.` });
            }

            const price_per_item = parseFloat(product.price);
            total_amount += price_per_item * item.quantity;

            orderItemsToInsert.push({
                order_id,
                product_id: item.product_id,
                store_id: product.store_id,
                quantity: item.quantity,
                price_per_item: price_per_item
            });

            // Kurangi stok produk
            await client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [item.quantity, item.product_id]);
        }

        // 3. Masukkan ke Tabel orders
        const orderQuery = `
            INSERT INTO orders (id, user_id, total_amount, shipping_address, shipping_provider, status, created_at)
            VALUES ($1, $2, $3, $4, $5, 'paid', NOW()) 
            RETURNING id, total_amount, status, created_at;
        `;
        const orderValues = [order_id, user_id, total_amount, shipping_address_snapshot, shipping_provider];
        const orderResult = await client.query(orderQuery, orderValues);

        // 4. Masukkan ke Tabel order_items
        const itemInserts = orderItemsToInsert.map(item =>
            client.query(
                `INSERT INTO order_items (order_id, product_id, store_id, quantity, price_per_item) VALUES ($1, $2, $3, $4, $5)`,
                [item.order_id, item.product_id, item.store_id, item.quantity, item.price_per_item]
            )
        );
        await Promise.all(itemInserts);
        
        await client.query('COMMIT');

        res.status(201).json({ 
            status: "Sukses", 
            message: "Pesanan debug berhasil dibuat dengan status Paid.",
            order: orderResult.rows[0]
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error saat membuat pesanan debug:', err.message);
        res.status(500).json({ status: "Gagal", error: "Kesalahan server saat debug checkout.", details: err.message });
    } finally {
        client.release();
    }
});
router.get('/orders/debug-address-insert', authenticateToken, async (req, res) => {
    const user_id = req.user.id; // ID pengguna Anda (yaitu 8)
    const DEBUG_ADDRESS_ID = 5; // ID yang dibutuhkan

    // Query INSERT ke tabel addresses
    const queryText = `
        INSERT INTO addresses (
            id, user_id, address_line, city, postal_code, is_primary
        ) VALUES (
            $1, $2, 'Jl. Debug No. 5, Komplek Koding', 'Jakarta', '10100', TRUE
        )
        ON CONFLICT (id) DO UPDATE 
        SET user_id = EXCLUDED.user_id 
        RETURNING id;
    `;
    
    // Gunakan ON CONFLICT (id) untuk menghindari error jika Anda menjalankannya dua kali
    
    try {
        const result = await dbPool.query(queryText, [DEBUG_ADDRESS_ID, user_id]);

        res.status(201).json({ 
            status: "Sukses", 
            message: `Alamat ID ${result.rows[0].id} berhasil disisipkan/diperbarui untuk debugging.`,
        });

    } catch (err) {
        console.error('Error saat insert alamat debug:', err.message);
        res.status(500).json({ status: "Gagal", error: "Kesalahan server saat insert alamat.", details: err.message });
    }
});
    return router;
};
