const express = require('express');
// Catatan: JWT middleware tidak diperlukan untuk endpoint publik seperti GET kategori

// Fungsi ini menerima dbPool dari index.js (Dependency Injection)
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar untuk menguji koneksi Catalog Service
    router.get('/', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Catalog Service siap digunakan. Endpoint: /categories" });
    });

    // =======================================================
    // 1. POST /categories: MEMBUAT KATEGORI BARU
    // =======================================================
    router.post('/categories', async (req, res) => {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ status: "Gagal", error: "Nama kategori wajib diisi." });
        }

        try {
            const queryText = `
                INSERT INTO product_categories (name, description)
                VALUES ($1, $2)
                RETURNING id, name, description;
            `;
            
            const result = await dbPool.query(queryText, [name, description || null]);
            
            res.status(201).json({ 
                status: "Sukses", 
                message: "Kategori berhasil dibuat.",
                category: result.rows[0]
            });

        } catch (err) {
            if (err.code === '23505') { // Error kode untuk unique constraint (nama sudah ada)
                return res.status(409).json({ status: "Gagal", error: "Nama kategori sudah ada." });
            }
            console.error('Error saat membuat kategori:', err.message);
            res.status(500).json({
                status: "Gagal",
                error: "Kesalahan server saat membuat kategori.",
                details: err.message,
            });
        }
    });

    // =======================================================
    // 2. GET /categories: MENGAMBIL SEMUA KATEGORI
    // =======================================================
    router.get('/categories', async (req, res) => {
        try {
            const queryText = `SELECT id, name, description FROM product_categories ORDER BY name ASC;`;
            const result = await dbPool.query(queryText);
            
            res.status(200).json({
                status: "Sukses",
                total_categories: result.rowCount,
                categories: result.rows
            });
        } catch (err) {
            console.error('Error saat mengambil kategori:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil data kategori.", details: err.message });
        }
    });

    // =======================================================
    // 3. PUT /categories/:id: MEMPERBARUI KATEGORI
    // =======================================================
    router.put('/categories/:id', async (req, res) => {
        const categoryId = req.params.id;
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ status: "Gagal", error: "Nama kategori wajib diisi untuk pembaruan." });
        }
        
        try {
            const queryText = `
                UPDATE product_categories 
                SET name = $1, description = $2
                WHERE id = $3
                RETURNING id, name, description;
            `;
            
            const result = await dbPool.query(queryText, [name, description, categoryId]);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Kategori tidak ditemukan." });
            }
            
            res.status(200).json({ 
                status: "Sukses", 
                message: "Kategori berhasil diperbarui.",
                category: result.rows[0]
            });

        } catch (err) {
            if (err.code === '23505') { 
                return res.status(409).json({ status: "Gagal", error: "Nama kategori sudah ada di database lain." });
            }
            console.error('Error saat memperbarui kategori:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat memperbarui kategori.", details: err.message });
        }
    });

    // =======================================================
    // 4. DELETE /categories/:id: MENGHAPUS KATEGORI
    // =======================================================
    router.delete('/categories/:id', async (req, res) => {
        const categoryId = req.params.id;
        
        try {
            // Catatan: Jika ada produk yang menggunakan category_id ini, 
            // PostgreSQL akan melempar error karena Foreign Key Constraint!
            const queryText = 'DELETE FROM product_categories WHERE id = $1 RETURNING id;';
            const result = await dbPool.query(queryText, [categoryId]);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Kategori tidak ditemukan." });
            }
            
            res.status(200).json({ 
                status: "Sukses", 
                message: `Kategori ID ${categoryId} berhasil dihapus.`
            });

        } catch (err) {
            if (err.code === '23503') { // PostgreSQL Foreign Key Violation Code
                return res.status(409).json({ 
                    status: "Gagal", 
                    error: "Tidak dapat menghapus. Ada produk yang masih menggunakan kategori ini.", 
                    details: err.message 
                });
            }
            console.error('Error saat menghapus kategori:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat menghapus kategori.", details: err.message });
        }
    });

    return router;
};
