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
`);

module.exports = db;
