# 🕌 RamadanFlow v3.3 — Raspberry Pi Setup Guide

## Prerequisites

- Raspberry Pi with Raspberry Pi OS (64-bit)
- Internet connection
- A domain name (for Cloudflare Tunnel, optional but recommended)

---

## ⚡ Automated Setup (The Easy Way)

We have included a setup script that installs Node, downloads dependencies, generates a secure `.env` file, and installs PM2 to run your app in the background.

```bash
# 1. Clone the repository
cd ~
git clone https://github.com/SAA2007/RamadanFlow.git
cd RamadanFlow/v3

# 2. Make the setup script executable and run it
chmod +x setup.sh
./setup.sh
```

**What the setup script does:**

1. Installs Node.js v22 via NVM (if you don't have it).
2. Runs `npm install` to get the dependencies.
3. Automatically creates a `.env` file with a freshly generated, secure `JWT_SECRET`.
4. Installs `pm2` globally for your user.
5. Starts `server.js` in the background automatically.

If you ever need to restart the app or view logs:

```bash
pm2 restart all    # Restart the app
pm2 logs           # View server logs
```

### Making it survive a reboot

The `setup.sh` script automatically attempts to configure PM2 to start on boot. However, if it fails (for instance, if you didn't have `sudo` permissions), you can manually run:

```bash
pm2 startup
```

*Note: If you run this manually, it will output another command that looks like `sudo env PATH=$PATH...`. You MUST copy and paste that command into your terminal and hit enter.*

---

## 🌐 Remote Access (Domain + CasaOS Setup)

If you want to access your Pi securely from anywhere (like `myramadan.duckdns.org`), run our automated deployment script:

```bash
cd ~/RamadanFlow/v3
chmod +x deploy.sh
sudo ./deploy.sh
```

This script will automatically install Node, configure PM2, and set up a DuckDNS **background ping** to keep your dynamic IP updated.

Because you have **CasaOS** running on port 80, the script will **NOT** attempt to install Nginx or override port 80. Instead, it will start RamadanFlow safely on `localhost:3000`.

### Option A: Use a Non-Descript Port (Fastest)

1. Log into your home WiFi Router settings.
2. Add a **Port Forwarding Rule** forwarding an external 'non-descript' port (e.g., `8085` or `8443`) to your Raspberry Pi's local IP address on **Port 3000**.
3. Access your app anywhere via `http://myramadan.duckdns.org:8085`.

### Option B: Route natively through CasaOS (Best for Standard Nginx HTTPS)

To get standard HTTPS without adding ports to the URL:

1. Open your CasaOS Dashboard.
2. Go to the App Store and install **Nginx Proxy Manager** or **Cloudflared**.
3. Add a new proxy host pointing `myramadan.duckdns.org` to `localhost:3000` (or your Pi's local IP on port 3000).
4. Request an SSL certificate directly from inside Nginx Proxy Manager using DNS-01 or HTTP-01 challenges.

### Option C: Native NodeJS HTTPS (Fully Automated)

Because you use CasaOS (which blocks standard HTTP/HTTPS verification), our `deploy.sh` script actually has a built-in fallback using `acme.sh` and the DuckDNS API!

By simply running `deploy.sh`, the script automatically:

1. Talks directly to DuckDNS.
2. Generates a valid Let's Encrypt SSL Certificate.
3. Saves it locally to the `v3/ssl` folder.
4. Auto-loads it into the Node.js server.

You can instantly access your app securely at: `https://myramadan.duckdns.org:3000`

---

## Maintenance

```bash
# Update code
cd ~/RamadanFlow && git pull
cd v3 && npm install
pm2 restart all

# Backup database
cp v3/data/ramadanflow.db ~/backups/ramadanflow_$(date +%F).db
```
