#!/bin/bash
# 🕌 RamadanFlow - Zero-to-Full Production Setup Script
# Handles: Node.js, PM2, App Setup, Nginx, DuckDNS, and Free SSL (Certbot)
# Run with: sudo ./deploy.sh

set -e

# ==========================================
# CONFIGURATION
# ==========================================
DOMAIN="myramadan.duckdns.org"
DUCKDNS_TOKEN="94e7fa22-5527-4243-a93a-6785067d7b6a"
PORT=3000
APP_DIR="/home/$SUDO_USER/RamadanFlow/v3"

# ==========================================
# PRE-FLIGHT CHECKS
# ==========================================
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run this script with sudo: sudo ./deploy.sh"
  exit 1
fi

if [ -z "$SUDO_USER" ]; then
  echo "❌ Could not detect the original user. Please run with 'sudo ./deploy.sh' instead of logging in as root."
  exit 1
fi

echo "======================================"
echo "🚀 RamadanFlow Automated Production Deployment"
echo "User: $SUDO_USER | Domain: $DOMAIN"
echo "======================================"

# ==========================================
# 1. SYSTEM UPDATES & DEPENDENCIES
# ==========================================
echo "📦 Updating system packages..."
apt update && apt upgrade -y
apt install -y curl wget git nano cron build-essential



# ==========================================
# 2. NODE.JS & NPM INSTALLATION (Global)
# ==========================================
if ! command -v node >/dev/null 2>&1; then
    echo "🟩 Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
else
    echo "✅ Node.js already installed: $(node -v)"
fi

# ==========================================
# 3. APP SETUP & ENVIRONMENT
# ==========================================
echo "⚙️ Setting up application directory..."
cd "$APP_DIR" || { echo "❌ Could not find $APP_DIR. Did you clone the repo?"; exit 1; }

# Install dependencies as the regular user to prevent permission issues
sudo -u "$SUDO_USER" npm install || { echo "⚠️ npm install failed, retrying in 5s..."; sleep 5; sudo -u "$SUDO_USER" npm install; } || { echo "⚠️ retrying again..."; sleep 5; sudo -u "$SUDO_USER" npm install; }

# Create SSL folder for Native HTTPS (Option C)
sudo -u "$SUDO_USER" mkdir -p ssl

# Generate .env if missing
if [ ! -f .env ]; then
    echo "🔑 Generating secure .env file..."
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sudo -u "$SUDO_USER" bash -c "echo 'PORT=$PORT' > .env"
    sudo -u "$SUDO_USER" bash -c "echo 'JWT_SECRET=$SECRET' >> .env"
else
    echo "✅ .env file already exists."
fi

# ==========================================
# 4. PM2 PROCESS MANAGER
# ==========================================
echo "🔄 Configuring PM2..."
npm install -g pm2 || { echo "⚠️ pm2 install failed, retrying in 5s..."; sleep 5; npm install -g pm2; } || { echo "⚠️ retrying again..."; sleep 5; npm install -g pm2; }

# Start the app as the standard user
sudo -u "$SUDO_USER" pm2 start ecosystem.config.js || sudo -u "$SUDO_USER" pm2 restart ecosystem.config.js
sudo -u "$SUDO_USER" pm2 save

# Setup PM2 to start on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER"

# ==========================================
# 5. DUCKDNS DYNAMIC IP CRONJOB
# ==========================================
echo "🦆 Configuring DuckDNS auto-updater..."
CRON_CMD="*/5 * * * * curl -s -k 'https://www.duckdns.org/update?domains=${DOMAIN%%.duckdns.org}&token=$DUCKDNS_TOKEN&ip=' >/dev/null 2>&1"
(crontab -u "$SUDO_USER" -l 2>/dev/null | grep -v "duckdns.org"; echo "$CRON_CMD") | crontab -u "$SUDO_USER" -
# Trigger an immediate update
curl -s -k "https://www.duckdns.org/update?domains=${DOMAIN%%.duckdns.org}&token=$DUCKDNS_TOKEN&ip=" >/dev/null 2>&1

echo "======================================"
echo "🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "RamadanFlow is running securely on your Pi at:"
echo "👉 http://localhost:$PORT"
echo ""
echo "To access it remotely via DuckDNS ($DOMAIN):"
echo "1. Log into your WiFi Router."
echo "2. Port Forward an external 'non-descript' port (e.g., 8443 or 5050)"
echo "   to your Raspberry Pi's local IP address on Port $PORT."
echo ""
echo "Example: You can then access it at http://$DOMAIN:8443"
echo "Note: If you run CasaOS, use the 'Cloudflared' or 'Nginx Proxy Manager'"
echo "CasaOS App to route this port natively."
echo "======================================"
