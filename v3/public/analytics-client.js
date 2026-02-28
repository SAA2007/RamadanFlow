// ===================================================================
// RamadanFlow Analytics Client — Security Telemetry & Behavioral Biometrics
// Fail-silent: NEVER breaks the main app
// ===================================================================

(function () {
    'use strict';
    try {

        var SESSION_ID = 'rf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        var eventBuffer = [];
        var FLUSH_INTERVAL = 10000; // 10 seconds
        var MOUSE_SAMPLE_INTERVAL = 200;
        var lastMousePos = null;
        var lastMouseTime = 0;
        var lastKeyUp = 0;
        var clickLog = [];
        var dwellTimes = [];
        var flightTimes = [];

        // ---------------------------------------------------------------
        // HELPERS
        // ---------------------------------------------------------------

        function hashString(str) {
            var hash = 0;
            for (var i = 0; i < str.length; i++) {
                var c = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + c;
                hash |= 0;
            }
            return 'h' + Math.abs(hash).toString(36);
        }

        function getToken() {
            return localStorage.getItem('rf_token') || '';
        }

        function getUsername() {
            return localStorage.getItem('rf_username') || '';
        }

        function sendAnalytics(endpoint, data) {
            try {
                var headers = { 'Content-Type': 'application/json' };
                var token = getToken();
                if (token) headers['Authorization'] = 'Bearer ' + token;
                fetch('/api/analytics' + endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(data),
                    keepalive: true
                }).catch(function () { });
            } catch (e) { }
        }

        function sendBeaconData(endpoint, data) {
            try {
                var token = getToken();
                var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                navigator.sendBeacon('/api/analytics' + endpoint + '?token=' + encodeURIComponent(token), blob);
            } catch (e) { }
        }

        // ---------------------------------------------------------------
        // FINGERPRINTING
        // ---------------------------------------------------------------

        function getCanvasHash() {
            try {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                canvas.width = 200; canvas.height = 50;
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillStyle = '#f60';
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = '#069';
                ctx.fillText('RamadanFlow fp', 2, 15);
                ctx.fillStyle = 'rgba(102,204,0,0.7)';
                ctx.fillText('analytics', 4, 17);
                return hashString(canvas.toDataURL());
            } catch (e) { return 'err'; }
        }

        function getWebGLHash() {
            try {
                var canvas = document.createElement('canvas');
                var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'none';
                var ext = gl.getExtension('WEBGL_debug_renderer_info');
                var vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown';
                var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
                return hashString(vendor + '|' + renderer);
            } catch (e) { return 'err'; }
        }

        function getWebRTCIPs(callback) {
            try {
                var ips = [];
                var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                pc.createDataChannel('');
                pc.createOffer().then(function (offer) {
                    pc.setLocalDescription(offer);
                }).catch(function () { });
                pc.onicecandidate = function (e) {
                    if (!e.candidate) {
                        pc.close();
                        callback(ips.map(function (ip) { return hashString(ip); }));
                        return;
                    }
                    var parts = e.candidate.candidate.split(' ');
                    var ip = parts[4];
                    if (ip && ips.indexOf(ip) === -1) ips.push(ip);
                };
                setTimeout(function () { try { pc.close(); } catch (e) { } callback(ips.map(function (ip) { return hashString(ip); })); }, 3000);
            } catch (e) { callback([]); }
        }

        function getNavigatorData() {
            try {
                return {
                    hardwareConcurrency: navigator.hardwareConcurrency || 0,
                    deviceMemory: navigator.deviceMemory || 0,
                    languages: (navigator.languages || [navigator.language]).join(','),
                    platform: navigator.platform || '',
                    webdriver: !!navigator.webdriver
                };
            } catch (e) { return {}; }
        }

        function getHeadlessFlags() {
            var flags = [];
            try {
                if (navigator.webdriver) flags.push('webdriver');
                if (!window.chrome && /Chrome/.test(navigator.userAgent)) flags.push('no_chrome_obj');
                if (navigator.plugins && navigator.plugins.length === 0) flags.push('no_plugins');
                if (!window.Notification) flags.push('no_notification_api');
                if (window.outerWidth === 0 && window.outerHeight === 0) flags.push('zero_outer_size');
            } catch (e) { }
            return flags;
        }

        function collectAndSendFingerprint() {
            getWebRTCIPs(function (ips) {
                var fp = {
                    sessionId: SESSION_ID,
                    username: getUsername(),
                    canvasHash: getCanvasHash(),
                    webglHash: getWebGLHash(),
                    webrtcIps: ips,
                    navigatorData: getNavigatorData(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
                    locale: navigator.language || '',
                    colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                    screenResolution: screen.width + 'x' + screen.height,
                    headlessFlags: getHeadlessFlags()
                };
                // Compute composite hash
                fp.fingerprintHash = hashString(
                    fp.canvasHash + fp.webglHash + fp.navigatorData.platform +
                    fp.navigatorData.hardwareConcurrency + fp.screenResolution + fp.timezone
                );
                sendAnalytics('/fingerprint', fp);
            });
        }

        // ---------------------------------------------------------------
        // BEHAVIORAL BIOMETRICS
        // ---------------------------------------------------------------

        // Keystroke dynamics
        var keyDownTimes = {};
        document.addEventListener('keydown', function (e) {
            try {
                var field = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ? (e.target.name || e.target.id || 'unknown') : null;
                if (!field) return;
                keyDownTimes[e.key] = Date.now();
                // Flight time (keyup of previous → keydown of this)
                if (lastKeyUp > 0) {
                    var flight = Date.now() - lastKeyUp;
                    flightTimes.push(flight);
                }
            } catch (ex) { }
        }, true);

        document.addEventListener('keyup', function (e) {
            try {
                var field = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ? (e.target.name || e.target.id || 'unknown') : null;
                if (!field) return;
                if (keyDownTimes[e.key]) {
                    var dwell = Date.now() - keyDownTimes[e.key];
                    dwellTimes.push(dwell);
                    delete keyDownTimes[e.key];
                }
                lastKeyUp = Date.now();
            } catch (ex) { }
        }, true);

        // Mouse dynamics
        var mousePositions = [];
        var lastClickTime = 0;
        var lastClickTarget = null;
        var rageClickCount = 0;

        setInterval(function () {
            // sampled at 200ms — handled via mousemove listener below
        }, MOUSE_SAMPLE_INTERVAL);

        document.addEventListener('mousemove', function (e) {
            try {
                var now = Date.now();
                if (now - lastMouseTime >= MOUSE_SAMPLE_INTERVAL) {
                    var pos = { x: e.clientX, y: e.clientY, t: now };
                    if (lastMousePos) {
                        var dx = pos.x - lastMousePos.x;
                        var dy = pos.y - lastMousePos.y;
                        var dt = (pos.t - lastMousePos.t) / 1000;
                        pos.velocity = Math.sqrt(dx * dx + dy * dy) / (dt || 0.001);
                    }
                    mousePositions.push(pos);
                    if (mousePositions.length > 100) mousePositions.shift();
                    lastMousePos = pos;
                    lastMouseTime = now;
                }
            } catch (ex) { }
        }, { passive: true });

        // Rage click detection
        document.addEventListener('click', function (e) {
            try {
                var now = Date.now();
                var target = e.target.id || e.target.className || e.target.tagName;
                if (target === lastClickTarget && now - lastClickTime < 1000) {
                    rageClickCount++;
                    if (rageClickCount >= 3) {
                        pushEvent('rage_click', { target: target, count: rageClickCount });
                        rageClickCount = 0;
                    }
                } else {
                    rageClickCount = 1;
                }
                lastClickTarget = target;
                lastClickTime = now;
            } catch (ex) { }
        }, true);

        // Copy/paste detection
        document.addEventListener('copy', function (e) {
            try {
                var field = e.target.name || e.target.id || 'unknown';
                pushEvent('copy', { field: field });
            } catch (ex) { }
        }, true);

        document.addEventListener('paste', function (e) {
            try {
                var field = e.target.name || e.target.id || 'unknown';
                pushEvent('paste', { field: field });
            } catch (ex) { }
        }, true);

        // Idle detection
        var lastActivity = Date.now();
        var idleReported = false;
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (evt) {
            document.addEventListener(evt, function () {
                lastActivity = Date.now();
                idleReported = false;
            }, { passive: true });
        });

        setInterval(function () {
            try {
                if (Date.now() - lastActivity > 30000 && !idleReported) {
                    pushEvent('idle', { duration_ms: Date.now() - lastActivity });
                    idleReported = true;
                }
            } catch (e) { }
        }, 5000);

        // Window focus/blur
        window.addEventListener('focus', function () {
            pushEvent('window_focus', { ts: Date.now() });
        });
        window.addEventListener('blur', function () {
            pushEvent('window_blur', { ts: Date.now() });
        });

        // Tab visibility
        document.addEventListener('visibilitychange', function () {
            pushEvent('visibility_change', { state: document.visibilityState, ts: Date.now() });
        });

        // ---------------------------------------------------------------
        // EVENT BUFFER & FLUSH
        // ---------------------------------------------------------------

        function pushEvent(type, data) {
            try {
                eventBuffer.push({
                    sessionId: SESSION_ID,
                    username: getUsername(),
                    type: type,
                    data: data,
                    ts: Date.now()
                });
            } catch (e) { }
        }

        function flushEvents() {
            try {
                if (eventBuffer.length === 0 && dwellTimes.length === 0 && flightTimes.length === 0) return;

                var batch = {
                    sessionId: SESSION_ID,
                    username: getUsername(),
                    events: eventBuffer.splice(0),
                    typing: null
                };

                // Include typing profile if we have data
                if (dwellTimes.length > 5) {
                    var avgDwell = dwellTimes.reduce(function (a, b) { return a + b; }, 0) / dwellTimes.length;
                    var avgFlight = flightTimes.length > 0 ? flightTimes.reduce(function (a, b) { return a + b; }, 0) / flightTimes.length : 0;
                    batch.typing = { avgDwell: Math.round(avgDwell), avgFlight: Math.round(avgFlight), samples: dwellTimes.length };
                    dwellTimes = [];
                    flightTimes = [];
                }

                // Check mouse linearity
                if (mousePositions.length > 10) {
                    var linearCount = 0;
                    for (var i = 2; i < mousePositions.length; i++) {
                        var p0 = mousePositions[i - 2], p1 = mousePositions[i - 1], p2 = mousePositions[i];
                        var cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
                        if (Math.abs(cross) < 5) linearCount++;
                    }
                    var linearRatio = linearCount / (mousePositions.length - 2);
                    if (linearRatio > 0.8) {
                        batch.events.push({ type: 'linear_mouse', data: { ratio: linearRatio }, ts: Date.now() });
                    }
                }

                sendAnalytics('/events', batch);
            } catch (e) { }
        }

        setInterval(flushEvents, FLUSH_INTERVAL);
        window.addEventListener('beforeunload', function () {
            try {
                flushEvents();
                var batch = { sessionId: SESSION_ID, username: getUsername(), events: eventBuffer, final: true };
                sendBeaconData('/events', batch);
            } catch (e) { }
        });

        // ---------------------------------------------------------------
        // INIT
        // ---------------------------------------------------------------

        setTimeout(collectAndSendFingerprint, 1000);

    } catch (globalErr) {
        // Fail completely silently
    }
})();
