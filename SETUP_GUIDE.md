# 🕌 Setup Guide — Taraweeh Tracker

Follow these steps to deploy the app. Takes about 10-15 minutes.

---

## Step 1: Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and click **+ Blank spreadsheet**
2. Name it: `Taraweeh Tracker`
3. You do **NOT** need to create any tabs/sheets manually — the app creates them automatically on first run

---

## Step 2: Open the Apps Script Editor

1. In your Google Sheet, click **Extensions** → **Apps Script**
2. This opens a new tab with the script editor
3. You'll see a file called `Code.gs` with a blank function — **delete everything** in it

---

## Step 3: Add the Code Files

### 3a. Code.gs (Backend)

1. Paste the entire contents of `Code.gs` from this project into the editor
2. **IMPORTANT**: On line 9, paste your Sheet ID:
   - Your Sheet URL looks like: `https://docs.google.com/spreadsheets/d/XXXXXXXXX/edit`
   - Copy the `XXXXXXXXX` part and paste it between the quotes:

   ```
   const SPREADSHEET_ID = 'XXXXXXXXX';
   ```

   - **Alternatively**, leave it empty (`''`) and the script will use whichever sheet it's attached to

### 3b. Add HTML Files

For each of these files, do:

1. Click the **+** button next to "Files" in the left sidebar
2. Choose **HTML**
3. Name it **exactly** as listed (without .html extension — Apps Script adds it):

| Create file named | Paste contents from |
|---|---|
| `Login` | `Login.html` |
| `Register` | `Register.html` |
| `Dashboard` | `Dashboard.html` |
| `Stylesheet` | `Stylesheet.html` |
| `JavaScript` | `JavaScript.html` |

After adding all files, your sidebar should show:

```
Code.gs
Login.html
Register.html
Dashboard.html
Stylesheet.html
JavaScript.html
```

---

## Step 4: Deploy as Web App

1. Click **Deploy** → **New deployment** (top right)
2. Click the gear icon ⚙ → select **Web app**
3. Set:
   - **Description**: `Taraweeh Tracker v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (so family can use it without Google login)
4. Click **Deploy**
5. Click **Authorize access** → choose your Google account → Advanced → Go to Taraweeh Tracker → Allow
6. **Copy the Web App URL** — this is the link you share with your family!

---

## Step 5: First Login

1. Open the Web App URL in your browser
2. Click **Register** → create your account
3. **Your first account automatically becomes admin** 👑
4. Share the URL with family members — they register their own accounts

---

## Step 6: Share with Family

Send the Web App URL to your family via WhatsApp/Telegram/etc. They can:

- Open it on any phone or computer
- Register their own account
- Start tracking immediately

---

## Updating the App

If you need to update the code later:

1. Edit the files in Apps Script
2. Click **Deploy** → **Manage deployments**
3. Click the ✏️ pencil icon on your deployment
4. Change **Version** to **New version**
5. Click **Deploy**

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Script function not found" | Make sure file names match exactly (case-sensitive) |
| Blank page after login | Check that `Dashboard.html` exists in Apps Script |
| "Unauthorized" error | Re-deploy and re-authorize |
| Slow loading | Normal — Google Apps Script has ~2-3 second cold starts |
| Need to reset a password | Admin can do it from the Admin tab, or edit the Users sheet directly |
