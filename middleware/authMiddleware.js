const jwt = require('jsonwebtoken');

// 1. Middleware untuk memverifikasi token JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // Format: Authorization: Bearer <TOKEN>
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        // 401 Unauthorized: Tidak ada token disediakan
        return res.status(401).json({ status: "Gagal", error: "Token otentikasi diperlukan." });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            // 403 Forbidden: Token tidak valid atau kedaluwarsa
            return res.status(403).json({ status: "Gagal", error: "Token tidak valid atau kedaluwarsa." });
        }
        
        // Simpan data user dari payload token ke request
        req.user = user; 
        next();
    });
}

// 2. Middleware untuk memverifikasi peran pengguna
function authorizeRole(roles = []) {
    // Memungkinkan string tunggal (contoh: 'seller') atau array (contoh: ['seller', 'admin'])
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        // Cek apakah user yang terautentikasi memiliki salah satu peran yang diizinkan
        if (!roles.includes(req.user.role)) {
            // 403 Forbidden: User tidak memiliki izin yang diperlukan
            return res.status(403).json({ 
                status: "Gagal", 
                error: "Akses ditolak. Anda tidak memiliki izin untuk tindakan ini." 
            });
        }
        next();
    };
}

module.exports = {
    authenticateToken,
    authorizeRole
};
