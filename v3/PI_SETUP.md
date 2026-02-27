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
git clone https://github.com/YOUR_USERNAME/RamadanFlow.git
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

## 🔒 Cloudflare Tunnel (Free HTTPS + Public DNS)

> This gives you **free HTTPS**, a public URL, and **no port forwarding needed**.

### 1. Get a Domain

- Buy a cheap domain or use an existing one
- Add it to Cloudflare (free plan): <https://dash.cloudflare.com>
- Update your domain's nameservers to Cloudflare's

### 2. Install cloudflared

```bash
# Download for ARM64 (Pi 4 / Pi 5)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login
# Opens browser — log in to Cloudflare and authorize
```

### 3. Create Tunnel

```bash
# Create the tunnel
cloudflared tunnel create ramadanflow

# Route your subdomain
cloudflared tunnel route dns ramadanflow ramadan.yourdomain.com
```

### 4. Configure Tunnel

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Paste this inside:

```yaml
tunnel: ramadanflow
credentials-file: /home/YOUR_PI_USERNAME/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: ramadan.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

*(Replace `<TUNNEL_ID>` with the ID shown when you created the tunnel, and `YOUR_PI_USERNAME` with your Pi's username).*

### 5. Run as Service

```bash
# Install as system service
sudo cloudflared service install

# Start it
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

### 6. Verify

Open `https://ramadan.yourdomain.com` — it should show RamadanFlow with a valid SSL certificate! 🎉

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
