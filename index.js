require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const dbPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

app.get('/', (req, res) => {
  res.send('Server Express berjalan!');
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT NOW() AS current_time');
    res.json({
      status: "Koneksi DB Sukses",
      server_time: result.rows[0].current_time,
    });
  } catch (err) {
    console.error('Database Connection Error:', err.message);
    res.status(500).json({
      status: "Koneksi DB Gagal",
      error: err.message,
    });
  }
});

// ← Tambahkan ini untuk daftar tabel
app.get('/db-tables', async (req, res) => {
  const queryText = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  try {
    const result = await dbPool.query(queryText);
    res.json({
      status: "Daftar tabel di schema 'public'",
      total_tables: result.rowCount,
      tables: result.rows.map(row => row.table_name)
    });
  } catch (err) {
    console.error('Error saat mengambil daftar tabel:', err.message);
    res.status(500).json({
      status: "Gagal",
      error: err.message,
    });
  }
});

app.get('/db-count-tables', async (req, res) => {
  const queryText = `
    SELECT COUNT(*) AS total_tables
    FROM information_schema.tables
    WHERE table_schema = 'public';
  `;
  try {
    const result = await dbPool.query(queryText);
    res.json({
      status: "Sukses",
      total_tables: parseInt(result.rows[0].total_tables, 10)
    });
  } catch (err) {
    console.error('Error saat menghitung tabel:', err.message);
    res.status(500).json({
      status: "Gagal",
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`Akses http://localhost:${PORT}/db-test dan /db-tables untuk menguji DB.`);
});
