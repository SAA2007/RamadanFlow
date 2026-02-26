const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/surah/add
router.post('/add', (req, res) => {
    try {
        const { surahNumber, surahName, totalAyah } = req.body;
        const username = req.user.username;
        if (!surahNumber || !surahName || !totalAyah) {
            return res.json({ success: false, error: 'Missing fields.' });
        }
        db.prepare('INSERT INTO surah_memorization (username, surah_number, surah_name, total_ayah) VALUES (?, ?, ?, ?)')
            .run(username, surahNumber, surahName, totalAyah);
        res.json({ success: true, message: 'Started memorizing ' + surahName + '!' });
    } catch (err) {
        console.error('Surah add error:', err);
        res.json({ success: false, error: 'Failed to add surah.' });
    }
});

// POST /api/surah/update
router.post('/update', (req, res) => {
    try {
        const { id, memorizedAyah } = req.body;
        const surah = db.prepare('SELECT * FROM surah_memorization WHERE id = ? AND username = ?').get(id, req.user.username);
        if (!surah) return res.json({ success: false, error: 'Surah not found or not yours.' });

        const clamped = Math.min(Math.max(0, memorizedAyah), surah.total_ayah);
        const completedAt = clamped >= surah.total_ayah ? new Date().toISOString() : null;

        db.prepare('UPDATE surah_memorization SET memorized_ayah = ?, completed_at = ? WHERE id = ?')
            .run(clamped, completedAt, id);

        res.json({ success: true, message: clamped + '/' + surah.total_ayah + ' ayah memorized' + (completedAt ? ' — Complete! 🎉' : '') });
    } catch (err) {
        console.error('Surah update error:', err);
        res.json({ success: false, error: 'Failed to update.' });
    }
});

// POST /api/surah/delete
router.post('/delete', (req, res) => {
    try {
        const { id } = req.body;
        const result = db.prepare('DELETE FROM surah_memorization WHERE id = ? AND username = ?').run(id, req.user.username);
        if (result.changes === 0) return res.json({ success: false, error: 'Not found or not yours.' });
        res.json({ success: true, message: 'Surah removed.' });
    } catch (err) {
        console.error('Surah delete error:', err);
        res.json({ success: false, error: 'Failed to delete.' });
    }
});

// GET /api/surah/:username
router.get('/:username', (req, res) => {
    try {
        const surahs = db.prepare('SELECT * FROM surah_memorization WHERE username = ? ORDER BY started_at DESC')
            .all(req.params.username);
        res.json({ success: true, surahs });
    } catch (err) {
        console.error('Surah get error:', err);
        res.json({ success: false, error: 'Failed to load surahs.' });
    }
});

module.exports = router;
