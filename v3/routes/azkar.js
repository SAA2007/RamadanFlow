const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/azkar/log
router.post('/log', (req, res) => {
    try {
        const { date, morning, evening } = req.body;
        const username = req.user.username; // from JWT
        if (!date) return res.json({ success: false, error: 'Missing date field.' });

        const mVal = morning ? 1 : 0;
        const eVal = evening ? 1 : 0;

        const existing = db.prepare('SELECT * FROM azkar WHERE username = ? AND date = ?').get(username, date);

        if (existing) {
            db.prepare('UPDATE azkar SET morning = ?, evening = ? WHERE username = ? AND date = ?').run(mVal, eVal, username, date);
            res.json({ success: true, message: 'Azkar Updated ✅' });
        } else {
            db.prepare('INSERT INTO azkar (username, date, morning, evening) VALUES (?, ?, ?, ?)').run(username, date, mVal, eVal);
            res.json({ success: true, message: 'Azkar Logged ✅' });
        }
    } catch (err) {
        console.error('Azkar log error:', err);
        res.json({ success: false, error: 'Failed to log azkar.' });
    }
});

// GET /api/azkar/:username/:year
router.get('/:username/:year', (req, res) => {
    try {
        const rows = db.prepare("SELECT date, morning, evening FROM azkar WHERE username = ? AND date LIKE ?").all(req.params.username, req.params.year + '%');
        const data = {};
        rows.forEach(r => { data[r.date] = { morning: !!r.morning, evening: !!r.evening }; });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Azkar get error:', err);
        res.json({ success: false, error: 'Failed to load azkar.' });
    }
});

module.exports = router;
