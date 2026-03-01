const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { logAdminAction } = require('../middleware/analytics');

const router = express.Router();

// GET /api/admin/users — returns all users with metadata + score
router.get('/users', (req, res) => {
    try {
        const users = db.prepare('SELECT username, email, role, gender, age, score_multiplier, frozen, session_invalidated_at, created_at as created FROM users ORDER BY created_at').all();
        const year = new Date().getFullYear();
        users.forEach(u => {
            let entries = 0;
            try {
                entries += db.prepare('SELECT COUNT(*) as c FROM taraweeh WHERE username = ? AND year = ?').get(u.username, year).c;
                entries += db.prepare('SELECT COUNT(*) as c FROM fasting WHERE username = ? AND year = ?').get(u.username, year).c;
                entries += db.prepare("SELECT COUNT(*) as c FROM azkar WHERE username = ? AND date LIKE ?").get(u.username, year + '%').c;
                entries += db.prepare("SELECT COUNT(*) as c FROM namaz WHERE username = ? AND date LIKE ?").get(u.username, year + '%').c;
            } catch (e) { }
            u.score = entries;
        });
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

// GET /api/admin/status — overview data for admin dashboard
router.get('/status', (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
        const today = new Date().toISOString().slice(0, 10);

        // Count today's tracker entries across all tables
        let todayEntries = 0;
        try {
            todayEntries += db.prepare("SELECT COUNT(*) as c FROM taraweeh WHERE date = ?").get(today).c;
            todayEntries += db.prepare("SELECT COUNT(*) as c FROM fasting WHERE date = ?").get(today).c;
            todayEntries += db.prepare("SELECT COUNT(*) as c FROM azkar WHERE date = ?").get(today).c;
            todayEntries += db.prepare("SELECT COUNT(*) as c FROM namaz WHERE date = ?").get(today).c;
        } catch (e) { }

        // Most active user today
        let mostActive = { username: '—', count: 0 };
        try {
            const rows = [
                ...db.prepare("SELECT username FROM taraweeh WHERE date = ?").all(today),
                ...db.prepare("SELECT username FROM fasting WHERE date = ?").all(today),
                ...db.prepare("SELECT username FROM azkar WHERE date = ?").all(today),
                ...db.prepare("SELECT username FROM namaz WHERE date = ?").all(today)
            ];
            const counts = {};
            rows.forEach(r => { counts[r.username] = (counts[r.username] || 0) + 1; });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            if (top) mostActive = { username: top[0], count: top[1] };
        } catch (e) { }

        // HIGH severity anomalies in last 24h
        let highAnomalies = 0;
        try {
            highAnomalies = db.prepare("SELECT COUNT(*) as c FROM analytics_anomalies WHERE severity = 'HIGH' AND created_at >= datetime('now', '-24 hours')").get().c;
        } catch (e) { }

        // Table row counts for DB stats
        let tableCounts = {};
        try {
            const tables = ['users', 'taraweeh', 'khatams', 'quran_progress', 'fasting', 'azkar', 'namaz', 'surah_memorization', 'settings', 'ramadan_dates',
                'analytics_events', 'analytics_fingerprints', 'analytics_typing_profiles', 'analytics_anomalies', 'analytics_admin_audit', 'analytics_honeypot', 'analytics_requests'];
            tables.forEach(t => {
                try { tableCounts[t] = db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c; } catch (e) { tableCounts[t] = 0; }
            });
        } catch (e) { }

        // DB file size
        let dbSize = 0;
        try {
            const fs = require('fs');
            const path = require('path');
            const stats = fs.statSync(path.join(__dirname, '..', 'data', 'ramadanflow.db'));
            dbSize = stats.size;
        } catch (e) { }

        res.json({
            success: true,
            uptime: Math.floor(process.uptime()),
            gitHash: global.GIT_INFO ? global.GIT_INFO.hash : 'unknown',
            gitDate: global.GIT_INFO ? global.GIT_INFO.date : 'unknown',
            totalUsers,
            todayEntries,
            mostActive,
            highAnomalies,
            tableCounts,
            dbSize
        });
    } catch (err) {
        console.error('Admin status error:', err);
        res.json({ success: false, error: 'Failed to load admin status.' });
    }
});

// POST /api/admin/db-checkpoint — WAL checkpoint
router.post('/db-checkpoint', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        let walSizeBefore = 0;
        try {
            const walPath = path.join(__dirname, '..', 'data', 'ramadanflow.db-wal');
            if (fs.existsSync(walPath)) walSizeBefore = fs.statSync(walPath).size;
        } catch (e) { }

        const start = Date.now();
        db.pragma('wal_checkpoint(TRUNCATE)');
        const duration = Date.now() - start;

        logAdminAction(req.user.username, 'db_checkpoint', null, null, { duration_ms: duration, wal_size_before: walSizeBefore });
        res.json({ success: true, duration_ms: duration, wal_size_before: walSizeBefore });
    } catch (err) {
        console.error('DB checkpoint error:', err);
        res.json({ success: false, error: 'Checkpoint failed.' });
    }
});

// GET /api/admin/scoring-config — public read (for display in stats explainer)
router.get('/scoring-config', (req, res) => {
    try {
        const rows = db.prepare('SELECT key, value, label, description FROM scoring_config ORDER BY rowid').all();
        res.json({ success: true, configs: rows });
    } catch (err) {
        res.json({ success: false, error: 'Failed to load scoring config.' });
    }
});

// POST /api/admin/scoring-config — admin only, update configs
router.post('/scoring-config', (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        const { configs } = req.body;
        if (!configs || !Array.isArray(configs)) return res.json({ success: false, error: 'Invalid configs array.' });
        const updateStmt = db.prepare('UPDATE scoring_config SET value = ? WHERE key = ?');
        const before = {};
        const after = {};
        db.prepare('SELECT key, value FROM scoring_config').all().forEach(r => { before[r.key] = r.value; });
        const tx = db.transaction(() => {
            configs.forEach(c => {
                if (c.key && c.value !== undefined) {
                    updateStmt.run(parseFloat(c.value), c.key);
                    after[c.key] = parseFloat(c.value);
                }
            });
        });
        tx();
        logAdminAction(req.user.username, 'update_scoring_config', null, JSON.stringify(before), { after });
        res.json({ success: true, message: 'Scoring config updated.' });
    } catch (err) {
        console.error('Scoring config update error:', err);
        res.json({ success: false, error: 'Failed to update scoring config.' });
    }
});

// POST /api/admin/scoring-config/reset — admin only, reseed defaults
router.post('/scoring-config/reset', (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
    try {
        db.prepare('DELETE FROM scoring_config').run();
        const seedStmt = db.prepare('INSERT INTO scoring_config (key, value, label, description) VALUES (?, ?, ?, ?)');
        const defaults = [
            ['taraweeh_per_rakaat', 1.5, 'Taraweeh per Rakaat', 'Points per rakaat of taraweeh prayer'],
            ['quran_per_para', 10, 'Quran per Para', 'Points per para read'],
            ['quran_per_khatam', 50, 'Quran per Khatam', 'Bonus points for completing a full Quran'],
            ['fasting_per_day', 15, 'Fasting per Day', 'Points per day of fasting'],
            ['azkar_per_session', 3, 'Azkar per Session', 'Points per morning or evening adhkar session'],
            ['surah_per_ayah', 0.5, 'Surah per Ayah', 'Points per ayah memorized'],
            ['namaz_mosque', 4, 'Namaz (Mosque)', 'Points per prayer at the mosque'],
            ['namaz_home_men', 2, 'Namaz Home (Men)', 'Points per prayer at home for men'],
            ['namaz_home_women', 4, 'Namaz Home (Women)', 'Points per prayer at home for women'],
            ['streak_per_day', 2, 'Streak per Day', 'Points per consecutive day of taraweeh']
        ];
        const tx = db.transaction(() => { defaults.forEach(d => seedStmt.run(d[0], d[1], d[2], d[3])); });
        tx();
        logAdminAction(req.user.username, 'reset_scoring_config', null, null, { action: 'reset_to_defaults' });
        res.json({ success: true, message: 'Scoring config reset to defaults.' });
    } catch (err) {
        res.json({ success: false, error: 'Failed to reset scoring config.' });
    }
});

module.exports = router;
