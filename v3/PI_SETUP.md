# 🕌 RamadanFlow v3.1 — Raspberry Pi Setup Guide

## Prerequisites

- Raspberry Pi 5 with Raspberry Pi OS (64-bit)
- Internet connection
- A domain name (for Cloudflare Tunnel)

---

## Step 1: Install Node.js

```bash
# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # Should show v22.x
npm -v
```

## Step 2: Clone & Install

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/RamadanFlow.git ramadanflow
cd ramadanflow/v3
npm install
```

## Step 3: Configure Environment

```bash
# Create .env file
cat > .env << 'EOF'
PORT=3000
JWT_SECRET=CHANGE_THIS_TO_A_RANDOM_STRING_64_CHARS
EOF

# Generate a proper secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output and paste it as JWT_SECRET in .env
```

## Step 4: Test Locally

```bash
npm start
# Open http://<pi-ip>:3000 in browser on same network
# Register your admin account (first user = admin)
# Ctrl+C to stop
```

## Step 5: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Start the app
pm2 start ecosystem.config.js

# Auto-start on boot
pm2 startup
# Run the command it prints
pm2 save

# Useful commands:
pm2 status          # Check status
pm2 logs            # View logs
pm2 restart all     # Restart
```

## Step 6: Cloudflare Tunnel (Free HTTPS + Public DNS)

> This gives you **free HTTPS**, a public URL, and **no port forwarding needed**.

### 6a. Get a Domain

- Buy a cheap domain or use an existing one
- Add it to Cloudflare (free plan): <https://dash.cloudflare.com>
- Update your domain's nameservers to Cloudflare's

### 6b. Install cloudflared

```bash
# Download for ARM64 (Pi 5)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login
# Opens browser — log in to Cloudflare and authorize
```

### 6c. Create Tunnel

```bash
# Create the tunnel
cloudflared tunnel create ramadanflow

# Route your subdomain
cloudflared tunnel route dns ramadanflow ramadan.yourdomain.com
```

### 6d. Configure Tunnel

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: ramadanflow
credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: ramadan.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

Replace `<TUNNEL_ID>` with the ID shown when you created the tunnel.

### 6e. Run as Service

```bash
# Install as system service
sudo cloudflared service install

# Start it
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

### 6f. Verify

Open `https://ramadan.yourdomain.com` — it should show RamadanFlow with a valid SSL certificate! 🎉

---

## Architecture

```
Internet → Cloudflare (HTTPS) → cloudflared tunnel → localhost:3000 → Express → SQLite
```

- **HTTPS**: Handled by Cloudflare (free, auto-renewed)
- **DNS**: Managed via Cloudflare dashboard
- **No port forwarding**: Tunnel creates an outbound connection
- **Database**: SQLite file at `v3/data/ramadanflow.db`
- **Backups**: Just copy the `.db` file periodically

## Maintenance

```bash
# Update code
cd ~/ramadanflow && git pull
cd v3 && npm install
pm2 restart ramadanflow

# Backup database
cp v3/data/ramadanflow.db ~/backups/ramadanflow_$(date +%F).db
```
