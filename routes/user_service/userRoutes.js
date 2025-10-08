const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Untuk membuat token
const saltRounds = 10; 

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

    // ----------------------------------------------------
    // GET /users (Ambil semua)
    // ----------------------------------------------------
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

    return router;
};