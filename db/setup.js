const { createEnumsQuery, createTablesQuery } = require('./migrations');

// Fungsi untuk inisialisasi SEMUA tabel dan tipe data (ENUM)
async function setupDatabase(req, res, dbPool) {
    try {
        await dbPool.query('BEGIN');
        
        // 1. DROP TIPE LAMA (Wajib dilakukan sebelum CREATE TYPE baru jika tipe lama sudah ada, CASCADE akan menghapus tabel yang terikat)
        await dbPool.query('DROP TYPE IF EXISTS user_role CASCADE');
        await dbPool.query('DROP TYPE IF EXISTS order_status CASCADE');
        await dbPool.query('DROP TYPE IF EXISTS withdrawal_status CASCADE');
        await dbPool.query('DROP TYPE IF EXISTS transaction_type CASCADE');
        console.log("⚠️ Tipe data ENUM lama (jika ada) telah dihapus.");

        // 2. CREATE semua Tipe data ENUM baru
        await dbPool.query(createEnumsQuery);
        console.log("✅ Semua Tipe data ENUM baru berhasil dibuat.");

        // 3. CREATE semua Tables
        await dbPool.query(createTablesQuery);
        console.log("✅ Semua Tabel berhasil dibuat.");

        await dbPool.query('COMMIT');

        res.status(201).json({ 
          status: "Sukses", 
          message: "Setup Database Kalana Pantry Selesai: Semua Tabel dan Tipe data berhasil dibuat." 
        });

    } catch (err) {
        await dbPool.query('ROLLBACK');
        console.error('Error saat inisialisasi database:', err.message);
        res.status(500).json({
            status: "Gagal",
            error: "Gagal inisialisasi database. Pastikan user DB memiliki izin CREATE.",
            details: err.message,
        });
    }
}

// Fungsi untuk menghapus semua tabel dan type
async function resetDatabase(req, res, dbPool) {
    try {
        // 1. Ambil daftar semua tabel
        const tablesResult = await dbPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);
        const tables = tablesResult.rows.map(row => row.table_name).join(', ');

        // 2. Hapus semua tabel
        if (tablesResult.rowCount > 0) {
            await dbPool.query(`DROP TABLE IF EXISTS ${tables} CASCADE;`);
            console.log(`🗑️ Tabel berikut dihapus: ${tables}`);
        }

        // 3. Hapus custom types secara eksplisit
        await dbPool.query('DROP TYPE IF EXISTS user_role CASCADE;');
        await dbPool.query('DROP TYPE IF EXISTS order_status CASCADE;');
        await dbPool.query('DROP TYPE IF EXISTS withdrawal_status CASCADE;');
        await dbPool.query('DROP TYPE IF EXISTS transaction_type CASCADE;');

        res.status(200).json({
            status: "Sukses",
            message: "Database telah berhasil direset (semua tabel dan tipe dihapus).",
            tables_dropped: tablesResult.rowCount,
        });

    } catch (err) {
        console.error('Error saat mereset database:', err.message);
        res.status(500).json({
            status: "Gagal",
            error: "Gagal mereset database.",
            details: err.message,
        });
    }
}

module.exports = {
    setupDatabase,
    resetDatabase
};
