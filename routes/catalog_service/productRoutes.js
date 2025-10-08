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

    return router;
};