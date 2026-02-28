// ===================================================================
// RamadanFlow v3.1 — Frontend Application
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
    azkarCalMonth: new Date().getMonth(),
    azkarCalYear: new Date().getFullYear(),
    namazCalMonth: new Date().getMonth(),
    namazCalYear: new Date().getFullYear(),
    taraweehData: {},
    fastingData: {},
    azkarData: {},
    namazData: {},
    surahs: [],
    khatams: [],
    dashboardData: null,
    adminUsers: [],
    ramadanDates: null,
    realUsername: '',
    impersonating: false,
    frozen: 0
};

// ===================================================================
// API HELPER
// ===================================================================

async function api(endpoint, options = {}) {
    // Block writes during impersonation
    if (APP.impersonating && options.method && options.method !== 'GET') {
        showToast('Read-only mode during impersonation.', 'error');
        return { success: false, error: 'Impersonation is read-only.' };
    }
    var headers = { 'Content-Type': 'application/json' };
    if (APP.token) headers['Authorization'] = 'Bearer ' + APP.token;
    try {
        var res = await fetch('/api' + endpoint, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        var data = await res.json();
        // Handle forced re-login
        if (data.error === 'Session expired. Please log in again.' || (res.status === 401 && APP.token)) {
            showToast('Session expired. Please log in again.', 'error');
            logout();
            return { success: false, error: 'Session expired.' };
        }
        return data;
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

    // Reset auth button states when navigating to login/register
    if (page === 'Login') {
        var loginBtn = document.getElementById('loginBtn');
        if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; }
    }
    if (page === 'Register') {
        var regBtn = document.getElementById('registerBtn');
        if (regBtn) { regBtn.disabled = false; regBtn.textContent = 'Create Account'; }
    }
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
        APP.gender = result.gender; // Added
        APP.age = result.age;       // Added
        localStorage.setItem('rf_token', result.token);
        localStorage.setItem('rf_username', result.username);
        localStorage.setItem('rf_role', result.role);
        localStorage.setItem('rf_email', result.email);
        localStorage.setItem('rf_gender', result.gender); // Added
        localStorage.setItem('rf_age', result.age);       // Added
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
    var password = document.getElementById('regPassword').value;
    var confirm = document.getElementById('regConfirmPassword').value;
    var gender = document.getElementById('regGender').value;
    var age = document.getElementById('regAge').value;
    var btn = document.getElementById('registerBtn'); // Moved btn declaration here

    if (password !== confirm) { showRegisterAlert('Passwords do not match.', 'error'); return; }
    if (password.length < 4) { showRegisterAlert('Password must be at least 4 characters.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';

    var result = await api('/auth/register', { method: 'POST', body: { username: username, email: email, password: password, gender: gender, age: age } });
    if (result.success) {
        showRegisterAlert(result.message, 'success');
        btn.disabled = false;
        btn.textContent = 'Create Account';
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
    APP.token = localStorage.getItem('rf_token') || '';
    APP.username = localStorage.getItem('rf_username') || '';
    APP.role = localStorage.getItem('rf_role') || 'user';
    APP.email = localStorage.getItem('rf_email') || '';
    APP.gender = localStorage.getItem('rf_gender') || '';
    APP.age = localStorage.getItem('rf_age') || '';

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
    // Always hide admin tab/buttons first, then show only if admin
    document.getElementById('adminTabBtn').style.display = 'none';
    var sidebarAdmin = document.getElementById('sidebarAdminBtn');
    var bottomAdmin = document.getElementById('bottomNavAdminBtn');
    if (sidebarAdmin) sidebarAdmin.style.display = 'none';
    if (bottomAdmin) bottomAdmin.style.display = 'none';
    if (APP.role === 'admin') {
        document.getElementById('adminTabBtn').style.display = '';
        if (sidebarAdmin) sidebarAdmin.style.display = '';
        if (bottomAdmin) bottomAdmin.style.display = '';
    }
    // Populate sidebar user info
    var sidebarName = document.getElementById('sidebarName');
    var sidebarRole = document.getElementById('sidebarRole');
    if (sidebarName) sidebarName.textContent = APP.username;
    if (sidebarRole) sidebarRole.textContent = APP.role;
    // Show frozen banner if applicable
    var frozenBanner = document.getElementById('frozenBanner');
    if (frozenBanner) frozenBanner.style.display = APP.frozen ? 'block' : 'none';
    APP.realUsername = APP.username;
    showSkeleton();
    fetchRamadanDates();
    loadMultiRegionTracker();
    loadDashboard();
    fetchAnnouncement();
}

async function fetchAnnouncement() {
    try {
        var r = await fetch('/api/announcement');
        var data = await r.json();
        var banner = document.getElementById('announcementBanner');
        if (banner && data.message) {
            // Check if this specific message was dismissed by this user
            var dismissedMsg = localStorage.getItem('rf_dismissed_announce');
            if (dismissedMsg === data.message) return;
            document.getElementById('announcementText').textContent = data.message;
            banner.style.display = 'flex';
        }
    } catch (e) { }
}

function dismissAnnouncement() {
    var banner = document.getElementById('announcementBanner');
    var text = document.getElementById('announcementText');
    if (text && text.textContent) localStorage.setItem('rf_dismissed_announce', text.textContent);
    if (banner) banner.style.display = 'none';
}

function logout() {
    localStorage.removeItem('rf_token');
    localStorage.removeItem('rf_username');
    localStorage.removeItem('rf_role');
    localStorage.removeItem('rf_email');
    localStorage.removeItem('rf_gender');
    localStorage.removeItem('rf_age');
    // Also clear any legacy keys
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('email');
    APP.username = '';
    APP.token = '';
    APP.role = 'user';
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
    // Sync active state across all three nav systems
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav-item').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.bottom-nav-item').forEach(function (b) { b.classList.remove('active'); });

    // Activate matching items in all navs
    document.querySelectorAll('[data-tab="' + tab + '"]').forEach(function (el) { el.classList.add('active'); });
    var tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.classList.add('active');

    if (tab === 'taraweeh') loadTaraweeh();
    else if (tab === 'quran') loadQuran();
    else if (tab === 'fasting') loadFasting();
    else if (tab === 'azkar') loadAzkar();
    else if (tab === 'surah') loadSurah();
    else if (tab === 'namaz') loadNamaz();
    else if (tab === 'stats') loadStats();
    else if (tab === 'admin') loadAdmin();
}

function changeYear() {
    APP.year = parseInt(document.getElementById('yearSelect').value);
    loadMultiRegionTracker();
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
        var mrTitle = document.getElementById('multiRegionTitle');
        if (mrTitle) {
            var today = new Date().toISOString().slice(0, 10);
            if (today >= APP.ramadanDates.start && today <= APP.ramadanDates.end) {
                mrTitle.innerHTML = '🌙 Ramadan Active (' + APP.ramadanDates.start + ' to ' + APP.ramadanDates.end + ')';
            } else if (today < APP.ramadanDates.start) {
                mrTitle.innerHTML = '⏳ Expected Ramadan: ' + APP.ramadanDates.start + ' to ' + APP.ramadanDates.end;
            } else {
                mrTitle.innerHTML = '✨ Ramadan Ended (' + APP.ramadanDates.start + ' to ' + APP.ramadanDates.end + ')';
            }
        }
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

APP.regionStarts = {};
async function loadMultiRegionTracker() {
    var el = document.getElementById('multiRegionTracker');
    if (!el) return;

    document.getElementById('ksaStart').textContent = '';
    document.getElementById('pakStart').textContent = '';
    document.getElementById('azStart').textContent = '';
    el.style.display = 'block';

    var result = await api('/ramadan/all-regions/' + APP.year);
    if (result.success && result.regions) {
        if (result.regions.ksa) {
            document.getElementById('ksaStart').textContent = result.regions.ksa.start;
            APP.regionStarts.ksa = result.regions.ksa.start;
        }
        if (result.regions.pak) {
            document.getElementById('pakStart').textContent = result.regions.pak.start;
            APP.regionStarts.pak = result.regions.pak.start;
        }
        if (result.regions.az) {
            document.getElementById('azStart').textContent = result.regions.az.start;
            APP.regionStarts.az = result.regions.az.start;
        }
        // re-render calendars so badges show up
        if (document.getElementById('tab-taraweeh').classList.contains('active')) renderTaraweehCalendar();
        if (document.getElementById('tab-fasting').classList.contains('active')) renderFastingCalendar();
    }
}

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
        document.getElementById('statTaraweeh').textContent = me.taraweehAverage + 'r avg';
        document.getElementById('statStreak').textContent = me.streak;
        document.getElementById('statParas').textContent = me.totalParas;
        document.getElementById('statKhatams').textContent = me.completedKhatams;
        document.getElementById('statFasting').textContent = me.fastingCount;
        document.getElementById('statAzkar').textContent = me.azkarCount;
        document.getElementById('statNamaz').textContent = me.namazCount;
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
        var isRamadan = isRamadanDay(ds);
        if (isRamadan) classes += ' ramadan';

        var regionText = '';
        if (APP.regionStarts) {
            if (APP.regionStarts.ksa === ds) regionText += '<div class="region-start-dot ksa-badge">🇸🇦 KSA</div>';
            if (APP.regionStarts.pak === ds) regionText += '<div class="region-start-dot pak-badge">🇵🇰 PAK</div>';
            if (APP.regionStarts.az === ds) regionText += '<div class="region-start-dot az-badge">🇦🇿 AZ</div>';
        }
        var rb = (entry && entry.completed && entry.rakaat) ? '<span class="rakaat-badge">' + entry.rakaat + 'r</span>' : '';
        // Only allow clicking if NOT in future AND within Ramadan timeframe
        var oc = (isFuture || !isRamadan) ? '' : ' onclick="openTaraweehModal(\'' + ds + '\')"';
        html += '<div class="' + classes + '"' + oc + '><span>' + d + '</span><div class="calendar-dots">' + regionText + '</div>' + rb + '</div>';
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
    document.getElementById('rakaatInput').value = (entry && entry.rakaat) ? entry.rakaat : 8;
}

function closeTaraweehModal() { document.getElementById('taraweehModal').classList.add('hidden'); }

async function saveTaraweeh() {
    var modal = document.getElementById('taraweehModal');
    var ds = modal.getAttribute('data-date');
    var rakaat = Math.min(20, Math.max(2, parseInt(document.getElementById('rakaatInput').value) || 8));
    if (rakaat % 2 !== 0) rakaat -= 1;
    closeTaraweehModal(); showLoading('Saving...');
    var r = await api('/taraweeh/log', { method: 'POST', body: { date: ds, completed: true, rakaat: rakaat } });
    hideLoading();
    if (r.success) { showToast(r.message); loadTaraweeh(); refreshDashboard(); }
}

async function removeTaraweeh() {
    var modal = document.getElementById('taraweehModal');
    var ds = modal.getAttribute('data-date');
    closeTaraweehModal(); showLoading('Removing...');
    var r = await api('/taraweeh/log', { method: 'POST', body: { date: ds, completed: false, rakaat: 0 } });
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
        html += '<div class="card" style="margin-bottom:16px"><div class="card-header"><div style="display:flex;align-items:center;gap:8px"><h2>' + typeIcon + ' ' + kh.type + ' Khatam</h2><span style="cursor:pointer;opacity:0.5;font-size:12px" title="Delete Khatam" onclick="deleteKhatam(\'' + kh.id + '\')">🗑️</span></div><span style="font-size:13px;color:var(--text-secondary)">' + kh.paraCount + '/30 paras · ' + pct + '%' + (isComplete ? ' ✅ Complete!' : '') + '</span></div>';
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
    showLoading('Starting Khatam...');
    var r = await api('/quran/create', { method: 'POST', body: { type: type } });
    hideLoading();
    if (r.success) { showToast(r.message); loadQuran(); refreshDashboard(); }
    else showToast(r.error, 'error');
}

async function deleteKhatam(khatamId) {
    if (!confirm("Are you sure you want to delete this Khatam entirely? All checked paras will be lost.")) return;
    showLoading('Deleting...');
    var r = await api('/quran/delete', { method: 'POST', body: { khatamId: khatamId } });
    hideLoading();
    if (r.success) { showToast(r.message); loadQuran(); refreshDashboard(); }
    else showToast(r.error, 'error');
}

async function togglePara(khatamId, paraNumber, completed) {
    var r = await api('/quran/toggle-para', { method: 'POST', body: { khatamId: khatamId, paraNumber: paraNumber, completed: completed } });
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
        var isRamadan = isRamadanDay(ds);
        if (isRamadan) classes += ' ramadan';

        var regionText = '';
        if (APP.regionStarts) {
            if (APP.regionStarts.ksa === ds) regionText += '<div class="region-start-dot ksa-badge">🇸🇦 KSA</div>';
            if (APP.regionStarts.pak === ds) regionText += '<div class="region-start-dot pak-badge">🇵🇰 PAK</div>';
            if (APP.regionStarts.az === ds) regionText += '<div class="region-start-dot az-badge">🇦🇿 AZ</div>';
        }
        var oc = (isFuture || !isRamadan) ? '' : ' onclick="toggleFasting(\'' + ds + '\')"';
        html += '<div class="' + classes + '"' + oc + '><span>' + d + '</span><div class="calendar-dots">' + regionText + '</div></div>';
    }
    container.innerHTML = html;
}

function prevFastingMonth() { APP.fastingCalMonth--; if (APP.fastingCalMonth < 0) { APP.fastingCalMonth = 11; APP.fastingCalYear--; } renderFastingCalendar(); }
function nextFastingMonth() { APP.fastingCalMonth++; if (APP.fastingCalMonth > 11) { APP.fastingCalMonth = 0; APP.fastingCalYear++; } renderFastingCalendar(); }

async function toggleFasting(dateStr) {
    var current = APP.fastingData[dateStr] && APP.fastingData[dateStr].completed;
    showLoading('Saving...');
    var r = await api('/fasting/log', { method: 'POST', body: { date: dateStr, completed: !current } });
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

let taraweehChartInstance = null;
let scoreChartInstance = null;

const BADGE_DEFS = [
    { emoji: '🔥', name: 'First Streak', desc: '3+ day streak', check: function (s) { return s.streak >= 3; } },
    { emoji: '⭐', name: 'Week Warrior', desc: '7+ day streak', check: function (s) { return s.streak >= 7; } },
    { emoji: '🏆', name: 'Iron Forged', desc: '30+ day streak', check: function (s) { return s.streak >= 30; } },
    { emoji: '📖', name: 'Hafiz Journey', desc: '1 Khatam done', check: function (s) { return s.completedKhatams >= 1; } },
    { emoji: '🌟', name: 'Quran Master', desc: '10+ Khatams', hidden: true, check: function (s) { return s.completedKhatams >= 10; } },
    { emoji: '🍽️', name: 'Fasting Warrior', desc: '15+ days fasted', check: function (s) { return s.fastingCount >= 15; } },
    { emoji: '🌙', name: 'Full Ramadan', desc: '29+ days fasted', check: function (s) { return s.fastingCount >= 29; } },
    { emoji: '🚀', name: 'Getting Started', desc: 'Logged first Taraweeh', check: function (s) { return s.taraweehCount >= 1; } },
    { emoji: '🤲', name: 'Dhikr Master', desc: '14+ posts of Azkar', check: function (s) { return s.azkarCount >= 14; } },
    { emoji: '🕌', name: 'Mosque Pillar', desc: '25+ Daily prayers', check: function (s) { return s.namazCount >= 25; } },
    { emoji: '🕋', name: 'Prayer Champion', desc: '150+ Daily prayers', hidden: true, check: function (s) { return s.namazCount >= 150; } },
    { emoji: '🦅', name: 'Night Owl', desc: '100+ total Taraweeh rakaat', hidden: true, check: function (s) { return s.taraweehRakaat >= 100; } },
    { emoji: '🥈', name: 'Silver Medal', desc: 'Score over 500', hidden: true, check: function (s) { return s.score >= 500; } },
    { emoji: '👑', name: 'Iron Man', desc: 'Score over 1000', hidden: true, check: function (s) { return s.score >= 1000; } }
];
function renderCharts() {
    if (!APP.dashboardData || !APP.dashboardData.summaries) return;
    var data = APP.dashboardData.summaries;
    if (!data || data.length === 0) return;

    var labels = data.map(function (s) { return s.username; });
    var taraweehData = data.map(function (s) { return s.taraweehAverage; });
    var scoreData = data.map(function (s) { return s.score; });

    if (taraweehChartInstance) taraweehChartInstance.destroy();
    if (scoreChartInstance) scoreChartInstance.destroy();

    var ctxT = document.getElementById('taraweehChart').getContext('2d');
    taraweehChartInstance = new Chart(ctxT, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Avg Rakaat/Day', data: taraweehData, backgroundColor: 'rgba(46, 204, 113, 0.6)', borderColor: '#2ecc71', borderWidth: 1 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    var ctxS = document.getElementById('scoreChart').getContext('2d');
    scoreChartInstance = new Chart(ctxS, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Score', data: scoreData, backgroundColor: 'rgba(201, 168, 76, 0.6)', borderColor: '#c9a84c', borderWidth: 1 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}



function renderLeaderboard() {
    if (!APP.dashboardData || !APP.dashboardData.summaries) return;
    var data = APP.dashboardData.summaries;
    var html = '<table class="family-table"><thead><tr><th>#</th><th>Name</th><th>🏅</th><th>🕌</th><th>🔥</th><th>📖</th><th>🍽️</th><th>Score</th></tr></thead><tbody>';
    data.forEach(function (s, i) {
        var medalsCount = BADGE_DEFS.filter(function (b) { return b.check(s); }).length;
        var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
        var nameExtra = '';
        if (s.score_multiplier && s.score_multiplier !== 1.0 && APP.role === 'admin') {
            nameExtra = ' <span style="color:var(--gold);font-size:11px" title="' + s.score_multiplier + 'x multiplier">⚡' + s.score_multiplier + 'x</span>';
        }
        var frozenIcon = s.frozen ? ' 🔒' : '';
        html += '<tr><td class="rank">' + medal + '</td><td>' + s.username + nameExtra + frozenIcon + '</td><td>' + medalsCount + '</td><td>' + s.taraweehCount + '</td><td>' + s.streak + '</td><td>' + s.totalParas + '</td><td>' + s.fastingCount + '</td><td style="color:var(--gold);font-weight:700">' + s.score + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('leaderboardTable').innerHTML = html;
}

function renderBadges() {
    if (!APP.dashboardData) return;
    var summaries = APP.dashboardData.summaries;

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">';
    BADGE_DEFS.forEach(function (def) {
        var earners = summaries.filter(function (s) { return def.check(s); }).map(function (s) { return s.username; });
        var earned = earners.length > 0;

        var displayEmoji = def.emoji;
        var displayName = def.name;
        var displayDesc = def.desc;
        var opacity = earned ? '1' : '0.5';

        if (def.hidden && !earned) {
            if (APP.role !== 'admin') {
                displayEmoji = '❓';
                displayName = '???';
                displayDesc = 'Secret achievement';
                opacity = '0.3';
            } else {
                displayDesc = def.desc + ' (Hidden from users)';
                opacity = '0.5';
            }
        }

        html += '<div style="background:' + (earned ? 'rgba(201,168,76,0.1)' : 'var(--bg-secondary)') + ';border:1px solid ' + (earned ? 'var(--gold)' : 'var(--border-color)') + ';border-radius:var(--radius-sm);padding:16px;text-align:center;opacity:' + opacity + '">';
        html += '<div style="font-size:32px;margin-bottom:8px">' + displayEmoji + '</div>';
        html += '<div style="font-weight:600;font-size:14px">' + displayName + '</div>';
        html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">' + displayDesc + '</div>';
        if (earned) html += '<div style="font-size:11px;color:var(--gold)">' + earners.join(', ') + '</div>';
        else html += '<div style="font-size:11px;color:var(--text-muted)">Unearned</div>';
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

    // Load current region first
    var rReg = await api('/ramadan/region');
    if (rReg.success && rReg.region) {
        var val = rReg.region.country + ',' + rReg.region.city;
        var selRegion = document.getElementById('adminRegionSelect');
        if (selRegion) selRegion.value = val;
    }

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

    // Load analytics dashboard
    loadAnalyticsDashboard();

    // Load Ramadan date management
    loadAdminRamadanDates();
}

async function loadAnalyticsDashboard() {
    try {
        var card = document.getElementById('analyticsAdminCard');
        if (!card) return;
        card.style.display = 'block';

        // Anomaly feed
        var aRes = await api('/analytics/anomalies');
        if (aRes.success && aRes.anomalies) {
            var aHtml = '<table class="family-table"><thead><tr><th>Sev</th><th>Type</th><th>User</th><th>Details</th><th>Time</th></tr></thead><tbody>';
            if (aRes.anomalies.length === 0) {
                aHtml += '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No anomalies detected ✅</td></tr>';
            } else {
                aRes.anomalies.forEach(function (a) {
                    var sevColor = a.severity === 'HIGH' ? 'var(--red)' : a.severity === 'MEDIUM' ? 'var(--gold)' : 'var(--text-muted)';
                    var details = '';
                    try { var d = JSON.parse(a.details); details = Object.keys(d).map(function (k) { return k + ':' + d[k]; }).join(', '); } catch (e) { details = a.details || ''; }
                    aHtml += '<tr><td style="color:' + sevColor + ';font-weight:700">' + a.severity + '</td><td>' + a.anomaly_type + '</td><td>' + (a.username || '-') + '</td><td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + details + '</td><td style="font-size:11px">' + (a.created_at || '') + '</td></tr>';
                });
            }
            aHtml += '</tbody></table>';
            document.getElementById('anomalyFeed').innerHTML = aHtml;
        }

        // Honeypot log
        var hRes = await api('/analytics/honeypot-log');
        if (hRes.success) {
            if (hRes.hits.length === 0) {
                document.getElementById('honeypotLog').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No honeypot hits yet 🍯</p>';
            } else {
                var hHtml = '<table class="family-table"><thead><tr><th>Route</th><th>IP Hash</th><th>UA</th><th>Time</th></tr></thead><tbody>';
                hRes.hits.forEach(function (h) {
                    hHtml += '<tr><td style="color:var(--red)">' + h.route + '</td><td style="font-size:11px">' + (h.ip_hash || '-') + '</td><td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (h.user_agent || '-') + '</td><td style="font-size:11px">' + (h.created_at || '') + '</td></tr>';
                });
                hHtml += '</tbody></table>';
                document.getElementById('honeypotLog').innerHTML = hHtml;
            }
        }

        // Fingerprint scores
        var fRes = await api('/analytics/fingerprint-scores');
        if (fRes.success) {
            if (fRes.scores.length === 0) {
                document.getElementById('fingerprintScores').innerHTML = '<p style="color:var(--text-muted);font-size:13px">No fingerprints collected yet</p>';
            } else {
                var fHtml = '<table class="family-table"><thead><tr><th>User</th><th>Unique FPs</th><th>Sessions</th><th>First Seen</th><th>Last Seen</th></tr></thead><tbody>';
                fRes.scores.forEach(function (s) {
                    var fpColor = s.unique_fps > 3 ? 'var(--red)' : s.unique_fps > 1 ? 'var(--gold)' : 'var(--green)';
                    fHtml += '<tr><td>' + s.username + '</td><td style="color:' + fpColor + ';font-weight:700">' + s.unique_fps + '</td><td>' + s.total_sessions + '</td><td style="font-size:11px">' + (s.first_seen || '') + '</td><td style="font-size:11px">' + (s.last_seen || '') + '</td></tr>';
                });
                fHtml += '</tbody></table>';
                document.getElementById('fingerprintScores').innerHTML = fHtml;
            }
        }

        // Typing baseline (show all users' latest)
        var tHtml = '<p style="color:var(--text-muted);font-size:13px">Typing profiles build over time as users type.</p>';
        document.getElementById('typingBaseline').innerHTML = tHtml;

    } catch (e) {
        // Fail silent
    }
}

async function saveAdminRegion() {
    var val = document.getElementById('adminRegionSelect').value;
    if (!val) return;
    var parts = val.split(',');
    var country = parts[0];
    var city = parts[1];

    if (!confirm('This will shift the Ramadan start date for the entire app to ' + country + ' (' + city + '). Proceed?')) return;

    showLoading('Updating Regional Calendar...');
    var r = await api('/ramadan/region', { method: 'POST', body: { country: country, city: city } });
    hideLoading();

    if (r.success) {
        showToast(r.message);
        // Re-fetch everything to adjust calendar instantly
        fetchRamadanDates();
        loadDashboard();
    } else {
        showToast(r.error, 'error');
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
        var frozenIcon = u.frozen ? '🔒' : '';
        html += '<div class="admin-user-row"><div class="admin-user-info">';
        html += '<span class="name">' + u.username + (u.role === 'admin' ? ' 👑' : '') + ' ' + frozenIcon + '</span>';
        html += '<span class="email">' + u.email + ' · Joined ' + u.created + '</span>';
        html += '</div><div class="admin-actions" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">';

        // Password viewer
        html += '<button class="btn btn-secondary btn-sm" id="pwBtn_' + u.username + '" onclick="revealPassword(\'' + u.username + '\')" title="Reveal password">👁</button>';

        // Score multiplier
        html += '<input type="number" min="0.1" max="5.0" step="0.1" value="' + (u.score_multiplier || 1.0) + '" id="mult_' + u.username + '" style="width:60px;padding:4px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-primary);border-radius:4px;font-size:12px">';
        html += '<button class="btn btn-secondary btn-sm" onclick="setMultiplier(\'' + u.username + '\')" title="Apply multiplier">🚀</button>';

        if (!isMe) {
            html += '<button class="btn btn-secondary btn-sm" onclick="adminResetPw(\'' + u.username + '\')" title="Reset password">🔑</button>';
            var tr = u.role === 'admin' ? 'user' : 'admin', tl = u.role === 'admin' ? '⬇' : '⬆';
            html += '<button class="btn btn-secondary btn-sm" onclick="adminToggleRole(\'' + u.username + '\',\'' + tr + '\')" title="' + (u.role === 'admin' ? 'Demote' : 'Promote') + '">' + tl + '</button>';
            html += '<button class="btn btn-secondary btn-sm" onclick="toggleFreeze(\'' + u.username + '\', ' + (u.frozen ? 'false' : 'true') + ')" title="' + (u.frozen ? 'Unfreeze' : 'Freeze') + '">' + (u.frozen ? '🔓' : '❄') + '</button>';
            html += '<button class="btn btn-secondary btn-sm" onclick="forceReLogin(\'' + u.username + '\')" title="Force re-login">⛔</button>';
            html += '<button class="btn btn-secondary btn-sm" onclick="impersonateUser(\'' + u.username + '\')" title="View as user">👤</button>';
            html += '<button class="btn btn-secondary btn-sm" onclick="openDataEditor(\'' + u.username + '\')" title="Edit data">📝</button>';
            html += '<button class="btn btn-danger btn-sm" onclick="adminDeleteUsr(\'' + u.username + '\')" title="Delete">🗑</button>';
        } else { html += '<span style="font-size:12px;color:var(--text-muted)">You</span>'; }
        html += '</div></div>';
    });
    c.innerHTML = html;
}

// --- Password Viewer ---
async function revealPassword(username) {
    var btn = document.getElementById('pwBtn_' + username);
    if (btn.dataset.revealed === 'true') {
        btn.textContent = '👁';
        btn.dataset.revealed = 'false';
        return;
    }
    var r = await api('/admin/reveal-password/' + username);
    if (r.success) {
        btn.textContent = r.password;
        btn.dataset.revealed = 'true';
        btn.style.fontSize = '11px';
        btn.style.minWidth = 'auto';
    } else {
        showToast(r.error, 'error');
    }
}

// --- Score Multiplier ---
async function setMultiplier(username) {
    var val = document.getElementById('mult_' + username).value;
    var r = await api('/admin/set-multiplier', { method: 'POST', body: { username: username, multiplier: parseFloat(val) } });
    if (r.success) { showToast(r.message); refreshDashboard(); }
    else showToast(r.error, 'error');
}

// --- Freeze ---
async function toggleFreeze(username, frozen) {
    var r = await api('/admin/toggle-freeze', { method: 'POST', body: { username: username, frozen: frozen } });
    if (r.success) { showToast(r.message); loadAdmin(); }
    else showToast(r.error, 'error');
}

// --- Force Re-Login ---
async function forceReLogin(username) {
    if (!confirm('Force ' + username + ' to re-login?')) return;
    var r = await api('/admin/invalidate-session', { method: 'POST', body: { username: username } });
    if (r.success) showToast(r.message);
    else showToast(r.error, 'error');
}

// --- Impersonate ---
function impersonateUser(username) {
    APP.realUsername = localStorage.getItem('rf_username');
    APP.username = username;
    APP.impersonating = true;
    var banner = document.getElementById('impersonateBanner');
    if (banner) {
        document.getElementById('impersonateName').textContent = username;
        banner.style.display = 'flex';
    }
    document.getElementById('displayName').textContent = username + ' (Preview)';
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

// --- Announcement ---
async function setAnnouncement() {
    var msg = document.getElementById('adminAnnouncementInput').value.trim();
    var r = await api('/admin/announcement', { method: 'POST', body: { message: msg } });
    if (r.success) showToast(r.message);
    else showToast(r.error, 'error');
}

async function clearAnnouncement() {
    document.getElementById('adminAnnouncementInput').value = '';
    var r = await api('/admin/announcement', { method: 'POST', body: { message: '' } });
    if (r.success) {
        showToast('Announcement cleared.');
        var banner = document.getElementById('announcementBanner');
        if (banner) banner.style.display = 'none';
    }
}

// --- Ramadan Date Management ---
async function loadAdminRamadanDates() {
    var container = document.getElementById('adminRamadanDates');
    if (!container) return;

    var r = await api('/ramadan/admin-dates/' + APP.year);
    var adminDates = r.success ? r.dates : {};

    var regions = [
        { id: 'ksa', label: '🇸🇦 KSA' },
        { id: 'pak', label: '🇵🇰 PAK' },
        { id: 'az', label: '🇦🇿 AZ' }
    ];

    var html = '';
    regions.forEach(function (reg) {
        var hasAdmin = adminDates[reg.id] ? true : false;
        var dateVal = hasAdmin ? adminDates[reg.id].date : '';
        var noteVal = hasAdmin ? adminDates[reg.id].note : '';
        var badge = hasAdmin ? '<span style="background:#27ae60;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:8px">Admin override active</span>' : '';

        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color)">';
        html += '<span style="min-width:60px;font-weight:600">' + reg.label + badge + '</span>';
        html += '<input type="date" id="ramDate_' + reg.id + '" value="' + dateVal + '" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);font-family:inherit">';
        html += '<input type="text" id="ramNote_' + reg.id + '" value="' + noteVal + '" placeholder="Note (optional)" style="flex:1;min-width:120px;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);font-family:inherit;font-size:12px">';
        html += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary)"><input type="checkbox" id="ramNotify_' + reg.id + '"> Notify</label>';
        html += '<button class="btn btn-primary btn-sm" onclick="saveAdminDate(\'' + reg.id + '\')">Save</button>';
        if (hasAdmin) {
            html += '<button class="btn btn-secondary btn-sm" onclick="clearAdminDate(\'' + reg.id + '\')" title="Clear admin override">✕</button>';
        }
        html += '</div>';
    });
    container.innerHTML = html;
}

async function saveAdminDate(region) {
    var dateVal = document.getElementById('ramDate_' + region).value;
    var noteVal = document.getElementById('ramNote_' + region).value;
    var notify = document.getElementById('ramNotify_' + region).checked;

    if (!dateVal) { showToast('Please select a date.', 'error'); return; }

    var r = await api('/ramadan/admin-dates', {
        method: 'POST', body: {
            year: APP.year,
            region: region,
            date: dateVal,
            note: noteVal,
            notify: notify
        }
    });

    if (r.success) {
        showToast(r.message);
        loadAdminRamadanDates();
        // If announced, also refresh banner
        if (notify) fetchAnnouncement();
    } else {
        showToast(r.error, 'error');
    }
}

async function clearAdminDate(region) {
    var r = await api('/ramadan/admin-dates/clear', {
        method: 'POST', body: {
            year: APP.year,
            region: region
        }
    });

    if (r.success) {
        showToast(r.message);
        loadAdminRamadanDates();
    } else {
        showToast(r.error, 'error');
    }
}

// --- Data Editor ---
async function openDataEditor(username) {
    showLoading('Loading data...');
    var r = await api('/admin/user-data/' + username + '/' + APP.year);
    hideLoading();
    if (!r.success) { showToast(r.error, 'error'); return; }

    var modal = document.getElementById('dataEditorModal');
    modal.classList.remove('hidden');
    modal.setAttribute('data-username', username);
    document.getElementById('dataEditorTitle').textContent = 'Edit Data: ' + username;

    var html = '';

    // Taraweeh
    if (r.data.taraweeh.length > 0) {
        html += '<h3 style="color:var(--gold);margin:12px 0 8px">🕌 Taraweeh</h3>';
        r.data.taraweeh.forEach(function (t) {
            html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">';
            html += '<span style="min-width:90px">' + t.date + '</span>';
            html += '<input type="number" min="0" max="20" step="2" value="' + t.rakaat + '" data-type="taraweeh" data-id="' + t.id + '" data-field="rakaat" class="data-edit-input" style="width:60px">';
            html += '<span style="color:var(--text-muted)">rakaat</span></div>';
        });
    }

    // Fasting
    if (r.data.fasting.length > 0) {
        html += '<h3 style="color:var(--gold);margin:12px 0 8px">🍽️ Fasting</h3>';
        r.data.fasting.forEach(function (f) {
            html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">';
            html += '<span style="min-width:90px">' + f.date + '</span>';
            html += '<select data-type="fasting" data-id="' + f.id + '" data-field="completed" class="data-edit-input">';
            html += '<option value="YES" ' + (f.completed === 'YES' ? 'selected' : '') + '>YES</option>';
            html += '<option value="NO" ' + (f.completed !== 'YES' ? 'selected' : '') + '>NO</option></select></div>';
        });
    }

    // Azkar
    if (r.data.azkar.length > 0) {
        html += '<h3 style="color:var(--gold);margin:12px 0 8px">📿 Azkar</h3>';
        r.data.azkar.forEach(function (a) {
            html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">';
            html += '<span style="min-width:90px">' + a.date + '</span>';
            html += '<label><input type="checkbox" ' + (a.morning ? 'checked' : '') + ' data-type="azkar" data-id="' + a.id + '" data-field="morning" class="data-edit-input"> ☀️</label>';
            html += '<label><input type="checkbox" ' + (a.evening ? 'checked' : '') + ' data-type="azkar" data-id="' + a.id + '" data-field="evening" class="data-edit-input"> 🌙</label></div>';
        });
    }

    // Namaz
    if (r.data.namaz.length > 0) {
        html += '<h3 style="color:var(--gold);margin:12px 0 8px">🕌 Namaz</h3>';
        r.data.namaz.forEach(function (n) {
            html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">';
            html += '<span style="min-width:90px">' + n.date + '</span>';
            html += '<span style="min-width:60px">' + n.prayer + '</span>';
            html += '<select data-type="namaz" data-id="' + n.id + '" data-field="location" class="data-edit-input">';
            html += '<option value="missed" ' + (n.location === 'missed' ? 'selected' : '') + '>missed</option>';
            html += '<option value="home" ' + (n.location === 'home' ? 'selected' : '') + '>home</option>';
            html += '<option value="mosque" ' + (n.location === 'mosque' ? 'selected' : '') + '>mosque</option></select></div>';
        });
    }

    // Surah
    if (r.data.surah.length > 0) {
        html += '<h3 style="color:var(--gold);margin:12px 0 8px">📝 Surah</h3>';
        r.data.surah.forEach(function (s) {
            html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">';
            html += '<span style="min-width:120px">' + s.surah_name + '</span>';
            html += '<input type="number" min="0" max="' + s.total_ayah + '" value="' + s.memorized_ayah + '" data-type="surah_memorization" data-id="' + s.id + '" data-field="memorized_ayah" class="data-edit-input" style="width:60px">';
            html += '<span style="color:var(--text-muted)">/' + s.total_ayah + '</span></div>';
        });
    }

    if (!html) html = '<p style="color:var(--text-muted);text-align:center;padding:20px">No data found for ' + APP.year + '</p>';
    document.getElementById('dataEditorContent').innerHTML = html;
}

function closeDataEditor() {
    document.getElementById('dataEditorModal').classList.add('hidden');
}

async function saveDataEditor() {
    var username = document.getElementById('dataEditorModal').getAttribute('data-username');
    var inputs = document.querySelectorAll('.data-edit-input');
    var changes = [];
    inputs.forEach(function (inp) {
        var val;
        if (inp.type === 'checkbox') val = inp.checked ? 1 : 0;
        else if (inp.type === 'number') val = parseInt(inp.value);
        else val = inp.value;
        changes.push({ type: inp.dataset.type, id: parseInt(inp.dataset.id), field: inp.dataset.field, value: val });
    });

    showLoading('Saving...');
    var r = await api('/admin/user-data/save', { method: 'POST', body: { username: username, changes: changes } });
    hideLoading();
    if (r.success) { showToast(r.message); closeDataEditor(); refreshDashboard(); }
    else showToast(r.error, 'error');
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
    var r = await api('/admin/delete-user', { method: 'POST', body: { targetUsername: username } });
    hideLoading();
    if (r.success) { showToast(r.message); loadAdmin(); }
    else showToast(r.error, 'error');
}

function openAdminEditUser() {
    var sel = document.getElementById('adminEditUserSelect').value;
    if (!sel) { showToast('Select a user first.', 'error'); return; }
    impersonateUser(sel);
}

function exitAdminEdit() {
    exitImpersonate();
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
// AZKAR
// ===================================================================

let currentDhikr = null;
async function fetchDailyDhikr() {
    if (currentDhikr) {
        document.getElementById('dailyDhikrText').innerHTML = currentDhikr.html;
        document.getElementById('dailyDhikrRef').textContent = '- ' + currentDhikr.ref;
        return;
    }
    try {
        var today = new Date();
        var num = ((today.getDate() + 10) * (today.getMonth() + 4) * today.getFullYear()) % 6236 + 1; // Fake seeded random
        var res = await fetch('https://api.alquran.cloud/v1/ayah/' + num + '/editions/quran-uthmani,en.asad,ur.jalandhry');
        var data = await res.json();
        if (data && data.data && data.data.length > 0) {
            var ar = data.data.find(function (e) { return e.edition.language === 'ar'; });
            var en = data.data.find(function (e) { return e.edition.language === 'en'; });
            var ur = data.data.find(function (e) { return e.edition.language === 'ur'; });

            var text = '';
            if (ar) text += '<div style="font-size:20px;margin-bottom:8px;text-align:right;font-family:\'Traditional Arabic\',serif;color:var(--text-primary)" dir="rtl">' + ar.text + '</div>';
            if (ur) text += '<div style="margin-bottom:8px;font-size:14px;color:var(--gold);text-align:right" dir="rtl">' + ur.text + '</div>';
            if (en) text += '<div style="font-size:13px;font-style:italic;color:var(--text-secondary)">" ' + en.text + ' "</div>';

            currentDhikr = { html: text, ref: 'Quran ' + ar.surah.number + ':' + ar.numberInSurah + ' (' + ar.surah.englishName + ')' };
            document.getElementById('dailyDhikrText').innerHTML = currentDhikr.html;
            document.getElementById('dailyDhikrRef').textContent = '- ' + currentDhikr.ref;
        }
    } catch (e) {
        document.getElementById('dailyDhikrText').innerHTML = '<p style="font-size: 14px; font-style: italic; color: var(--text-primary);">There is no deity but Allah, alone, without partner.</p>';
        document.getElementById('dailyDhikrRef').textContent = "- Sahih Bukhari";
    }
}

async function loadAzkar() {
    var r = await api('/azkar/' + APP.username + '/' + APP.year);
    if (r.success) { APP.azkarData = r.data; renderAzkarCalendar(); fetchDailyDhikr(); }
}

function renderAzkarCalendar() {
    var month = APP.azkarCalMonth, year = APP.azkarCalYear;
    var container = document.getElementById('azkarCalendar');
    var title = document.getElementById('azkarMonthTitle');
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
        var entry = APP.azkarData[ds] || {};
        var isToday = ds === todayStr;
        var isFuture = new Date(ds) > today;
        var hasMorning = entry.morning;
        var hasEvening = entry.evening;
        var both = hasMorning && hasEvening;
        var classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFuture) classes += ' future';
        if (both) classes += ' completed';

        var icons = '';
        if (hasMorning) icons += '☀️';
        if (hasEvening) icons += '🌙';

        var oc = isFuture ? '' : ' onclick="openAzkarModal(\'' + ds + '\')"';
        html += '<div class="' + classes + '"' + oc + '><span>' + d + '</span><span class="rakaat-badge">' + icons + '</span></div>';
    }
    container.innerHTML = html;
}

function prevAzkarMonth() { APP.azkarCalMonth--; if (APP.azkarCalMonth < 0) { APP.azkarCalMonth = 11; APP.azkarCalYear--; } renderAzkarCalendar(); }
function nextAzkarMonth() { APP.azkarCalMonth++; if (APP.azkarCalMonth > 11) { APP.azkarCalMonth = 0; APP.azkarCalYear++; } renderAzkarCalendar(); }

function openAzkarModal(dateStr) {
    var modal = document.getElementById('azkarModal');
    modal.classList.remove('hidden');
    modal.setAttribute('data-date', dateStr);

    // Format date nicely: "Mon, Mar 12, 2026"
    var dateObj = new Date(dateStr + 'T00:00:00'); // avoid timezone offsets shifting day backward
    var displayDate = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('azkarModalDate').textContent = displayDate;

    var entry = APP.azkarData[dateStr] || {};
    document.getElementById('azkarMorningCheck').checked = !!entry.morning;
    document.getElementById('azkarEveningCheck').checked = !!entry.evening;
}

function closeAzkarModal() {
    document.getElementById('azkarModal').classList.add('hidden');
}

async function saveAzkarDay() {
    var modal = document.getElementById('azkarModal');
    var ds = modal.getAttribute('data-date');

    var mChecked = document.getElementById('azkarMorningCheck').checked;
    var eChecked = document.getElementById('azkarEveningCheck').checked;

    closeAzkarModal();
    showLoading('Saving...');
    var r = await api('/azkar/log', { method: 'POST', body: { date: ds, morning: mChecked, evening: eChecked } });
    hideLoading();

    if (r.success) { showToast(r.message); loadAzkar(); refreshDashboard(); }
}

// ===================================================================
// SURAH MEMORIZATION
// ===================================================================

var SURAH_LIST = [
    { n: 1, name: "Al-Fatiha", a: 7 }, { n: 2, name: "Al-Baqarah", a: 286 }, { n: 3, name: "Ali 'Imran", a: 200 }, { n: 4, name: "An-Nisa", a: 176 },
    { n: 5, name: "Al-Ma'idah", a: 120 }, { n: 6, name: "Al-An'am", a: 165 }, { n: 7, name: "Al-A'raf", a: 206 }, { n: 8, name: "Al-Anfal", a: 75 },
    { n: 9, name: "At-Tawbah", a: 129 }, { n: 10, name: "Yunus", a: 109 }, { n: 11, name: "Hud", a: 123 }, { n: 12, name: "Yusuf", a: 111 },
    { n: 13, name: "Ar-Ra'd", a: 43 }, { n: 14, name: "Ibrahim", a: 52 }, { n: 15, name: "Al-Hijr", a: 99 }, { n: 16, name: "An-Nahl", a: 128 },
    { n: 17, name: "Al-Isra", a: 111 }, { n: 18, name: "Al-Kahf", a: 110 }, { n: 19, name: "Maryam", a: 98 }, { n: 20, name: "Taha", a: 135 },
    { n: 21, name: "Al-Anbya", a: 112 }, { n: 22, name: "Al-Hajj", a: 78 }, { n: 23, name: "Al-Mu'minun", a: 118 }, { n: 24, name: "An-Nur", a: 64 },
    { n: 25, name: "Al-Furqan", a: 77 }, { n: 26, name: "Ash-Shu'ara", a: 227 }, { n: 27, name: "An-Naml", a: 93 }, { n: 28, name: "Al-Qasas", a: 88 },
    { n: 29, name: "Al-Ankabut", a: 69 }, { n: 30, name: "Ar-Rum", a: 60 }, { n: 31, name: "Luqman", a: 34 }, { n: 32, name: "As-Sajdah", a: 30 },
    { n: 33, name: "Al-Ahzab", a: 73 }, { n: 34, name: "Saba", a: 54 }, { n: 35, name: "Fatir", a: 45 }, { n: 36, name: "Ya-Sin", a: 83 },
    { n: 37, name: "As-Saffat", a: 182 }, { n: 38, name: "Sad", a: 88 }, { n: 39, name: "Az-Zumar", a: 75 }, { n: 40, name: "Ghafir", a: 85 },
    { n: 41, name: "Fussilat", a: 54 }, { n: 42, name: "Ash-Shura", a: 53 }, { n: 43, name: "Az-Zukhruf", a: 89 }, { n: 44, name: "Ad-Dukhan", a: 59 },
    { n: 45, name: "Al-Jathiyah", a: 37 }, { n: 46, name: "Al-Ahqaf", a: 35 }, { n: 47, name: "Muhammad", a: 38 }, { n: 48, name: "Al-Fath", a: 29 },
    { n: 49, name: "Al-Hujurat", a: 18 }, { n: 50, name: "Qaf", a: 45 }, { n: 51, name: "Adh-Dhariyat", a: 60 }, { n: 52, name: "At-Tur", a: 49 },
    { n: 53, name: "An-Najm", a: 62 }, { n: 54, name: "Al-Qamar", a: 55 }, { n: 55, name: "Ar-Rahman", a: 78 }, { n: 56, name: "Al-Waqi'ah", a: 96 },
    { n: 57, name: "Al-Hadid", a: 29 }, { n: 58, name: "Al-Mujadila", a: 22 }, { n: 59, name: "Al-Hashr", a: 24 }, { n: 60, name: "Al-Mumtahanah", a: 13 },
    { n: 61, name: "As-Saff", a: 14 }, { n: 62, name: "Al-Jumu'ah", a: 11 }, { n: 63, name: "Al-Munafiqun", a: 11 }, { n: 64, name: "At-Taghabun", a: 18 },
    { n: 65, name: "At-Talaq", a: 12 }, { n: 66, name: "At-Tahrim", a: 12 }, { n: 67, name: "Al-Mulk", a: 30 }, { n: 68, name: "Al-Qalam", a: 52 },
    { n: 69, name: "Al-Haqqah", a: 52 }, { n: 70, name: "Al-Ma'arij", a: 44 }, { n: 71, name: "Nuh", a: 28 }, { n: 72, name: "Al-Jinn", a: 28 },
    { n: 73, name: "Al-Muzzammil", a: 20 }, { n: 74, name: "Al-Muddaththir", a: 56 }, { n: 75, name: "Al-Qiyamah", a: 40 }, { n: 76, name: "Al-Insan", a: 31 },
    { n: 77, name: "Al-Mursalat", a: 50 }, { n: 78, name: "An-Naba", a: 40 }, { n: 79, name: "An-Nazi'at", a: 46 }, { n: 80, name: "Abasa", a: 42 },
    { n: 81, name: "At-Takwir", a: 29 }, { n: 82, name: "Al-Infitar", a: 19 }, { n: 83, name: "Al-Mutaffifin", a: 36 }, { n: 84, name: "Al-Inshiqaq", a: 25 },
    { n: 85, name: "Al-Buruj", a: 22 }, { n: 86, name: "At-Tariq", a: 17 }, { n: 87, name: "Al-A'la", a: 19 }, { n: 88, name: "Al-Ghashiyah", a: 26 },
    { n: 89, name: "Al-Fajr", a: 30 }, { n: 90, name: "Al-Balad", a: 20 }, { n: 91, name: "Ash-Shams", a: 15 }, { n: 92, name: "Al-Layl", a: 21 },
    { n: 93, name: "Ad-Duha", a: 11 }, { n: 94, name: "Ash-Sharh", a: 8 }, { n: 95, name: "At-Tin", a: 8 }, { n: 96, name: "Al-Alaq", a: 19 },
    { n: 97, name: "Al-Qadr", a: 5 }, { n: 98, name: "Al-Bayyinah", a: 8 }, { n: 99, name: "Az-Zalzalah", a: 8 }, { n: 100, name: "Al-Adiyat", a: 11 },
    { n: 101, name: "Al-Qari'ah", a: 11 }, { n: 102, name: "At-Takathur", a: 8 }, { n: 103, name: "Al-Asr", a: 3 }, { n: 104, name: "Al-Humazah", a: 9 },
    { n: 105, name: "Al-Fil", a: 5 }, { n: 106, name: "Quraysh", a: 4 }, { n: 107, name: "Al-Ma'un", a: 7 }, { n: 108, name: "Al-Kawthar", a: 3 },
    { n: 109, name: "Al-Kafirun", a: 6 }, { n: 110, name: "An-Nasr", a: 3 }, { n: 111, name: "Al-Masad", a: 5 }, { n: 112, name: "Al-Ikhlas", a: 4 },
    { n: 113, name: "Al-Falaq", a: 5 }, { n: 114, name: "An-Nas", a: 6 }
];

async function loadSurah() {
    var r = await api('/surah/' + APP.username);
    if (r.success) {
        APP.surahs = r.surahs.sort(function (a, b) { return a.surah_number - b.surah_number; });
        renderSurahList();
    }
}

function filterSurahs() {
    var q = document.getElementById('surahSearch').value.toLowerCase();
    var filtered = APP.surahs.filter(function (s) {
        return s.surah_name.toLowerCase().indexOf(q) !== -1 || s.surah_number.toString().indexOf(q) !== -1;
    });
    renderSurahList(filtered);
}

function renderSurahList(list) {
    var container = document.getElementById('surahList');
    var dataList = list || APP.surahs;
    if (dataList.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)"><p style="font-size:40px;margin-bottom:12px">📝</p><p>No surahs found or being memorized yet</p><p style="font-size:13px;margin-top:8px">Click "+ Add Surah" to start</p></div>';
        return;
    }
    var html = '';
    dataList.forEach(function (s) {
        var pct = Math.round((s.memorized_ayah / s.total_ayah) * 100);
        var isComplete = s.completed_at;
        html += '<div class="card" style="margin-bottom:12px"><div class="card-header"><h2 style="font-size:16px">' + s.surah_number + '. ' + s.surah_name + (isComplete ? ' ✅' : '') + '</h2><div style="display:flex;gap:8px;align-items:center"><span style="font-size:13px;color:var(--text-secondary)">' + s.memorized_ayah + '/' + s.total_ayah + ' ayah · ' + pct + '%</span><button class="btn btn-danger btn-sm" onclick="deleteSurah(' + s.id + ')">🗑</button></div></div>';
        html += '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>';
        if (!isComplete) {
            html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="range" min="0" max="' + s.total_ayah + '" value="' + s.memorized_ayah + '" style="flex:1" oninput="this.nextElementSibling.textContent=this.value" onchange="updateSurahProgress(' + s.id + ',this.value)"><span style="min-width:30px;color:var(--gold);font-weight:700">' + s.memorized_ayah + '</span></div>';
        }
        html += '</div>';
    });
    container.innerHTML = html;
}

function openSurahPicker() {
    var options = SURAH_LIST.map(function (s) { return s.n + '. ' + s.name + ' (' + s.a + ' ayah)'; }).join('\n');
    var choice = prompt('Enter surah number (1-114):\n\nExamples:\n36 = Ya-Sin\n67 = Al-Mulk\n112 = Al-Ikhlas');
    if (!choice) return;
    var num = parseInt(choice);
    if (num < 1 || num > 114) { showToast('Invalid surah number (1-114).', 'error'); return; }

    var existing = APP.surahs.find(function (s) { return s.surah_number === num; });
    if (existing) { showToast('Surah is already in your list!', 'error'); return; }

    var surah = SURAH_LIST[num - 1];
    addSurah(surah.n, surah.name, surah.a);
}

async function addSurah(num, name, ayah) {
    showLoading('Adding...');
    var r = await api('/surah/add', { method: 'POST', body: { surahNumber: num, surahName: name, totalAyah: ayah } });
    hideLoading();
    if (r.success) { showToast(r.message); loadSurah(); }
    else showToast(r.error, 'error');
}

async function updateSurahProgress(id, value) {
    var r = await api('/surah/update', { method: 'POST', body: { id: id, memorizedAyah: parseInt(value) } });
    if (r.success) { showToast(r.message); loadSurah(); }
}

async function deleteSurah(id) {
    if (!confirm('Remove this surah?')) return;
    var r = await api('/surah/delete', { method: 'POST', body: { id: id } });
    if (r.success) { showToast(r.message); loadSurah(); }
}

// ===================================================================
// NAMAZ (SALAH)
// ===================================================================

var PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
var PRAYER_LABELS = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
var PRAYER_TIMES = { fajr: '🌅', dhuhr: '☀️', asr: '🌤️', maghrib: '🌇', isha: '🌙' };

async function loadNamaz() {
    var month = APP.namazCalMonth + 1;
    var r = await api('/namaz/' + APP.username + '/' + APP.namazCalYear + '/' + month);
    if (r.success) { APP.namazData = r.data; renderNamazGrid(); }
}

function renderNamazGrid() {
    var month = APP.namazCalMonth, year = APP.namazCalYear;
    var container = document.getElementById('namazGrid');
    var title = document.getElementById('namazMonthTitle');
    var mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    title.textContent = mn[month] + ' ' + year;

    var firstDay = new Date(year, month, 1).getDay();
    var dim = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

    var html = '<div class="calendar-grid">';
    var dh = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var h = 0; h < 7; h++) html += '<div class="calendar-day-header">' + dh[h] + '</div>';
    for (var e = 0; e < firstDay; e++) html += '<div class="calendar-day empty"></div>';

    for (var d = 1; d <= dim; d++) {
        var ds = year + '-' + pad(month + 1) + '-' + pad(d);
        var dayData = APP.namazData[ds] || {};
        var isToday = ds === todayStr;
        var isFuture = new Date(ds) > today;
        var classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFuture) classes += ' future';
        if (isRamadanDay(ds)) classes += ' ramadan';

        var loggedCount = 0;
        PRAYERS.forEach(function (p) { if (dayData[p] && dayData[p] !== 'missed') loggedCount++; });
        if (loggedCount === 5) classes += ' completed';

        var badge = loggedCount > 0 ? ('<span class="rakaat-badge">' + loggedCount + '/5</span>') : '';
        var oc = isFuture ? '' : ' onclick="openNamazModal(\'' + ds + '\')"';
        html += '<div class="' + classes + '"' + oc + '><span>' + d + '</span>' + badge + '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function prevNamazMonth() { APP.namazCalMonth--; if (APP.namazCalMonth < 0) { APP.namazCalMonth = 11; APP.namazCalYear--; } loadNamaz(); }
function nextNamazMonth() { APP.namazCalMonth++; if (APP.namazCalMonth > 11) { APP.namazCalMonth = 0; APP.namazCalYear++; } loadNamaz(); }

function openNamazModal(dateStr) {
    document.getElementById('namazModal').classList.remove('hidden');
    document.getElementById('namazModalDate').textContent = dateStr;
    document.getElementById('namazModal').setAttribute('data-date', dateStr);

    var dayData = APP.namazData[dateStr] || {};
    var html = '';
    PRAYERS.forEach(function (p) {
        var loc = dayData[p] || 'missed';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-secondary);border-radius:4px">';
        html += '<span style="font-weight:600">' + PRAYER_TIMES[p] + ' ' + PRAYER_LABELS[p] + '</span>';
        html += '<select id="namazLoc_' + p + '" style="background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-primary);padding:6px;border-radius:4px;font-family:\'Inter\',sans-serif">';
        html += '<option value="missed" ' + (loc === 'missed' ? 'selected' : '') + '>❌ Missed</option>';
        html += '<option value="home" ' + (loc === 'home' ? 'selected' : '') + '>\uD83C\uDFE0 Home</option>';
        html += '<option value="mosque" ' + (loc === 'mosque' ? 'selected' : '') + '>\uD83D\uDD4C Mosque</option>';
        html += '</select></div>';
    });
    document.getElementById('namazModalGrid').innerHTML = html;
}

function closeNamazModal() { document.getElementById('namazModal').classList.add('hidden'); }

async function saveNamazDay() {
    var dateStr = document.getElementById('namazModal').getAttribute('data-date');
    showLoading('Saving...');
    var promises = [];
    PRAYERS.forEach(function (p) {
        var loc = document.getElementById('namazLoc_' + p).value;
        promises.push(api('/namaz/log', { method: 'POST', body: { date: dateStr, prayer: p, location: loc } }));
    });
    await Promise.all(promises);
    hideLoading();
    closeNamazModal();
    showToast('Namaz saved');
    loadNamaz();
    refreshDashboard();
}

// ===================================================================
// INIT ON PAGE LOAD
// ===================================================================

window.onload = initApp;
