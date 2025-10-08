const express = require('express');
const { authenticateToken } = require('../../middleware/authMiddleware');

// Fungsi ini menerima dbPool dari index.js
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar untuk menguji koneksi Alamat
    router.get('/addresses', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Address Routes siap digunakan." });
    });

    // =======================================================
    // 1. POST /addresses: MEMBUAT ALAMAT BARU
    // =======================================================
    router.post('/addresses', authenticateToken, async (req, res) => {
        const { address_line, city, postal_code, is_primary } = req.body;
        const user_id = req.user.id; // Diambil dari token JWT

        if (!address_line || !city || !postal_code) {
            return res.status(400).json({ status: "Gagal", error: "Alamat lengkap, kota, dan kode pos wajib diisi." });
        }
        
        try {
            // Jika alamat baru dijadikan utama, set alamat lama menjadi non-utama
            if (is_primary) {
                await dbPool.query('UPDATE addresses SET is_primary = FALSE WHERE user_id = $1', [user_id]);
            }

            const queryText = `
                INSERT INTO addresses (user_id, address_line, city, postal_code, is_primary, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING id, address_line, city, postal_code, is_primary;
            `;
            
            const values = [user_id, address_line, city, postal_code, is_primary || false];
            const result = await dbPool.query(queryText, values);
            
            res.status(201).json({ 
                status: "Sukses", 
                message: "Alamat berhasil ditambahkan.",
                address: result.rows[0]
            });

        } catch (err) {
            console.error('Error saat membuat alamat:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat membuat alamat.", details: err.message });
        }
    });

    // =======================================================
    // 2. GET /addresses: MENGAMBIL SEMUA ALAMAT USER
    // =======================================================
    router.get('/addresses', authenticateToken, async (req, res) => {
        const user_id = req.user.id;
        try {
            const queryText = `
                SELECT id, address_line, city, postal_code, is_primary, created_at 
                FROM addresses WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC;
            `;
            const result = await dbPool.query(queryText, [user_id]);

            res.status(200).json({
                status: "Sukses",
                total_addresses: result.rowCount,
                addresses: result.rows
            });

        } catch (err) {
            console.error('Error saat mengambil alamat:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil data alamat.", details: err.message });
        }
    });

    // =======================================================
    // 3. PUT /addresses/:id: MEMPERBARUI ALAMAT USER
    // =======================================================
    router.put('/addresses/:id', authenticateToken, async (req, res) => {
        const addressId = req.params.id;
        const user_id = req.user.id;
        const { address_line, city, postal_code, is_primary } = req.body;

        if (!address_line || !city || !postal_code) {
            return res.status(400).json({ status: "Gagal", error: "Data alamat tidak lengkap." });
        }

        try {
            // Pastikan user tersebut adalah pemilik alamat ini dan update
            const updateQuery = `
                UPDATE addresses 
                SET address_line = $1, city = $2, postal_code = $3, is_primary = $4
                WHERE id = $5 AND user_id = $6
                RETURNING *;
            `;
            
            const result = await dbPool.query(updateQuery, [address_line, city, postal_code, is_primary || false, addressId, user_id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Alamat tidak ditemukan atau Anda tidak memiliki izin untuk mengedit." });
            }

            // Jika alamat baru diset sebagai utama, set alamat lama menjadi non-utama
            if (is_primary) {
                await dbPool.query('UPDATE addresses SET is_primary = FALSE WHERE user_id = $1 AND id != $2', [user_id, addressId]);
            }
            
            res.status(200).json({ status: "Sukses", message: "Alamat berhasil diperbarui.", address: result.rows[0] });

        } catch (err) {
            console.error('Error saat memperbarui alamat:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat memperbarui alamat.", details: err.message });
        }
    });

    return router;
};
