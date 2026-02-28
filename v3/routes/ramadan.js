const express = require('express');
const db = require('../db/database');
const { logAdminAction } = require('../middleware/analytics');

const router = express.Router();

// ---------------------------------------------------------------
// HARDCODED OVERRIDES — fallback when no admin date is set
// Add new years here when the API returns incorrect start dates.
// Format: { year: { regionId: 'YYYY-MM-DD' } }
// ---------------------------------------------------------------
const RAMADAN_OVERRIDES = {
    2026: {
        ksa: '2026-02-18',
        pak: '2026-02-19',
        az: '2026-02-19'
    }
};

// ---------------------------------------------------------------
// HELPER: get the best date for a region/year
// Priority: 1) Admin DB  2) Hardcoded override  3) null (use API)
// ---------------------------------------------------------------
function getAdminDate(year, region) {
    try {
        const row = db.prepare('SELECT date, note FROM ramadan_dates WHERE year = ? AND region = ?').get(year, region);
        if (row) return { date: row.date, note: row.note, source: 'admin' };
    } catch (e) { }
    if (RAMADAN_OVERRIDES[year] && RAMADAN_OVERRIDES[year][region]) {
        return { date: RAMADAN_OVERRIDES[year][region], note: '', source: 'override' };
    }
    return null;
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

// ---------------------------------------------------------------
// ADMIN: GET saved dates for a year
// ---------------------------------------------------------------
router.get('/admin-dates/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const rows = db.prepare('SELECT region, date, note FROM ramadan_dates WHERE year = ?').all(year);
        const dates = {};
        rows.forEach(r => { dates[r.region] = { date: r.date, note: r.note }; });
        res.json({ success: true, dates });
    } catch (err) {
        res.json({ success: false, error: 'Failed to load dates.' });
    }
});

// ---------------------------------------------------------------
// ADMIN: Save a date for a region
// ---------------------------------------------------------------
router.post('/admin-dates/save', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { year, region, date, note, notifyUsers } = req.body;
        if (!year || !region || !date) return res.json({ success: false, error: 'Missing year, region, or date.' });
        if (!['ksa', 'pak', 'az'].includes(region)) return res.json({ success: false, error: 'Invalid region.' });

        const before = db.prepare('SELECT date, note FROM ramadan_dates WHERE year = ? AND region = ?').get(year, region);
        db.prepare('INSERT OR REPLACE INTO ramadan_dates (year, region, date, set_by_admin, note) VALUES (?, ?, ?, 1, ?)').run(year, region, date, note || '');

        // Invalidate cached region data so next fetch uses the new dates
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_all_regions_%');

        logAdminAction(req.user.username, 'set_ramadan_date', region, before || null, { year, region, date, note });

        // Optionally announce
        if (notifyUsers) {
            const regionNames = { ksa: 'KSA', pak: 'Pakistan', az: 'Azerbaijan' };
            const msg = '📅 Ramadan ' + year + ' starts ' + date + ' in ' + (regionNames[region] || region) + ' — confirmed by admin';
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('announcement', ?)").run(msg);
        }

        res.json({ success: true, message: 'Date saved for ' + region.toUpperCase() + '.' });
    } catch (err) {
        console.error('Admin save date error:', err);
        res.json({ success: false, error: 'Failed to save date.' });
    }
});

// ---------------------------------------------------------------
// ADMIN: Clear a date for a region (fall back to override/API)
// ---------------------------------------------------------------
router.post('/admin-dates/clear', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { year, region } = req.body;
        if (!year || !region) return res.json({ success: false, error: 'Missing year or region.' });

        const before = db.prepare('SELECT date, note FROM ramadan_dates WHERE year = ? AND region = ?').get(year, region);
        db.prepare('DELETE FROM ramadan_dates WHERE year = ? AND region = ?').run(year, region);
        db.prepare('DELETE FROM settings WHERE key LIKE ?').run('ramadan_all_regions_%');

        logAdminAction(req.user.username, 'clear_ramadan_date', region, before || null, { year, region });
        res.json({ success: true, message: region.toUpperCase() + ' date cleared — will use fallback.' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to clear date.' });
    }
});

// GET /api/ramadan/all-regions/:year
router.get('/all-regions/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const key = 'ramadan_all_regions_' + year;

        const regionsToCheck = [
            { id: 'ksa', name: 'Saudi Arabia (Makkah)', city: 'Makkah', country: 'Saudi Arabia' },
            { id: 'pak', name: 'Pakistan (Islamabad)', city: 'Islamabad', country: 'Pakistan' },
            { id: 'az', name: 'Azerbaijan (Baku)', city: 'Baku', country: 'Azerbaijan' }
        ];

        // Build results: check admin DB first, then override map, then API
        const results = {};
        const needsApi = [];

        for (const r of regionsToCheck) {
            const adminDate = getAdminDate(year, r.id);
            if (adminDate) {
                results[r.id] = { name: r.name, start: adminDate.date, source: adminDate.source, note: adminDate.note };
            } else {
                needsApi.push(r);
            }
        }

        // Only fetch API for regions that don't have admin/override dates
        if (needsApi.length > 0) {
            for (const r of needsApi) {
                try {
                    const method = r.id === 'ksa' ? 4 : 2;
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
                            results[r.id] = { name: r.name, start: ramadanStart, source: 'api' };
                        }
                    }
                } catch (e) { /* API failed for this region, skip */ }
            }
        }

        // Cache the result (will be invalidated when admin saves)
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
