const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/dashboard/:year
router.get('/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const users = db.prepare('SELECT username, email, role, created_at FROM users').all();

        const summaries = users.map(u => {
            // Taraweeh count, rakaat, & streak
            const taraweehRows = db.prepare('SELECT date, rakaat FROM taraweeh WHERE username = ? AND year = ? AND completed = ? ORDER BY date DESC').all(u.username, year, 'YES');
            const taraweehCount = taraweehRows.length;
            const taraweehRakaat = taraweehRows.reduce((sum, r) => sum + (r.rakaat || 0), 0);

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

            // Azkar — each morning or evening counts as 1 separate instance
            const azkarRows = db.prepare("SELECT morning, evening FROM azkar WHERE username = ? AND date LIKE ?").all(u.username, year + '%');
            let azkarPoints = 0;
            let azkarCount = 0; // Total days they did at least one
            azkarRows.forEach(r => {
                if (r.morning === 1) azkarPoints += 1;
                if (r.evening === 1) azkarPoints += 1;
                if (r.morning === 1 || r.evening === 1) azkarCount += 1;
            });

            // Namaz — count prayers by location
            const namazRows = db.prepare("SELECT location FROM namaz WHERE username = ? AND date LIKE ? AND location != 'missed'").all(u.username, year + '%');
            const namazMosque = namazRows.filter(r => r.location === 'mosque').length;
            const namazHome = namazRows.filter(r => r.location === 'home').length;
            const namazCount = namazRows.length;

            // Score (v3.2 formula - values rakaat > days)
            const score = Math.floor(
                (taraweehRakaat * 1.5) +
                (totalParas * 5) +
                (completedKhatams * 50) +
                (fastingCount * 10) +
                (azkarPoints * 1) +
                (namazMosque * 3) +
                (namazHome * 1) +
                (streak * 2)
            );

            return {
                username: u.username,
                email: u.email,
                role: u.role,
                taraweehCount,
                taraweehRakaat,
                streak,
                totalParas,
                completedKhatams,
                fastingCount,
                azkarCount,
                namazCount,
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
