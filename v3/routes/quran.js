const express = require('express');
const db = require('../db/database');
const crypto = require('crypto');

const router = express.Router();

function generateId() {
    return crypto.randomBytes(4).toString('hex');
}

// POST /api/quran/create
router.post('/create', (req, res) => {
    try {
        const { type } = req.body;
        const username = req.user.username;
        if (type !== 'Arabic' && type !== 'Translation') {
            return res.json({ success: false, error: 'Type must be Arabic or Translation.' });
        }

        const year = new Date().getFullYear();
        const id = username.toLowerCase() + '_' + type.toLowerCase() + '_' + generateId();
        db.prepare('INSERT INTO khatams (id, username, year, type, para_count) VALUES (?, ?, ?, ?, 0)').run(id, username, year, type);

        res.json({ success: true, khatamId: id, message: 'New ' + type + ' Khatam started!' });
    } catch (err) {
        console.error('Create khatam error:', err);
        res.json({ success: false, error: 'Failed to create khatam.' });
    }
});

// GET /api/quran/:username/:year
router.get('/:username/:year', (req, res) => {
    try {
        const { username, year } = req.params;
        const khatams = db.prepare('SELECT * FROM khatams WHERE username = ? AND year = ? ORDER BY started_at DESC').all(username, parseInt(year));

        const result = khatams.map(k => {
            const paras = db.prepare('SELECT para_number, completed FROM quran_progress WHERE khatam_id = ?').all(k.id);
            const completedParas = {};
            paras.forEach(p => { completedParas[p.para_number] = p.completed === 1; });

            return {
                id: k.id,
                type: k.type,
                startedAt: k.started_at,
                completedAt: k.completed_at,
                paraCount: k.para_count,
                paras: completedParas
            };
        });

        res.json({ success: true, khatams: result });
    } catch (err) {
        console.error('Get khatams error:', err);
        res.json({ success: false, error: 'Failed to get khatams.' });
    }
});

// POST /api/quran/toggle-para
router.post('/toggle-para', (req, res) => {
    try {
        const { khatamId, paraNumber, completed } = req.body;
        const username = req.user.username;

        // Verify ownership
        const khatam = db.prepare('SELECT * FROM khatams WHERE id = ? AND username = ?').get(khatamId, username);
        if (!khatam) return res.json({ success: false, error: 'Khatam not found.' });

        if (completed) {
            db.prepare('INSERT OR REPLACE INTO quran_progress (khatam_id, para_number, completed) VALUES (?, ?, 1)').run(khatamId, paraNumber);
        } else {
            db.prepare('DELETE FROM quran_progress WHERE khatam_id = ? AND para_number = ?').run(khatamId, paraNumber);
        }

        // Update para count
        const count = db.prepare('SELECT COUNT(*) as c FROM quran_progress WHERE khatam_id = ? AND completed = 1').get(khatamId).c;
        const completedAt = count >= 30 ? new Date().toISOString() : null;
        db.prepare('UPDATE khatams SET para_count = ?, completed_at = ? WHERE id = ?').run(count, completedAt, khatamId);

        res.json({ success: true, paraCount: count, message: completed ? 'Para ' + paraNumber + ' completed!' : 'Para ' + paraNumber + ' unmarked.' });
    } catch (err) {
        console.error('Toggle para error:', err);
        res.json({ success: false, error: 'Failed to toggle para.' });
    }
});

// POST /api/quran/delete
router.post('/delete', (req, res) => {
    try {
        const { khatamId } = req.body;
        const username = req.user.username;

        // Verify ownership
        const khatam = db.prepare('SELECT * FROM khatams WHERE id = ? AND username = ?').get(khatamId, username);
        if (!khatam) return res.json({ success: false, error: 'Khatam not found or unauthorized.' });

        // Delete associated progress first, then the khatam itself
        db.prepare('DELETE FROM quran_progress WHERE khatam_id = ?').run(khatamId);
        db.prepare('DELETE FROM khatams WHERE id = ?').run(khatamId);

        res.json({ success: true, message: 'Khatam deleted successfully.' });
    } catch (err) {
        console.error('Delete khatam error:', err);
        res.json({ success: false, error: 'Failed to delete khatam.' });
    }
});

module.exports = router;
