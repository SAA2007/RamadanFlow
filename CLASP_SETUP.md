# RamadanFlow — Quick Clasp Setup

## One-Time Setup (do this once)

### Step 1: Login to Google

Open your terminal and run:

```
clasp login
```

This opens a browser. Sign in with your Google account and allow access.

### Step 2: Enable the Apps Script API

Go to: <https://script.google.com/home/usersettings>
Turn ON "Google Apps Script API"

### Step 3: Create the Apps Script project

Option A — Link to an existing project:

1. Open your Apps Script project in the browser
2. Copy the Script ID from the URL:  `https://script.google.com/home/projects/SCRIPT_ID_HERE/edit`
3. Edit `.clasp.json` and add the scriptId:

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "."
}
```

Option B — Create a new project:

```
clasp create --title "RamadanFlow" --rootDir .
```

### Step 4: Push the code

```
clasp push
```

Type `y` when asked about overwriting.

### Step 5: Deploy

```
clasp deploy -d "v2.1"
```

---

## After Any Code Change

Just run two commands:

```
clasp push
clasp deploy -d "description of change"
```

That's it! No copy-pasting needed.

---

## Useful Commands

```
clasp open       # Opens the Apps Script editor in browser
clasp pull       # Pulls code from Apps Script to local
clasp logs       # View execution logs
clasp versions   # List all versions
```
