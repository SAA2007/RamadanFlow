const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/namaz/log
router.post('/log', (req, res) => {
    try {
        const { username, date, prayer, location } = req.body;
        // prayer: fajr, dhuhr, asr, maghrib, isha
        // location: mosque, home, missed
        if (!username || !date || !prayer || !location) {
            return res.json({ success: false, error: 'Missing fields.' });
        }

        if (location === 'missed') {
            db.prepare('DELETE FROM namaz WHERE username = ? AND date = ? AND prayer = ?').run(username, date, prayer);
        } else {
            db.prepare('INSERT OR REPLACE INTO namaz (username, date, prayer, location) VALUES (?, ?, ?, ?)')
                .run(username, date, prayer, location);
        }

        res.json({ success: true, message: prayer + (location === 'missed' ? ' cleared' : ' — ' + location + ' 🕌') });
    } catch (err) {
        console.error('Namaz log error:', err);
        res.json({ success: false, error: 'Failed to log namaz.' });
    }
});

// GET /api/namaz/:username/:year/:month (month is 1-indexed)
router.get('/:username/:year/:month', (req, res) => {
    try {
        const { username, year, month } = req.params;
        const prefix = year + '-' + String(month).padStart(2, '0');
        const rows = db.prepare("SELECT date, prayer, location FROM namaz WHERE username = ? AND date LIKE ?")
            .all(username, prefix + '%');

        // Group by date
        const data = {};
        rows.forEach(r => {
            if (!data[r.date]) data[r.date] = {};
            data[r.date][r.prayer] = r.location;
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error('Namaz get error:', err);
        res.json({ success: false, error: 'Failed to load namaz.' });
    }
});

module.exports = router;
