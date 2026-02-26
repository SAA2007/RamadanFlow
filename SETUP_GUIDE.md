# 🕌 Setup Guide — RamadanFlow

Follow these steps to deploy. Takes ~10 minutes.

---

## Step 1: Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **+ Blank spreadsheet**
2. Name it: `RamadanFlow`
3. You do NOT need to create tabs — the app creates them automatically

---

## Step 2: Open Apps Script Editor

1. In your Sheet → **Extensions** → **Apps Script**
2. Delete everything in the default `Code.gs`

---

## Step 3: Add the Code Files

### 3a. Code.gs

1. Paste the entire `Code.gs` from this project
2. **Optional**: on line 9, paste your Sheet ID:

   ```
   const SPREADSHEET_ID = 'YOUR_SHEET_ID_HERE';
   ```

   Or leave empty — it will use the attached sheet

### 3b. HTML Files

Click **+** → **HTML** for each file. Name them **exactly** (without .html):

| Create as | Paste from |
|---|---|
| `Login` | `Login.html` |
| `Register` | `Register.html` |
| `Dashboard` | `Dashboard.html` |
| `Stylesheet` | `Stylesheet.html` |
| `JavaScript` | `JavaScript.html` |

---

## Step 4: Deploy

1. **Deploy** → **New deployment**
2. ⚙ → **Web app**
3. **Execute as**: `Me` · **Who has access**: `Anyone`
4. Click **Deploy** → **Authorize access** → Allow
5. **Copy the Web App URL** — this is your family link!

---

## Step 5: First Login

1. Open the URL → **Register** → create your account
2. **First account = admin** 👑 automatically
3. Share the URL with family

---

## Updating Later

1. Edit files in Apps Script
2. **Deploy** → **Manage deployments** → ✏ → **New version** → Deploy

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Blank page | Check all file names match exactly |
| "Unauthorized" | Re-deploy and re-authorize |
| Slow load | Normal — 2-3s cold start is expected |
| Forgot password | Admin resets it from Admin tab |
