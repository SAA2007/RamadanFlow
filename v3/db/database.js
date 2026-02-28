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

// RC1 migrations
try { db.exec("ALTER TABLE users ADD COLUMN plain_pw TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE users ADD COLUMN score_multiplier REAL DEFAULT 1.0"); } catch (e) { }
try { db.exec("ALTER TABLE users ADD COLUMN session_invalidated_at TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE users ADD COLUMN frozen INTEGER DEFAULT 0"); } catch (e) { }

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
`);

module.exports = db;
