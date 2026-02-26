# 🕌 Taraweeh & Quran Family Tracker

A **free**, mobile-friendly web app for families to track Ramadan progress together — built entirely on **Google Sheets + Google Apps Script** (zero hosting cost).

## Features

| Feature | Description |
|---|---|
| 🕌 **Taraweeh Calendar** | Click-to-log daily Taraweeh prayers (8 or 20 rakaat) |
| 📖 **Quran Progress** | Track multiple Khatams (Arabic + Translation), unlimited rounds |
| 🍽️ **Fasting Tracker** | Click-to-log daily fasts on a calendar |
| 📊 **Statistics** | Family bar charts, leaderboard, combined scores |
| 🎖️ **Badges** | 10 achievement badges with earner names |
| 👑 **Admin Panel** | Manage users, reset passwords, promote/demote |
| 👥 **Multi-User** | Supports 15+ simultaneous users with login/registration |
| 📅 **Year Selector** | Reusable across multiple Ramadans |

## Tech Stack

- **Database:** Google Sheets
- **Backend:** Google Apps Script (Code.gs)
- **Frontend:** HTML + CSS + JavaScript (served by Apps Script)
- **Hosting:** Google (free, forever)

## Quick Start

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed step-by-step instructions.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Backend — auth, CRUD, badges, admin |
| `Dashboard.html` | Main app page with 5 tabs |
| `Login.html` | Login page |
| `Register.html` | Registration page |
| `JavaScript.html` | Shared client-side logic |
| `Stylesheet.html` | All CSS styles |
| `SETUP_GUIDE.md` | Step-by-step setup instructions |
| `USER_GUIDE.md` | Short walkthrough for family members |

## License

Personal/family use. No license restrictions.
