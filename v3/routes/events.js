const express = require('express');
const db = require('../db/database');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// ===================================================================
// USER ENDPOINTS
// ===================================================================

// GET /api/events — list events visible to current user
router.get('/', (req, res) => {
    try {
        const username = req.user.username;
        const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();

        const visible = events.filter(ev => {
            if (ev.target === 'all') return true;
            if (ev.target === 'specific' && ev.target_users) {
                try {
                    const users = JSON.parse(ev.target_users);
                    return users.includes(username);
                } catch (e) { return false; }
            }
            return ev.mandatory === 1;
        });

        const result = visible.map(ev => {
            const submission = db.prepare('SELECT id, submitted_at, total_score, completed FROM event_submissions WHERE event_id = ? AND username = ?').get(ev.id, username);
            let userPoints = null;
            if (ev.results_published) {
                const pts = db.prepare('SELECT points FROM event_points WHERE event_id = ? AND username = ?').get(ev.id, username);
                userPoints = pts ? pts.points : 0;
            }
            return {
                id: ev.id,
                title: ev.title,
                description: ev.description,
                mandatory: ev.mandatory,
                open_at: ev.open_at,
                close_at: ev.close_at,
                results_published: ev.results_published,
                submitted: !!submission,
                submitted_at: submission ? submission.submitted_at : null,
                userPoints: userPoints
            };
        });

        res.json({ success: true, events: result });
    } catch (err) {
        console.error('Events list error:', err);
        res.json({ success: false, error: 'Failed to load events.' });
    }
});

// GET /api/events/:id/questions — questions without correct answers or points
router.get('/:id/questions', (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
        if (!ev) return res.json({ success: false, error: 'Event not found.' });

        const questions = db.prepare('SELECT id, question_order, type, question_text, options FROM event_questions WHERE event_id = ? ORDER BY question_order').all(eventId);

        // Parse options JSON for MCQ
        const sanitized = questions.map(q => ({
            id: q.id,
            question_order: q.question_order,
            type: q.type,
            question_text: q.question_text,
            options: q.options ? JSON.parse(q.options) : null
        }));

        res.json({ success: true, event: { id: ev.id, title: ev.title, description: ev.description }, questions: sanitized });
    } catch (err) {
        console.error('Event questions error:', err);
        res.json({ success: false, error: 'Failed to load questions.' });
    }
});

// POST /api/events/:id/submit — submit answers
router.post('/:id/submit', (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const username = req.user.username;
        const { answers } = req.body; // [{question_id, answer_text}]

        if (!answers || !Array.isArray(answers)) {
            return res.json({ success: false, error: 'Answers array required.' });
        }

        const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
        if (!ev) return res.json({ success: false, error: 'Event not found.' });

        // Check if not yet open
        if (ev.open_at && new Date(ev.open_at) > new Date()) {
            return res.json({ success: false, error: 'This event has not opened yet.' });
        }

        // Check if closed
        if (ev.close_at && new Date(ev.close_at) < new Date()) {
            return res.json({ success: false, error: 'This event has closed.' });
        }

        // Check duplicate submission
        const existing = db.prepare('SELECT id FROM event_submissions WHERE event_id = ? AND username = ?').get(eventId, username);
        if (existing) {
            return res.json({ success: false, error: 'You have already submitted answers for this event.' });
        }

        const questions = db.prepare('SELECT * FROM event_questions WHERE event_id = ?').all(eventId);
        const questionMap = {};
        questions.forEach(q => { questionMap[q.id] = q; });

        // Create submission
        const subResult = db.prepare('INSERT INTO event_submissions (event_id, username, completed) VALUES (?, ?, 1)').run(eventId, username);
        const submissionId = subResult.lastInsertRowid;

        let totalAutoScore = 0;
        const insertAnswer = db.prepare('INSERT INTO event_answers (submission_id, question_id, answer_text, auto_score) VALUES (?, ?, ?, ?)');

        const submitTx = db.transaction(() => {
            answers.forEach(a => {
                const q = questionMap[a.question_id];
                if (!q) return;

                let autoScore = null;

                if (q.type === 'truefalse' || q.type === 'mcq') {
                    if (q.correct_answer && a.answer_text) {
                        const isCorrect = a.answer_text.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
                        autoScore = isCorrect ? (q.points || 10) : -(q.negative_points || 0);
                        totalAutoScore += autoScore;
                    } else {
                        autoScore = -(q.negative_points || 0);
                        totalAutoScore += autoScore;
                    }
                }
                // Written answers: autoScore stays null, needs manual scoring

                insertAnswer.run(submissionId, a.question_id, a.answer_text || '', autoScore);
            });

            // Update total score on submission
            db.prepare('UPDATE event_submissions SET total_score = ? WHERE id = ?').run(totalAutoScore, submissionId);
        });
        submitTx();

        res.json({ success: true, message: 'Answers submitted successfully. Results will be published by the admin.' });
    } catch (err) {
        console.error('Event submit error:', err);
        res.json({ success: false, error: 'Failed to submit answers.' });
    }
});

// ===================================================================
// ADMIN ENDPOINTS
// ===================================================================

// GET /api/events/admin/list — all events with submission counts
router.get('/admin/list', adminMiddleware, (req, res) => {
    try {
        const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
        const result = events.map(ev => {
            const subCount = db.prepare('SELECT COUNT(*) as c FROM event_submissions WHERE event_id = ?').get(ev.id).c;
            const questionCount = db.prepare('SELECT COUNT(*) as c FROM event_questions WHERE event_id = ?').get(ev.id).c;
            return { ...ev, submission_count: subCount, question_count: questionCount };
        });
        res.json({ success: true, events: result });
    } catch (err) {
        console.error('Admin events list error:', err);
        res.json({ success: false, error: 'Failed to load events.' });
    }
});

// POST /api/events/admin/create — create event with questions
router.post('/admin/create', adminMiddleware, (req, res) => {
    try {
        const { title, description, mandatory, target, target_users, open_at, close_at, questions } = req.body;

        if (!title) return res.json({ success: false, error: 'Title is required.' });
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.json({ success: false, error: 'At least one question is required.' });
        }

        const targetUsersStr = target === 'specific' && target_users ? JSON.stringify(target_users) : null;

        const createTx = db.transaction(() => {
            const evResult = db.prepare(
                'INSERT INTO events (title, description, mandatory, target, target_users, open_at, close_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(title, description || '', mandatory ? 1 : 0, target || 'all', targetUsersStr, open_at || null, close_at || null, req.user.username);

            const eventId = evResult.lastInsertRowid;

            const insertQ = db.prepare(
                'INSERT INTO event_questions (event_id, question_order, type, question_text, options, correct_answer, points, negative_points, allow_manual_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );

            questions.forEach((q, i) => {
                insertQ.run(
                    eventId,
                    q.question_order !== undefined ? q.question_order : i,
                    q.type,
                    q.question_text,
                    q.type === 'mcq' && q.options ? JSON.stringify(q.options) : null,
                    q.correct_answer || null,
                    q.points || 10,
                    q.negative_points || 0,
                    q.type === 'written' ? 1 : 0
                );
            });

            return eventId;
        });

        const eventId = createTx();

        // Audit log
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details) VALUES (?, ?, ?, ?)')
                .run(req.user.username, 'create_event', null, JSON.stringify({ event_id: eventId, title }));
        } catch (e) { /* audit optional */ }

        res.json({ success: true, message: 'Event created successfully.', event_id: eventId });
    } catch (err) {
        console.error('Create event error:', err);
        res.json({ success: false, error: 'Failed to create event.' });
    }
});

// GET /api/events/admin/:id/submissions — all submissions with answers
router.get('/admin/:id/submissions', adminMiddleware, (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const submissions = db.prepare('SELECT * FROM event_submissions WHERE event_id = ? ORDER BY submitted_at DESC').all(eventId);

        const result = submissions.map(sub => {
            const answers = db.prepare(
                `SELECT ea.*, eq.question_text, eq.type, eq.correct_answer, eq.points, eq.negative_points
                 FROM event_answers ea
                 JOIN event_questions eq ON ea.question_id = eq.id
                 WHERE ea.submission_id = ?
                 ORDER BY eq.question_order`
            ).all(sub.id);
            return { ...sub, answers };
        });

        const questions = db.prepare('SELECT * FROM event_questions WHERE event_id = ? ORDER BY question_order').all(eventId);

        res.json({ success: true, submissions: result, questions });
    } catch (err) {
        console.error('Admin submissions error:', err);
        res.json({ success: false, error: 'Failed to load submissions.' });
    }
});

// POST /api/events/admin/:id/submissions/:subId/score — manual score
router.post('/admin/:id/submissions/:subId/score', adminMiddleware, (req, res) => {
    try {
        const subId = parseInt(req.params.subId);
        const { question_id, manual_score, admin_note } = req.body;

        db.prepare('UPDATE event_answers SET manual_score = ?, admin_note = ? WHERE submission_id = ? AND question_id = ?')
            .run(manual_score, admin_note || null, subId, question_id);

        // Recalculate total score for this submission
        const answers = db.prepare('SELECT auto_score, manual_score FROM event_answers WHERE submission_id = ?').all(subId);
        let total = 0;
        answers.forEach(a => {
            if (a.manual_score !== null) total += a.manual_score;
            else if (a.auto_score !== null) total += a.auto_score;
        });
        db.prepare('UPDATE event_submissions SET total_score = ? WHERE id = ?').run(total, subId);

        // Audit
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details) VALUES (?, ?, ?, ?)')
                .run(req.user.username, 'manual_score', null, JSON.stringify({ submission_id: subId, question_id, manual_score }));
        } catch (e) { /* audit optional */ }

        res.json({ success: true, message: 'Score updated.', total_score: total });
    } catch (err) {
        console.error('Manual score error:', err);
        res.json({ success: false, error: 'Failed to update score.' });
    }
});

// POST /api/events/admin/:id/publish — publish results
router.post('/admin/:id/publish', adminMiddleware, (req, res) => {
    try {
        const eventId = parseInt(req.params.id);

        // Calculate final scores and write to event_points
        const submissions = db.prepare('SELECT * FROM event_submissions WHERE event_id = ?').all(eventId);

        const publishTx = db.transaction(() => {
            submissions.forEach(sub => {
                // Recalculate from answers (use manual_score if set, else auto_score)
                const answers = db.prepare('SELECT auto_score, manual_score FROM event_answers WHERE submission_id = ?').all(sub.id);
                let total = 0;
                answers.forEach(a => {
                    if (a.manual_score !== null) total += a.manual_score;
                    else if (a.auto_score !== null) total += a.auto_score;
                });

                db.prepare('UPDATE event_submissions SET total_score = ? WHERE id = ?').run(total, sub.id);

                // Upsert event_points
                db.prepare(
                    'INSERT INTO event_points (event_id, username, points) VALUES (?, ?, ?) ON CONFLICT(event_id, username) DO UPDATE SET points = ?, awarded_at = datetime(\'now\')'
                ).run(eventId, sub.username, total, total);
            });

            db.prepare('UPDATE events SET results_published = 1 WHERE id = ?').run(eventId);
        });
        publishTx();

        // Audit
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details) VALUES (?, ?, ?, ?)')
                .run(req.user.username, 'publish_event', null, JSON.stringify({ event_id: eventId, submissions: submissions.length }));
        } catch (e) { /* audit optional */ }

        res.json({ success: true, message: 'Results published. Scores updated for ' + submissions.length + ' users.' });
    } catch (err) {
        console.error('Publish event error:', err);
        res.json({ success: false, error: 'Failed to publish results.' });
    }
});

// POST /api/events/admin/:id/reset-user — reset one user's submission
router.post('/admin/:id/reset-user', adminMiddleware, (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        const { username } = req.body;
        if (!username) return res.json({ success: false, error: 'Username required.' });

        const sub = db.prepare('SELECT id FROM event_submissions WHERE event_id = ? AND username = ?').get(eventId, username);
        if (!sub) return res.json({ success: false, error: 'No submission found for this user.' });

        const resetTx = db.transaction(() => {
            db.prepare('DELETE FROM event_answers WHERE submission_id = ?').run(sub.id);
            db.prepare('DELETE FROM event_submissions WHERE id = ?').run(sub.id);
            db.prepare('DELETE FROM event_points WHERE event_id = ? AND username = ?').run(eventId, username);
        });
        resetTx();

        // Audit
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details) VALUES (?, ?, ?, ?)')
                .run(req.user.username, 'reset_event_user', username, JSON.stringify({ event_id: eventId }));
        } catch (e) { /* audit optional */ }

        res.json({ success: true, message: 'Submission reset for ' + username + '.' });
    } catch (err) {
        console.error('Reset user error:', err);
        res.json({ success: false, error: 'Failed to reset user.' });
    }
});

// POST /api/events/admin/:id/reset-all — reset all submissions
router.post('/admin/:id/reset-all', adminMiddleware, (req, res) => {
    try {
        const eventId = parseInt(req.params.id);

        const resetTx = db.transaction(() => {
            const subs = db.prepare('SELECT id FROM event_submissions WHERE event_id = ?').all(eventId);
            subs.forEach(s => {
                db.prepare('DELETE FROM event_answers WHERE submission_id = ?').run(s.id);
            });
            db.prepare('DELETE FROM event_submissions WHERE event_id = ?').run(eventId);
            db.prepare('DELETE FROM event_points WHERE event_id = ?').run(eventId);
            db.prepare('UPDATE events SET results_published = 0 WHERE id = ?').run(eventId);
        });
        resetTx();

        // Audit
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details) VALUES (?, ?, ?, ?)')
                .run(req.user.username, 'reset_event_all', null, JSON.stringify({ event_id: eventId }));
        } catch (e) { /* audit optional */ }

        res.json({ success: true, message: 'All submissions reset.' });
    } catch (err) {
        console.error('Reset all error:', err);
        res.json({ success: false, error: 'Failed to reset submissions.' });
    }
});

// DELETE /api/events/admin/:id — delete event and all associated data
router.delete('/admin/:id', adminMiddleware, (req, res) => {
    try {
        const eventId = parseInt(req.params.id);

        const ev = db.prepare('SELECT id, title FROM events WHERE id = ?').get(eventId);
        if (!ev) return res.json({ success: false, error: 'Event not found.' });

        const deleteTx = db.transaction(() => {
            // Delete answers for all submissions of this event
            const subs = db.prepare('SELECT id FROM event_submissions WHERE event_id = ?').all(eventId);
            subs.forEach(s => {
                db.prepare('DELETE FROM event_answers WHERE submission_id = ?').run(s.id);
            });
            // Delete submissions
            db.prepare('DELETE FROM event_submissions WHERE event_id = ?').run(eventId);
            // Delete questions
            db.prepare('DELETE FROM event_questions WHERE event_id = ?').run(eventId);
            // Delete points
            db.prepare('DELETE FROM event_points WHERE event_id = ?').run(eventId);
            // Delete event
            db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
        });
        deleteTx();

        // Audit
        try {
            db.prepare('INSERT INTO analytics_admin_audit (admin_username, action, target_username, details) VALUES (?, ?, ?, ?)')
                .run(req.user.username, 'delete_event', null, JSON.stringify({ event_id: eventId, title: ev.title }));
        } catch (e) { /* audit optional */ }

        res.json({ success: true, message: 'Event "' + ev.title + '" deleted.' });
    } catch (err) {
        console.error('Delete event error:', err);
        res.json({ success: false, error: 'Failed to delete event.' });
    }
});

module.exports = router;
