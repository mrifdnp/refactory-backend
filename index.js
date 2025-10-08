require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const userRoutes = require('./routes/user_service/userRoutes'); 
const categoryRoutes = require('./routes/catalog_service/categoryRoutes'); 
const storeRoutes = require('./routes/catalog_service/storeRoutes'); 
const productRoutes = require('./routes/catalog_service/productRoutes')
const { setupDatabase, resetDatabase } = require('./db/setup'); 
const addressRoutes=require('./routes/user_service/addressRoutes')
const reviewRoutes=require('./routes/review_service/reviewRoutes')
const financeRoutes=require('./routes/finance_service/financeRoutes')
const debugRoutes = require('./routes/debugRoutes'); // <-- BARU: Import Debug Routes

// --- DEBUG CHECKPOINT 1 ---
console.log('CHECKPOINT 1: Dependensi dan Modul berhasil dimuat.'); 
// --------------------------

const app = express();
app.use(express.json());

// Inisialisasi Koneksi Database PostgreSQL
const dbPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

app.use('/auth', userRoutes(dbPool)); 
app.use('/auth', addressRoutes(dbPool));


app.use('/catalog', categoryRoutes(dbPool)); 
app.use('/catalog', storeRoutes(dbPool));    
app.use('/catalog',productRoutes(dbPool))

app.use('/reviews',reviewRoutes(dbPool))

app.use('/finance',financeRoutes(dbPool))

app.use('/debug', debugRoutes(dbPool)); 




app.post('/setup-database', (req, res) => setupDatabase(req, res, dbPool));


app.delete('/reset-database', (req, res) => resetDatabase(req, res, dbPool));



app.get('/', (req, res) => {
  res.send('✅ Server berjalan. Siap memuat rute modular!');
});

// GET /db-tables (Untuk debugging)
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


// =======================================================
// 4. LISTENER SERVER
// =======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('CHECKPOINT 2: app.listen() berhasil dipanggil.');
  console.log(`🚀 Server berjalan di http://localhost:${PORT}.`);
  console.log(`Uji Auth: http://localhost:${PORT}/auth/login`);
  console.log(`Uji Toko: http://localhost:${PORT}/catalog/stores`);
  console.log(`SETUP MIGRATION: POST http://localhost:${PORT}/setup-database`);
}).on('error', (err) => { 
  console.error('SERVER CRASHED (PORT ISSUE):', err.message);
  console.error(`Coba ganti PORT di file .env Anda. Port ${PORT} mungkin sudah digunakan.`);
});