const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/fasting/log
router.post('/log', (req, res) => {
    try {
        const { date, completed } = req.body;
        const username = req.user.username;

        const dateStr = date || new Date().toISOString().slice(0, 10);
        const year = parseInt(dateStr.slice(0, 4));

        if (!completed) {
            db.prepare('DELETE FROM fasting WHERE username = ? AND date = ?').run(username, dateStr);
            return res.json({ success: true, message: 'Fasting removed for ' + dateStr });
        }

        const existing = db.prepare('SELECT id FROM fasting WHERE username = ? AND date = ?').get(username, dateStr);
        if (existing) {
            return res.json({ success: true, message: 'Already logged.' });
        }

        db.prepare('INSERT INTO fasting (username, year, date, completed) VALUES (?, ?, ?, ?)').run(username, year, dateStr, 'YES');
        res.json({ success: true, message: 'Fasting logged for ' + dateStr });
    } catch (err) {
        console.error('Fasting log error:', err);
        res.json({ success: false, error: 'Failed to log fasting.' });
    }
});

// GET /api/fasting/:username/:year
router.get('/:username/:year', (req, res) => {
    try {
        const { username, year } = req.params;
        const rows = db.prepare('SELECT date, completed FROM fasting WHERE username = ? AND year = ?').all(username, parseInt(year));

        const data = {};
        rows.forEach(r => {
            data[r.date] = { completed: r.completed === 'YES' };
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error('Fasting get error:', err);
        res.json({ success: false, error: 'Failed to get fasting data.' });
    }
});

module.exports = router;
