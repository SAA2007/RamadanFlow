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

// GET /api/ramadan/all-regions/:year
router.get('/all-regions/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const key = 'ramadan_all_regions_' + year;

        // Check cache
        const cached = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        if (cached) {
            try { return res.json({ success: true, regions: JSON.parse(cached.value) }); } catch (e) { }
        }

        const regionsToCheck = [
            { id: 'ksa', name: 'Saudi Arabia (Makkah)', city: 'Makkah', country: 'Saudi Arabia' },
            { id: 'pak', name: 'Pakistan (Islamabad)', city: 'Islamabad', country: 'Pakistan' },
            { id: 'az', name: 'Azerbaijan (Baku)', city: 'Baku', country: 'Azerbaijan' }
        ];

        const results = {};
        for (const r of regionsToCheck) {
            const method = r.id === 'ksa' ? 4 : 2; // Use Umm al-Qura for KSA
            const url = `https://api.aladhan.com/v1/calendarByCity/${year}?city=${encodeURIComponent(r.city)}&country=${encodeURIComponent(r.country)}&method=${method}`;
            const response = await fetch(url);
            const json = await response.json();
            if (json.code === 200 && json.data) {
                let ramadanStart = null;
                for (let m = 1; m <= 12; m++) {
                    const days = json.data[m.toString()];
                    if (days) {
                        const firstDay = days.find(d => d.hijri.month.number === 9);
                        if (firstDay) {
                            const dateParts = firstDay.gregorian.date.split('-');
                            ramadanStart = dateParts[2] + '-' + dateParts[1] + '-' + dateParts[0];
                            break;
                        }
                    }
                }
                if (ramadanStart) {
                    results[r.id] = { name: r.name, start: ramadanStart };
                }
            }
        }

        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(results));
        res.json({ success: true, regions: results });
    } catch (err) {
        res.json({ success: false, error: 'Failed' });
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
            url = `https://api.aladhan.com/v1/calendarByCity/${year}?city=${encodeURIComponent(region.city)}&country=${encodeURIComponent(region.country)}&method=2`;
        } else {
            // Default global (Mecca approximate)
            url = `https://api.aladhan.com/v1/calendarByCity/${year}?city=Makkah&country=Saudi%20Arabia&method=4`;
        }

        const response = await fetch(url);
        const json = await response.json();

        if (json.code === 200 && json.data) {
            let startDay = null;
            let endDay = null;

            for (let m = 1; m <= 12; m++) {
                const days = json.data[m.toString()];
                if (days) {
                    for (const d of days) {
                        if (d.hijri.month.number === 9) {
                            if (!startDay) startDay = d.gregorian.date;
                            endDay = d.gregorian.date;
                        }
                    }
                }
            }

            if (startDay && endDay) {
                const startParts = startDay.split('-');
                const endParts = endDay.split('-');
                const startDate = startParts[2] + '-' + startParts[1] + '-' + startParts[0];
                const endDate = endParts[2] + '-' + endParts[1] + '-' + endParts[0];

                const result = { start: startDate, end: endDate };

                // Cache it
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(result));

                return res.json({ success: true, dates: result });
            }
        }

        res.json({ success: false, error: 'Could not fetch dates for ' + year });
    } catch (err) {
        console.error('Ramadan dates error:', err);
        res.json({ success: false, error: 'Failed to fetch dates.' });
    }
});

module.exports = router;
