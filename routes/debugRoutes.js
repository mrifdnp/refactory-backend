const express = require('express');
const bcrypt = require('bcrypt');
const saltRounds = 10;

// Fungsi ini menerima dbPool dari index.js
module.exports = (dbPool) => {
    const router = express.Router();

    // =======================================================
    // POST /insert-mock-data: Memasukkan data awal untuk pengujian
    // =======================================================
    router.post('/insert-mock-data', async (req, res) => {
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');

            // --- 1. MOCK USER (Seller) ---
            const userEmail = `seller_mock_${Date.now()}@test.com`;
            const hashedPassword = await bcrypt.hash('123456', saltRounds); // Password standar untuk mock
            const userQuery = `
                INSERT INTO users (full_name, email, password_hash, role)
                VALUES ($1, $2, $3, 'seller')
                RETURNING id;
            `;
            const userResult = await client.query(userQuery, ['Budi Seller', userEmail, hashedPassword]);
            const userId = userResult.rows[0].id;

            // --- 2. MOCK STORE (Terikat pada User ID Seller) ---
            const storeQuery = `
                INSERT INTO stores (user_id, name, slug, description)
                VALUES ($1, $2, $3, $4)
                RETURNING id;
            `;
            const storeResult = await client.query(storeQuery, [userId, 'Toko Sayur Segar Mock', 'toko-sayur-segar-mock', 'Menjual sayuran segar dari kebun sendiri.']);
            const storeId = storeResult.rows[0].id;

            // --- 3. MOCK CATEGORIES ---
            const cat1Query = `INSERT INTO product_categories (name) VALUES ('Sayuran') RETURNING id;`;
            const cat2Query = `INSERT INTO product_categories (name) VALUES ('Buah-buahan') RETURNING id;`;
            const cat1Result = await client.query(cat1Query);
            const cat2Result = await client.query(cat2Query);
            const catSayuranId = cat1Result.rows[0].id;
            const catBuahId = cat2Result.rows[0].id;


            // --- 4. MOCK PRODUCTS (Terikat pada Store ID dan Category ID) ---
            const productQuery = `
                INSERT INTO products (store_id, category_id, name, description, price, stock_quantity, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE);
            `;
            await client.query(productQuery, [storeId, catSayuranId, 'Bayam Hijau Organik', 'Bayam segar bebas pestisida.', 15.00, 100]);
            await client.query(productQuery, [storeId, catBuahId, 'Apel Malang Grade A', 'Apel manis, cocok untuk diet.', 45.00, 50]);

            // --- 5. MOCK BUYER (Optional) ---
            const buyerEmail = `buyer_mock_${Date.now()}@test.com`;
            const buyerQuery = `
                INSERT INTO users (full_name, email, password_hash, role)
                VALUES ($1, $2, $3, 'buyer')
                RETURNING id;
            `;
            await client.query(buyerQuery, ['Siti Pembeli Mock', buyerEmail, hashedPassword]);
            
            await client.query('COMMIT');

            res.status(201).json({
                status: "Sukses",
                message: "Data mock (1 Seller, 1 Toko, 2 Kategori, 2 Produk, 1 Buyer) berhasil dimasukkan.",
                user_login: { seller_email: userEmail, buyer_email: buyerEmail, password: '123456', store_id: storeId }
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error saat insert mock data:', err.message);
            res.status(500).json({ status: "Gagal", error: "Gagal memasukkan data mock.", details: err.message });
        } finally {
            client.release();
        }
    });

    return router;
};