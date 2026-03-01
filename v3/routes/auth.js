const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        let { username, email, password, gender, age, dob } = req.body;

        if (!username || !email || !password || !gender) {
            return res.json({ success: false, error: 'All fields are required.' });
        }
        // Require either dob or age
        if (!dob && !age) {
            return res.json({ success: false, error: 'Date of birth or age is required.' });
        }
        if (username.length < 3) {
            return res.json({ success: false, error: 'Username must be at least 3 characters.' });
        }
        if (password.length < 4) {
            return res.json({ success: false, error: 'Password must be at least 4 characters.' });
        }

        // Check if username or email already exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existing) {
            return res.json({ success: false, error: 'Username or email already taken.' });
        }

        // First user = admin
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const role = userCount === 0 ? 'admin' : 'user';

        const hash = bcrypt.hashSync(password, 10);

        // Compute age from dob if provided
        if (dob) {
            age = new Date().getFullYear() - new Date(dob).getFullYear();
        } else {
            age = parseInt(age);
        }

        db.prepare('INSERT INTO users (username, email, password_hash, role, gender, age, dob, plain_pw) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(username, email, hash, role, gender, age, dob || null, password);

        res.json({ success: true, message: 'Account created! ' + (role === 'admin' ? 'You are the admin 👑' : 'You can now sign in.') });
    } catch (err) {
        console.error('Register error:', err);
        res.json({ success: false, error: 'Registration failed.' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.json({ success: false, error: 'All fields are required.' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.json({ success: false, error: 'Invalid username/email or password.' });
        }

        // Backfill plain_pw for users who registered before it was added
        if (!user.plain_pw) {
            try { db.prepare('UPDATE users SET plain_pw = ? WHERE username = ?').run(password, user.username); } catch (e) { }
        }

        const token = generateToken(user);
        res.json({
            success: true,
            token,
            username: user.username,
            email: user.email,
            role: user.role,
            gender: user.gender,
            age: user.age,
            dob: user.dob || null,
            frozen: user.frozen || 0
        });
    } catch (err) {
        console.error('Login error:', err);
        res.json({ success: false, error: 'Login failed.' });
    }
});

// POST /api/auth/change-password (protected)
router.post('/change-password', authMiddleware, (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const username = req.user.username;

        if (!oldPassword || !newPassword) {
            return res.json({ success: false, error: 'All fields are required.' });
        }
        if (newPassword.length < 4) {
            return res.json({ success: false, error: 'New password must be at least 4 characters.' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
            return res.json({ success: false, error: 'Current password is incorrect.' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ?, plain_pw = ? WHERE username = ?').run(newHash, newPassword, username);
        res.json({ success: true, message: 'Password changed successfully!' });
    } catch (err) {
        console.error('Change password error:', err);
        res.json({ success: false, error: 'Password change failed.' });
    }
});

// PUT /api/auth/profile (protected — update own profile)
router.put('/profile', authMiddleware, (req, res) => {
    try {
        const username = req.user.username;
        const { displayName, email, dob, gender } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.json({ success: false, error: 'User not found.' });
        }

        // Build update fields and audit diff
        const before = { username: user.username, email: user.email, dob: user.dob, gender: user.gender };
        const changes = {};

        if (displayName && displayName !== user.username) {
            // Check uniqueness
            const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(displayName, user.id);
            if (existing) {
                return res.json({ success: false, error: 'Display name already taken.' });
            }
            changes.username = displayName;
        }

        if (email && email !== user.email) {
            const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
            if (existing) {
                return res.json({ success: false, error: 'Email already taken.' });
            }
            changes.email = email;
        }

        if (dob !== undefined) {
            changes.dob = dob || null;
            // Compute age from dob
            if (dob) {
                changes.age = new Date().getFullYear() - new Date(dob).getFullYear();
            }
        }

        if (gender && gender !== user.gender) {
            changes.gender = gender;
        }

        if (Object.keys(changes).length === 0) {
            return res.json({ success: true, message: 'No changes detected.' });
        }

        // Apply updates
        const setClauses = Object.keys(changes).map(k => k + ' = ?').join(', ');
        const values = Object.keys(changes).map(k => changes[k]);
        values.push(user.id);
        db.prepare('UPDATE users SET ' + setClauses + ' WHERE id = ?').run(...values);

        // Audit log
        const after = { ...before };
        Object.keys(changes).forEach(k => { after[k] = changes[k]; });
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))').run(
                username, 'profile_update', changes.username || username,
                JSON.stringify({ before, after })
            );
        } catch (e) { }

        // Return updated user info
        const updated = db.prepare('SELECT username, email, role, gender, age, dob, frozen FROM users WHERE id = ?').get(user.id);
        res.json({
            success: true,
            message: 'Profile updated!',
            user: {
                username: updated.username,
                email: updated.email,
                role: updated.role,
                gender: updated.gender,
                age: updated.age,
                dob: updated.dob || null,
                frozen: updated.frozen || 0
            }
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.json({ success: false, error: 'Profile update failed.' });
    }
});

module.exports = router;
