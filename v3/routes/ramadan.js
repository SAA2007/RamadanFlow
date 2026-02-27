const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/ramadan/region
router.get('/region', (req, res) => {
    try {
        const cached = db.prepare('SELECT value FROM settings WHERE key = ?').get('ramadan_region');
        if (cached) {
            return res.json({ success: true, region: JSON.parse(cached.value) });
        }
        res.json({ success: true, region: null });
    } catch (err) {
        res.json({ success: false, error: 'Failed to fetch region' });
    }
});

// POST /api/ramadan/region
router.post('/region', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
    const { country, city } = req.body;
    if (!country || !city) return res.json({ success: false, error: 'Missing country or city' });

    try {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('ramadan_region', JSON.stringify({ country, city }));
        // Invalidate the dates cache so it fetches again
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_%_dates'); // Assuming we change key to avoid collision with settings like ramadan_region
        res.json({ success: true, message: 'Region updated to ' + country + ' (' + city + ')' });
    } catch (err) {
        res.json({ success: false, error: 'Database error' });
    }
});

// GET /api/ramadan/:year
router.get('/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        // Change key so it doesn't collide with "ramadan_region"
        const key = 'ramadan_' + year + '_dates';

        // Check dates cache first
        const cached = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        if (cached) {
            try { return res.json({ success: true, dates: JSON.parse(cached.value) }); } catch (e) { }
        }

        // Check if we have a custom region set
        let region = null;
        const cachedRegion = db.prepare('SELECT value FROM settings WHERE key = ?').get('ramadan_region');
        if (cachedRegion) {
            try { region = JSON.parse(cachedRegion.value); } catch (e) { }
        }

        let url = '';
        if (region && region.city && region.country) {
            url = `https://api.aladhan.com/v1/hijriCalendarByCity/9/${year}?city=${encodeURIComponent(region.city)}&country=${encodeURIComponent(region.country)}&method=2`;
        } else {
            // Default global (Mecca approximate)
            url = `https://api.aladhan.com/v1/hijriCalendar/9/${year}?method=2`;
        }

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

        res.json({ success: false, error: 'Could not fetch dates for ' + year });
    } catch (err) {
        console.error('Ramadan dates error:', err);
        res.json({ success: false, error: 'Failed to fetch dates.' });
    }
});

module.exports = router;
