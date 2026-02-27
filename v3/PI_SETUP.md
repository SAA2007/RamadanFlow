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

## 🌐 Remote Access (DuckDNS + HTTPS)

If you want to access your Pi securely from anywhere, you can use **DuckDNS** (free dynamic DNS) along with **Cloudflare Tunnel** (or Nginx/Certbot) for SSL.

Because you mentioned using a DuckDNS token, here is the easiest way to expose your local `3000` port to a DuckDNS domain using a Cloudflare Tunnel (which provides HTTPS automatically without port forwarding):

### 1. Get your DuckDNS Domain

1. Go to [duckdns.org](https://www.duckdns.org/) and log in.
2. Create a domain (e.g., `myramadan.duckdns.org`).
3. Take note of your **Token**.

*Note: Since Cloudflare Tunnels are the most secure way to bypass Router Port Forwarding, we'll map your DuckDNS domain through Cloudflared.*

### 2. Install Cloudflared on Pi

```bash
# Download for ARM64 (Pi 4 / Pi 5)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login
```

### 3. Setup the Tunnel

```bash
cloudflared tunnel create ramadanflow

# Map your DuckDNS domain to the tunnel
cloudflared tunnel route dns ramadanflow myramadan.duckdns.org
```

### 4. Create Configuration

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Paste this inside:

```yaml
tunnel: ramadanflow
credentials-file: /home/YOUR_PI_USERNAME/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: myramadan.duckdns.org
    service: http://localhost:3000
  - service: http_status:404
```

*(Replace `<TUNNEL_ID>` with your tunnel ID and `YOUR_PI_USERNAME` with your Pi username).*

### 5. Run as Service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### What if I want pure DuckDNS port forwarding without Cloudflare?

If you'd rather open ports on your router:

1. Port forward port `80` and `443` on your router to your Pi's local IP.
2. Install the duckdns cronjob to keep your IP updated:

```bash
echo "*/5 * * * * curl -k 'https://www.duckdns.org/update?domains=YOUR_DOMAIN&token=YOUR_TOKEN&ip=' >/dev/null 2>&1" | crontab -
```

3. Install Nginx and run Certbot to get a free HTTPS certificate for `myramadan.duckdns.org`.

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
