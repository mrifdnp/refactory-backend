// --- SQL untuk membuat semua ENUM types ---
const createEnumsQuery = `
-- Enum untuk role pengguna
CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'admin');

-- Enum untuk status pesanan
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'failed');

-- Enum untuk status penarikan dana
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processed', 'failed');

-- Enum untuk jenis transaksi
CREATE TYPE transaction_type AS ENUM ('sale', 'commission', 'withdrawal', 'refund', 'adjustment');
`;

// --- SQL untuk membuat semua Tables ---
const createTablesQuery = `
-- Tabel pusat untuk semua pengguna
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    role user_role NOT NULL DEFAULT 'buyer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk profil toko milik penjual
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    logo_url VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk menyimpan banyak alamat per pengguna
CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    address_line TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(10),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk kategori produk
CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- Tabel utama untuk semua produk yang dijual
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id),
    category_id INT REFERENCES product_categories(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    sku VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk pesanan dari pembeli
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    total_amount DECIMAL(10, 2) NOT NULL,
    shipping_address TEXT NOT NULL,
    shipping_provider VARCHAR(50),
    tracking_number VARCHAR(100),
    status order_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel perantara untuk detail item di setiap pesanan
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id),
    product_id INT NOT NULL REFERENCES products(id),
    store_id INT NOT NULL REFERENCES stores(id),
    quantity INT NOT NULL,
    price_per_item DECIMAL(10, 2) NOT NULL
);

-- Tabel untuk ulasan produk
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    product_id INT NOT NULL REFERENCES products(id),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk menyimpan saldo penjual
CREATE TABLE IF NOT EXISTS seller_balances (
    id SERIAL PRIMARY KEY,
    store_id INT UNIQUE NOT NULL REFERENCES stores(id),
    available_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    pending_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk mencatat permintaan penarikan dana
CREATE TABLE IF NOT EXISTS withdrawals (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id),
    amount DECIMAL(12, 2) NOT NULL,
    status withdrawal_status NOT NULL DEFAULT 'pending',
    bank_account_info TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Tabel buku besar untuk semua transaksi keuangan (audit trail)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id),
    order_item_id INT REFERENCES order_items(id),
    withdrawal_id INT REFERENCES withdrawals(id),
    type transaction_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

module.exports = {
    createEnumsQuery,
    createTablesQuery
};
