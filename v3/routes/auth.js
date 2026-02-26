const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.json({ success: false, error: 'All fields are required.' });
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
        db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run(username, email, hash, role);

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

        const token = generateToken(user);
        res.json({
            success: true,
            token,
            username: user.username,
            email: user.email,
            role: user.role
        });
    } catch (err) {
        console.error('Login error:', err);
        res.json({ success: false, error: 'Login failed.' });
    }
});

// POST /api/auth/change-password (protected — requires JWT)
const { authMiddleware } = require('../middleware/auth');
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
        db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(newHash, username);
        res.json({ success: true, message: 'Password changed successfully!' });
    } catch (err) {
        console.error('Change password error:', err);
        res.json({ success: false, error: 'Password change failed.' });
    }
});

module.exports = router;
