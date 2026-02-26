// ===================================================================
// RAMADANFLOW — Family Ramadan Progress Tracker
// ===================================================================
// Version 2.1 — Multi-Khatam, Fasting, Badges, Ramadan Dates, CSV
// Copy this entire file into the Apps Script editor as "Code.gs"
// ===================================================================

// --- CONFIGURATION ---
const SPREADSHEET_ID = ''; // <-- Paste your Google Sheet ID here
const ADMIN_EMAILS = [];   // Optional: emails that auto-get admin role

// --- SHEET NAMES ---
const SHEET_USERS    = 'Users';
const SHEET_TARAWEEH = 'TaraweehLog';
const SHEET_QURAN    = 'QuranProgress';
const SHEET_KHATAMS  = 'Khatams';
const SHEET_FASTING  = 'FastingLog';
const SHEET_SETTINGS = 'Settings';

// ===================================================================
// WEB APP ENTRY POINT
// ===================================================================

function doGet(e) {
  var page = e.parameter.page || 'Login';
  var allowed = ['Login', 'Register', 'Dashboard'];
  if (allowed.indexOf(page) === -1) page = 'Login';
  var template = HtmlService.createTemplateFromFile(page);
  // Inject deployment URL so pages can navigate without async calls
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle('RamadanFlow')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppUrl() {
  return ScriptApp.getService().getUrl();
}

// ===================================================================
// HELPERS
// ===================================================================

function getSheet_(name) {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = {
      'Users':         ['Username','Email','PasswordHash','Role','CreatedDate'],
      'TaraweehLog':   ['Username','Year','Date','Completed','Rakaat'],
      'Khatams':       ['KhatamId','Username','Year','Type','StartDate','CompletedDate','ParasDone'],
      'QuranProgress': ['KhatamId','ParaNumber','Date','Notes'],
      'FastingLog':    ['Username','Year','Date','Fasted','Notes'],
      'Settings':      ['Key','Value']
    };
    if (headers[name]) {
      sheet.appendRow(headers[name]);
      sheet.getRange(1, 1, 1, headers[name].length).setFontWeight('bold');
    }
  }
  return sheet;
}

function hashPassword_(password) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var hash = '';
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i]; if (b < 0) b += 256;
    var h = b.toString(16); if (h.length === 1) h = '0' + h;
    hash += h;
  }
  return hash;
}

function getCurrentYear_() { return new Date().getFullYear(); }

function getTodayString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function generateId_() {
  return Utilities.getUuid().split('-')[0];
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    return { success: false, error: 'Server busy, please try again.' };
  }
  try { return fn(); }
  finally { lock.releaseLock(); }
}

// ===================================================================
// USER REGISTRATION
// ===================================================================

function registerUser(username, email, password) {
  if (!username || !email || !password)
    return { success: false, error: 'All fields are required.' };

  username = username.trim().toLowerCase();
  email = email.trim().toLowerCase();

  if (username.length < 3)
    return { success: false, error: 'Username must be at least 3 characters.' };
  if (!/^[a-z0-9_]+$/.test(username))
    return { success: false, error: 'Username: only letters, numbers, underscores.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { success: false, error: 'Invalid email format.' };
  if (password.length < 4)
    return { success: false, error: 'Password must be at least 4 characters.' };

  return withLock_(function() {
    var sheet = getSheet_(SHEET_USERS);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === username)
        return { success: false, error: 'Username already taken.' };
      if (data[i][1].toString().toLowerCase() === email)
        return { success: false, error: 'Email already registered.' };
    }

    var role = (data.length <= 1) ? 'admin' : 'user';
    if (ADMIN_EMAILS.indexOf(email) !== -1) role = 'admin';

    sheet.appendRow([username, email, hashPassword_(password), role, getTodayString_()]);
    return { success: true, message: 'Account created! You can now log in.' };
  });
}

// ===================================================================
// USER LOGIN
// ===================================================================

function loginUser(identifier, password) {
  if (!identifier || !password)
    return { success: false, error: 'Please enter your credentials.' };

  identifier = identifier.trim().toLowerCase();
  var hash = hashPassword_(password);
  var sheet = getSheet_(SHEET_USERS);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var u = data[i][0].toString().toLowerCase();
    var e = data[i][1].toString().toLowerCase();
    var h = data[i][2].toString();
    var r = data[i][3].toString() || 'user';
    if ((u === identifier || e === identifier) && h === hash) {
      return { success: true, username: data[i][0].toString(), email: data[i][1].toString(), role: r };
    }
  }
  return { success: false, error: 'Invalid username/email or password.' };
}

// ===================================================================
// TARAWEEH
// ===================================================================

function logTaraweeh(username, dateStr, completed, rakaat) {
  if (!username) return { success: false, error: 'Not logged in.' };
  return withLock_(function() {
    var sheet = getSheet_(SHEET_TARAWEEH);
    var date = dateStr || getTodayString_();
    var year = new Date(date).getFullYear();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === username.toLowerCase() &&
          data[i][2].toString() === date) {
        if (!completed) {
          sheet.deleteRow(i + 1);
          return { success: true, message: 'Taraweeh removed for ' + date };
        }
        sheet.getRange(i + 1, 4).setValue('YES');
        sheet.getRange(i + 1, 5).setValue(rakaat || 8);
        return { success: true, message: 'Updated for ' + date };
      }
    }

    if (completed) {
      sheet.appendRow([username, year, date, 'YES', rakaat || 8]);
      return { success: true, message: 'Taraweeh logged for ' + date };
    }
    return { success: true, message: 'No change.' };
  });
}

function getUserTaraweehData(username, year) {
  year = year || getCurrentYear_();
  var sheet = getSheet_(SHEET_TARAWEEH);
  var data = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === username.toLowerCase() &&
        data[i][1].toString() == year.toString()) {
      result[data[i][2].toString()] = {
        completed: data[i][3].toString() === 'YES',
        rakaat: data[i][4] ? data[i][4].toString() : '8'
      };
    }
  }
  return { success: true, data: result };
}

// ===================================================================
// KHATAM (QURAN ROUNDS) MANAGEMENT
// ===================================================================

function createKhatam(username, type) {
  if (!username) return { success: false, error: 'Not logged in.' };
  if (type !== 'Arabic' && type !== 'Translation')
    return { success: false, error: 'Type must be Arabic or Translation.' };

  return withLock_(function() {
    var sheet = getSheet_(SHEET_KHATAMS);
    var id = username.toLowerCase() + '_' + type.toLowerCase() + '_' + generateId_();
    var year = getCurrentYear_();
    sheet.appendRow([id, username, year, type, getTodayString_(), '', 0]);
    return { success: true, khatamId: id, message: 'New ' + type + ' Khatam started!' };
  });
}

function getUserKhatams(username, year) {
  year = year || getCurrentYear_();
  var kSheet = getSheet_(SHEET_KHATAMS);
  var kData = kSheet.getDataRange().getValues();
  var pSheet = getSheet_(SHEET_QURAN);
  var pData = pSheet.getDataRange().getValues();

  // Build para map: { khatamId: [paraNumbers] }
  var paraMap = {};
  for (var p = 1; p < pData.length; p++) {
    var kid = pData[p][0].toString();
    if (!paraMap[kid]) paraMap[kid] = [];
    paraMap[kid].push(parseInt(pData[p][1]));
  }

  var khatams = [];
  for (var i = 1; i < kData.length; i++) {
    if (kData[i][1].toString().toLowerCase() === username.toLowerCase() &&
        kData[i][2].toString() == year.toString()) {
      var kId = kData[i][0].toString();
      var paras = paraMap[kId] || [];
      khatams.push({
        khatamId: kId,
        type: kData[i][3].toString(),
        startDate: kData[i][4].toString(),
        completedDate: kData[i][5].toString(),
        parasCompleted: paras.sort(function(a,b){ return a-b; }),
        paraCount: paras.length
      });
    }
  }
  return { success: true, khatams: khatams };
}

function togglePara(username, khatamId, paraNumber) {
  if (!username) return { success: false, error: 'Not logged in.' };
  if (paraNumber < 1 || paraNumber > 30)
    return { success: false, error: 'Para must be 1-30.' };

  return withLock_(function() {
    // Verify khatam belongs to user
    var kSheet = getSheet_(SHEET_KHATAMS);
    var kData = kSheet.getDataRange().getValues();
    var kRow = -1;
    for (var k = 1; k < kData.length; k++) {
      if (kData[k][0].toString() === khatamId &&
          kData[k][1].toString().toLowerCase() === username.toLowerCase()) {
        kRow = k + 1;
        break;
      }
    }
    if (kRow === -1) return { success: false, error: 'Khatam not found.' };

    var pSheet = getSheet_(SHEET_QURAN);
    var pData = pSheet.getDataRange().getValues();

    // Check if para already exists
    for (var i = pData.length - 1; i >= 1; i--) {
      if (pData[i][0].toString() === khatamId &&
          pData[i][1].toString() == paraNumber.toString()) {
        // Remove it (toggle off)
        pSheet.deleteRow(i + 1);
        // Update count in Khatams sheet
        updateKhatamCount_(kSheet, kRow, khatamId, pSheet);
        return { success: true, action: 'removed', message: 'Para ' + paraNumber + ' unmarked.' };
      }
    }

    // Add it (toggle on)
    pSheet.appendRow([khatamId, paraNumber, getTodayString_(), '']);
    updateKhatamCount_(kSheet, kRow, khatamId, pSheet);
    return { success: true, action: 'added', message: 'Para ' + paraNumber + ' completed!' };
  });
}

function updateKhatamCount_(kSheet, kRow, khatamId, pSheet) {
  var pData = pSheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < pData.length; i++) {
    if (pData[i][0].toString() === khatamId) count++;
  }
  kSheet.getRange(kRow, 7).setValue(count);
  if (count >= 30) {
    kSheet.getRange(kRow, 6).setValue(getTodayString_());
  } else {
    kSheet.getRange(kRow, 6).setValue('');
  }
}

function deleteKhatam(username, khatamId) {
  if (!username) return { success: false, error: 'Not logged in.' };

  return withLock_(function() {
    var kSheet = getSheet_(SHEET_KHATAMS);
    var kData = kSheet.getDataRange().getValues();

    for (var k = kData.length - 1; k >= 1; k--) {
      if (kData[k][0].toString() === khatamId &&
          kData[k][1].toString().toLowerCase() === username.toLowerCase()) {
        kSheet.deleteRow(k + 1);
        break;
      }
    }

    // Delete all paras for this khatam
    var pSheet = getSheet_(SHEET_QURAN);
    var pData = pSheet.getDataRange().getValues();
    for (var i = pData.length - 1; i >= 1; i--) {
      if (pData[i][0].toString() === khatamId) {
        pSheet.deleteRow(i + 1);
      }
    }

    return { success: true, message: 'Khatam deleted.' };
  });
}

// ===================================================================
// FASTING TRACKER
// ===================================================================

function logFasting(username, dateStr, fasted, notes) {
  if (!username) return { success: false, error: 'Not logged in.' };
  return withLock_(function() {
    var sheet = getSheet_(SHEET_FASTING);
    var date = dateStr || getTodayString_();
    var year = new Date(date).getFullYear();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === username.toLowerCase() &&
          data[i][2].toString() === date) {
        if (!fasted) {
          sheet.deleteRow(i + 1);
          return { success: true, message: 'Fasting removed for ' + date };
        }
        sheet.getRange(i + 1, 4).setValue('YES');
        sheet.getRange(i + 1, 5).setValue(notes || '');
        return { success: true, message: 'Fasting updated for ' + date };
      }
    }

    if (fasted) {
      sheet.appendRow([username, year, date, 'YES', notes || '']);
      return { success: true, message: 'Fasting logged for ' + date };
    }
    return { success: true, message: 'No change.' };
  });
}

function getUserFastingData(username, year) {
  year = year || getCurrentYear_();
  var sheet = getSheet_(SHEET_FASTING);
  var data = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === username.toLowerCase() &&
        data[i][1].toString() == year.toString()) {
      result[data[i][2].toString()] = {
        fasted: data[i][3].toString() === 'YES',
        notes: data[i][4] ? data[i][4].toString() : ''
      };
    }
  }
  return { success: true, data: result };
}

// ===================================================================
// DASHBOARD / STATISTICS DATA
// ===================================================================

function getDashboardData(year) {
  year = year || getCurrentYear_();

  var usersSheet = getSheet_(SHEET_USERS);
  var taraweehSheet = getSheet_(SHEET_TARAWEEH);
  var khatamSheet = getSheet_(SHEET_KHATAMS);
  var fastingSheet = getSheet_(SHEET_FASTING);

  var usersData = usersSheet.getDataRange().getValues();
  var taraweehData = taraweehSheet.getDataRange().getValues();
  var khatamData = khatamSheet.getDataRange().getValues();
  var fastingData = fastingSheet.getDataRange().getValues();

  // Taraweeh per user
  var taraweehMap = {};
  for (var j = 1; j < taraweehData.length; j++) {
    var tUser = taraweehData[j][0].toString().toLowerCase();
    if (taraweehData[j][1].toString() != year.toString()) continue;
    if (!taraweehMap[tUser]) taraweehMap[tUser] = {};
    taraweehMap[tUser][taraweehData[j][2].toString()] = {
      completed: taraweehData[j][3].toString() === 'YES',
      rakaat: taraweehData[j][4] ? taraweehData[j][4].toString() : '8'
    };
  }

  // Khatam per user
  var khatamMap = {};
  for (var k = 1; k < khatamData.length; k++) {
    var kUser = khatamData[k][1].toString().toLowerCase();
    if (khatamData[k][2].toString() != year.toString()) continue;
    if (!khatamMap[kUser]) khatamMap[kUser] = { totalParas: 0, completedKhatams: 0, khatams: [] };
    var paraCount = parseInt(khatamData[k][6]) || 0;
    khatamMap[kUser].totalParas += paraCount;
    if (paraCount >= 30) khatamMap[kUser].completedKhatams++;
    khatamMap[kUser].khatams.push({
      type: khatamData[k][3].toString(),
      paraCount: paraCount,
      completed: paraCount >= 30
    });
  }

  // Fasting per user
  var fastingMap = {};
  for (var f = 1; f < fastingData.length; f++) {
    var fUser = fastingData[f][0].toString().toLowerCase();
    if (fastingData[f][1].toString() != year.toString()) continue;
    if (!fastingMap[fUser]) fastingMap[fUser] = 0;
    if (fastingData[f][3].toString() === 'YES') fastingMap[fUser]++;
  }

  // Build summaries
  var summaries = [];
  for (var i = 1; i < usersData.length; i++) {
    var uname = usersData[i][0].toString();
    var uLower = uname.toLowerCase();
    var tData = taraweehMap[uLower] || {};
    var kData = khatamMap[uLower] || { totalParas: 0, completedKhatams: 0, khatams: [] };
    var fCount = fastingMap[uLower] || 0;

    // Count taraweeh
    var taraweehCount = 0;
    var dates = Object.keys(tData).sort();
    for (var d = 0; d < dates.length; d++) {
      if (tData[dates[d]].completed) taraweehCount++;
    }

    // Calculate streak
    var streak = 0;
    var today = new Date();
    var checkDate = new Date(today);
    while (true) {
      var ds = Utilities.formatDate(checkDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (tData[ds] && tData[ds].completed) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    var score = taraweehCount + kData.totalParas + (fCount * 0.5);

    summaries.push({
      username: uname,
      role: usersData[i][3].toString() || 'user',
      taraweehCount: taraweehCount,
      streak: streak,
      totalParas: kData.totalParas,
      completedKhatams: kData.completedKhatams,
      khatamDetails: kData.khatams,
      fastingCount: fCount,
      score: Math.round(score * 10) / 10
    });
  }

  // Sort by score descending
  summaries.sort(function(a, b) { return b.score - a.score; });

  // Compute badges
  var badges = computeBadges_(summaries);

  return {
    success: true,
    year: year,
    summaries: summaries,
    badges: badges
  };
}

// ===================================================================
// BADGE SYSTEM (Scalable)
// ===================================================================

function computeBadges_(summaries) {
  if (!summaries || summaries.length === 0) return [];

  // Badge definitions — add new badges here easily
  var badgeDefs = [
    {
      id: 'top_performer',
      emoji: '🏆',
      name: 'Top Performer',
      desc: 'Highest combined score',
      check: function(s, all) {
        return all.length > 0 && s.username === all[0].username && s.score > 0;
      }
    },
    {
      id: 'streak_master',
      emoji: '🔥',
      name: 'Streak Master',
      desc: 'Longest Taraweeh streak',
      check: function(s, all) {
        if (s.streak === 0) return false;
        var maxStreak = Math.max.apply(null, all.map(function(a){ return a.streak; }));
        return s.streak === maxStreak;
      }
    },
    {
      id: 'hafiz_journey',
      emoji: '📖',
      name: 'Hafiz Journey',
      desc: 'Completed 1 full Khatam',
      check: function(s) { return s.completedKhatams >= 1; }
    },
    {
      id: 'double_khatam',
      emoji: '💎',
      name: 'Double Khatam',
      desc: 'Completed 2+ Khatams',
      check: function(s) { return s.completedKhatams >= 2; }
    },
    {
      id: 'dedicated',
      emoji: '🌟',
      name: 'Dedicated',
      desc: '10+ Taraweeh prayers',
      check: function(s) { return s.taraweehCount >= 10; }
    },
    {
      id: 'consistent',
      emoji: '📿',
      name: 'Consistent',
      desc: '20+ Taraweeh prayers',
      check: function(s) { return s.taraweehCount >= 20; }
    },
    {
      id: 'iron_will',
      emoji: '💪',
      name: 'Iron Will',
      desc: '7+ day streak',
      check: function(s) { return s.streak >= 7; }
    },
    {
      id: 'fasting_warrior',
      emoji: '🍽️',
      name: 'Fasting Warrior',
      desc: '15+ days fasted',
      check: function(s) { return s.fastingCount >= 15; }
    },
    {
      id: 'full_ramadan',
      emoji: '🌙',
      name: 'Full Ramadan',
      desc: '29+ days fasted',
      check: function(s) { return s.fastingCount >= 29; }
    },
    {
      id: 'getting_started',
      emoji: '🚀',
      name: 'Getting Started',
      desc: 'Logged first Taraweeh',
      check: function(s) { return s.taraweehCount >= 1; }
    }
  ];

  var results = [];
  for (var b = 0; b < badgeDefs.length; b++) {
    var def = badgeDefs[b];
    var earners = [];
    for (var s = 0; s < summaries.length; s++) {
      if (def.check(summaries[s], summaries)) {
        earners.push(summaries[s].username);
      }
    }
    if (earners.length > 0) {
      results.push({
        id: def.id,
        emoji: def.emoji,
        name: def.name,
        desc: def.desc,
        earners: earners
      });
    }
  }
  return results;
}

// ===================================================================
// ADMIN FUNCTIONS
// ===================================================================

function isAdmin_(username) {
  var sheet = getSheet_(SHEET_USERS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === username.toLowerCase()) {
      return data[i][3].toString().toLowerCase() === 'admin';
    }
  }
  return false;
}

function adminGetAllUsers(requestingUser) {
  if (!isAdmin_(requestingUser))
    return { success: false, error: 'Unauthorized.' };

  var sheet = getSheet_(SHEET_USERS);
  var data = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < data.length; i++) {
    users.push({
      username: data[i][0].toString(),
      email: data[i][1].toString(),
      role: data[i][3].toString(),
      created: data[i][4].toString()
    });
  }
  return { success: true, users: users };
}

function adminResetPassword(requestingUser, targetUsername, newPassword) {
  if (!isAdmin_(requestingUser))
    return { success: false, error: 'Unauthorized.' };
  if (!newPassword || newPassword.length < 4)
    return { success: false, error: 'Password must be at least 4 characters.' };

  return withLock_(function() {
    var sheet = getSheet_(SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === targetUsername.toLowerCase()) {
        sheet.getRange(i + 1, 3).setValue(hashPassword_(newPassword));
        return { success: true, message: 'Password reset for ' + targetUsername };
      }
    }
    return { success: false, error: 'User not found.' };
  });
}

function adminChangeRole(requestingUser, targetUsername, newRole) {
  if (!isAdmin_(requestingUser))
    return { success: false, error: 'Unauthorized.' };
  if (newRole !== 'admin' && newRole !== 'user')
    return { success: false, error: 'Role must be admin or user.' };

  return withLock_(function() {
    var sheet = getSheet_(SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === targetUsername.toLowerCase()) {
        sheet.getRange(i + 1, 4).setValue(newRole);
        return { success: true, message: targetUsername + ' is now ' + newRole };
      }
    }
    return { success: false, error: 'User not found.' };
  });
}

function adminDeleteUser(requestingUser, targetUsername) {
  if (!isAdmin_(requestingUser))
    return { success: false, error: 'Unauthorized.' };
  if (requestingUser.toLowerCase() === targetUsername.toLowerCase())
    return { success: false, error: 'Cannot delete yourself.' };

  return withLock_(function() {
    var sheet = getSheet_(SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === targetUsername.toLowerCase()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: targetUsername + ' deleted.' };
      }
    }
    return { success: false, error: 'User not found.' };
  });
}

// ===================================================================
// UTILITY
// ===================================================================

function getAvailableYears() {
  var years = {};
  var sheets = [SHEET_TARAWEEH, SHEET_KHATAMS, SHEET_FASTING];
  var yearCols = [1, 2, 1];

  for (var s = 0; s < sheets.length; s++) {
    var data = getSheet_(sheets[s]).getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var y = data[i][yearCols[s]].toString();
      if (y && !isNaN(y)) years[y] = true;
    }
  }
  years[getCurrentYear_().toString()] = true;
  return Object.keys(years).sort().reverse();
}

// ===================================================================
// CHANGE PASSWORD (Self)
// ===================================================================

function changePassword(username, oldPassword, newPassword) {
  if (!username) return { success: false, error: 'Not logged in.' };
  if (!oldPassword || !newPassword)
    return { success: false, error: 'Both passwords are required.' };
  if (newPassword.length < 4)
    return { success: false, error: 'New password must be at least 4 characters.' };

  var oldHash = hashPassword_(oldPassword);
  var newHash = hashPassword_(newPassword);

  return withLock_(function() {
    var sheet = getSheet_(SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === username.toLowerCase()) {
        if (data[i][2].toString() !== oldHash) {
          return { success: false, error: 'Current password is incorrect.' };
        }
        sheet.getRange(i + 1, 3).setValue(newHash);
        return { success: true, message: 'Password changed successfully!' };
      }
    }
    return { success: false, error: 'User not found.' };
  });
}

// ===================================================================
// RAMADAN DATES (Aladhan API + Cache)
// ===================================================================

function getRamadanDates(year) {
  year = year || getCurrentYear_();
  var key = 'ramadan_' + year;

  // Check cache first
  var sheet = getSheet_(SHEET_SETTINGS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === key) {
      try {
        return { success: true, dates: JSON.parse(data[i][1].toString()) };
      } catch (e) { /* cache corrupted, re-fetch */ }
    }
  }

  // Fetch from Aladhan API (Hijri month 9 = Ramadan)
  try {
    var url = 'https://api.aladhan.com/v1/hijriCalendar/9/' + year + '?method=2';
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(response.getContentText());

    if (json.code === 200 && json.data && json.data.length > 0) {
      var firstDay = json.data[0].gregorian.date; // DD-MM-YYYY
      var lastDay = json.data[json.data.length - 1].gregorian.date;

      // Convert DD-MM-YYYY to YYYY-MM-DD
      var startParts = firstDay.split('-');
      var endParts = lastDay.split('-');
      var startDate = startParts[2] + '-' + startParts[1] + '-' + startParts[0];
      var endDate = endParts[2] + '-' + endParts[1] + '-' + endParts[0];

      var result = { start: startDate, end: endDate };

      // Cache it
      withLock_(function() {
        sheet.appendRow([key, JSON.stringify(result)]);
        return { success: true };
      });

      return { success: true, dates: result };
    }
  } catch (e) {
    // API failed — return empty gracefully
  }

  return { success: false, error: 'Could not fetch Ramadan dates for ' + year };
}

// ===================================================================
// EXPORT ALL DATA (CSV format for admin)
// ===================================================================

function exportAllData(requestingUser, year) {
  if (!isAdmin_(requestingUser))
    return { success: false, error: 'Unauthorized.' };

  year = year || getCurrentYear_();
  var result = { taraweeh: [], quran: [], fasting: [] };

  // Taraweeh
  var tData = getSheet_(SHEET_TARAWEEH).getDataRange().getValues();
  for (var t = 0; t < tData.length; t++) {
    if (t === 0 || tData[t][1].toString() == year.toString()) {
      result.taraweeh.push(tData[t].join(','));
    }
  }

  // Khatams + QuranProgress
  var kData = getSheet_(SHEET_KHATAMS).getDataRange().getValues();
  for (var k = 0; k < kData.length; k++) {
    if (k === 0 || kData[k][2].toString() == year.toString()) {
      result.quran.push(kData[k].join(','));
    }
  }

  // Fasting
  var fData = getSheet_(SHEET_FASTING).getDataRange().getValues();
  for (var f = 0; f < fData.length; f++) {
    if (f === 0 || fData[f][1].toString() == year.toString()) {
      result.fasting.push(fData[f].join(','));
    }
  }

  return { success: true, data: result };
}
