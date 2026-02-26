# 🕌 RamadanFlow — Family Ramadan Progress Tracker

A **free**, mobile-friendly web app for families to track Ramadan progress together — built on **Google Sheets + Google Apps Script** (zero hosting cost).

## Features

| Feature | Description |
|---|---|
| 🕌 **Taraweeh Calendar** | Click-to-log daily prayers (8 or 20 rakaat), Ramadan days auto-highlighted |
| 📖 **Multi-Khatam** | Track unlimited Arabic + Translation Quran rounds with undo protection |
| 🍽️ **Fasting Tracker** | Click-to-log daily fasts on a calendar |
| 📊 **Statistics** | Family bar charts, ranked leaderboard with score formula |
| 🎖️ **10 Badges** | Achievement badges with earner usernames |
| 👤 **Profile** | Change password, view account info |
| 👑 **Admin Panel** | Search/filter users, reset passwords, edit any user's data, CSV export |
| 👥 **15+ Users** | Concurrent access with server-side locking |
| 📅 **Multi-Year** | Reusable across Ramadans, auto-fetches Ramadan dates |
| 🌍 **Multi-Region** | Works for family in KSA, Azerbaijan, Pakistan, or anywhere |

## Tech Stack

- **Database:** Google Sheets (6 tabs auto-created)
- **Backend:** Google Apps Script (Code.gs)
- **Frontend:** HTML + CSS + JavaScript
- **Hosting:** Google (free forever)
- **Ramadan Dates:** Aladhan API (auto-cached)

## Quick Start

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for step-by-step deployment.
Share [USER_GUIDE.md](USER_GUIDE.md) with family members.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Backend — auth, CRUD, badges, admin, Ramadan API, CSV |
| `Dashboard.html` | Main app with 5 tabs |
| `JavaScript.html` | Client-side logic |
| `Stylesheet.html` | Islamic dark theme CSS |
| `Login.html` | Login page |
| `Register.html` | Registration page |

## Version History

- **v2.1** — Multi-khatam, fasting, badges, Ramadan dates, profile, admin improvements, CSV export
- **v2.0** — Initial release
