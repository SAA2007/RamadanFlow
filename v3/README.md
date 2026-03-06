# 🕌 RamadanFlow v3.2.0

Family Ramadan progress tracker — self-hosted on Raspberry Pi. Track Taraweeh, Quran, Fasting, Azkar, Surah memorization, and daily Namaz for your entire family.

## Features

- **Taraweeh** — Log nightly rakaat (0–20), calendar view, streak tracking
- **Quran** — Khatam manager with 30-para completion grid
- **Fasting** — Daily fast tracking with calendar
- **Azkar** — Morning and evening dhikr calendar
- **Surah Memorization** — Track ayah-by-ayah progress per surah
- **Namaz** — Daily 5-prayer log (mosque/home/missed)
- **Family Leaderboard** — Dynamic scoring formula with configurable multipliers
- **Badges** — Achievement system (streaks, khatams, fasting, etc.)
- **Responsive** — Desktop sidebar + mobile bottom nav, no horizontal scroll
- **Multi-Region Ramadan** — KSA, Pakistan, Azerbaijan start date support
- **Smart Popups** — Viewport-aware positioning, mobile bottom sheets
- **Tab Persistence** — Stay on current tab after page refresh
- **Dynamic Scoring Config** — Admin-configurable point values (10 parameters)

### Admin Powers

- 👑 Full user management (create/delete/promote/demote)
- 👁 Password viewer with reveal toggle
- 🔐 Password reset per user
- 📝 Full data editor per user (all trackers, audit-logged)
- 📥 Per-user data export (JSON download)
- 📊 Per-user analytics view (anomaly summary)
- 🚀 Per-user score multiplier (0.1x–5.0x)
- ❄ Score freeze (lock accounts from new entries)
- ⛔ Force re-login (invalidate JWT sessions)
- 👤 Impersonate user (read-only preview mode)
- 📢 Announcement banner (visible to all users)
- 📥 Bulk CSV/JSON data export

### Security Analytics

- ⚠️ Anomaly feed with severity/type/user/date range filters
- 🍯 Honeypot hit log with parsed User Agents
- 🔑 Fingerprint consistency scores with expandable session details
- ⌨️ Typing baseline deviation tracking
- 📡 Live request log (auto-refresh 10s, color-coded response times)
- 🗑 Bulk anomaly clear
- 📥 Anomaly CSV export
- 🛡 False positive suppression toggle

### Tools

- 📢 Announcement set/clear
- 📥 JSON + CSV bulk export
- 🗄 Database stats (file size, row counts per table)
- 🔄 WAL checkpoint with timing info
- 📋 Audit log (all admin actions, timestamped)

## Setup

```bash
# Clone
git clone <repo-url> && cd RamadanFlow/v3

# Auto-deploy (Raspberry Pi / CasaOS / Linux)
chmod +x deploy.sh && ./deploy.sh

# Or manual
npm install
node server.js
```

**First user to register becomes admin.**

## Tech Stack

- **Backend**: Node.js, Express, SQLite (better-sqlite3)
- **Frontend**: Vanilla JS, CSS Grid/Flexbox, Chart.js
- **Auth**: JWT (30-day tokens), bcrypt password hashing
- **Security**: Helmet, CORS, rate limiting, honeypots

<details>
<summary>🔍 What's tracked (local analytics)</summary>

All analytics are **stored locally in your SQLite database**. No external services, no cloud, no third-party tracking.

| Category | What | Purpose |
|----------|------|---------|
| **Fingerprinting** | Canvas hash, WebGL hash, navigator data, screen resolution, timezone | Identify multi-account abuse |
| **Keystroke dynamics** | Average key dwell/flight time per session | Detect account sharing |
| **Mouse behavior** | Movement linearity, rage clicks | Bot detection |
| **Session events** | Page focus/blur, tab visibility, idle detection, copy/paste | Usage patterns |
| **Anomaly detection** | Request cadence, impossible travel, slow requests, privilege escalation | Security alerting |
| **Honeypots** | Fake API endpoints, hidden form fields | Bot/scraper detection |
| **Admin audit** | All admin actions logged with before/after diffs | Accountability |

Everything runs on your device. You own all the data.

</details>

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | auto-generated | Secret for JWT signing |
| `PORT` | `3000` | Server port |

## License

ISC
