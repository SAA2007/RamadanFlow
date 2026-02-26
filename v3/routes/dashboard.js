const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/dashboard/:year
router.get('/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const users = db.prepare('SELECT username, email, role, created_at FROM users').all();

        const summaries = users.map(u => {
            // Taraweeh count & streak
            const taraweehRows = db.prepare('SELECT date, rakaat FROM taraweeh WHERE username = ? AND year = ? AND completed = ? ORDER BY date DESC').all(u.username, year, 'YES');
            const taraweehCount = taraweehRows.length;

            // Calculate streak
            let streak = 0;
            if (taraweehRows.length > 0) {
                const today = new Date();
                let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dateSet = new Set(taraweehRows.map(r => r.date));
                for (let i = 0; i < 366; i++) {
                    const ds = checkDate.toISOString().slice(0, 10);
                    if (dateSet.has(ds)) {
                        streak++;
                        checkDate.setDate(checkDate.getDate() - 1);
                    } else {
                        break;
                    }
                }
            }

            // Quran
            const khatams = db.prepare('SELECT para_count, completed_at FROM khatams WHERE username = ? AND year = ?').all(u.username, year);
            const totalParas = khatams.reduce((s, k) => s + k.para_count, 0);
            const completedKhatams = khatams.filter(k => k.completed_at).length;

            // Fasting
            const fastingCount = db.prepare('SELECT COUNT(*) as c FROM fasting WHERE username = ? AND year = ? AND completed = ?').get(u.username, year, 'YES').c;

            // Score (same formula as v2)
            const score = (taraweehCount * 3) + (totalParas * 2) + (fastingCount * 2) + (streak) + (completedKhatams * 20);

            return {
                username: u.username,
                email: u.email,
                role: u.role,
                taraweehCount,
                streak,
                totalParas,
                completedKhatams,
                fastingCount,
                score
            };
        });

        // Sort by score descending
        summaries.sort((a, b) => b.score - a.score);

        res.json({ success: true, summaries });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.json({ success: false, error: 'Failed to load dashboard.' });
    }
});

module.exports = router;
