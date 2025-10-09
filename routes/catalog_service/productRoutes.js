const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middleware/authMiddleware');

// Fungsi ini menerima dbPool dari index.js
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar untuk menguji koneksi Produk
    router.get('/', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Product Routes siap digunakan. Endpoint: /products" });
    });

    // =======================================================
    // 1. POST /products: MEMBUAT PRODUK BARU (Hanya oleh Seller)
    // =======================================================
    router.post('/products', authenticateToken, authorizeRole('seller'), async (req, res) => {
        const { category_id, name, description, price, stock_quantity, sku } = req.body;
        const user_id = req.user.id; // ID Pengguna dari token
        
        if (!name || !price || stock_quantity === undefined) {
            return res.status(400).json({ status: "Gagal", error: "Nama, harga, dan kuantitas stok wajib diisi." });
        }
        
        try {
            // Cek apakah user sudah memiliki toko
            const storeResult = await dbPool.query('SELECT id FROM stores WHERE user_id = $1', [user_id]);
            if (storeResult.rowCount === 0) {
                return res.status(403).json({ status: "Gagal", error: "Anda harus membuat toko terlebih dahulu untuk menjual produk." });
            }
            const store_id = storeResult.rows[0].id;

            const queryText = `
                INSERT INTO products (store_id, category_id, name, description, price, stock_quantity, sku)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, name, price, stock_quantity, created_at;
            `;
            
            const values = [store_id, category_id || null, name, description || null, price, stock_quantity, sku || null];
            const result = await dbPool.query(queryText, values);
            
            res.status(201).json({ 
                status: "Sukses", 
                message: "Produk berhasil dibuat.",
                product: result.rows[0]
            });

        } catch (err) {
            console.error('Error saat membuat produk:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat membuat produk.", details: err.message });
        }
    });

    // =======================================================
    // 2. GET /products: MENGAMBIL SEMUA PRODUK (Publik)
    // =======================================================
    router.get('/products', async (req, res) => {
        try {
            const queryText = `
                SELECT 
                    p.id, p.name, p.description, p.price, p.stock_quantity, p.is_active,
                    s.name AS store_name, c.name AS category_name
                FROM products p
                JOIN stores s ON p.store_id = s.id
                LEFT JOIN product_categories c ON p.category_id = c.id
                WHERE p.is_active = TRUE
                ORDER BY p.created_at DESC;
            `;
            const result = await dbPool.query(queryText);

            res.status(200).json({
                status: "Sukses",
                total_products: result.rowCount,
                products: result.rows
            });

        } catch (err) {
            console.error('Error saat mengambil produk:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil daftar produk.", details: err.message });
        }
    });

    router.get('/products/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const queryText = `
 SELECT 
                id, store_id, category_id, name, description, price,expiration_estimate, 
                stock_quantity, sku, is_active, created_at, updated_at
            FROM products
            WHERE id = $1 AND is_active = TRUE;         `;
        const result = await dbPool.query(queryText, [productId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ status: "Gagal", error: "Produk tidak ditemukan atau tidak aktif." });
        }

        res.status(200).json({
            status: "Sukses",
            product: result.rows[0]
        });

    } catch (err) {
        console.error('Error saat mengambil detail produk:', err.message);
        res.status(500).json({ status: "Gagal", error: "Gagal mengambil detail produk.", details: err.message });
    }
});

    // =======================================================
    // 3. PUT /products/:id: MEMPERBARUI PRODUK (Hanya Pemilik Toko)
    // =======================================================
    router.put('/products/:id', authenticateToken, authorizeRole(['seller', 'admin']), async (req, res) => {
        const productId = req.params.id;
        const { name, description, price, stock_quantity, category_id, is_active } = req.body;
        const currentUserId = req.user.id;

        try {
            // Cek kepemilikan dan dapatkan store_id produk
            const checkQuery = `
                SELECT s.user_id 
                FROM products p
                JOIN stores s ON p.store_id = s.id
                WHERE p.id = $1;
            `;
            const checkResult = await dbPool.query(checkQuery, [productId]);
            
            if (checkResult.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Produk tidak ditemukan." });
            }
            
            // Otorisasi: Hanya pemilik toko yang boleh update
            if (checkResult.rows[0].user_id !== currentUserId && req.user.role !== 'admin') {
                return res.status(403).json({ status: "Gagal", error: "Akses ditolak. Anda bukan pemilik produk ini." });
            }

            const updateQuery = `
                UPDATE products 
                SET 
                    name = COALESCE($1, name), 
                    description = COALESCE($2, description), 
                    price = COALESCE($3, price), 
                    stock_quantity = COALESCE($4, stock_quantity),
                    category_id = COALESCE($5, category_id),
                    is_active = COALESCE($6, is_active),
                    updated_at = NOW()
                WHERE id = $7
                RETURNING *;
            `;
            
            const values = [name, description, price, stock_quantity, category_id, is_active, productId];
            const result = await dbPool.query(updateQuery, values);

            res.status(200).json({ 
                status: "Sukses", 
                message: "Produk berhasil diperbarui.",
                product: result.rows[0]
            });

        } catch (err) {
            console.error('Error saat memperbarui produk:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat memperbarui produk.", details: err.message });
        }
    });



// ... (Rute PUT /products/:id berakhir di sini)

// =======================================================
// 4. POST /products/seed-dummy: MASUKKAN 10 PRODUK DUMMY (Tanpa Auth/Pengujian)
// =======================================================
// Rute ini dapat diakses TANPA token. HANYA untuk lingkungan Dev/Testing.
router.post('/products/seed-dummy', async (req, res) => {
    
    // --- Data 10 Produk Bahan Pangan yang Diperluas (SKU DIHAPUS) ---
    const EXTENDED_PRODUCTS_DATA = [
        { name: "Apel Malang Grade A", description: "Apel manis, cocok untuk diet.", price: 45000.00, stock_quantity: 50, category_id: 2, category_name: 'Buah-buahan' },
        { name: "Sawi Hijau Organik", description: "Sayuran hijau segar, ideal untuk capcay.", price: 7500.00, stock_quantity: 120, category_id: 1, category_name: 'Sayur' },
        { name: "Udang Segar Kupas (250g)", description: "Siap masak, ukuran sedang.", price: 55000.00, stock_quantity: 40, category_id: 2, category_name: 'Daging/Seafood' },
        { name: "Tepung Terigu Serbaguna", description: "Protein sedang, untuk aneka kue.", price: 11000.00, stock_quantity: 200, category_id: 1, category_name: 'Sembako' },
        { name: "Kopi Arabika Gayo (200g)", description: "Biji kopi premium, dark roast.", price: 85000.00, stock_quantity: 30, category_id: 2, category_name: 'Minuman' },
        { name: "Susu UHT Full Cream (1L)", description: "Kalsium tinggi, cocok untuk keluarga.", price: 18000.00, stock_quantity: 150, category_id: 1, category_name: 'Daging' },
        { name: "Bumbu Dasar Kuning Instan", description: "Siap pakai, cepat dan praktis.", price: 15000.00, stock_quantity: 90, category_id: 2, category_name: 'Daging' },
        { name: "Ayam Potong 1 Kg (Fresh)", description: "Diproses pada hari yang sama.", price: 38000.00, stock_quantity: 60, category_id: 1, category_name: 'Daging/Seafood' },
        { name: "Mie Instan Goreng (Dusin)", description: "Stok bulanan, hemat dan lezat.", price: 115000.00, stock_quantity: 80, category_id: 1, category_name: 'Sembako' },
        { name: "Tahu Putih Bandung", description: "Lembut dan padat, cocok untuk digoreng.", price: 4000.00, stock_quantity: 250, category_id: 2, category_name: 'Protein Nabati' },
    ];
    // ------------------------------------------

    let client;
    try {
        client = await dbPool.connect();

        // 1. Cari Store ID yang sudah ada
        const storeResult = await client.query('SELECT id FROM stores LIMIT 1');
        if (storeResult.rowCount === 0) {
            return res.status(403).json({ status: "Gagal", error: "Tidak ada toko yang terdaftar. Seeding gagal." });
        }
        const store_id = storeResult.rows[0].id;
        
        let insertedCount = 0;
        for (const product of EXTENDED_PRODUCTS_DATA) {
            // Hapus sku dari query dan values
            const queryText = `
                INSERT INTO products (store_id, category_id, name, description, price, stock_quantity, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE)
                RETURNING id; 
            `;
            const values = [
                store_id, 
                product.category_id, 
                product.name, 
                product.description, 
                product.price, 
                product.stock_quantity
            ];
            
            const result = await client.query(queryText, values);
            if (result.rowCount > 0) {
                insertedCount++;
            }
        }

        res.status(201).json({ 
            status: "Sukses", 
            message: `${insertedCount} produk bahan pangan baru berhasil dimasukkan (Duplikasi diizinkan).`,
            total_inserted: insertedCount
        });

    } catch (err) {
        console.error('Error saat melakukan seeding produk:', err.message);
        res.status(500).json({ status: "Gagal", error: "Kesalahan server saat seeding.", details: err.message });
    } finally {
        if (client) client.release();
    }
});

return router;
};

