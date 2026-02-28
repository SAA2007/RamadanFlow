// ===================================================================
// RamadanFlow v3 — Admin Panel JS (separated for maintainability)
// ===================================================================

var adminAllUsers = [];
var adminAnomalyCache = [];
var adminAnomalyPollTimer = null;
var adminRequestPollTimer = null;
var adminDeletePending = {};

// --- Toggle collapsible section ---
function toggleAdminSection(id) {
    var sec = document.getElementById('adminSec-' + id);
    if (!sec) return;
    sec.classList.toggle('collapsed');
    try {
        var state = JSON.parse(localStorage.getItem('rf_admin_sections') || '{}');
        state[id] = sec.classList.contains('collapsed');
        localStorage.setItem('rf_admin_sections', JSON.stringify(state));
    } catch (e) { }
}

function restoreAdminSections() {
    try {
        var state = JSON.parse(localStorage.getItem('rf_admin_sections') || '{}');
        Object.keys(state).forEach(function (id) {
            var sec = document.getElementById('adminSec-' + id);
            if (sec) {
                if (state[id]) sec.classList.add('collapsed');
                else sec.classList.remove('collapsed');
            }
        });
    } catch (e) { }
}

// --- Inline action status ---
function showCardStatus(username, msg, type) {
    var el = document.getElementById('status-' + username);
    if (!el) return;
    el.textContent = msg;
    el.className = 'action-status show ' + type;
    setTimeout(function () { el.className = 'action-status'; }, 4000);
}

// --- Load Admin Tab ---
async function loadAdmin() {
    if (APP.role !== 'admin') return;
    restoreAdminSections();
    loadAdminOverview();

    var data = await api('/admin/users');
    if (data.success && data.users) {
        adminAllUsers = data.users;
        var badge = document.getElementById('adminBadge-users');
        if (badge) badge.textContent = data.users.length;
        renderAdminUsers(data.users);
    }

    loadAnomalies();
    loadHoneypot();
    loadFingerprints();
    loadTypingBaseline();
    loadLiveRequestLog();
    loadAuditLog();
    loadAdminRamadanDates();
    loadCurrentAnnouncement();

    clearInterval(adminAnomalyPollTimer);
    adminAnomalyPollTimer = setInterval(function () { pollAnomalies(); }, 30000);
    clearInterval(adminRequestPollTimer);
    adminRequestPollTimer = setInterval(function () { loadLiveRequestLog(); }, 10000);
}

// --- Overview ---
async function loadAdminOverview() {
    try {
        var data = await api('/admin/status');
        if (!data.success) return;
        document.getElementById('ovUsers').textContent = data.totalUsers || 0;
        document.getElementById('ovToday').textContent = data.todayEntries || 0;
        var active = data.mostActive || { username: '\u2014', count: 0 };
        document.getElementById('ovActive').textContent = active.count > 0 ? active.username : '\u2014';

        var alerts = data.highAnomalies || 0;
        document.getElementById('ovAlerts').textContent = alerts;
        var alertCard = document.getElementById('ovAlertCard');
        if (alertCard) {
            if (alerts > 0) alertCard.classList.add('alert-card');
            else alertCard.classList.remove('alert-card');
        }

        var upSec = data.uptime || 0;
        var h = Math.floor(upSec / 3600);
        var m = Math.floor((upSec % 3600) / 60);
        document.getElementById('ovUptime').textContent = h + 'h ' + m + 'm';
        document.getElementById('ovGit').innerHTML = (data.gitHash || '\u2014') + '<br>' + (data.gitDate || '').substring(0, 10);

        if (data.tableCounts) {
            var html = '';
            Object.keys(data.tableCounts).forEach(function (t) {
                html += '<div style="display:flex;justify-content:space-between"><span>' + t + '</span><strong>' + data.tableCounts[t] + '</strong></div>';
            });
            if (data.dbSize) html += '<div style="margin-top:6px;color:var(--gold)">DB size: ' + (data.dbSize / 1024 / 1024).toFixed(2) + ' MB</div>';
            var dbEl = document.getElementById('dbStatsContainer');
            if (dbEl) dbEl.innerHTML = html;
        }

        var secBadge = document.getElementById('adminBadge-security');
        if (secBadge) secBadge.textContent = alerts > 0 ? alerts + ' HIGH' : '\u2713';
    } catch (e) { }
}

// --- WAL Checkpoint ---
async function runWALCheckpoint() {
    try {
        var data = await api('/admin/db-checkpoint', { method: 'POST', body: {} });
        var el = document.getElementById('checkpointResult');
        if (!el) return;
        if (data.success) {
            el.textContent = '\u2705 Checkpoint done in ' + data.duration_ms + 'ms (WAL was ' + (data.wal_size_before / 1024).toFixed(1) + ' KB)';
            el.className = 'action-status show success';
        } else {
            el.textContent = '\u274C ' + (data.error || 'Failed');
            el.className = 'action-status show error';
        }
        setTimeout(function () { el.className = 'action-status'; }, 4000);
    } catch (e) {
        var el2 = document.getElementById('checkpointResult');
        if (el2) { el2.textContent = '\u274C Connection error'; el2.className = 'action-status show error'; }
    }
}

// --- User Cards ---
function filterAdminUsers() {
    var q = (document.getElementById('adminSearch').value || '').toLowerCase();
    var filtered = adminAllUsers.filter(function (u) {
        return u.username.toLowerCase().indexOf(q) >= 0 || (u.email || '').toLowerCase().indexOf(q) >= 0;
    });
    renderAdminUsers(filtered);
}

function renderAdminUsers(users) {
    var html = '';
    users.forEach(function (u) {
        var tags = '<span class="user-card-tag ' + (u.role === 'admin' ? 'tag-admin' : 'tag-user') + '">' + u.role + '</span>';
        if (u.frozen) tags += '<span class="user-card-tag tag-frozen">\u2744\uFE0F Frozen</span>';
        if (u.score_multiplier && u.score_multiplier !== 1.0) tags += '<span class="user-card-tag tag-multiplier">\u26A1 ' + u.score_multiplier + 'x</span>';

        html += '<div class="user-card" id="card-' + u.username + '">'
            + '<div class="user-card-header">'
            + '<div><div class="user-card-name">' + u.username + '</div><div class="user-card-email">' + (u.email || '') + '</div></div>'
            + '<button class="action-menu-btn" onclick="toggleUserMenu(\'' + u.username + '\')">\u22EF</button>'
            + '</div>'
            + '<div class="user-card-meta">' + tags + '</div>'
            + '<div class="user-card-score">Score: <strong>' + (u.score !== undefined ? u.score : '\u2014') + '</strong></div>'
            + '<div class="action-dropdown" id="menu-' + u.username + '" style="display:none"></div>'
            + '<div class="user-card-inline" id="inline-' + u.username + '"></div>'
            + '<div class="action-status" id="status-' + u.username + '"></div>'
            + '</div>';
    });
    document.getElementById('adminUserList').innerHTML = html || '<p style="color:var(--text-muted)">No users found.</p>';
}

function toggleUserMenu(username) {
    var menu = document.getElementById('menu-' + username);
    if (!menu) return;
    document.querySelectorAll('.action-dropdown').forEach(function (m) { if (m.id !== 'menu-' + username) m.style.display = 'none'; });

    if (menu.style.display === 'none' || !menu.style.display) {
        var u = adminAllUsers.find(function (x) { return x.username === username; }) || {};
        menu.innerHTML = '<button class="action-dropdown-item" onclick="revealPassword(\'' + username + '\')">\uD83D\uDC41 Reveal password</button>'
            + '<button class="action-dropdown-item" onclick="openDataEditor(\'' + username + '\')">\uD83D\uDCDD Edit data</button>'
            + '<button class="action-dropdown-item" onclick="promptMultiplier(\'' + username + '\', ' + (u.score_multiplier || 1.0) + ')">\u26A1 Set multiplier</button>'
            + '<div class="action-dropdown-sep"></div>'
            + '<button class="action-dropdown-item" onclick="impersonateUser(\'' + username + '\')">\uD83D\uDC64 Impersonate</button>'
            + '<button class="action-dropdown-item" onclick="forceReLogin(\'' + username + '\')">\uD83D\uDD11 Force re-login</button>'
            + '<button class="action-dropdown-item" onclick="toggleFreeze(\'' + username + '\', ' + (u.frozen ? 0 : 1) + ')">' + (u.frozen ? '\uD83D\uDD13 Unfreeze score' : '\u2744\uFE0F Freeze score') + '</button>'
            + '<button class="action-dropdown-item" onclick="adminToggleRole(\'' + username + '\', \'' + (u.role === 'admin' ? 'user' : 'admin') + '\')">' + (u.role === 'admin' ? '\u2B07 Demote to user' : '\u2B06 Promote to admin') + '</button>'
            + '<div class="action-dropdown-sep"></div>'
            + '<button class="action-dropdown-item danger" onclick="adminDeleteUsr(\'' + username + '\')">\uD83D\uDDD1 Delete user</button>';
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
}

// Close menus on outside click
document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-menu-btn') && !e.target.closest('.action-dropdown')) {
        document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    }
});

// --- User Actions ---
async function revealPassword(username) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    var inline = document.getElementById('inline-' + username);
    if (!inline) return;
    if (inline.classList.contains('show')) { inline.classList.remove('show'); return; }
    try {
        var data = await api('/admin/reveal-password/' + username);
        if (data.success) {
            var pw = data.password || 'unavailable';
            inline.innerHTML = '\uD83D\uDD11 <code>' + pw + '</code> <button class="btn btn-secondary btn-sm" style="margin-left:8px;font-size:11px" onclick="navigator.clipboard.writeText(\'' + pw.replace(/'/g, "\\'") + '\');this.textContent=\'Copied!\'">\uD83D\uDCCB Copy</button>';
        } else {
            inline.innerHTML = '\u274C ' + (data.error || 'Failed');
        }
        inline.classList.add('show');
    } catch (e) { showCardStatus(username, 'Request failed \u2014 check connection', 'error'); }
}

async function promptMultiplier(username, current) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    var val = prompt('Set score multiplier for ' + username + ' (0.1\u20135.0, current: ' + current + '):', current);
    if (val === null) return;
    val = parseFloat(val);
    if (isNaN(val) || val < 0.1 || val > 5.0) { showCardStatus(username, 'Invalid multiplier (0.1\u20135.0)', 'error'); return; }
    try {
        var data = await api('/admin/set-multiplier', { method: 'POST', body: { username: username, multiplier: val } });
        if (data.success) { showCardStatus(username, '\u26A1 Multiplier set to ' + val + 'x', 'success'); loadAdmin(); }
        else showCardStatus(username, data.error || 'Failed', 'error');
    } catch (e) { showCardStatus(username, 'Request failed', 'error'); }
}

function setMultiplier(username) { promptMultiplier(username, 1.0); }

async function toggleFreeze(username, frozen) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    try {
        var data = await api('/admin/toggle-freeze', { method: 'POST', body: { username: username, frozen: frozen } });
        if (data.success) { showCardStatus(username, frozen ? '\u2744\uFE0F Score frozen' : '\uD83D\uDD13 Score unfrozen', 'success'); loadAdmin(); }
        else showCardStatus(username, data.error || 'Failed', 'error');
    } catch (e) { showCardStatus(username, 'Request failed', 'error'); }
}

async function forceReLogin(username) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    try {
        var data = await api('/admin/invalidate-session', { method: 'POST', body: { username: username } });
        if (data.success) showCardStatus(username, '\uD83D\uDD11 Session invalidated', 'success');
        else showCardStatus(username, data.error || 'Failed', 'error');
    } catch (e) { showCardStatus(username, 'Request failed', 'error'); }
}

function impersonateUser(username) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    APP.realUsername = localStorage.getItem('rf_username');
    APP.username = username;
    APP.impersonating = true;
    var banner = document.getElementById('impersonateBanner');
    if (banner) {
        document.getElementById('impersonateName').textContent = username;
        banner.style.display = 'flex';
    }
    document.getElementById('displayName').textContent = username + ' (Preview)';
    switchTab('taraweeh');
    loadDashboard();
}

function exitImpersonate() {
    APP.username = APP.realUsername || localStorage.getItem('rf_username');
    APP.impersonating = false;
    var banner = document.getElementById('impersonateBanner');
    if (banner) banner.style.display = 'none';
    document.getElementById('displayName').textContent = APP.username;
    loadDashboard();
}

async function adminToggleRole(username, newRole) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    if (username === APP.realUsername || username === localStorage.getItem('rf_username')) {
        showCardStatus(username, 'Cannot change your own role', 'error'); return;
    }
    try {
        var data = await api('/admin/change-role', { method: 'POST', body: { username: username, role: newRole } });
        if (data.success) { showCardStatus(username, '\u2705 Role changed to ' + newRole, 'success'); loadAdmin(); }
        else showCardStatus(username, data.error || 'Failed', 'error');
    } catch (e) { showCardStatus(username, 'Request failed', 'error'); }
}

function adminDeleteUsr(username) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    var now = Date.now();
    if (adminDeletePending[username] && now - adminDeletePending[username] < 5000) {
        delete adminDeletePending[username];
        api('/admin/delete-user', { method: 'POST', body: { username: username } }).then(function (data) {
            if (data.success) { showToast('\uD83D\uDDD1 User ' + username + ' deleted', 'success'); loadAdmin(); }
            else showCardStatus(username, data.error || 'Failed', 'error');
        }).catch(function () { showCardStatus(username, 'Request failed', 'error'); });
    } else {
        adminDeletePending[username] = now;
        showCardStatus(username, '\u26A0\uFE0F Click Delete again within 5s to confirm', 'error');
    }
}

function adminResetPw(username) {
    var pw = prompt('New password for ' + username + ':');
    if (!pw || pw.length < 4) return;
    api('/admin/reset-password', { method: 'POST', body: { username: username, newPassword: pw } }).then(function (data) {
        if (data.success) showCardStatus(username, '\u2705 Password reset', 'success');
        else showCardStatus(username, data.error || 'Failed', 'error');
    }).catch(function () { showCardStatus(username, 'Request failed', 'error'); });
}

// --- Announcement ---
async function loadCurrentAnnouncement() {
    try {
        var r = await fetch('/api/announcement');
        var data = await r.json();
        var el = document.getElementById('currentAnnouncementPreview');
        if (el) el.textContent = data.message ? '\uD83D\uDCE2 Active: "' + data.message + '"' : 'No active announcement.';
    } catch (e) { }
}

async function setAnnouncement() {
    var el = document.getElementById('adminAnnouncementInput');
    var msg = el ? el.value.trim() : '';
    if (!msg) return;
    var data = await api('/admin/announcement', { method: 'POST', body: { message: msg } });
    if (data.success) { showToast('\uD83D\uDCE2 Announcement set', 'success'); loadCurrentAnnouncement(); }
}

async function clearAnnouncement() {
    var data = await api('/admin/announcement', { method: 'POST', body: { message: '' } });
    if (data.success) { showToast('\uD83D\uDCE2 Announcement cleared', 'success'); loadCurrentAnnouncement(); localStorage.removeItem('rf_dismissed_announce'); }
}

// --- Region ---
async function saveAdminRegion() {
    var val = document.getElementById('adminRegionSelect').value;
    var parts = val.split(',');
    var data = await api('/ramadan/region', { method: 'POST', body: { country: parts[0], city: parts[1] } });
    if (data.success) { showToast('\uD83C\uDF0D Region saved: ' + val, 'success'); loadMultiRegionTracker(); }
    else showToast(data.error || 'Failed', 'error');
}

// --- Ramadan Date Management ---
async function loadAdminRamadanDates() {
    var year = APP.year;
    try {
        var adminData = await api('/ramadan/admin-dates/' + year);
        var regionsData = await api('/ramadan/all-regions/' + year);
        var adminDates = adminData.success ? adminData.dates : {};
        var regions = regionsData.success ? regionsData.regions : {};
        var container = document.getElementById('adminRamadanDates');
        if (!container) return;
        var html = '';
        ['ksa', 'pak', 'az'].forEach(function (id) {
            var label = id === 'ksa' ? '\uD83C\uDDF8\uD83C\uDDE6 KSA' : id === 'pak' ? '\uD83C\uDDF5\uD83C\uDDF0 PAK' : '\uD83C\uDDE6\uD83C\uDDFF AZ';
            var r = regions[id] || {};
            var a = adminDates[id] || {};
            var source = r.source || 'api';
            var sourceBadge = '<span class="ramadan-source-badge source-' + source + '">' + source.toUpperCase() + '</span>';
            var currentDate = r.start || '';
            html += '<div class="ramadan-region-row">'
                + '<strong style="min-width:70px">' + label + '</strong>'
                + sourceBadge
                + '<span style="color:var(--text-secondary);font-size:12px">' + currentDate + '</span>'
                + '<input type="date" id="rdDate-' + id + '" value="' + (a.date || currentDate || '') + '" style="padding:6px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-family:\'Inter\',sans-serif">'
                + '<input type="text" id="rdNote-' + id + '" placeholder="Note..." value="' + (a.note || '') + '" style="flex:1;min-width:80px;padding:6px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px">'
                + '<label style="font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="rdNotify-' + id + '"> Notify</label>'
                + '<button class="btn btn-primary btn-sm" onclick="saveAdminDate(\'' + id + '\')" style="font-size:11px;padding:4px 10px">Save</button>'
                + '<button class="btn btn-secondary btn-sm" onclick="clearAdminDate(\'' + id + '\')" style="font-size:11px;padding:4px 10px">Clear</button>'
                + '</div>';
        });
        container.innerHTML = html;
    } catch (e) { }
}

async function saveAdminDate(region) {
    var date = document.getElementById('rdDate-' + region).value;
    var note = document.getElementById('rdNote-' + region).value;
    var notify = document.getElementById('rdNotify-' + region).checked;
    if (!date) { showToast('Select a date first', 'error'); return; }
    try {
        var data = await api('/ramadan/admin-dates', { method: 'POST', body: { year: APP.year, region: region, date: date, note: note, notify: notify } });
        if (data.success) { showToast('\uD83D\uDCC5 ' + data.message, 'success'); loadAdminRamadanDates(); loadMultiRegionTracker(); }
        else showToast(data.error || 'Failed', 'error');
    } catch (e) { showToast('Request failed', 'error'); }
}

async function clearAdminDate(region) {
    try {
        var data = await api('/ramadan/admin-dates/clear', { method: 'POST', body: { year: APP.year, region: region } });
        if (data.success) { showToast('\uD83D\uDCC5 ' + data.message, 'success'); loadAdminRamadanDates(); loadMultiRegionTracker(); }
        else showToast(data.error || 'Failed', 'error');
    } catch (e) { showToast('Request failed', 'error'); }
}

// --- Anomaly Feed ---
async function loadAnomalies() {
    try {
        var suppress = document.getElementById('anomalySuppressToggle') && document.getElementById('anomalySuppressToggle').checked;
        var data = await api('/analytics/anomalies' + (suppress ? '?suppress=true' : ''));
        if (!data.success) return;
        adminAnomalyCache = data.anomalies || [];
        var types = {};
        adminAnomalyCache.forEach(function (a) { types[a.anomaly_type] = true; });
        var typeSelect = document.getElementById('anomalyFilterType');
        if (typeSelect) {
            var current = typeSelect.value;
            typeSelect.innerHTML = '<option value="">All Types</option>';
            Object.keys(types).forEach(function (t) {
                typeSelect.innerHTML += '<option value="' + t + '"' + (t === current ? ' selected' : '') + '>' + t + '</option>';
            });
        }
        applyAnomalyFilters();
        var pill = document.getElementById('anomalyNewPill');
        if (pill) pill.style.display = 'none';
    } catch (e) { }
}

function applyAnomalyFilters() {
    var severity = (document.getElementById('anomalyFilterSeverity') || {}).value || '';
    var type = (document.getElementById('anomalyFilterType') || {}).value || '';
    var user = ((document.getElementById('anomalyFilterUser') || {}).value || '').toLowerCase();
    var filtered = adminAnomalyCache.filter(function (a) {
        if (severity && a.severity !== severity) return false;
        if (type && a.anomaly_type !== type) return false;
        if (user && (!a.username || a.username.toLowerCase().indexOf(user) < 0)) return false;
        return true;
    });
    var html = '<table class="admin-table"><thead><tr><th>Severity</th><th>Type</th><th>User</th><th>Details</th><th>Time</th></tr></thead><tbody>';
    filtered.forEach(function (a) {
        var details = '';
        try { details = JSON.stringify(JSON.parse(a.details || '{}'), null, 0).substring(0, 80); } catch (e) { details = a.details || ''; }
        html += '<tr><td><span class="severity-badge severity-' + a.severity + '">' + a.severity + '</span></td>'
            + '<td>' + (a.anomaly_type || '') + '</td>'
            + '<td>' + (a.username || '\u2014') + '</td>'
            + '<td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + details + '</td>'
            + '<td style="font-size:11px;white-space:nowrap">' + (a.created_at || '').substring(0, 16) + '</td></tr>';
    });
    html += '</tbody></table>';
    if (filtered.length === 0) html = '<p style="color:var(--text-muted);font-size:13px">No anomalies found.</p>';
    document.getElementById('anomalyFeed').innerHTML = html;
}

var lastAnomalyCount = 0;
function pollAnomalies() {
    api('/analytics/anomalies').then(function (data) {
        if (!data.success) return;
        var count = (data.anomalies || []).length;
        if (count > lastAnomalyCount && lastAnomalyCount > 0) {
            var pill = document.getElementById('anomalyNewPill');
            if (pill) { pill.textContent = (count - lastAnomalyCount) + ' new'; pill.style.display = 'inline-block'; }
        }
        lastAnomalyCount = count;
    }).catch(function () { });
}

function exportAnomaliesCSV() {
    if (adminAnomalyCache.length === 0) { showToast('No anomalies to export', 'error'); return; }
    var csv = 'severity,type,username,details,ip_hash,country,created_at\n';
    adminAnomalyCache.forEach(function (a) {
        csv += [a.severity, a.anomaly_type, a.username || '', (a.details || '').replace(/,/g, ';'), a.ip_hash || '', a.cf_ip_country || '', a.created_at || ''].join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv' });
    var a2 = document.createElement('a');
    a2.href = URL.createObjectURL(blob);
    a2.download = 'anomalies.csv';
    a2.click();
}

function clearAllAnomalies() {
    if (!confirm('Clear ALL anomalies? This cannot be undone.')) return;
    showToast('Bulk clear not yet implemented on backend.', 'error');
}

// --- Honeypot ---
async function loadHoneypot() {
    try {
        var data = await api('/analytics/honeypot-log');
        if (!data.success) return;
        var hits = data.hits || [];
        if (hits.length === 0) { document.getElementById('honeypotLog').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No honeypot hits.</p>'; return; }
        var html = '<table class="admin-table"><thead><tr><th>Route</th><th>IP Hash</th><th>User Agent</th><th>Time</th></tr></thead><tbody>';
        hits.forEach(function (h) {
            var ua = h.user_agent || '';
            if (ua.indexOf('curl') >= 0) ua = '\uD83D\uDD27 curl';
            else if (ua.indexOf('python') >= 0 || ua.indexOf('Python') >= 0) ua = '\uD83D\uDC0D Python script';
            else if (ua.indexOf('Go-http') >= 0) ua = '\uD83D\uDD39 Go client';
            else if (ua.indexOf('Chrome') >= 0) ua = '\uD83C\uDF10 Chrome';
            else if (ua.indexOf('Firefox') >= 0) ua = '\uD83E\uDD8A Firefox';
            else if (ua.length > 40) ua = ua.substring(0, 40) + '\u2026';
            html += '<tr><td>' + (h.route || '') + '</td><td style="font-size:11px">' + (h.ip_hash || '') + '</td><td style="font-size:11px">' + ua + '</td><td style="font-size:11px;white-space:nowrap">' + (h.created_at || '').substring(0, 16) + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('honeypotLog').innerHTML = html;
    } catch (e) { }
}

// --- Fingerprints ---
async function loadFingerprints() {
    try {
        var data = await api('/analytics/fingerprint-scores');
        if (!data.success) return;
        var scores = data.scores || [];
        if (scores.length === 0) { document.getElementById('fingerprintScores').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No fingerprint data.</p>'; return; }
        var html = '<table class="admin-table"><thead><tr><th>User</th><th>Unique FPs</th><th>Sessions</th><th>First Seen</th><th>Last Seen</th></tr></thead><tbody>';
        scores.forEach(function (s) {
            var row = s.unique_fps > 3 ? ' style="background:rgba(243,156,18,0.08)"' : '';
            html += '<tr' + row + '><td>' + s.username + '</td><td>' + s.unique_fps + (s.unique_fps > 3 ? ' \u26A0\uFE0F' : '') + '</td><td>' + s.total_sessions + '</td><td style="font-size:11px">' + (s.first_seen || '').substring(0, 10) + '</td><td style="font-size:11px">' + (s.last_seen || '').substring(0, 10) + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('fingerprintScores').innerHTML = html;
    } catch (e) { }
}

// --- Typing ---
async function loadTypingBaseline() {
    try {
        var fpData = await api('/analytics/fingerprint-scores');
        if (!fpData.success) return;
        var users = (fpData.scores || []).map(function (s) { return s.username; });
        if (users.length === 0) { document.getElementById('typingBaseline').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No typing data.</p>'; return; }
        var html = '<table class="admin-table"><thead><tr><th>User</th><th>Baseline Dwell</th><th>Baseline Flight</th><th>Flagged</th></tr></thead><tbody>';
        for (var i = 0; i < Math.min(users.length, 10); i++) {
            try {
                var tData = await api('/analytics/typing/' + users[i]);
                if (tData.success && tData.profiles && tData.profiles.length > 0) {
                    var latest = tData.profiles[0];
                    html += '<tr><td>' + users[i] + '</td><td>' + Math.round(latest.baseline_dwell || 0) + 'ms</td><td>' + Math.round(latest.baseline_flight || 0) + 'ms</td><td>' + (latest.flagged ? '\uD83D\uDEA9 ' + Math.round(latest.deviation_pct) + '%' : '\u2713') + '</td></tr>';
                }
            } catch (e) { }
        }
        html += '</tbody></table>';
        document.getElementById('typingBaseline').innerHTML = html;
    } catch (e) { }
}

// --- Live Request Log ---
async function loadLiveRequestLog() {
    try {
        var data = await api('/analytics/requests');
        if (!data.success) return;
        var reqs = data.requests || [];
        if (reqs.length === 0) { document.getElementById('liveRequestLog').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No requests logged yet.</p>'; return; }
        var html = '<table class="admin-table"><thead><tr><th>Time</th><th>Method</th><th>Route</th><th>User</th><th>Status</th><th>ms</th><th>\uD83C\uDF0D</th></tr></thead><tbody>';
        reqs.forEach(function (r) {
            var ms = r.response_ms || 0;
            var rtClass = ms < 200 ? 'rt-fast' : ms < 1000 ? 'rt-medium' : 'rt-slow';
            var flag = r.cf_country ? getFlagEmoji(r.cf_country) : '';
            html += '<tr><td style="font-size:11px;white-space:nowrap">' + (r.created_at || '').substring(11, 19) + '</td>'
                + '<td><strong>' + (r.method || '') + '</strong></td>'
                + '<td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis">' + (r.route || '') + '</td>'
                + '<td>' + (r.username || '\u2014') + '</td>'
                + '<td>' + (r.status_code || '') + '</td>'
                + '<td class="' + rtClass + '" style="font-weight:600">' + ms + '</td>'
                + '<td>' + flag + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('liveRequestLog').innerHTML = html;
    } catch (e) { /* silent */ }
}

function getFlagEmoji(cc) {
    if (!cc || cc.length !== 2) return cc || '';
    try { return String.fromCodePoint(...[...cc.toUpperCase()].map(function (c) { return 127397 + c.charCodeAt(0); })); } catch (e) { return cc; }
}

// --- Audit Log ---
async function loadAuditLog() {
    try {
        var data = await api('/analytics/admin-audit');
        if (!data.success) return;
        var audits = data.audits || [];
        if (audits.length === 0) { document.getElementById('auditLogContainer').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No audit entries.</p>'; return; }
        var html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="admin-table" style="min-width:400px"><thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>Time</th></tr></thead><tbody>';
        audits.forEach(function (a) {
            var action = (a.action || '');
            if (action.length > 40) action = action.substring(0, 40) + '\u2026';
            html += '<tr><td style="white-space:nowrap">' + (a.admin_username || '') + '</td><td style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (a.action || '').replace(/"/g, '&quot;') + '">' + action + '</td><td style="white-space:nowrap">' + (a.target_username || '\u2014') + '</td><td style="font-size:11px;white-space:nowrap">' + (a.created_at || '').substring(0, 16) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        document.getElementById('auditLogContainer').innerHTML = html;
    } catch (e) { }
}

// --- Data Editor ---
function openDataEditor(username) {
    document.querySelectorAll('.action-dropdown').forEach(function (m) { m.style.display = 'none'; });
    api('/admin/user-data/' + username + '/' + APP.year).then(function (data) {
        if (!data.success) { showToast(data.error || 'Failed', 'error'); return; }
        var modal = document.getElementById('dataEditorModal');
        document.getElementById('dataEditorTitle').textContent = '\uD83D\uDCDD Edit Data \u2014 ' + username;
        APP.editingUsername = username;
        var html = '';
        var tables = ['taraweeh', 'fasting', 'azkar', 'namaz', 'quran_progress', 'surah_memorization'];
        tables.forEach(function (t) {
            var rows = data[t] || [];
            html += '<h4 style="color:var(--gold);margin:12px 0 6px">' + t.charAt(0).toUpperCase() + t.slice(1) + ' (' + rows.length + ')</h4>';
            if (rows.length === 0) { html += '<p style="font-size:12px;color:var(--text-muted)">No data</p>'; return; }
            html += '<div style="overflow-x:auto"><table class="admin-table"><thead><tr>';
            var keys = Object.keys(rows[0]).filter(function (k) { return k !== 'id' && k !== 'username'; });
            keys.forEach(function (k) { html += '<th>' + k + '</th>'; });
            html += '</tr></thead><tbody>';
            rows.forEach(function (row, i) {
                html += '<tr>';
                keys.forEach(function (k) {
                    html += '<td><input type="text" value="' + (row[k] !== null && row[k] !== undefined ? row[k] : '') + '" data-table="' + t + '" data-idx="' + i + '" data-key="' + k + '" style="width:100%;min-width:60px;padding:4px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:3px;color:var(--text-primary);font-size:11px"></td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
        });
        document.getElementById('dataEditorContent').innerHTML = html;
        modal.classList.remove('hidden');
    }).catch(function () { showToast('Request failed', 'error'); });
}

function closeDataEditor() { document.getElementById('dataEditorModal').classList.add('hidden'); }

async function saveDataEditor() {
    var inputs = document.querySelectorAll('#dataEditorContent input[data-table]');
    var changes = {};
    inputs.forEach(function (inp) {
        var t = inp.dataset.table;
        var idx = parseInt(inp.dataset.idx);
        var key = inp.dataset.key;
        if (!changes[t]) changes[t] = {};
        if (!changes[t][idx]) changes[t][idx] = {};
        changes[t][idx][key] = inp.value;
    });
    try {
        var data = await api('/admin/user-data/save', { method: 'POST', body: { username: APP.editingUsername, year: APP.year, data: changes } });
        if (data.success) { showToast('\u2705 Data saved', 'success'); closeDataEditor(); }
        else showToast(data.error || 'Save failed', 'error');
    } catch (e) { showToast('Request failed', 'error'); }
}

function openAdminEditUser() {
    var sel = document.getElementById('adminEditUserSelect');
    if (sel && sel.value) openDataEditor(sel.value);
}

function exitAdminEdit() {
    var banner = document.getElementById('adminEditBanner');
    if (banner) banner.style.display = 'none';
    APP.username = localStorage.getItem('rf_username');
    loadDashboard();
}

// --- Export ---
async function exportCSV() {
    try {
        var data = await api('/admin/export/' + APP.year);
        if (!data.success) { showToast('Export failed', 'error'); return; }
        var allData = data.data || {};
        var csv = 'tracker,username,date,detail\n';
        ['taraweeh', 'fasting', 'azkar', 'namaz'].forEach(function (t) {
            (allData[t] || []).forEach(function (row) {
                csv += [t, row.username || '', row.date || '', JSON.stringify(row).replace(/,/g, ';')].join(',') + '\n';
            });
        });
        var blob = new Blob([csv], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'RamadanFlow_' + APP.year + '.csv';
        a.click();
    } catch (e) { showToast('Export failed', 'error'); }
}

async function exportJSON() {
    try {
        var data = await api('/admin/export/' + APP.year);
        if (!data.success) { showToast('Export failed', 'error'); return; }
        var blob = new Blob([JSON.stringify(data.data || {}, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'RamadanFlow_' + APP.year + '.json';
        a.click();
    } catch (e) { showToast('Export failed', 'error'); }
}
