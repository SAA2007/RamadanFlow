const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;

function generateToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Not authenticated.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // Force re-login check: if session was invalidated after token was issued
        try {
            const user = db.prepare('SELECT session_invalidated_at, frozen FROM users WHERE id = ?').get(decoded.id);
            if (user) {
                if (user.session_invalidated_at) {
                    const invalidatedAt = new Date(user.session_invalidated_at).getTime() / 1000;
                    if (decoded.iat < invalidatedAt) {
                        return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
                    }
                }
                // Attach frozen status to req.user for downstream use
                req.user.frozen = user.frozen || 0;
            }
        } catch (e) { /* fail open — don't block if DB check fails */ }

        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
}

function adminMiddleware(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Unauthorized. Admin only.' });
    }
    next();
}

// Middleware to check if user is frozen (block data writes, allow reads)
function frozenCheck(req, res, next) {
    if (req.user && req.user.frozen === 1 && req.method !== 'GET') {
        return res.json({ success: false, error: 'Your account is frozen. No changes allowed.' });
    }
    next();
}

module.exports = { generateToken, authMiddleware, adminMiddleware, frozenCheck, JWT_SECRET };
