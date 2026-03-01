const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/dashboard/:year
router.get('/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const users = db.prepare('SELECT username, email, role, gender, age, score_multiplier, frozen, created_at FROM users').all();

        const summaries = users.map(u => {
            // Taraweeh count, rakaat, & streak
            const taraweehRows = db.prepare('SELECT date, rakaat FROM taraweeh WHERE username = ? AND year = ? AND completed = ? ORDER BY date DESC').all(u.username, year, 'YES');
            const taraweehCount = taraweehRows.length;
            const sumRakaat = taraweehRows.reduce((sum, r) => sum + (r.rakaat || 0), 0);
            const taraweehAverage = taraweehCount > 0 ? Math.round(sumRakaat / taraweehCount) : 0;

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
            let azkarCount = 0;
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

            // Surah memorization
            const surahResult = db.prepare("SELECT COALESCE(SUM(memorized_ayah), 0) as total FROM surah_memorization WHERE username = ?").get(u.username);
            const surahAyahs = surahResult.total;

            // Read scoring config from DB
            const configRows = db.prepare('SELECT key, value FROM scoring_config').all();
            const cfg = {};
            configRows.forEach(r => { cfg[r.key] = r.value; });

            // Demographics-aware namaz multipliers
            const nMosqueMult = cfg.namaz_mosque || 4;
            const nHomeMult = u.gender === 'Female' ? (cfg.namaz_home_women || 4) : (cfg.namaz_home_men || 2);

            let ageBonus = 0;
            const computedAge = u.dob ? (new Date().getFullYear() - new Date(u.dob).getFullYear()) : u.age;
            if (computedAge) {
                if (computedAge <= 12) ageBonus = 50;
                else if (computedAge >= 60) ageBonus = 50;
            }

            // Score (dynamic formula — reads from scoring_config table)
            const rawScore = Math.floor(
                (sumRakaat * (cfg.taraweeh_per_rakaat || 1.5)) +
                (totalParas * (cfg.quran_per_para || 10)) +
                (completedKhatams * (cfg.quran_per_khatam || 50)) +
                (fastingCount * (cfg.fasting_per_day || 15)) +
                (azkarPoints * (cfg.azkar_per_session || 3)) +
                (surahAyahs * (cfg.surah_per_ayah || 0.5)) +
                (namazMosque * nMosqueMult) +
                (namazHome * nHomeMult) +
                (streak * (cfg.streak_per_day || 2)) +
                ageBonus
            );

            // Apply per-user score multiplier
            const scoreMultiplier = u.score_multiplier || 1.0;
            const score = Math.floor(rawScore * scoreMultiplier);

            return {
                username: u.username,
                email: u.email,
                role: u.role,
                gender: u.gender,
                age: u.age,
                frozen: u.frozen || 0,
                score_multiplier: scoreMultiplier,
                taraweehCount,
                taraweehRakaat: sumRakaat,
                taraweehAverage,
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

        // Strip internal fields from non-admin responses
        const isAdmin = req.user && req.user.role === 'admin';
        const sanitized = summaries.map(s => {
            const out = { ...s };
            if (!isAdmin) {
                delete out.score_multiplier;
                delete out.frozen;
                delete out.email;
            }
            return out;
        });

        res.json({ success: true, summaries: sanitized });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.json({ success: false, error: 'Failed to load dashboard.' });
    }
});

module.exports = router;
