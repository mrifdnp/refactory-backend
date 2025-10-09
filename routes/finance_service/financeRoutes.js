const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middleware/authMiddleware');

// Fungsi ini menerima dbPool
module.exports = (dbPool) => {
    const router = express.Router();

    // Rute dasar
    router.get('/', (req, res) => {
        res.status(200).json({ status: "Sukses", message: "✅ Financial Service siap digunakan. Endpoint: /balances & /withdrawals" });
    });

    // =======================================================
    // 1. GET /balances: MENGAMBIL SALDO PENJUAL (Hanya Seller)
    // =======================================================
    router.get('/balances', authenticateToken, authorizeRole('seller'), async (req, res) => {
        const user_id = req.user.id;
        
        try {
            // Dapatkan store_id user ini
            const storeResult = await dbPool.query('SELECT id FROM stores WHERE user_id = $1', [user_id]);
            if (storeResult.rowCount === 0) {
                return res.status(404).json({ status: "Gagal", error: "Anda belum memiliki toko yang terdaftar." });
            }
            const store_id = storeResult.rows[0].id;

            // Dapatkan saldo
            const balanceResult = await dbPool.query('SELECT available_balance, pending_balance, last_updated FROM seller_balances WHERE store_id = $1', [store_id]);
            
            if (balanceResult.rowCount === 0) {
                 // Jika saldo belum ada, inisialisasi dengan 0
                return res.status(200).json({ status: "Sukses", balance: {
                    store_id: store_id,
                    available_balance: 0,
                    pending_balance: 0,
                    message: "Saldo baru diinisialisasi"
                }});
            }

            res.status(200).json({ 
                status: "Sukses", 
                balance: { store_id: store_id, ...balanceResult.rows[0] }
            });

        } catch (err) {
            console.error('Error saat mengambil saldo:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil data saldo.", details: err.message });
        }
    });

  
    router.post('/withdrawals', authenticateToken, authorizeRole('seller'), async (req, res) => {
        const { amount, bank_account_info } = req.body;
        const user_id = req.user.id;
        
        if (!amount || amount <= 0 || !bank_account_info) {
            return res.status(400).json({ status: "Gagal", error: "Jumlah penarikan dan info rekening wajib diisi." });
        }

        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');

            const storeResult = await client.query('SELECT id FROM stores WHERE user_id = $1', [user_id]);
            if (storeResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ status: "Gagal", error: "Toko tidak ditemukan." });
            }
            const store_id = storeResult.rows[0].id;

            // 1. Cek Saldo yang Tersedia
            const balanceResult = await client.query('SELECT available_balance FROM seller_balances WHERE store_id = $1 FOR UPDATE', [store_id]);
            
            if (balanceResult.rowCount === 0 || parseFloat(balanceResult.rows[0].available_balance) < amount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: "Gagal", error: "Saldo tersedia tidak mencukupi untuk penarikan ini." });
            }

            // 2. Kurangi Saldo Tersedia
            await client.query(
                'UPDATE seller_balances SET available_balance = available_balance - $1, last_updated = NOW() WHERE store_id = $2',
                [amount, store_id]
            );

            // 3. Catat Permintaan Penarikan
            const withdrawalQuery = `
                INSERT INTO withdrawals (store_id, amount, status, bank_account_info, requested_at)
                VALUES ($1, $2, 'pending', $3, NOW())
                RETURNING id, amount, status, requested_at;
            `;
            const withdrawalResult = await client.query(withdrawalQuery, [store_id, amount, bank_account_info]);
            
            // 4. Catat Transaksi (debit/withdrawal)
             const transactionQuery = `
                INSERT INTO transactions (store_id, withdrawal_id, type, amount, description, created_at)
                VALUES ($1, $2, 'withdrawal', $3, $4, NOW())
            `;
            await client.query(transactionQuery, [store_id, withdrawalResult.rows[0].id, -amount, `Penarikan Dana (ID: ${withdrawalResult.rows[0].id})`]);

            await client.query('COMMIT');

            res.status(201).json({ 
                status: "Sukses", 
                message: "Permintaan penarikan berhasil diajukan.",
                withdrawal: withdrawalResult.rows[0]
            });

        } catch (err) {
            await client.query('ROLLBACK'); 
            console.error('Error saat penarikan dana:', err.message);
            res.status(500).json({ status: "Gagal", error: "Kesalahan transaksi server saat penarikan.", details: err.message });
        } finally {
            client.release();
        }
    });


     router.get('/transactions/me', authenticateToken, async (req, res) => {
        const user_id = req.user.id;
        try {
            // Melakukan JOIN dari transactions -> order_items -> orders untuk memfilter berdasarkan user_id pembeli
            const queryText = `
                SELECT 
                    t.id, t.type, t.amount, t.description, t.created_at, 
                    o.id AS order_id, s.name AS store_name
                FROM transactions t
                JOIN order_items oi ON t.order_item_id = oi.id
                JOIN orders o ON oi.order_id = o.id
                JOIN stores s ON t.store_id = s.id
                WHERE o.user_id = $1 -- Filter berdasarkan ID pembeli yang login
                ORDER BY t.created_at DESC;
            `;
            const result = await dbPool.query(queryText, [user_id]);

            res.status(200).json({ 
                status: "Sukses", 
                message: "Riwayat transaksi terkait pembelian Anda.",
                transactions: result.rows 
            });

        } catch (err) {
            console.error('Error saat mengambil riwayat transaksi pembeli:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal mengambil riwayat transaksi.", details: err.message });
        }
    });

    return router;


};
