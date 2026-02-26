const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

// GET /api/admin/users
router.get('/users', (req, res) => {
    try {
        const users = db.prepare('SELECT username, email, role, created_at as created FROM users ORDER BY created_at').all();
        res.json({ success: true, users });
    } catch (err) {
        console.error('Admin get users error:', err);
        res.json({ success: false, error: 'Failed to get users.' });
    }
});

// POST /api/admin/reset-password
router.post('/reset-password', (req, res) => {
    try {
        const { targetUsername, newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) {
            return res.json({ success: false, error: 'Password must be at least 4 characters.' });
        }
        const hash = bcrypt.hashSync(newPassword, 10);
        const result = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, targetUsername);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        res.json({ success: true, message: targetUsername + ' password reset.' });
    } catch (err) {
        console.error('Admin reset password error:', err);
        res.json({ success: false, error: 'Failed to reset password.' });
    }
});

// POST /api/admin/change-role
router.post('/change-role', (req, res) => {
    try {
        const { targetUsername, newRole } = req.body;
        if (newRole !== 'admin' && newRole !== 'user') {
            return res.json({ success: false, error: 'Invalid role.' });
        }
        const result = db.prepare('UPDATE users SET role = ? WHERE username = ?').run(newRole, targetUsername);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        res.json({ success: true, message: targetUsername + ' is now ' + newRole });
    } catch (err) {
        console.error('Admin change role error:', err);
        res.json({ success: false, error: 'Failed to change role.' });
    }
});

// POST /api/admin/delete-user
router.post('/delete-user', (req, res) => {
    try {
        const { targetUsername, requestingUser } = req.body;
        if (targetUsername.toLowerCase() === requestingUser.toLowerCase()) {
            return res.json({ success: false, error: 'Cannot delete yourself.' });
        }
        const result = db.prepare('DELETE FROM users WHERE username = ?').run(targetUsername);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        // Also clean up their data
        db.prepare('DELETE FROM taraweeh WHERE username = ?').run(targetUsername);
        db.prepare('DELETE FROM fasting WHERE username = ?').run(targetUsername);
        const khatams = db.prepare('SELECT id FROM khatams WHERE username = ?').all(targetUsername);
        khatams.forEach(k => db.prepare('DELETE FROM quran_progress WHERE khatam_id = ?').run(k.id));
        db.prepare('DELETE FROM khatams WHERE username = ?').run(targetUsername);
        res.json({ success: true, message: targetUsername + ' deleted.' });
    } catch (err) {
        console.error('Admin delete user error:', err);
        res.json({ success: false, error: 'Failed to delete user.' });
    }
});

// GET /api/admin/export/:year
router.get('/export/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const taraweeh = db.prepare('SELECT username, year, date, completed, rakaat FROM taraweeh WHERE year = ?').all(year);
        const khatams = db.prepare('SELECT * FROM khatams WHERE year = ?').all(year);
        const fasting = db.prepare('SELECT username, year, date, completed FROM fasting WHERE year = ?').all(year);

        res.json({ success: true, data: { taraweeh, quran: khatams, fasting } });
    } catch (err) {
        console.error('Admin export error:', err);
        res.json({ success: false, error: 'Failed to export data.' });
    }
});

module.exports = router;
