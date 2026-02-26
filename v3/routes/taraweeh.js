const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/taraweeh/log
router.post('/log', (req, res) => {
    try {
        const { date, completed, rakaat } = req.body;
        const username = req.user.username;

        const dateStr = date || new Date().toISOString().slice(0, 10);
        const year = parseInt(dateStr.slice(0, 4));

        if (!completed) {
            // Remove entry
            db.prepare('DELETE FROM taraweeh WHERE username = ? AND date = ?').run(username, dateStr);
            return res.json({ success: true, message: 'Taraweeh removed for ' + dateStr });
        }

        // Upsert
        const existing = db.prepare('SELECT id FROM taraweeh WHERE username = ? AND date = ?').get(username, dateStr);
        if (existing) {
            db.prepare('UPDATE taraweeh SET completed = ?, rakaat = ? WHERE id = ?').run('YES', rakaat || 8, existing.id);
        } else {
            db.prepare('INSERT INTO taraweeh (username, year, date, completed, rakaat) VALUES (?, ?, ?, ?, ?)').run(username, year, dateStr, 'YES', rakaat || 8);
        }
        res.json({ success: true, message: 'Taraweeh logged for ' + dateStr });
    } catch (err) {
        console.error('Taraweeh log error:', err);
        res.json({ success: false, error: 'Failed to log taraweeh.' });
    }
});

// GET /api/taraweeh/:username/:year
router.get('/:username/:year', (req, res) => {
    try {
        const username = req.params.username;
        const year = req.params.year;
        const rows = db.prepare('SELECT date, completed, rakaat FROM taraweeh WHERE username = ? AND year = ?').all(username, parseInt(year));

        const data = {};
        rows.forEach(r => {
            data[r.date] = { completed: r.completed === 'YES', rakaat: String(r.rakaat || 8) };
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error('Taraweeh get error:', err);
        res.json({ success: false, error: 'Failed to get taraweeh data.' });
    }
});

module.exports = router;
