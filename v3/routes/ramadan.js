const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/ramadan/:year
router.get('/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const key = 'ramadan_' + year;

        // Check cache first
        const cached = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        if (cached) {
            try {
                return res.json({ success: true, dates: JSON.parse(cached.value) });
            } catch (e) { /* cache corrupted, re-fetch */ }
        }

        // Fetch from Aladhan API
        const url = `https://api.aladhan.com/v1/hijriCalendar/9/${year}?method=2`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.code === 200 && json.data && json.data.length > 0) {
            const firstDay = json.data[0].gregorian.date; // DD-MM-YYYY
            const lastDay = json.data[json.data.length - 1].gregorian.date;

            const startParts = firstDay.split('-');
            const endParts = lastDay.split('-');
            const startDate = startParts[2] + '-' + startParts[1] + '-' + startParts[0];
            const endDate = endParts[2] + '-' + endParts[1] + '-' + endParts[0];

            const result = { start: startDate, end: endDate };

            // Cache it
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(result));

            return res.json({ success: true, dates: result });
        }

        res.json({ success: false, error: 'Could not fetch Ramadan dates for ' + year });
    } catch (err) {
        console.error('Ramadan dates error:', err);
        res.json({ success: false, error: 'Failed to fetch Ramadan dates.' });
    }
});

module.exports = router;
