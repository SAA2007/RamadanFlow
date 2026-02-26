# 🕌 Setup & Deployment Guide — RamadanFlow

RamadanFlow is a Single Page Application (SPA) built on Google Apps Script. It uses `clasp` for automated deployments.

---

## 1. Initial Setup (One-Time)

### Create the Google Apps Script Project

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Name it: `RamadanFlow`
3. Copy the **Script ID** from the URL (looks like `1KjNt...`).

### Link Your Local Code via Clasp

1. Open your terminal in the `RamadanFlow` folder.
2. If you haven't logged in: `clasp login`
3. Edit `.clasp.json` and paste your Script ID:

   ```json
   {
     "scriptId": "YOUR_SCRIPT_ID_HERE",
     "rootDir": "."
   }
   ```

---

## 2. Push Code 🚀 (Anytime you make changes)

Run this in your terminal:

```bash
clasp push --force
```

*(This automatically uploads `Code.gs`, `Index.html`, `js`, `css`, etc. without manual copy-pasting).*

---

## 3. Deploy as Web App 🌐

You must deploy the app to get a public link you can share with your family.

### **First Time Deployment:**

1. Open [script.google.com](https://script.google.com) and open your `RamadanFlow` project.
2. Click **Deploy** (top right) → **New deployment**
3. Click the ⚙️ gear icon → select **Web app**
4. Set the following:
   - **Description**: `v1.0 (or whatever version)`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Click **Deploy** → **Authorize access** → Allow your Google account.
6. **Copy the Web App URL** — this is the static link you send to your family!

### **Updating an Existing Deployment:**

*Important: If you create a "New deployment" every time, the URL changes. Do this instead:*

1. Run `clasp push --force` on your computer.
2. Go to the Apps Script editor.
3. Click **Deploy** → **Manage deployments**.
4. Click the ✏️ **pencil icon** next to your active deployment.
5. Change **Version** to **New version**.
6. Click **Deploy**.
*(Your family's URL stays exactly the same, but the code updates instantly!)*

---

## 4. How to Use & Test

1. **Go to your Web App URL.**
2. **First User Registration:**
   - Click **Register**. The first person to create an account is automatically granted **Admin 👑** rights.
3. **Usage:**
   - Log in.
   - You can now log Taraweeh rakaats, start Quran Khatams (Arabic or Translation), and track fasting.
   - The **Admin 👑** tab allows you to fix other family members' data or change their passwords if they forget.
