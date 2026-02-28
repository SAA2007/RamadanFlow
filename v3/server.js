require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ===================================================================
// AUTO-SETUP: Generate .env if missing
// ===================================================================

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const secret = crypto.randomBytes(32).toString('hex');
    const envContent = `PORT=3000\nJWT_SECRET=${secret}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log('');
    console.log('  ✅ Created .env with auto-generated JWT_SECRET');
    console.log('  ⚠️  Restart the server to load the new .env');
    console.log('');
    // Reload env vars now
    require('dotenv').config({ path: envPath, override: true });
}

// Validate JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'ramadanflow_default_secret') {
    console.error('');
    console.error('  ❌ FATAL: JWT_SECRET is not set or is the default value.');
    console.error('     Edit .env and set a proper JWT_SECRET.');
    console.error('');
    process.exit(1);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const { authMiddleware, adminMiddleware, frozenCheck } = require('./middleware/auth');
const { analyticsMiddleware, honeypotHandler, honeypotFieldCheck } = require('./middleware/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================================================================
// MIDDLEWARE
// ===================================================================

app.use(helmet({ contentSecurityPolicy: false })); // Security headers
app.use(cors());
app.use(express.json());

// Analytics middleware — tracks every request for security telemetry
app.use(analyticsMiddleware);

// Rate limit for auth routes (5 attempts per minute per IP)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, error: 'Too many attempts. Try again in a minute.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Serve static frontend files from /public
var publicDir = path.resolve(__dirname, 'public');
app.use(express.static(publicDir));

// Explicit root route
app.get('/', function (req, res) {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// ===================================================================
// API ROUTES
// ===================================================================

// Auth — rate-limited, public (login/register), with honeypot field check
app.use('/api/auth', authLimiter, honeypotFieldCheck, require('./routes/auth'));

// Protected routes — require JWT
app.use('/api/taraweeh', authMiddleware, frozenCheck, require('./routes/taraweeh'));
app.use('/api/quran', authMiddleware, frozenCheck, require('./routes/quran'));
app.use('/api/fasting', authMiddleware, frozenCheck, require('./routes/fasting'));
app.use('/api/azkar', authMiddleware, frozenCheck, require('./routes/azkar'));
app.use('/api/surah', authMiddleware, frozenCheck, require('./routes/surah'));
app.use('/api/namaz', authMiddleware, frozenCheck, require('./routes/namaz'));
app.use('/api/dashboard', authMiddleware, require('./routes/dashboard'));
app.use('/api/ramadan', authMiddleware, require('./routes/ramadan'));

// Admin routes — require JWT + admin role
app.use('/api/admin', authMiddleware, adminMiddleware, require('./routes/admin'));

// Analytics routes — mixed auth (fingerprint/events are public, admin feeds require admin)
app.use('/api/analytics', require('./routes/analytics'));

// Public announcement endpoint
const announcementDb = require('./db/database');
app.get('/api/announcement', function (req, res) {
    try {
        var row = announcementDb.prepare("SELECT value FROM settings WHERE key = 'announcement'").get();
        res.json({ success: true, message: (row && row.value) ? row.value : '' });
    } catch (e) {
        res.json({ success: true, message: '' });
    }
});

// Honeypot routes — fake endpoints that flag callers
app.get('/api/export', honeypotHandler({ success: true, data: [], format: 'csv', message: 'Export queued' }));
app.get('/api/users/all', honeypotHandler({ success: true, users: [], total: 0, page: 1 }));
app.get('/admin/backup', honeypotHandler({ success: true, backup_id: 'bk_' + Date.now(), status: 'queued' }));
app.get('/admin/dump', honeypotHandler({ success: true, tables: [], format: 'sql' }));
app.get('/api/debug', honeypotHandler({ success: true, debug: true, env: 'production', uptime: process.uptime() }));

// ===================================================================
// SPA FALLBACK — serve index.html for all non-API routes
// ===================================================================

app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================================
// START SERVER
// ===================================================================

const http = require('http');
const https = require('https');

let server;
const sslPath = path.join(__dirname, 'ssl');
const keyPath = path.join(sslPath, 'privkey.pem');
const certPath = path.join(sslPath, 'fullchain.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
    server = https.createServer(options, app);
    console.log('');
    console.log('  🔒 SSL Certificates found in /ssl');
    console.log('  🕌 RamadanFlow v3.RC1 is running in HTTPS mode!');
    console.log('  ─────────────────────────────────');
    console.log(`  URL:  https://localhost:${PORT}`);
    console.log('');
} else {
    server = http.createServer(app);
    console.log('');
    console.log('  ⚠️  No SSL certs in /ssl. Starting HTTP mode.');
    console.log('  🕌 RamadanFlow v3.RC1 is running!');
    console.log('  ─────────────────────────────────');
    console.log(`  URL:  http://localhost:${PORT}`);
    console.log('');
}

server.listen(PORT);
