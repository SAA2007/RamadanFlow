const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/azkar/log
router.post('/log', (req, res) => {
    try {
        const { username, date, type } = req.body; // type = 'morning' or 'evening'
        if (!username || !date || !type) return res.json({ success: false, error: 'Missing fields.' });

        const existing = db.prepare('SELECT * FROM azkar WHERE username = ? AND date = ?').get(username, date);

        if (existing) {
            const current = type === 'morning' ? existing.morning : existing.evening;
            const newVal = current ? 0 : 1;
            db.prepare(`UPDATE azkar SET ${type} = ? WHERE username = ? AND date = ?`).run(newVal, username, date);
            res.json({ success: true, message: type + (newVal ? ' ✅' : ' removed') });
        } else {
            const morning = type === 'morning' ? 1 : 0;
            const evening = type === 'evening' ? 1 : 0;
            db.prepare('INSERT INTO azkar (username, date, morning, evening) VALUES (?, ?, ?, ?)').run(username, date, morning, evening);
            res.json({ success: true, message: type + ' ✅' });
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
