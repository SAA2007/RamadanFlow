require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { authMiddleware, adminMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================================================================
// MIDDLEWARE
// ===================================================================

app.use(cors());
app.use(express.json());

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

// Auth — no middleware needed (login/register are public)
app.use('/api/auth', require('./routes/auth'));

// Protected routes — require JWT
app.use('/api/taraweeh', authMiddleware, require('./routes/taraweeh'));
app.use('/api/quran', authMiddleware, require('./routes/quran'));
app.use('/api/fasting', authMiddleware, require('./routes/fasting'));
app.use('/api/azkar', authMiddleware, require('./routes/azkar'));
app.use('/api/surah', authMiddleware, require('./routes/surah'));
app.use('/api/namaz', authMiddleware, require('./routes/namaz'));
app.use('/api/dashboard', authMiddleware, require('./routes/dashboard'));
app.use('/api/ramadan', authMiddleware, require('./routes/ramadan'));

// Admin routes — require JWT + admin role
app.use('/api/admin', authMiddleware, adminMiddleware, require('./routes/admin'));

// ===================================================================
// SPA FALLBACK — serve index.html for all non-API routes
// ===================================================================

app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================================
// START SERVER
// ===================================================================

app.listen(PORT, () => {
    console.log('');
    console.log('  🕌 RamadanFlow v3.1 is running!');
    console.log('  ─────────────────────────────────');
    console.log(`  URL:  http://localhost:${PORT}`);
    console.log('');
});
