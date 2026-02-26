// ===================================================================
// RamadanFlow v3.0 — Frontend Application
// Replaces google.script.run with fetch() API calls
// ===================================================================

var APP = {
    username: '',
    role: 'user',
    email: '',
    token: '',
    year: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear(),
    fastingCalMonth: new Date().getMonth(),
    fastingCalYear: new Date().getFullYear(),
    taraweehData: {},
    fastingData: {},
    khatams: [],
    dashboardData: null,
    adminUsers: [],
    ramadanDates: null
};

// ===================================================================
// API HELPER
// ===================================================================

async function api(endpoint, options = {}) {
    var headers = { 'Content-Type': 'application/json' };
    if (APP.token) headers['Authorization'] = 'Bearer ' + APP.token;
    try {
        var res = await fetch('/api' + endpoint, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        return await res.json();
    } catch (err) {
        console.error('API error:', endpoint, err);
        return { success: false, error: 'Connection error.' };
    }
}

// ===================================================================
// PAGE NAVIGATION (SPA)
// ===================================================================

function goToPage(page) {
    document.getElementById('loginWrapper').style.display = 'none';
    document.getElementById('registerWrapper').style.display = 'none';
    document.getElementById('dashboardWrapper').style.display = 'none';
    var targetId = page.toLowerCase() + 'Wrapper';
    var el = document.getElementById(targetId);
    if (el) el.style.display = 'block';
}

// ===================================================================
// AUTH: LOGIN
// ===================================================================

async function handleLogin(e) {
    e.preventDefault();
    var id = document.getElementById('identifier').value.trim();
    var pw = document.getElementById('loginPassword').value;
    var btn = document.getElementById('loginBtn');

    if (!id || !pw) { showLoginAlert('Please fill in all fields.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';

    var result = await api('/auth/login', { method: 'POST', body: { identifier: id, password: pw } });
    if (result.success) {
        APP.token = result.token;
        APP.username = result.username;
        APP.role = result.role;
        APP.email = result.email;
        sessionStorage.setItem('token', result.token);
        sessionStorage.setItem('username', result.username);
        sessionStorage.setItem('role', result.role);
        sessionStorage.setItem('email', result.email);
        initDashboard();
    } else {
        showLoginAlert(result.error, 'error');
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

function showLoginAlert(msg, type) {
    var el = document.getElementById('loginAlert');
    el.textContent = msg;
    el.className = 'alert show alert-' + type;
}

// ===================================================================
// AUTH: REGISTER
// ===================================================================

async function handleRegister(e) {
    e.preventDefault();
    var username = document.getElementById('regUsername').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var pw = document.getElementById('regPassword').value;
    var cpw = document.getElementById('regConfirmPassword').value;
    var btn = document.getElementById('registerBtn');

    if (pw !== cpw) { showRegisterAlert('Passwords do not match.', 'error'); return; }
    if (pw.length < 4) { showRegisterAlert('Password must be at least 4 characters.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';

    var result = await api('/auth/register', { method: 'POST', body: { username, email, password: pw } });
    if (result.success) {
        showRegisterAlert(result.message, 'success');
        setTimeout(function () { goToPage('Login'); }, 1500);
    } else {
        showRegisterAlert(result.error, 'error');
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

function showRegisterAlert(msg, type) {
    var el = document.getElementById('registerAlert');
    el.textContent = msg;
    el.className = 'alert show alert-' + type;
}

// ===================================================================
// INIT & LOGOUT
// ===================================================================

function initApp() {
    APP.token = sessionStorage.getItem('token') || '';
    APP.username = sessionStorage.getItem('username') || '';
    APP.role = sessionStorage.getItem('role') || 'user';
    APP.email = sessionStorage.getItem('email') || '';

    if (!APP.username || !APP.token) {
        goToPage('Login');
        return;
    }
    initDashboard();
}

function initDashboard() {
    goToPage('Dashboard');
    document.getElementById('displayName').textContent = APP.username;
    document.getElementById('displayRole').textContent = APP.role;
    if (APP.role === 'admin') document.getElementById('adminTabBtn').style.display = '';
    showSkeleton();
    fetchRamadanDates();
    loadDashboard();
}

function logout() {
    sessionStorage.clear();
    APP.username = '';
    APP.token = '';
    APP.dashboardData = null;
    APP.taraweehData = {};
    APP.khatams = [];
    APP.fastingData = {};
    goToPage('Login');
}

// ===================================================================
// TABS
// ===================================================================

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'taraweeh') loadTaraweeh();
    else if (tab === 'quran') loadQuran();
    else if (tab === 'fasting') loadFasting();
    else if (tab === 'stats') loadStats();
    else if (tab === 'admin') loadAdmin();
}

function changeYear() {
    APP.year = parseInt(document.getElementById('yearSelect').value);
    loadDashboard();
}

// ===================================================================
// SKELETON LOADER
// ===================================================================

function showSkeleton() {
    var area = document.getElementById('skeletonArea');
    area.style.display = 'block';
    area.innerHTML = '<div style="display:grid;gap:16px"><div style="height:200px;background:var(--bg-secondary);border-radius:var(--radius);animation:pulse 1.5s ease infinite"></div><div style="height:100px;background:var(--bg-secondary);border-radius:var(--radius);animation:pulse 1.5s ease infinite"></div></div>';
}
function hideSkeleton() { document.getElementById('skeletonArea').style.display = 'none'; }

// ===================================================================
// LOADING / TOAST
// ===================================================================

function showLoading(msg) { document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 3000);
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// ===================================================================
// RAMADAN DATES
// ===================================================================

async function fetchRamadanDates() {
    var result = await api('/ramadan/' + APP.year);
    if (result.success && result.dates) {
        APP.ramadanDates = result.dates;
    }
}

function isRamadanDay(dateStr) {
    if (!APP.ramadanDates) return false;
    return dateStr >= APP.ramadanDates.start && dateStr <= APP.ramadanDates.end;
}

function getRamadanStartMonth() {
    if (!APP.ramadanDates || !APP.ramadanDates.start) return null;
    var parts = APP.ramadanDates.start.split('-');
    return { month: parseInt(parts[1]) - 1, year: parseInt(parts[0]) };
}

// ===================================================================
// DASHBOARD
// ===================================================================

async function loadDashboard() {
    var result = await api('/dashboard/' + APP.year);
    hideSkeleton();
    if (result.success) {
        APP.dashboardData = result;
        renderMyStats();
        var rm = getRamadanStartMonth();
        if (rm) {
            APP.calendarMonth = rm.month;
            APP.calendarYear = rm.year;
            APP.fastingCalMonth = rm.month;
            APP.fastingCalYear = rm.year;
        }
        switchTab('taraweeh');
    }
}

function renderMyStats() {
    var data = APP.dashboardData;
    if (!data) return;
    var me = null;
    for (var i = 0; i < data.summaries.length; i++) {
        if (data.summaries[i].username.toLowerCase() === APP.username.toLowerCase()) { me = data.summaries[i]; break; }
    }
    if (me) {
        document.getElementById('statTaraweeh').textContent = me.taraweehCount;
        document.getElementById('statStreak').textContent = me.streak;
        document.getElementById('statParas').textContent = me.totalParas;
        document.getElementById('statKhatams').textContent = me.completedKhatams;
        document.getElementById('statFasting').textContent = me.fastingCount;
    }
}

async function refreshDashboard() {
    var r = await api('/dashboard/' + APP.year);
    if (r.success) { APP.dashboardData = r; renderMyStats(); }
}

// ===================================================================
// TARAWEEH CALENDAR
// ===================================================================

async function loadTaraweeh() {
    var r = await api('/taraweeh/' + APP.username + '/' + APP.year);
    if (r.success) { APP.taraweehData = r.data; renderTaraweehCalendar(); }
}

function renderTaraweehCalendar() {
    var month = APP.calendarMonth, year = APP.calendarYear;
    var container = document.getElementById('taraweehCalendar');
    var title = document.getElementById('taraweehMonthTitle');
    var mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    title.textContent = mn[month] + ' ' + year;

    var firstDay = new Date(year, month, 1).getDay();
    var dim = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

    var html = '';
    var dh = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var h = 0; h < 7; h++) html += '<div class="calendar-day-header">' + dh[h] + '</div>';
    for (var e = 0; e < firstDay; e++) html += '<div class="calendar-day empty"></div>';

    for (var d = 1; d <= dim; d++) {
        var ds = year + '-' + pad(month + 1) + '-' + pad(d);
        var entry = APP.taraweehData[ds];
        var isToday = ds === todayStr;
        var isFuture = new Date(ds) > today;
        var classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFuture) classes += ' future';
        if (entry && entry.completed) classes += ' completed';
        if (isRamadanDay(ds)) classes += ' ramadan';

        var rb = (entry && entry.completed && entry.rakaat) ? '<span class="rakaat-badge">' + entry.rakaat + 'r</span>' : '';
        var oc = isFuture ? '' : ' onclick="openTaraweehModal(\'' + ds + '\')"';
        html += '<div class="' + classes + '"' + oc + '><span>' + d + '</span>' + rb + '</div>';
    }
    container.innerHTML = html;
}

function prevMonth() { APP.calendarMonth--; if (APP.calendarMonth < 0) { APP.calendarMonth = 11; APP.calendarYear--; } renderTaraweehCalendar(); }
function nextMonth() { APP.calendarMonth++; if (APP.calendarMonth > 11) { APP.calendarMonth = 0; APP.calendarYear++; } renderTaraweehCalendar(); }

function openTaraweehModal(dateStr) {
    var modal = document.getElementById('taraweehModal');
    modal.classList.remove('hidden');
    modal.setAttribute('data-date', dateStr);
    document.getElementById('taraweehModalDate').textContent = dateStr;
    var entry = APP.taraweehData[dateStr];
    document.getElementById('taraweehRemoveBtn').style.display = (entry && entry.completed) ? '' : 'none';
    document.querySelectorAll('.rakaat-option').forEach(function (o) { o.classList.remove('selected'); });
    var defaultR = (entry && entry.rakaat) ? entry.rakaat : '8';
    document.querySelector('.rakaat-option[data-rakaat="' + defaultR + '"]').classList.add('selected');
}

function closeTaraweehModal() { document.getElementById('taraweehModal').classList.add('hidden'); }
function selectRakaat(el) { document.querySelectorAll('.rakaat-option').forEach(function (o) { o.classList.remove('selected'); }); el.classList.add('selected'); }

async function saveTaraweeh() {
    var modal = document.getElementById('taraweehModal');
    var ds = modal.getAttribute('data-date');
    var rakaat = parseInt(document.querySelector('.rakaat-option.selected').getAttribute('data-rakaat'));
    closeTaraweehModal(); showLoading('Saving...');
    var r = await api('/taraweeh/log', { method: 'POST', body: { username: APP.username, date: ds, completed: true, rakaat: rakaat } });
    hideLoading();
    if (r.success) { showToast(r.message); loadTaraweeh(); refreshDashboard(); }
}

async function removeTaraweeh() {
    var modal = document.getElementById('taraweehModal');
    var ds = modal.getAttribute('data-date');
    closeTaraweehModal(); showLoading('Removing...');
    var r = await api('/taraweeh/log', { method: 'POST', body: { username: APP.username, date: ds, completed: false, rakaat: 0 } });
    hideLoading();
    if (r.success) { showToast(r.message); loadTaraweeh(); refreshDashboard(); }
}

// ===================================================================
// QURAN / KHATAM
// ===================================================================

async function loadQuran() {
    showLoading('Loading Quran...');
    var r = await api('/quran/' + APP.username + '/' + APP.year);
    hideLoading();
    if (r.success) { APP.khatams = r.khatams; renderKhatams(); }
}

function renderKhatams() {
    var container = document.getElementById('khatamList');
    if (APP.khatams.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)"><p style="font-size:40px;margin-bottom:12px">📖</p><p>No Khatams started yet for ' + APP.year + '</p><p style="font-size:13px;margin-top:8px">Click "+ Arabic" or "+ Translation" above to begin</p></div>';
        return;
    }
    var html = '';
    for (var k = 0; k < APP.khatams.length; k++) {
        var kh = APP.khatams[k];
        var isComplete = kh.paraCount >= 30;
        var pct = Math.round((kh.paraCount / 30) * 100);
        var typeIcon = kh.type === 'Arabic' ? '🕋' : '🌍';
        html += '<div class="card" style="margin-bottom:16px"><div class="card-header"><h2>' + typeIcon + ' ' + kh.type + ' Khatam</h2><span style="font-size:13px;color:var(--text-secondary)">' + kh.paraCount + '/30 paras · ' + pct + '%' + (isComplete ? ' ✅ Complete!' : '') + '</span></div>';
        html += '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>';
        html += '<div class="quran-grid">';
        for (var p = 1; p <= 30; p++) {
            var done = kh.paras && kh.paras[p];
            html += '<div class="para-box' + (done ? ' completed' : '') + '" onclick="togglePara(\'' + kh.id + '\',' + p + ',' + !done + ')">' + p + '</div>';
        }
        html += '</div></div>';
    }
    container.innerHTML = html;
}

async function startNewKhatam(type) {
    showLoading('Starting...');
    var r = await api('/quran/create', { method: 'POST', body: { username: APP.username, type: type } });
    hideLoading();
    if (r.success) { showToast(r.message); loadQuran(); refreshDashboard(); }
    else showToast(r.error, 'error');
}

async function togglePara(khatamId, paraNumber, completed) {
    var r = await api('/quran/toggle-para', { method: 'POST', body: { username: APP.username, khatamId: khatamId, paraNumber: paraNumber, completed: completed } });
    if (r.success) { showToast(r.message); loadQuran(); refreshDashboard(); }
}

// ===================================================================
// FASTING
// ===================================================================

async function loadFasting() {
    var r = await api('/fasting/' + APP.username + '/' + APP.year);
    if (r.success) { APP.fastingData = r.data; renderFastingCalendar(); }
}

function renderFastingCalendar() {
    var month = APP.fastingCalMonth, year = APP.fastingCalYear;
    var container = document.getElementById('fastingCalendar');
    var title = document.getElementById('fastingMonthTitle');
    var mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    title.textContent = mn[month] + ' ' + year;

    var firstDay = new Date(year, month, 1).getDay();
    var dim = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

    var html = '';
    var dh = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var h = 0; h < 7; h++) html += '<div class="calendar-day-header">' + dh[h] + '</div>';
    for (var e = 0; e < firstDay; e++) html += '<div class="calendar-day empty"></div>';

    for (var d = 1; d <= dim; d++) {
        var ds = year + '-' + pad(month + 1) + '-' + pad(d);
        var entry = APP.fastingData[ds];
        var isToday = ds === todayStr;
        var isFuture = new Date(ds) > today;
        var classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFuture) classes += ' future';
        if (entry && entry.completed) classes += ' completed';
        if (isRamadanDay(ds)) classes += ' ramadan';

        var oc = isFuture ? '' : ' onclick="toggleFasting(\'' + ds + '\')"';
        html += '<div class="' + classes + '"' + oc + '><span>' + d + '</span></div>';
    }
    container.innerHTML = html;
}

function prevFastingMonth() { APP.fastingCalMonth--; if (APP.fastingCalMonth < 0) { APP.fastingCalMonth = 11; APP.fastingCalYear--; } renderFastingCalendar(); }
function nextFastingMonth() { APP.fastingCalMonth++; if (APP.fastingCalMonth > 11) { APP.fastingCalMonth = 0; APP.fastingCalYear++; } renderFastingCalendar(); }

async function toggleFasting(dateStr) {
    var current = APP.fastingData[dateStr] && APP.fastingData[dateStr].completed;
    showLoading('Saving...');
    var r = await api('/fasting/log', { method: 'POST', body: { username: APP.username, date: dateStr, completed: !current } });
    hideLoading();
    if (r.success) { showToast(r.message); loadFasting(); refreshDashboard(); }
}

// ===================================================================
// STATS / LEADERBOARD / BADGES
// ===================================================================

function loadStats() {
    if (!APP.dashboardData) return;
    renderCharts();
    renderLeaderboard();
    renderBadges();
}

function renderCharts() {
    var data = APP.dashboardData.summaries;
    renderBarChart('taraweehChart', '🕌 Taraweeh Days', data.map(function (s) { return { label: s.username, value: s.taraweehCount }; }), 'var(--green)');
    renderBarChart('quranChart', '📖 Quran Paras', data.map(function (s) { return { label: s.username, value: s.totalParas }; }), 'var(--gold)');
    renderBarChart('fastingChart', '🍽️ Fasting Days', data.map(function (s) { return { label: s.username, value: s.fastingCount }; }), 'var(--blue)');
}

function renderBarChart(containerId, title, items, color) {
    var max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    var html = '<h3 style="font-size:15px;margin-bottom:12px">' + title + '</h3>';
    items.forEach(function (item) {
        var pct = Math.round((item.value / max) * 100);
        html += '<div style="margin-bottom:8px;display:flex;align-items:center;gap:12px"><span style="min-width:80px;font-size:13px">' + item.label + '</span><div style="flex:1;height:20px;background:var(--bg-secondary);border-radius:10px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:10px;transition:width 0.5s"></div></div><span style="min-width:30px;font-size:13px;text-align:right">' + item.value + '</span></div>';
    });
    document.getElementById(containerId).innerHTML = html;
}

function renderLeaderboard() {
    var data = APP.dashboardData.summaries;
    var html = '<table class="family-table"><thead><tr><th>#</th><th>Name</th><th>🕌</th><th>🔥</th><th>📖</th><th>🍽️</th><th>Score</th></tr></thead><tbody>';
    data.forEach(function (s, i) {
        var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
        html += '<tr><td class="rank">' + medal + '</td><td>' + s.username + '</td><td>' + s.taraweehCount + '</td><td>' + s.streak + '</td><td>' + s.totalParas + '</td><td>' + s.fastingCount + '</td><td style="color:var(--gold);font-weight:700">' + s.score + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('leaderboardTable').innerHTML = html;
}

function renderBadges() {
    if (!APP.dashboardData) return;
    var summaries = APP.dashboardData.summaries;
    var badgeDefs = [
        { emoji: '🔥', name: 'First Streak', desc: '3+ day streak', check: function (s) { return s.streak >= 3; } },
        { emoji: '⭐', name: 'Week Warrior', desc: '7+ day streak', check: function (s) { return s.streak >= 7; } },
        { emoji: '📖', name: 'Hafiz Journey', desc: '1 Khatam done', check: function (s) { return s.completedKhatams >= 1; } },
        { emoji: '🍽️', name: 'Fasting Warrior', desc: '15+ days fasted', check: function (s) { return s.fastingCount >= 15; } },
        { emoji: '🌙', name: 'Full Ramadan', desc: '29+ days fasted', check: function (s) { return s.fastingCount >= 29; } },
        { emoji: '🚀', name: 'Getting Started', desc: 'Logged first Taraweeh', check: function (s) { return s.taraweehCount >= 1; } }
    ];

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">';
    badgeDefs.forEach(function (def) {
        var earners = summaries.filter(function (s) { return def.check(s); }).map(function (s) { return s.username; });
        var earned = earners.length > 0;
        html += '<div style="background:' + (earned ? 'rgba(201,168,76,0.1)' : 'var(--bg-secondary)') + ';border:1px solid ' + (earned ? 'var(--gold)' : 'var(--border-color)') + ';border-radius:var(--radius-sm);padding:16px;text-align:center;opacity:' + (earned ? '1' : '0.5') + '">';
        html += '<div style="font-size:32px;margin-bottom:8px">' + def.emoji + '</div>';
        html += '<div style="font-weight:600;font-size:14px">' + def.name + '</div>';
        html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">' + def.desc + '</div>';
        if (earned) html += '<div style="font-size:11px;color:var(--gold)">' + earners.join(', ') + '</div>';
        html += '</div>';
    });
    html += '</div>';
    document.getElementById('badgesContainer').innerHTML = html;
}

// ===================================================================
// PROFILE
// ===================================================================

function openProfile() {
    document.getElementById('profileModal').classList.remove('hidden');
    document.getElementById('profileUsername').textContent = APP.username;
    document.getElementById('profileEmail').textContent = APP.email;
    document.getElementById('profileRole').textContent = APP.role;
}

function closeProfile() { document.getElementById('profileModal').classList.add('hidden'); }

async function changePasswordSubmit() {
    var oldPw = document.getElementById('oldPassword').value;
    var newPw = document.getElementById('newPassword').value;
    var cfPw = document.getElementById('confirmNewPassword').value;
    if (!oldPw || !newPw) { showToast('Fill in all fields.', 'error'); return; }
    if (newPw !== cfPw) { showToast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 4) { showToast('Min 4 characters.', 'error'); return; }

    showLoading('Changing password...');
    var r = await api('/auth/change-password', { method: 'POST', body: { username: APP.username, oldPassword: oldPw, newPassword: newPw } });
    hideLoading();
    if (r.success) { showToast(r.message); closeProfile(); }
    else showToast(r.error, 'error');
}

// ===================================================================
// ADMIN
// ===================================================================

async function loadAdmin() {
    if (APP.role !== 'admin') return;
    showLoading('Loading users...');
    var r = await api('/admin/users');
    hideLoading();
    if (r.success) {
        APP.adminUsers = r.users;
        renderAdminUsers(r.users);
        var sel = document.getElementById('adminEditUserSelect');
        sel.innerHTML = '<option value="">— Select user —</option>';
        r.users.forEach(function (u) { sel.innerHTML += '<option value="' + u.username + '">' + u.username + '</option>'; });
    }
}

function filterAdminUsers() {
    var q = document.getElementById('adminSearch').value.toLowerCase();
    var filtered = APP.adminUsers.filter(function (u) { return u.username.toLowerCase().indexOf(q) !== -1 || u.email.toLowerCase().indexOf(q) !== -1; });
    renderAdminUsers(filtered);
}

function renderAdminUsers(users) {
    var c = document.getElementById('adminUserList');
    var html = '';
    users.forEach(function (u) {
        var isMe = u.username.toLowerCase() === APP.username.toLowerCase();
        html += '<div class="admin-user-row"><div class="admin-user-info"><span class="name">' + u.username + (u.role === 'admin' ? ' 👑' : '') + '</span><span class="email">' + u.email + ' · Joined ' + u.created + '</span></div><div class="admin-actions">';
        if (!isMe) {
            html += '<button class="btn btn-secondary btn-sm" onclick="adminResetPw(\'' + u.username + '\')">🔑 Reset PW</button>';
            var tr = u.role === 'admin' ? 'user' : 'admin', tl = u.role === 'admin' ? '⬇ Demote' : '⬆ Promote';
            html += '<button class="btn btn-secondary btn-sm" onclick="adminToggleRole(\'' + u.username + '\',\'' + tr + '\')">' + tl + '</button>';
            html += '<button class="btn btn-danger btn-sm" onclick="adminDeleteUsr(\'' + u.username + '\')">🗑</button>';
        } else { html += '<span style="font-size:12px;color:var(--text-muted)">You</span>'; }
        html += '</div></div>';
    });
    c.innerHTML = html;
}

async function adminResetPw(username) {
    var np = prompt('New password for ' + username + ':');
    if (!np || np.length < 4) { showToast('Min 4 chars.', 'error'); return; }
    showLoading('Resetting...');
    var r = await api('/admin/reset-password', { method: 'POST', body: { targetUsername: username, newPassword: np } });
    hideLoading();
    showToast(r.success ? r.message : r.error, r.success ? undefined : 'error');
}

async function adminToggleRole(username, newRole) {
    showLoading('Updating...');
    var r = await api('/admin/change-role', { method: 'POST', body: { targetUsername: username, newRole: newRole } });
    hideLoading();
    if (r.success) { showToast(r.message); loadAdmin(); }
    else showToast(r.error, 'error');
}

async function adminDeleteUsr(username) {
    if (!confirm('Delete ' + username + '? This cannot be undone.')) return;
    showLoading('Deleting...');
    var r = await api('/admin/delete-user', { method: 'POST', body: { targetUsername: username, requestingUser: APP.username } });
    hideLoading();
    if (r.success) { showToast(r.message); loadAdmin(); }
    else showToast(r.error, 'error');
}

function openAdminEditUser() {
    var sel = document.getElementById('adminEditUserSelect').value;
    if (!sel) { showToast('Select a user first.', 'error'); return; }
    // Switch to taraweeh tab viewing that user's data
    APP.username = sel;
    document.getElementById('adminEditBanner').style.display = 'flex';
    document.getElementById('adminEditName').textContent = sel;
    loadDashboard();
}

function exitAdminEdit() {
    APP.username = sessionStorage.getItem('username');
    document.getElementById('adminEditBanner').style.display = 'none';
    loadDashboard();
}

async function exportCSV() {
    showLoading('Exporting...');
    var r = await api('/admin/export/' + APP.year);
    hideLoading();
    if (!r.success) { showToast(r.error, 'error'); return; }

    var csv = 'TARAWEEH\nUsername,Year,Date,Completed,Rakaat\n';
    r.data.taraweeh.forEach(function (row) { csv += row.username + ',' + row.year + ',' + row.date + ',' + row.completed + ',' + row.rakaat + '\n'; });
    csv += '\nQURAN KHATAMS\nID,Username,Year,Type,Started,Completed,Paras\n';
    r.data.quran.forEach(function (row) { csv += row.id + ',' + row.username + ',' + row.year + ',' + row.type + ',' + (row.started_at || '') + ',' + (row.completed_at || '') + ',' + row.para_count + '\n'; });
    csv += '\nFASTING\nUsername,Year,Date,Completed\n';
    r.data.fasting.forEach(function (row) { csv += row.username + ',' + row.year + ',' + row.date + ',' + row.completed + '\n'; });

    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'RamadanFlow_' + APP.year + '.csv';
    a.click();
}

// ===================================================================
// INIT ON PAGE LOAD
// ===================================================================

window.onload = initApp;
