// ===================================================================
// RamadanFlow Analytics Middleware — Server-Side Security Layer
// Fail-silent: ALL errors caught, never breaks the main app
// ===================================================================

const crypto = require('crypto');
const db = require('../db/database');

// ---------------------------------------------------------------
// FALSE POSITIVE SUPPRESSION
// ---------------------------------------------------------------

var ANOMALY_SUPPRESS_RULES = {
    // headless_browser with only no_plugins flag — Chrome has no plugins by default
    headless_single_noplugins: function (type, details) {
        if (type === 'headless_browser' && details && details.flags && details.flags.length === 1 && details.flags[0] === 'no_plugins') return true;
        return false;
    },
    // parameter_tampering on admin routes — admin UI sends custom fields
    admin_param_tampering: function (type, details) {
        if (type === 'parameter_tampering' && details && details.route && details.route.indexOf('/api/admin') === 0) return true;
        return false;
    }
};

function shouldSuppressAnomaly(type, details) {
    for (var key in ANOMALY_SUPPRESS_RULES) {
        if (ANOMALY_SUPPRESS_RULES[key](type, details)) return key;
    }
    return false;
}

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------

function hashIP(ip) {
    if (!ip) return 'unknown';
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function computeFingerprintHash(req) {
    try {
        var parts = [
            req.headers['user-agent'] || '',
            req.headers['accept-language'] || '',
            req.headers['cf-connecting-ip'] || req.ip || '',
            req.headers['cf-ja3-hash'] || ''
        ];
        return crypto.createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 32);
    } catch (e) { return 'err'; }
}

function getCFHeaders(req) {
    return {
        country: req.headers['cf-ipcountry'] || '',
        ray: req.headers['cf-ray'] || '',
        deviceType: req.headers['cf-device-type'] || '',
        connectingIP: hashIP(req.headers['cf-connecting-ip'] || req.ip),
        ja3: req.headers['cf-ja3-hash'] || ''
    };
}

function logAnomaly(sessionId, userId, username, severity, type, details, ipHash, country) {
    try {
        // Check suppression rules
        var suppressReason = shouldSuppressAnomaly(type, details);
        if (suppressReason === 'admin_param_tampering') return; // fully suppress
        if (suppressReason === 'headless_single_noplugins') {
            severity = 'LOW';
            if (!details) details = {};
            details.suppressed = true;
            details.suppress_reason = 'single_no_plugins_flag';
        }
        // headless_browser: only MEDIUM+ if 2+ flags
        if (type === 'headless_browser' && details && details.flags && details.flags.length < 2 && !suppressReason) {
            severity = 'LOW';
        }
        db.prepare(`INSERT INTO analytics_anomalies (session_id, user_id, username, severity, anomaly_type, details, ip_hash, cf_ip_country)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sessionId, userId, username, severity, type, JSON.stringify(details), ipHash, country);
        if (severity === 'HIGH') {
            console.error('[ANALYTICS ALERT] HIGH severity anomaly:', type, '-', username || 'anonymous', '-', JSON.stringify(details));
        }
    } catch (e) { /* silent */ }
}

// ---------------------------------------------------------------
// REQUEST LOGGING (for live request log)
// ---------------------------------------------------------------

function logRequest(method, route, username, statusCode, responseMs, country, userAgent) {
    try {
        db.prepare('INSERT INTO analytics_requests (method, route, username, status_code, response_ms, cf_country, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            method, route, username || null, statusCode || 0, responseMs || 0, country || '', userAgent || '');
    } catch (e) { /* silent */ }
}

// ---------------------------------------------------------------
// REQUEST BODY SHAPE WHITELIST (parameter tampering detection)
// ---------------------------------------------------------------

const ROUTE_SHAPES = {
    '/api/auth/login': ['identifier', 'password', 'website'],
    '/api/auth/register': ['username', 'email', 'password', 'gender', 'age', 'website'],
    '/api/auth/change-password': ['oldPassword', 'newPassword'],
    '/api/taraweeh': ['date', 'year', 'completed', 'rakaat'],
    '/api/quran': ['khatamId', 'paraNumber', 'completed', 'type', 'year', 'id'],
    '/api/fasting': ['date', 'year', 'completed'],
    '/api/azkar': ['date', 'morning', 'evening'],
    '/api/namaz': ['date', 'prayer', 'location'],
    '/api/surah': ['surahNumber', 'surahName', 'totalAyah', 'memorizedAyah', 'id'],
    '/api/admin': ['username', 'role', 'region', 'country', 'city']
};

// ---------------------------------------------------------------
// IN-MEMORY TRACKERS (per IP/session, reset on restart)
// ---------------------------------------------------------------

const failedJWTPerIP = {};  // ip -> [{ts}]
const userRequestTimes = {}; // sessionId -> [timestamps]
const userCountryMap = {}; // userId -> [{country, ts}]

// ---------------------------------------------------------------
// MAIN MIDDLEWARE
// ---------------------------------------------------------------

function analyticsMiddleware(req, res, next) {
    try {
        var startTime = Date.now();
        var clientIP = hashIP(req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress);
        var cf = getCFHeaders(req);
        var sessionId = req.headers['x-session-id'] || '';

        // --- Parameter Tampering Detection ---
        if (req.body && typeof req.body === 'object') {
            var routeBase = req.path.replace(/\/[^/]+$/, ''); // strip trailing param
            var whitelist = ROUTE_SHAPES[req.path] || ROUTE_SHAPES[routeBase];
            if (whitelist && req.method === 'POST') {
                var extraFields = Object.keys(req.body).filter(function (k) { return whitelist.indexOf(k) === -1; });
                if (extraFields.length > 0) {
                    logAnomaly(sessionId, req.user ? req.user.id : null, req.user ? req.user.username : null,
                        'MEDIUM', 'parameter_tampering',
                        { route: req.path, extraFields: extraFields, bodyShape: Object.keys(req.body) },
                        clientIP, cf.country);
                }
            }
        }

        // --- Request Cadence Profiling ---
        if (sessionId) {
            if (!userRequestTimes[sessionId]) userRequestTimes[sessionId] = [];
            userRequestTimes[sessionId].push(Date.now());
            // Keep last 50 request timestamps
            if (userRequestTimes[sessionId].length > 50) userRequestTimes[sessionId].shift();
            // Check for bot-like uniform cadence (every 20 requests)
            if (userRequestTimes[sessionId].length >= 20 && userRequestTimes[sessionId].length % 20 === 0) {
                var times = userRequestTimes[sessionId];
                var intervals = [];
                for (var i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
                var mean = intervals.reduce(function (a, b) { return a + b; }, 0) / intervals.length;
                var variance = intervals.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / intervals.length;
                var stdDev = Math.sqrt(variance);
                var cv = mean > 0 ? stdDev / mean : 1;
                if (cv < 0.1 && mean < 5000) {
                    logAnomaly(sessionId, req.user ? req.user.id : null, req.user ? req.user.username : null,
                        'MEDIUM', 'bot_cadence',
                        { cv: cv.toFixed(3), meanInterval: Math.round(mean), samples: intervals.length },
                        clientIP, cf.country);
                }
            }
        }

        // --- Impossible Travel Detection ---
        if (req.user && cf.country) {
            var uid = req.user.id;
            if (!userCountryMap[uid]) userCountryMap[uid] = [];
            var now = Date.now();
            userCountryMap[uid].push({ country: cf.country, ts: now });
            // Keep last 20
            if (userCountryMap[uid].length > 20) userCountryMap[uid].shift();
            // Check for different country within 1 hour
            var oneHourAgo = now - 3600000;
            var recent = userCountryMap[uid].filter(function (e) { return e.ts > oneHourAgo; });
            var countries = {};
            recent.forEach(function (e) { countries[e.country] = true; });
            if (Object.keys(countries).length > 1) {
                logAnomaly(sessionId, uid, req.user.username,
                    'HIGH', 'impossible_travel',
                    { countries: Object.keys(countries), window: '1h' },
                    clientIP, cf.country);
            }
        }

        // --- Slow Request + Request Logging ---
        var originalEnd = res.end;
        res.end = function () {
            try {
                var elapsed = Date.now() - startTime;
                // Log request for live feed (skip static files)
                if (req.path.indexOf('/api/') === 0) {
                    logRequest(req.method, req.path, req.user ? req.user.username : null, res.statusCode, elapsed, cf.country, req.headers['user-agent'] || '');
                }
                if (elapsed > 2000) {
                    logAnomaly(sessionId, req.user ? req.user.id : null, req.user ? req.user.username : null,
                        'LOW', 'slow_request',
                        { route: req.path, method: req.method, elapsed_ms: elapsed },
                        clientIP, cf.country);
                }
            } catch (e) { }
            originalEnd.apply(res, arguments);
        };

        // --- Privilege Escalation (403 tracking) ---
        var originalStatus = res.status.bind(res);
        res.status = function (code) {
            try {
                if (code === 403 && req.user) {
                    var key = 'priv_' + (sessionId || clientIP);
                    if (!failedJWTPerIP[key]) failedJWTPerIP[key] = { count: 0, first: Date.now() };
                    failedJWTPerIP[key].count++;
                    if (failedJWTPerIP[key].count >= 5) {
                        logAnomaly(sessionId, req.user.id, req.user.username,
                            'HIGH', 'privilege_escalation',
                            { count: failedJWTPerIP[key].count },
                            clientIP, cf.country);
                        failedJWTPerIP[key].count = 0;
                    }
                }
                if (code === 401) {
                    if (!failedJWTPerIP[clientIP]) failedJWTPerIP[clientIP] = { count: 0, first: Date.now() };
                    failedJWTPerIP[clientIP].count++;
                    // Reset after 10 minutes
                    if (Date.now() - failedJWTPerIP[clientIP].first > 600000) {
                        failedJWTPerIP[clientIP] = { count: 1, first: Date.now() };
                    }
                    if (failedJWTPerIP[clientIP].count >= 10) {
                        logAnomaly(sessionId, null, null,
                            'HIGH', 'jwt_brute_force',
                            { count: failedJWTPerIP[clientIP].count, window: '10min' },
                            clientIP, cf.country);
                        console.error('[PM2 ALERT] 10+ failed JWT attempts from IP hash:', clientIP);
                        failedJWTPerIP[clientIP].count = 0;
                    }
                }
            } catch (e) { }
            return originalStatus(code);
        };
    } catch (e) { /* fail silent */ }

    next();
}

// ---------------------------------------------------------------
// HONEYPOT ROUTE HANDLER
// ---------------------------------------------------------------

function honeypotHandler(fakeResponse) {
    return function (req, res) {
        try {
            var clientIP = hashIP(req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress);
            var sessionId = req.headers['x-session-id'] || '';
            db.prepare(`INSERT INTO analytics_honeypot (session_id, ip_hash, route, user_agent, headers)
                VALUES (?, ?, ?, ?, ?)`).run(
                sessionId, clientIP, req.path,
                req.headers['user-agent'] || '',
                JSON.stringify({ accept: req.headers['accept'], referer: req.headers['referer'] })
            );
            logAnomaly(sessionId, null, null, 'HIGH', 'honeypot_triggered',
                { route: req.path }, clientIP, req.headers['cf-ipcountry'] || '');
        } catch (e) { }
        res.json(fakeResponse);
    };
}

// ---------------------------------------------------------------
// HONEYPOT FORM FIELD CHECK
// ---------------------------------------------------------------

function honeypotFieldCheck(req, res, next) {
    try {
        if (req.body && req.body.website && req.body.website.length > 0) {
            var clientIP = hashIP(req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress);
            logAnomaly(req.headers['x-session-id'] || '', null, req.body.identifier || req.body.username || null,
                'HIGH', 'honeypot_form_field',
                { route: req.path, field: 'website' },
                clientIP, req.headers['cf-ipcountry'] || '');
            // Still return 200 so the bot doesn't know
        }
    } catch (e) { }
    next();
}

// ---------------------------------------------------------------
// ADMIN AUDIT LOGGER
// ---------------------------------------------------------------

function logAdminAction(adminUsername, action, targetUsername, beforeState, afterState) {
    try {
        db.prepare(`INSERT INTO analytics_admin_audit (admin_username, action, target_username, before_state, after_state)
            VALUES (?, ?, ?, ?, ?)`).run(adminUsername, action, targetUsername, JSON.stringify(beforeState), JSON.stringify(afterState));
    } catch (e) { }
}

module.exports = {
    analyticsMiddleware,
    honeypotHandler,
    honeypotFieldCheck,
    logAdminAction,
    logAnomaly,
    hashIP,
    computeFingerprintHash,
    getCFHeaders
};
