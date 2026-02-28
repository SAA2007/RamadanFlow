// ===================================================================
// RamadanFlow Analytics Routes — API endpoints for telemetry data
// ===================================================================

const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { logAnomaly } = require('../middleware/analytics');

const router = express.Router();

// ---------------------------------------------------------------
// POST /fingerprint — Receive session fingerprint (auth optional)
// ---------------------------------------------------------------

router.post('/fingerprint', function (req, res) {
    try {
        var fp = req.body;
        if (!fp || !fp.sessionId) return res.json({ success: true });

        // Extract user from token if present
        var userId = null, username = fp.username || null;
        try {
            var jwt = require('jsonwebtoken');
            var token = (req.headers.authorization || '').replace('Bearer ', '');
            if (token) {
                var decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
                username = decoded.username;
            }
        } catch (e) { }

        db.prepare(`INSERT OR REPLACE INTO analytics_fingerprints
            (session_id, user_id, username, fingerprint_hash, canvas_hash, webgl_hash, webrtc_ips,
             navigator_data, timezone, locale, color_scheme, screen_resolution, headless_flags,
             ja3_hash, cf_ip_country, cf_device_type, cf_connecting_ip_hash, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            fp.sessionId, userId, username,
            fp.fingerprintHash || '',
            fp.canvasHash || '',
            fp.webglHash || '',
            JSON.stringify(fp.webrtcIps || []),
            JSON.stringify(fp.navigatorData || {}),
            fp.timezone || '',
            fp.locale || '',
            fp.colorScheme || '',
            fp.screenResolution || '',
            JSON.stringify(fp.headlessFlags || []),
            req.headers['cf-ja3-hash'] || '',
            req.headers['cf-ipcountry'] || '',
            req.headers['cf-device-type'] || '',
            fp.sessionId ? crypto.createHash('sha256').update(req.headers['cf-connecting-ip'] || req.ip || '').digest('hex').substring(0, 16) : '',
            req.headers['user-agent'] || ''
        );

        // Headless detection anomaly
        if (fp.headlessFlags && fp.headlessFlags.length > 0) {
            logAnomaly(fp.sessionId, userId, username, 'MEDIUM', 'headless_browser',
                { flags: fp.headlessFlags },
                crypto.createHash('sha256').update(req.ip || '').digest('hex').substring(0, 16),
                req.headers['cf-ipcountry'] || '');
        }

        res.json({ success: true });
    } catch (e) {
        res.json({ success: true }); // fail silent
    }
});

// ---------------------------------------------------------------
// POST /events — Receive batched behavioral events
// ---------------------------------------------------------------

router.post('/events', function (req, res) {
    try {
        var batch = req.body;
        if (!batch || !batch.sessionId) return res.json({ success: true });

        // Handle sendBeacon token passthrough
        var userId = null, username = batch.username || null;
        try {
            var jwt = require('jsonwebtoken');
            var token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token || '';
            if (token) {
                var decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
                username = decoded.username;
            }
        } catch (e) { }

        // Store events
        if (batch.events && Array.isArray(batch.events)) {
            var stmt = db.prepare(`INSERT INTO analytics_events (session_id, user_id, username, event_type, event_data)
                VALUES (?, ?, ?, ?, ?)`);
            var insertMany = db.transaction(function (events) {
                for (var i = 0; i < events.length; i++) {
                    var ev = events[i];
                    stmt.run(batch.sessionId, userId, username, ev.type || 'unknown', JSON.stringify(ev.data || {}));
                }
            });
            insertMany(batch.events);
        }

        // Store/update typing profile
        if (batch.typing && username) {
            var existing = db.prepare('SELECT baseline_dwell, baseline_flight FROM analytics_typing_profiles WHERE username = ? ORDER BY id DESC LIMIT 1').get(username);
            var deviationPct = 0;
            var flagged = 0;

            if (existing && existing.baseline_dwell > 0) {
                deviationPct = Math.abs(batch.typing.avgDwell - existing.baseline_dwell) / existing.baseline_dwell * 100;
                if (deviationPct > 40) {
                    flagged = 1;
                    logAnomaly(batch.sessionId, userId, username, 'MEDIUM', 'typing_deviation',
                        { deviation: deviationPct.toFixed(1) + '%', expected: existing.baseline_dwell, actual: batch.typing.avgDwell },
                        '', '');
                }
            }

            // Compute running baseline (weighted moving average)
            var baselineDwell = existing ? existing.baseline_dwell * 0.7 + batch.typing.avgDwell * 0.3 : batch.typing.avgDwell;
            var baselineFlight = existing ? existing.baseline_flight * 0.7 + batch.typing.avgFlight * 0.3 : batch.typing.avgFlight;

            db.prepare(`INSERT INTO analytics_typing_profiles
                (username, session_id, avg_dwell_ms, avg_flight_ms, baseline_dwell, baseline_flight, deviation_pct, flagged)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                username, batch.sessionId,
                batch.typing.avgDwell, batch.typing.avgFlight,
                baselineDwell, baselineFlight,
                deviationPct, flagged
            );
        }

        res.json({ success: true });
    } catch (e) {
        res.json({ success: true }); // fail silent
    }
});

// ---------------------------------------------------------------
// ADMIN-ONLY ENDPOINTS
// ---------------------------------------------------------------

// Anomaly feed
router.get('/anomalies', authMiddleware, adminMiddleware, function (req, res) {
    try {
        var rows = db.prepare(`SELECT * FROM analytics_anomalies ORDER BY
            CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
            created_at DESC LIMIT 100`).all();
        res.json({ success: true, anomalies: rows });
    } catch (e) {
        res.json({ success: false, error: 'Failed to load anomalies.' });
    }
});

// Honeypot hits
router.get('/honeypot-log', authMiddleware, adminMiddleware, function (req, res) {
    try {
        var rows = db.prepare('SELECT * FROM analytics_honeypot ORDER BY created_at DESC LIMIT 50').all();
        res.json({ success: true, hits: rows });
    } catch (e) {
        res.json({ success: false, error: 'Failed to load honeypot log.' });
    }
});

// Per-user fingerprint consistency
router.get('/fingerprint-scores', authMiddleware, adminMiddleware, function (req, res) {
    try {
        var rows = db.prepare(`SELECT username, COUNT(DISTINCT fingerprint_hash) as unique_fps,
            COUNT(*) as total_sessions, MIN(created_at) as first_seen, MAX(created_at) as last_seen
            FROM analytics_fingerprints WHERE username IS NOT NULL
            GROUP BY username ORDER BY unique_fps DESC`).all();
        res.json({ success: true, scores: rows });
    } catch (e) {
        res.json({ success: false, error: 'Failed to load fingerprint scores.' });
    }
});

// Typing deviation history
router.get('/typing/:username', authMiddleware, adminMiddleware, function (req, res) {
    try {
        var rows = db.prepare('SELECT * FROM analytics_typing_profiles WHERE username = ? ORDER BY created_at DESC LIMIT 50')
            .all(req.params.username);
        res.json({ success: true, profiles: rows });
    } catch (e) {
        res.json({ success: false, error: 'Failed to load typing profiles.' });
    }
});

// Admin audit log
router.get('/admin-audit', authMiddleware, adminMiddleware, function (req, res) {
    try {
        var rows = db.prepare('SELECT * FROM analytics_admin_audit ORDER BY created_at DESC LIMIT 50').all();
        res.json({ success: true, audits: rows });
    } catch (e) {
        res.json({ success: false, error: 'Failed to load audit log.' });
    }
});

module.exports = router;
