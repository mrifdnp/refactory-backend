const express = require('express');
const { authenticateToken } = require('../../middleware/authMiddleware'); // Untuk otorisasi

// Fungsi ini menerima dbPool
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar
    router.get('/', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Review Service siap digunakan. Endpoint: /reviews" });
    });

    // =======================================================
    // 1. POST /reviews: MEMBUAT ULASAN BARU (Hanya oleh User yang Login)
    // =======================================================
    router.post('/reviews', authenticateToken, async (req, res) => {
        const { product_id, rating, comment } = req.body;
        const user_id = req.user.id; 
        
        if (!product_id || !rating) {
            return res.status(400).json({ status: "Gagal", error: "ID Produk dan Rating wajib diisi." });
        }
        
        // Validasi Rating: harus antara 1 sampai 5
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ status: "Gagal", error: "Rating harus antara 1 sampai 5." });
        }

        try {
            // Cek apakah produk benar-benar ada (Penting untuk integritas data)
            const productCheck = await dbPool.query('SELECT id FROM products WHERE id = $1', [product_id]);
            if (productCheck.rowCount === 0) {
                 return res.status(404).json({ status: "Gagal", error: "Produk tidak ditemukan." });
            }

            const queryText = `
                INSERT INTO reviews (user_id, product_id, rating, comment, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id, product_id, rating, comment, created_at;
            `;
            
            const values = [user_id, product_id, rating, comment || null];
            const result = await dbPool.query(queryText, values);
            
            res.status(201).json({ 
                status: "Sukses", 
                message: "Ulasan berhasil dibuat.",
                review: result.rows[0]
            });

        } catch (err) {
             // Opsional: Cek jika user sudah pernah review produk ini (UNIQUE constraint di masa depan)
            console.error('Error saat membuat ulasan:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat membuat ulasan.", details: err.message });
        }
    });

    // =======================================================
    // 2. GET /products/:product_id/reviews: MENGAMBIL SEMUA ULASAN UNTUK SATU PRODUK (Publik)
    // =======================================================
    router.get('/products/:product_id/reviews', async (req, res) => {
        const productId = req.params.product_id;
        try {
            // Gabungkan dengan tabel users untuk menampilkan nama user yang me-review
            const queryText = `
                SELECT 
                    r.id, r.rating, r.comment, r.created_at, 
                    u.full_name AS reviewer_name
                FROM reviews r
                JOIN users u ON r.user_id = u.id
                WHERE r.product_id = $1
                ORDER BY r.created_at DESC;
            `;
            const result = await dbPool.query(queryText, [productId]);

            res.status(200).json({
                status: "Sukses",
                product_id: productId,
                total_reviews: result.rowCount,
                reviews: result.rows
            });

        } catch (err) {
            console.error('Error saat mengambil ulasan:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil daftar ulasan.", details: err.message });
        }
    });

    return router;
};