# 🕌 RamadanFlow v3.RC1

Family Ramadan progress tracker — self-hosted on Raspberry Pi. Track Taraweeh, Quran, Fasting, Azkar, Surah memorization, and daily Namaz for your entire family.

## Features

- **Taraweeh** — Log nightly rakaat (2–20), calendar view, streak tracking
- **Quran** — Khatam manager with 30-para completion grid
- **Fasting** — Daily fast tracking with calendar
- **Azkar** — Morning and evening dhikr calendar
- **Surah Memorization** — Track ayah-by-ayah progress per surah
- **Namaz** — Daily 5-prayer log (mosque/home/missed)
- **Family Leaderboard** — Scoring formula with age/gender bonuses
- **Badges** — Achievement system (streaks, khatams, fasting, etc.)
- **Responsive** — Desktop sidebar + mobile bottom nav, no horizontal scroll
- **Multi-Region Ramadan** — KSA, Pakistan, Azerbaijan start date support

### Admin Powers

- 👑 Full user management (create/delete/promote/demote)
- 👁 Password viewer with reveal toggle
- 📝 Full data editor per user (all trackers, audit-logged)
- 🚀 Per-user score multiplier (0.1x–5.0x)
- ❄ Score freeze (lock accounts from new entries)
- ⛔ Force re-login (invalidate JWT sessions)
- 👤 Impersonate user (read-only preview mode)
- 📢 Announcement banner (visible to all users)
- 📥 CSV data export

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
