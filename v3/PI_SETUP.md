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

If you restart your Raspberry Pi, the app won't turn on automatically unless you run this command:

```bash
pm2 startup
```

*Note: This command will output another command that looks like `sudo env PATH=$PATH...`. You MUST copy and paste that command into your terminal and hit enter.*

---

## 🌐 Remote Access (Domain + Free HTTPS)

If you want to access your Pi securely from anywhere (like `myramadan.duckdns.org`), we created a **Zero-touch Production Deployment** script.

This script will automatically:

1. Install Nginx and Certbot.
2. Route your local app (port 3000) to port 80 (HTTP) and port 443 (HTTPS).
3. Secure your domain with a **Free Let's Encrypt SSL Certificate**.
4. Configure a background job (cronjob) to automatically continuously update your DuckDNS IP address every 5 minutes so it never breaks.

### How to run it

1. Open `deploy.sh` and make sure the `DOMAIN` and `DUCKDNS_TOKEN` variables at the very top match your DuckDNS info.
2. Run this command:

```bash
cd ~/RamadanFlow/v3
chmod +x deploy.sh

# Run as root so it can configure Nginx and SSL
sudo ./deploy.sh
```

**⚠️ CRITICAL FINAL STEP:**
Because this routes your own domain explicitly to your router's IP, you **must** log into your home WiFi Router settings and add a **Port Forwarding Rule** forwarding `Port 80` and `Port 443` to your Raspberry Pi's local IP address (e.g., `192.168.1.xxx`).

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
