const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Untuk membuat token
const saltRounds = 10; 
const { authenticateToken, authorizeRole } = require('../../middleware/authMiddleware'); 

// Fungsi ini menerima dbPool dari index.js (Dependency Injection)
module.exports = (dbPool) => {
    const router = express.Router();

    // ----------------------------------------------------
    // POST /register
    // ----------------------------------------------------
    router.post('/register', async (req, res) => {
        const { full_name, email, password, phone_number, role } = req.body;
        if (!email || !password || !full_name) {
            return res.status(400).json({ status: "Gagal", error: "Nama lengkap, email, dan password wajib diisi." });
        }

        try {
            const password_hash = await bcrypt.hash(password, saltRounds);
            const queryText = `
                INSERT INTO "users" ("full_name", "email", "password_hash", "phone_number", "role", "created_at", "updated_at")
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                RETURNING id, "full_name", email, phone_number, role, created_at;
            `;
            
            const values = [full_name, email, password_hash, phone_number || null, role || 'buyer'];
            const result = await dbPool.query(queryText, values);
            
            res.status(201).json({ 
                status: "Sukses", 
                message: "Pengguna berhasil didaftarkan.",
                user: result.rows[0]
            });

        } catch (err) {
            if (err.code === '23505') { 
                return res.status(409).json({ status: "Gagal", error: "Email atau Nomor Telepon sudah terdaftar." });
            }
            
            console.error('Error saat pendaftaran pengguna:', err.message);
            res.status(500).json({
                status: "Gagal",
                error: "Kesalahan server saat memproses pendaftaran.",
                details: err.message,
            });
        }
    });

    // ----------------------------------------------------
    // POST /login
    // ----------------------------------------------------
    router.post('/login', async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ status: "Gagal", error: "Email dan password wajib diisi." });
        }

        try {
            const result = await dbPool.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = result.rows[0];

            if (!user) {
                return res.status(401).json({ status: "Gagal", error: "Kredensial tidak valid." });
            }

            const passwordMatch = await bcrypt.compare(password, user.password_hash);

            if (passwordMatch) {
                // 1. Buat Payload JWT
                const payload = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                };
                
                // 2. Tandatangani Token
                const token = jwt.sign(payload, process.env.JWT_SECRET, {
                    expiresIn: '5d' // Token berlaku selama 1 hari
                });

                // Hapus password hash dari objek sebelum mengirimkannya ke client
                const { password_hash, ...safeUser } = user; 
                
                return res.status(200).json({ 
                    status: "Sukses", 
                    message: "Login berhasil!", 
                    user: safeUser,
                    token: token // Kirim token ke klien
                });
            } else {
                return res.status(401).json({ status: "Gagal", error: "Kredensial tidak valid." });
            }

        } catch (err) {
            console.error('Error saat login:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat login.", details: err.message });
        }
    });


    router.get('/users', async (req, res) => {
        try {
            const queryText = `SELECT id, "full_name", email, phone_number, role, created_at, updated_at FROM users ORDER BY created_at DESC;`;
            const result = await dbPool.query(queryText);
            
            res.status(200).json({
                status: "Sukses",
                total_users: result.rowCount,
                users: result.rows
            });
        } catch (err) {
            console.error('Error saat mengambil semua pengguna:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil data pengguna.", details: err.message });
        }
    });

    // ----------------------------------------------------
    // GET /users/:id (Ambil satu)
    // ----------------------------------------------------
    router.get('/users/:id', async (req, res) => {
        const userId = req.params.id;
        try {
            const queryText = `SELECT id, "full_name", email, phone_number, role, created_at, updated_at FROM users WHERE id = $1;`;
            const result = await dbPool.query(queryText, [userId]);
            
            const user = result.rows[0];

            if (user) {
                res.status(200).json({ status: "Sukses", user: user });
            } else {
                res.status(404).json({ status: "Gagal", error: "Pengguna tidak ditemukan." });
            }
        } catch (err) {
            console.error('Error saat mengambil pengguna berdasarkan ID:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil data pengguna.", details: err.message });
        }
    });

     router.put('/users/:id', authenticateToken, async (req, res) => {
        const targetUserId = parseInt(req.params.id);
        const { full_name, email, phone_number, role } = req.body;
        const authUser = req.user; // Data user dari token: { id, role, ... }

        // --- Otorisasi: Verifikasi Kepemilikan atau Admin ---
        // 1. Pengguna hanya boleh mengedit datanya sendiri.
        // 2. Jika bukan data sendiri, harus memiliki role 'admin' untuk bisa mengedit.
        if (authUser.id !== targetUserId && authUser.role !== 'admin') {
            return res.status(403).json({ status: "Gagal", error: "Tidak diizinkan mengubah data pengguna lain." });
        }

        // --- Kontrol Role Update ---
        // Hanya admin yang diizinkan untuk mengubah role pengguna lain.
        if (role && role !== authUser.role && authUser.role !== 'admin') {
            return res.status(403).json({ status: "Gagal", error: "Tidak diizinkan mengubah role pengguna." });
        }
        
        // --- Membangun Query Update Dinamis ---
        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (full_name !== undefined) {
            fields.push(`"full_name" = $${paramIndex++}`);
            values.push(full_name);
        }
        if (email !== undefined) {
            fields.push(`email = $${paramIndex++}`);
            values.push(email);
        }
        if (phone_number !== undefined) {
            fields.push(`phone_number = $${paramIndex++}`);
            values.push(phone_number);
        }
        // Role: Hanya tambahkan jika di-set di body DAN diizinkan
        if (role !== undefined && (role === authUser.role || authUser.role === 'admin')) {
             fields.push(`role = $${paramIndex++}`);
             values.push(role);
        }


        if (fields.length === 0) {
            return res.status(400).json({ status: "Gagal", error: "Tidak ada data yang diberikan untuk diperbarui." });
        }

        fields.push(`updated_at = NOW()`); // Selalu update timestamp
        
        // Tambahkan ID pengguna yang ditargetkan sebagai parameter terakhir
        values.push(targetUserId);

        try {
            const queryText = `
                UPDATE "users"
                SET ${fields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, "full_name", email, phone_number, role, created_at, updated_at;
            `;
            
            const result = await dbPool.query(queryText, values);

            if (result.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Pengguna tidak ditemukan." });
            }

            res.status(200).json({
                status: "Sukses",
                message: "Data pengguna berhasil diperbarui.",
                user: result.rows[0]
            });

        } catch (err) {
            if (err.code === '23505') { // Error UNIQUE constraint (misalnya email sudah dipakai)
                return res.status(409).json({ status: "Gagal", error: "Email atau Nomor Telepon sudah digunakan oleh pengguna lain." });
            }

            console.error('Error saat memperbarui pengguna:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat memperbarui data.", details: err.message });
        }
    });

 // GET /wallet: Melihat Saldo Pembeli
    router.get('/wallet', authenticateToken, async (req, res) => {
        const user_id = req.user.id;
        
        try {
            const result = await dbPool.query('SELECT balance, last_updated FROM buyer_wallets WHERE user_id = $1', [user_id]);
            
            if (result.rowCount === 0) {
                 // Jika record belum ada, inisialisasi saldo 0 dan buat record baru (UPSERT pattern)
                 await dbPool.query('INSERT INTO buyer_wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [user_id]);

                 return res.status(200).json({ 
                    status: "Sukses", 
                    message: "Saldo ditemukan.",
                    wallet: { balance: 0, last_updated: new Date() }
                 });
            }

            res.status(200).json({ 
                status: "Sukses", 
                wallet: result.rows[0] 
            });

        } catch (err) {
            console.error('Error saat mengambil saldo pembeli:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil saldo.", details: err.message });
        }
    });

    // POST /wallet/deposit: Melakukan Top-Up/Deposit ke Saldo Pembeli
    router.post('/wallet/deposit', authenticateToken, async (req, res) => {
        const { amount } = req.body;
        const user_id = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ status: "Gagal", error: "Jumlah deposit harus lebih dari nol." });
        }

        const client = await dbPool.connect();
        try {
            await client.query('BEGIN'); // Transaksi wajib untuk operasi keuangan

            // Update saldo pembeli, jika record belum ada, buat (UPSERT)
            const queryText = `
                INSERT INTO buyer_wallets (user_id, balance, last_updated) 
                VALUES ($1, $2, NOW())
                ON CONFLICT (user_id) DO UPDATE 
                SET balance = buyer_wallets.balance + $2, last_updated = NOW()
                RETURNING balance, last_updated;
            `;
            
            const result = await client.query(queryText, [user_id, amount]);
            
            // Logika lanjutan: Catat transaksi deposit di tabel 'transactions' jika diperlukan.

            await client.query('COMMIT');

            res.status(200).json({ 
                status: "Sukses", 
                message: `Deposit sebesar ${amount} berhasil.`,
                new_balance: result.rows[0].balance
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error saat deposit:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan server saat deposit.", details: err.message });
        } finally {
            client.release();
        }
    });

    return router;
};