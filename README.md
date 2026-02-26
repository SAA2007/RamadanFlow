# 🕌 RamadanFlow

A family Ramadan activity tracker — track taraweeh, Quran, fasting, azkar, surah memorization, and daily namaz.

## Versions

| Version | Stack | Folder |
|:--------|:------|:-------|
| **v2** | Google Apps Script (legacy) | [`v2/`](v2/) |
| **v3** | Node.js + Express + SQLite (self-hosted) | [`v3/`](v3/) |

## Quick Start (v3)

```bash
cd v3
npm install
node server.js
```

On first run, the server will:

1. Auto-create `.env` with a secure random `JWT_SECRET`
2. Auto-create the `data/` directory for the SQLite database
3. Start at `http://localhost:3000`

> **First user to register becomes admin** 👑

## Deploy to Raspberry Pi

See the full guide: [`v3/PI_SETUP.md`](v3/PI_SETUP.md)

```bash
cd v3 && npm install && node server.js
# Then: pm2 start ecosystem.config.js
# Then: set up Cloudflare Tunnel for HTTPS
```

## Features

- 🕌 **Taraweeh** — calendar tracker with custom rakaat (1-20)
- 📖 **Quran** — khatam tracker (Arabic / Translation, 30 paras)
- 🍽️ **Fasting** — daily fasting log
- 📿 **Azkar** — morning / evening daily toggle
- 📝 **Surah** — memorization progress (114 surahs, ayah slider)
- 🕌 **Namaz** — 5 daily prayers (mosque / home / missed)
- 📊 **Stats** — leaderboard, charts, badges
- 👑 **Admin** — user management, data export
