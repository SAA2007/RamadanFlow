const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'ramadanflow.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// ===================================================================
// SCHEMA
// ===================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    gender TEXT DEFAULT 'Male',
    age INTEGER DEFAULT 30,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS taraweeh (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    year INTEGER NOT NULL,
    date TEXT NOT NULL,
    completed TEXT DEFAULT 'YES',
    rakaat INTEGER DEFAULT 8,
    UNIQUE(username, date)
  );

  CREATE TABLE IF NOT EXISTS khatams (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE,
    year INTEGER NOT NULL,
    type TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    para_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS quran_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    khatam_id TEXT NOT NULL,
    para_number INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(khatam_id, para_number),
    FOREIGN KEY (khatam_id) REFERENCES khatams(id)
  );

  CREATE TABLE IF NOT EXISTS fasting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    year INTEGER NOT NULL,
    date TEXT NOT NULL,
    completed TEXT DEFAULT 'YES',
    UNIQUE(username, date)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS azkar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    date TEXT NOT NULL,
    morning INTEGER DEFAULT 0,
    evening INTEGER DEFAULT 0,
    UNIQUE(username, date)
  );

  CREATE TABLE IF NOT EXISTS surah_memorization (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    surah_number INTEGER NOT NULL,
    surah_name TEXT NOT NULL,
    total_ayah INTEGER NOT NULL,
    memorized_ayah INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS namaz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    date TEXT NOT NULL,
    prayer TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'missed',
    UNIQUE(username, date, prayer)
  );
`);

// ===================================================================
// MIGRATIONS
// ===================================================================

try {
  db.exec("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'Male'");
  db.exec("ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 30");
} catch (e) {
  // Columns already exist
}

// v3 migrations
try { db.exec("ALTER TABLE users ADD COLUMN plain_pw TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE users ADD COLUMN score_multiplier REAL DEFAULT 1.0"); } catch (e) { }
try { db.exec("ALTER TABLE users ADD COLUMN session_invalidated_at TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE users ADD COLUMN frozen INTEGER DEFAULT 0"); } catch (e) { }

// Ramadan admin dates table
db.exec(`
  CREATE TABLE IF NOT EXISTS ramadan_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    region TEXT NOT NULL,
    date TEXT NOT NULL,
    set_by_admin INTEGER DEFAULT 1,
    note TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(year, region)
  );
`);

// ===================================================================
// INDEXES (idempotent — IF NOT EXISTS)
// ===================================================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_taraweeh_user_year ON taraweeh(username, year);
  CREATE INDEX IF NOT EXISTS idx_fasting_user_year ON fasting(username, year);
  CREATE INDEX IF NOT EXISTS idx_khatams_user_year ON khatams(username, year);
  CREATE INDEX IF NOT EXISTS idx_azkar_user_date ON azkar(username, date);
  CREATE INDEX IF NOT EXISTS idx_namaz_user_date ON namaz(username, date);
  CREATE INDEX IF NOT EXISTS idx_surah_user ON surah_memorization(username);
`);

// ===================================================================
// ANALYTICS TABLES
// ===================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id INTEGER,
    username TEXT COLLATE NOCASE,
    event_type TEXT NOT NULL,
    event_data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics_fingerprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    user_id INTEGER,
    username TEXT COLLATE NOCASE,
    fingerprint_hash TEXT,
    canvas_hash TEXT,
    webgl_hash TEXT,
    webrtc_ips TEXT,
    navigator_data TEXT,
    timezone TEXT,
    locale TEXT,
    color_scheme TEXT,
    screen_resolution TEXT,
    headless_flags TEXT,
    ja3_hash TEXT,
    cf_ip_country TEXT,
    cf_device_type TEXT,
    cf_connecting_ip_hash TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics_typing_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    session_id TEXT,
    avg_dwell_ms REAL,
    avg_flight_ms REAL,
    baseline_dwell REAL,
    baseline_flight REAL,
    deviation_pct REAL,
    flagged INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics_anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id INTEGER,
    username TEXT COLLATE NOCASE,
    severity TEXT DEFAULT 'LOW',
    anomaly_type TEXT NOT NULL,
    details TEXT,
    ip_hash TEXT,
    cf_ip_country TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics_admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_username TEXT NOT NULL COLLATE NOCASE,
    action TEXT NOT NULL,
    target_username TEXT COLLATE NOCASE,
    before_state TEXT,
    after_state TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics_honeypot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    ip_hash TEXT,
    route TEXT NOT NULL,
    user_agent TEXT,
    headers TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_anomalies_severity ON analytics_anomalies(severity);
  CREATE INDEX IF NOT EXISTS idx_analytics_fingerprints_user ON analytics_fingerprints(username);

  CREATE TABLE IF NOT EXISTS analytics_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT,
    route TEXT,
    username TEXT COLLATE NOCASE,
    status_code INTEGER,
    response_ms INTEGER,
    cf_country TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_analytics_requests_created ON analytics_requests(created_at);
`);

// Auto-cleanup: keep last 500 request rows
try {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS cleanup_analytics_requests
    AFTER INSERT ON analytics_requests
    BEGIN
      DELETE FROM analytics_requests WHERE id NOT IN (
        SELECT id FROM analytics_requests ORDER BY id DESC LIMIT 500
      );
    END;
  `);
} catch (e) { /* trigger may already exist */ }

// ===================================================================
// SCORING CONFIG TABLE
// ===================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS scoring_config (
    key TEXT PRIMARY KEY,
    value REAL NOT NULL,
    label TEXT,
    description TEXT
  );
`);

// Seed defaults only if table is empty
const configCount = db.prepare('SELECT COUNT(*) as c FROM scoring_config').get().c;
if (configCount === 0) {
  const seedConfig = db.prepare('INSERT INTO scoring_config (key, value, label, description) VALUES (?, ?, ?, ?)');
  const defaults = [
    ['taraweeh_per_rakaat', 1.5, 'Taraweeh per Rakaat', 'Points awarded per rakaat of Taraweeh prayer'],
    ['quran_per_para', 10, 'Quran per Para', 'Points per para (juz) read'],
    ['quran_per_khatam', 50, 'Quran per Khatam', 'Bonus points for completing a full Quran reading'],
    ['fasting_per_day', 15, 'Fasting per Day', 'Points per day of fasting'],
    ['azkar_per_session', 3, 'Azkar per Session', 'Points per morning or evening azkar session'],
    ['surah_per_ayah', 0.5, 'Surah per Ayah', 'Points per ayah memorized'],
    ['namaz_mosque', 4, 'Namaz Mosque', 'Points per prayer at mosque'],
    ['namaz_home_men', 2, 'Namaz Home (Men)', 'Points per prayer at home for men'],
    ['namaz_home_women', 4, 'Namaz Home (Women)', 'Points per prayer at home for women'],
    ['streak_per_day', 2, 'Streak per Day', 'Points per consecutive day streak']
  ];
  const seedMany = db.transaction(() => {
    defaults.forEach(d => seedConfig.run(d[0], d[1], d[2], d[3]));
  });
  seedMany();
  console.log('[DB] Scoring config seeded with defaults');
}

module.exports = db;
