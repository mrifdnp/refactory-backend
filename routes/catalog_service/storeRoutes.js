
const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middleware/authMiddleware');

// Fungsi ini menerima dbPool dari index.js
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar untuk menguji koneksi Toko
    router.get('/', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Store Routes siap digunakan. Endpoint: /stores" });
    });

    // =======================================================
    // 1. POST /stores: MEMBUAT TOKO BARU (Hanya oleh Seller)
    // =======================================================
    router.post('/stores', authenticateToken, authorizeRole('seller'), async (req, res) => {
        const { name, description, logo_url } = req.body;
        const user_id = req.user.id; // Diambil dari payload JWT

        if (!name) {
            return res.status(400).json({ status: "Gagal", error: "Nama toko wajib diisi." });
        }
        
        try {
            // Cek apakah user sudah memiliki toko
            const existingStore = await dbPool.query('SELECT id FROM stores WHERE user_id = $1', [user_id]);
            if (existingStore.rowCount > 0) {
                return res.status(409).json({ status: "Gagal", error: "Anda sudah memiliki toko. Satu pengguna hanya dapat memiliki satu toko." });
            }

            // Buat slug otomatis dari nama
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '');

            const queryText = `
                INSERT INTO stores (user_id, name, slug, description, logo_url)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, name, slug, is_verified, created_at;
            `;
            
            const result = await dbPool.query(queryText, [user_id, name, slug, description || null, logo_url || null]);
            
            res.status(201).json({ 
                status: "Sukses", 
                message: "Toko berhasil dibuat.",
                store: result.rows[0]
            });

        } catch (err) {
            if (err.code === '23505') { // Unique Constraint Error (kemungkinan slug sudah ada)
                 return res.status(409).json({ status: "Gagal", error: "Nama toko/slug sudah digunakan. Silakan pilih nama lain." });
            }
            console.error('Error saat membuat toko:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat membuat toko.", details: err.message });
        }
    });

    // =======================================================
    // 2. GET /stores/:id: MENGAMBIL DETAIL TOKO
    // =======================================================
    
    router.get('/stores', async (req, res) => {
    try {
        // Query untuk mengambil semua toko (hanya kolom publik)
        const queryText = `
            SELECT id, user_id, name, slug, logo_url, is_verified, created_at 
            FROM stores 
            ORDER BY created_at DESC;
        `;
        const result = await dbPool.query(queryText);

        res.status(200).json({
            status: "Sukses",
            total_stores: result.rowCount,
            stores: result.rows
        });

    } catch (err) {
        console.error('Error saat mengambil semua toko:', err.message);
        res.status(500).json({ status: "Gagal", error: "Gagal mengambil daftar toko.", details: err.message });
    }
});
router.get('/stores/:id', async (req, res) => {
        const storeId = req.params.id;
        try {
            const queryText = `
                SELECT id, user_id, name, slug, description, logo_url, is_verified, created_at 
                FROM stores WHERE id = $1;
            `;
            const result = await dbPool.query(queryText, [storeId]);
            
            if (result.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Toko tidak ditemukan." });
            }
            
            res.status(200).json({ status: "Sukses", store: result.rows[0] });

        } catch (err) {
            console.error('Error saat mengambil detail toko:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil data toko.", details: err.message });
        }
    });

    // =======================================================
    // 3. PUT /stores/:id: MEMPERBARUI TOKO (Hanya Pemilik Toko)
    // =======================================================
    router.put('/stores/:id', authenticateToken, authorizeRole(['seller', 'admin']), async (req, res) => {
        const storeId = req.params.id;
        const { name, description, logo_url } = req.body;
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        if (!name) {
            return res.status(400).json({ status: "Gagal", error: "Nama toko wajib diisi untuk pembaruan." });
        }
        
        try {
            // Ambil info toko untuk cek kepemilikan
            const storeInfo = await dbPool.query('SELECT user_id FROM stores WHERE id = $1', [storeId]);
            if (storeInfo.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Toko tidak ditemukan." });
            }

            // Otorisasi: Hanya pemilik atau admin yang boleh update
            if (storeInfo.rows[0].user_id !== currentUserId && currentUserRole !== 'admin') {
                return res.status(403).json({ status: "Gagal", error: "Akses ditolak. Anda bukan pemilik toko ini." });
            }

            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '');

            const queryText = `
                UPDATE stores 
                SET name = $1, slug = $2, description = $3, logo_url = $4
                WHERE id = $5
                RETURNING id, name, slug, is_verified;
            `;
            
            const result = await dbPool.query(queryText, [name, slug, description || null, logo_url || null, storeId]);

            res.status(200).json({ 
                status: "Sukses", 
                message: "Toko berhasil diperbarui.",
                store: result.rows[0]
            });

        } catch (err) {
            if (err.code === '23505') { 
                return res.status(409).json({ status: "Gagal", error: "Nama toko/slug sudah digunakan oleh toko lain." });
            }
            console.error('Error saat memperbarui toko:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat memperbarui toko.", details: err.message });
        }
    });

    return router;
};
