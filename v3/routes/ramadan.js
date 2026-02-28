const express = require('express');
const db = require('../db/database');
const { logAdminAction } = require('../middleware/analytics');

const router = express.Router();

// ---------------------------------------------------------------
// HARDCODED OVERRIDES — fallback when admin hasn't set dates
// Priority: Admin DB > Hardcoded > Aladhan API
// Format: { year: { regionId: 'YYYY-MM-DD' } }
// ---------------------------------------------------------------
const RAMADAN_OVERRIDES = {
    2026: {
        ksa: '2026-02-18',
        pak: '2026-02-19',
        az: '2026-02-19'
    }
};

const REGION_NAMES = {
    ksa: 'Saudi Arabia (Makkah)',
    pak: 'Pakistan (Islamabad)',
    az: 'Azerbaijan (Baku)'
};

// Helper: get admin-set dates for a year (keyed by region)
function getAdminDates(year) {
    const rows = db.prepare('SELECT region, date, note FROM ramadan_dates WHERE year = ? AND set_by_admin = 1').all(year);
    const map = {};
    rows.forEach(r => { map[r.region] = { date: r.date, note: r.note || '' }; });
    return map;
}

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
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_%_dates');
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_all_regions_%');
        res.json({ success: true, message: 'Region updated to ' + country + ' (' + city + ')' });
    } catch (err) {
        res.json({ success: false, error: 'Database error' });
    }
});

// GET /api/ramadan/admin-dates/:year — admin-set dates for UI display
router.get('/admin-dates/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const adminDates = getAdminDates(year);
        res.json({ success: true, dates: adminDates });
    } catch (err) {
        res.json({ success: false, error: 'Failed' });
    }
});

// POST /api/ramadan/admin-dates — set date for a region (admin only)
router.post('/admin-dates', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { year, region, date, note, notify } = req.body;
    if (!year || !region || !date) return res.json({ success: false, error: 'Missing year, region, or date' });
    if (!['ksa', 'pak', 'az'].includes(region)) return res.json({ success: false, error: 'Invalid region' });

    try {
        db.prepare('INSERT OR REPLACE INTO ramadan_dates (year, region, date, set_by_admin, note, updated_at) VALUES (?, ?, ?, 1, ?, datetime(\'now\'))').run(year, region, date, note || '');

        // Invalidate all-regions cache so next fetch picks up admin date
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_all_regions_%');

        logAdminAction(req.user.username, 'set_ramadan_date', null, null, { year, region, date, note });

        // Optionally set announcement
        if (notify) {
            const regionLabel = REGION_NAMES[region] || region.toUpperCase();
            const msg = '📅 Ramadan ' + year + ' starts ' + date + ' in ' + regionLabel + ' — confirmed by admin';
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('announcement', ?)").run(msg);
        }

        res.json({ success: true, message: 'Date set for ' + region.toUpperCase() + ': ' + date });
    } catch (err) {
        console.error('Set admin date error:', err);
        res.json({ success: false, error: 'Failed to save date.' });
    }
});

// POST /api/ramadan/admin-dates/clear — clear admin date for a region
router.post('/admin-dates/clear', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { year, region } = req.body;
    if (!year || !region) return res.json({ success: false, error: 'Missing year or region' });

    try {
        db.prepare('DELETE FROM ramadan_dates WHERE year = ? AND region = ?').run(year, region);
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_all_regions_%');
        logAdminAction(req.user.username, 'clear_ramadan_date', null, null, { year, region });
        res.json({ success: true, message: region.toUpperCase() + ' date cleared — will fall back to override/API' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to clear date.' });
    }
});

// GET /api/ramadan/all-regions/:year
// Priority: 1) Admin DB  2) Hardcoded override  3) Aladhan API
router.get('/all-regions/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const adminDates = getAdminDates(year);

        const regionsToCheck = [
            { id: 'ksa', name: 'Saudi Arabia (Makkah)', city: 'Makkah', country: 'Saudi Arabia' },
            { id: 'pak', name: 'Pakistan (Islamabad)', city: 'Islamabad', country: 'Pakistan' },
            { id: 'az', name: 'Azerbaijan (Baku)', city: 'Baku', country: 'Azerbaijan' }
        ];

        const results = {};

        // First try API cache
        const key = 'ramadan_all_regions_' + year;
        const cached = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        let apiResults = {};
        if (cached) {
            try { apiResults = JSON.parse(cached.value); } catch (e) { }
        }

        // If no cache, fetch from API
        if (Object.keys(apiResults).length === 0) {
            for (const r of regionsToCheck) {
                const method = r.id === 'ksa' ? 4 : 2;
                try {
                    const url = `https://api.aladhan.com/v1/calendarByCity/${year}?city=${encodeURIComponent(r.city)}&country=${encodeURIComponent(r.country)}&method=${method}`;
                    const response = await fetch(url);
                    const json = await response.json();
                    if (json.code === 200 && json.data) {
                        let ramadanStart = null;
                        for (let m = 1; m <= 12; m++) {
                            const days = json.data[m.toString()];
                            if (days && Array.isArray(days)) {
                                const firstDay = days.find(d => d.date && d.date.hijri && d.date.hijri.month && d.date.hijri.month.number === 9);
                                if (firstDay) {
                                    const dateParts = firstDay.date.gregorian.date.split('-');
                                    ramadanStart = dateParts[2] + '-' + dateParts[1] + '-' + dateParts[0];
                                    break;
                                }
                            }
                        }
                        if (ramadanStart) {
                            apiResults[r.id] = { name: r.name, start: ramadanStart };
                        }
                    }
                } catch (e) { /* skip failed region */ }
            }
            // Cache raw API results
            if (Object.keys(apiResults).length > 0) {
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(apiResults));
            }
        }

        // Build final results with priority layers
        regionsToCheck.forEach(r => {
            const id = r.id;
            let start = null;
            let source = 'api';

            // 3) API (lowest priority)
            if (apiResults[id]) {
                start = apiResults[id].start;
            }

            // 2) Hardcoded override
            if (RAMADAN_OVERRIDES[year] && RAMADAN_OVERRIDES[year][id]) {
                start = RAMADAN_OVERRIDES[year][id];
                source = 'override';
            }

            // 1) Admin DB (highest priority)
            if (adminDates[id]) {
                start = adminDates[id].date;
                source = 'admin';
            }

            if (start) {
                results[id] = { name: r.name, start, source };
            }
        });

        res.json({ success: true, regions: results });
    } catch (err) {
        res.json({ success: false, error: 'Failed' });
    }
});

// GET /api/ramadan/:year
router.get('/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const key = 'ramadan_' + year + '_dates';

        const cached = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        if (cached) {
            try { return res.json({ success: true, dates: JSON.parse(cached.value) }); } catch (e) { }
        }

        let region = null;
        const cachedRegion = db.prepare('SELECT value FROM settings WHERE key = ?').get('ramadan_region');
        if (cachedRegion) {
            try { region = JSON.parse(cachedRegion.value); } catch (e) { }
        }

        let url = '';
        if (region && region.city && region.country) {
            url = `https://api.aladhan.com/v1/calendarByCity/${year}?city=${encodeURIComponent(region.city)}&country=${encodeURIComponent(region.country)}&method=2`;
        } else {
            url = `https://api.aladhan.com/v1/calendarByCity/${year}?city=Makkah&country=Saudi%20Arabia&method=4`;
        }

        const response = await fetch(url);
        const json = await response.json();

        if (json.code === 200 && json.data) {
            let startDay = null;
            let endDay = null;

            for (let m = 1; m <= 12; m++) {
                const days = json.data[m.toString()];
                if (days && Array.isArray(days)) {
                    for (const d of days) {
                        if (d.date && d.date.hijri && d.date.hijri.month.number === 9) {
                            if (!startDay) startDay = d.date.gregorian.date;
                            endDay = d.date.gregorian.date;
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
