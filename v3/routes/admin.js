const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { logAdminAction } = require('../middleware/analytics');

const router = express.Router();

// GET /api/admin/users — returns all users with metadata
router.get('/users', (req, res) => {
    try {
        const users = db.prepare('SELECT username, email, role, gender, age, score_multiplier, frozen, session_invalidated_at, created_at as created FROM users ORDER BY created_at').all();
        res.json({ success: true, users });
    } catch (err) {
        console.error('Admin get users error:', err);
        res.json({ success: false, error: 'Failed to get users.' });
    }
});

// GET /api/admin/reveal-password/:username — returns plain password
router.get('/reveal-password/:username', (req, res) => {
    try {
        const user = db.prepare('SELECT plain_pw FROM users WHERE username = ?').get(req.params.username);
        if (!user) return res.json({ success: false, error: 'User not found.' });
        res.json({ success: true, password: user.plain_pw || 'unavailable' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to reveal password.' });
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
        const result = db.prepare('UPDATE users SET password_hash = ?, plain_pw = ? WHERE username = ?').run(hash, newPassword, targetUsername);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        logAdminAction(req.user.username, 'reset_password', targetUsername, null, { newPassword: '***' });
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
        const before = db.prepare('SELECT role FROM users WHERE username = ?').get(targetUsername);
        const result = db.prepare('UPDATE users SET role = ? WHERE username = ?').run(newRole, targetUsername);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        logAdminAction(req.user.username, 'change_role', targetUsername, before, { role: newRole });
        res.json({ success: true, message: targetUsername + ' is now ' + newRole });
    } catch (err) {
        console.error('Admin change role error:', err);
        res.json({ success: false, error: 'Failed to change role.' });
    }
});

// POST /api/admin/delete-user
router.post('/delete-user', (req, res) => {
    try {
        const { targetUsername } = req.body;
        if (targetUsername.toLowerCase() === req.user.username.toLowerCase()) {
            return res.json({ success: false, error: 'Cannot delete yourself.' });
        }
        const result = db.prepare('DELETE FROM users WHERE username = ?').run(targetUsername);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        // Also clean up their data
        db.prepare('DELETE FROM taraweeh WHERE username = ?').run(targetUsername);
        db.prepare('DELETE FROM fasting WHERE username = ?').run(targetUsername);
        db.prepare('DELETE FROM azkar WHERE username = ?').run(targetUsername);
        db.prepare('DELETE FROM surah_memorization WHERE username = ?').run(targetUsername);
        db.prepare('DELETE FROM namaz WHERE username = ?').run(targetUsername);
        const khatams = db.prepare('SELECT id FROM khatams WHERE username = ?').all(targetUsername);
        khatams.forEach(k => db.prepare('DELETE FROM quran_progress WHERE khatam_id = ?').run(k.id));
        db.prepare('DELETE FROM khatams WHERE username = ?').run(targetUsername);
        logAdminAction(req.user.username, 'delete_user', targetUsername, null, null);
        res.json({ success: true, message: targetUsername + ' deleted.' });
    } catch (err) {
        console.error('Admin delete user error:', err);
        res.json({ success: false, error: 'Failed to delete user.' });
    }
});

// POST /api/admin/set-multiplier
router.post('/set-multiplier', (req, res) => {
    try {
        const { username, multiplier } = req.body;
        const m = parseFloat(multiplier);
        if (isNaN(m) || m < 0.1 || m > 5.0) {
            return res.json({ success: false, error: 'Multiplier must be between 0.1 and 5.0' });
        }
        const before = db.prepare('SELECT score_multiplier FROM users WHERE username = ?').get(username);
        const result = db.prepare('UPDATE users SET score_multiplier = ? WHERE username = ?').run(m, username);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        logAdminAction(req.user.username, 'set_multiplier', username, before, { score_multiplier: m });
        res.json({ success: true, message: username + ' multiplier set to ' + m + 'x' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to set multiplier.' });
    }
});

// POST /api/admin/toggle-freeze
router.post('/toggle-freeze', (req, res) => {
    try {
        const { username, frozen } = req.body;
        const val = frozen ? 1 : 0;
        const before = db.prepare('SELECT frozen FROM users WHERE username = ?').get(username);
        const result = db.prepare('UPDATE users SET frozen = ? WHERE username = ?').run(val, username);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        logAdminAction(req.user.username, 'toggle_freeze', username, before, { frozen: val });
        res.json({ success: true, message: username + (val ? ' frozen 🔒' : ' unfrozen 🔓') });
    } catch (err) {
        res.json({ success: false, error: 'Failed to toggle freeze.' });
    }
});

// POST /api/admin/invalidate-session
router.post('/invalidate-session', (req, res) => {
    try {
        const { username } = req.body;
        const result = db.prepare("UPDATE users SET session_invalidated_at = datetime('now') WHERE username = ?").run(username);
        if (result.changes === 0) return res.json({ success: false, error: 'User not found.' });
        logAdminAction(req.user.username, 'invalidate_session', username, null, { forced_relogin: true });
        res.json({ success: true, message: username + ' session invalidated. They must re-login.' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to invalidate session.' });
    }
});

// POST /api/admin/announcement
router.post('/announcement', (req, res) => {
    try {
        const { message } = req.body;
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('announcement', ?)").run(message || '');
        logAdminAction(req.user.username, 'set_announcement', null, null, { message });
        res.json({ success: true, message: message ? 'Announcement set.' : 'Announcement cleared.' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to set announcement.' });
    }
});

// GET /api/admin/user-data/:username/:year — all tracker data for a user
router.get('/user-data/:username/:year', (req, res) => {
    try {
        const { username, year } = req.params;
        const y = parseInt(year);

        const taraweeh = db.prepare('SELECT id, date, completed, rakaat FROM taraweeh WHERE username = ? AND year = ? ORDER BY date').all(username, y);
        const fasting = db.prepare('SELECT id, date, completed FROM fasting WHERE username = ? AND year = ? ORDER BY date').all(username, y);
        const azkar = db.prepare("SELECT id, date, morning, evening FROM azkar WHERE username = ? AND date LIKE ? ORDER BY date").all(username, y + '%');
        const namaz = db.prepare("SELECT id, date, prayer, location FROM namaz WHERE username = ? AND date LIKE ? ORDER BY date, prayer").all(username, y + '%');
        const khatams = db.prepare('SELECT id, type, para_count, started_at, completed_at FROM khatams WHERE username = ? AND year = ?').all(username, y);
        const surah = db.prepare('SELECT id, surah_number, surah_name, total_ayah, memorized_ayah, completed_at FROM surah_memorization WHERE username = ?').all(username);

        res.json({ success: true, data: { taraweeh, fasting, azkar, namaz, khatams, surah } });
    } catch (err) {
        console.error('Admin get user data error:', err);
        res.json({ success: false, error: 'Failed to load user data.' });
    }
});

// POST /api/admin/user-data/save — bulk update user data
router.post('/user-data/save', (req, res) => {
    try {
        const { username, changes } = req.body;
        // changes = [{ type: 'taraweeh', id: 5, field: 'rakaat', value: 12 }, ...]
        if (!changes || !Array.isArray(changes)) {
            return res.json({ success: false, error: 'No changes provided.' });
        }

        const ALLOWED = {
            taraweeh: ['completed', 'rakaat'],
            fasting: ['completed'],
            azkar: ['morning', 'evening'],
            namaz: ['location'],
            surah_memorization: ['memorized_ayah']
        };

        let applied = 0;
        const auditEntries = [];

        changes.forEach(c => {
            const table = c.type;
            const allowedFields = ALLOWED[table];
            if (!allowedFields || !allowedFields.includes(c.field)) return;

            // Get before state
            const before = db.prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(c.id);
            if (!before) return;

            db.prepare('UPDATE ' + table + ' SET ' + c.field + ' = ? WHERE id = ?').run(c.value, c.id);
            applied++;
            auditEntries.push({ table, id: c.id, field: c.field, before: before[c.field], after: c.value });
        });

        if (auditEntries.length > 0) {
            logAdminAction(req.user.username, 'edit_user_data', username, null, { edits: auditEntries });
        }

        res.json({ success: true, message: applied + ' change(s) saved.' });
    } catch (err) {
        console.error('Admin save user data error:', err);
        res.json({ success: false, error: 'Failed to save changes.' });
    }
});

// GET /api/admin/export/:year
router.get('/export/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const taraweeh = db.prepare('SELECT username, year, date, completed, rakaat FROM taraweeh WHERE year = ?').all(year);
        const khatams = db.prepare('SELECT * FROM khatams WHERE year = ?').all(year);
        const fasting = db.prepare('SELECT username, year, date, completed FROM fasting WHERE year = ?').all(year);
        const azkar = db.prepare("SELECT username, date, morning, evening FROM azkar WHERE date LIKE ?").all(year + '%');
        const surah = db.prepare('SELECT username, surah_number, surah_name, total_ayah, memorized_ayah, completed_at FROM surah_memorization').all();
        const namaz = db.prepare("SELECT username, date, prayer, location FROM namaz WHERE date LIKE ?").all(year + '%');

        res.json({ success: true, data: { taraweeh, quran: khatams, fasting, azkar, surah, namaz } });
    } catch (err) {
        console.error('Admin export error:', err);
        res.json({ success: false, error: 'Failed to export data.' });
    }
});

module.exports = router;
