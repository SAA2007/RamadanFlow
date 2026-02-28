#!/bin/bash
# ===================================================================
# RamadanFlow v3.RC1 — Automated Deployment Script
# Targets: Raspberry Pi / CasaOS / Any Debian-based Linux
# Usage:   chmod +x deploy.sh && ./deploy.sh
# ===================================================================

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
NC='\033[0m'

echo ""
echo -e "${GOLD}🕌 RamadanFlow v3.RC1 — Deployment Script${NC}"
echo "─────────────────────────────────────────"
echo ""

# -------------------------------------------------------------------
# 1. Check / Install Node.js (v18+)
# -------------------------------------------------------------------
if command -v node &> /dev/null; then
    NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VER" -ge 18 ]; then
        echo -e "${GREEN}✅ Node.js $(node -v) found${NC}"
    else
        echo -e "${RED}⚠️  Node.js $(node -v) is too old. Need v18+${NC}"
        echo "   Installing Node.js 18..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    echo -e "${GOLD}📦 Node.js not found. Installing v18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo -e "${GREEN}   Node: $(node -v) | npm: $(npm -v)${NC}"
echo ""

# -------------------------------------------------------------------
# 2. Install PM2 globally
# -------------------------------------------------------------------
if ! command -v pm2 &> /dev/null; then
    echo -e "${GOLD}📦 Installing PM2...${NC}"
    sudo npm install -g pm2
fi
echo -e "${GREEN}✅ PM2 $(pm2 -v) found${NC}"
echo ""

# -------------------------------------------------------------------
# 3. Navigate to v3 directory
# -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V3_DIR="$SCRIPT_DIR"

if [ ! -f "$V3_DIR/server.js" ]; then
    echo -e "${RED}❌ server.js not found in $V3_DIR${NC}"
    echo "   Run this script from within the v3/ directory."
    exit 1
fi

cd "$V3_DIR"
echo -e "${GREEN}✅ Working directory: $V3_DIR${NC}"
echo ""

# -------------------------------------------------------------------
# 4. Install dependencies
# -------------------------------------------------------------------
echo -e "${GOLD}📦 Installing npm dependencies...${NC}"
npm install --production
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# -------------------------------------------------------------------
# 5. Generate .env if missing
# -------------------------------------------------------------------
if [ ! -f .env ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    cat > .env << EOF
JWT_SECRET=$JWT_SECRET
PORT=3000
EOF
    echo -e "${GREEN}✅ Generated .env with random JWT_SECRET${NC}"
else
    echo -e "${GREEN}✅ .env already exists${NC}"
fi
echo ""

# -------------------------------------------------------------------
# 6. Ensure data directory exists
# -------------------------------------------------------------------
mkdir -p data
echo -e "${GREEN}✅ data/ directory ready${NC}"
echo ""

# -------------------------------------------------------------------
# 7. Set executable flag on this script
# -------------------------------------------------------------------
chmod +x "$0"

# -------------------------------------------------------------------
# 8. PM2 Setup
# -------------------------------------------------------------------
echo -e "${GOLD}🚀 Setting up PM2...${NC}"

# Stop existing instance if running
pm2 stop ramadanflow 2>/dev/null || true
pm2 delete ramadanflow 2>/dev/null || true

# Start fresh
pm2 start server.js --name ramadanflow
pm2 save

# Generate startup script (auto-start on boot)
echo ""
echo -e "${GOLD}⚙️  Generating PM2 startup script...${NC}"
echo "   You may be prompted for your password."
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || pm2 startup 2>/dev/null || echo -e "${RED}   ⚠️  Could not auto-generate startup. Run: pm2 startup${NC}"
pm2 save
echo -e "${GREEN}✅ PM2 configured — RamadanFlow will auto-start on boot${NC}"
echo ""

# -------------------------------------------------------------------
# 9. DuckDNS Helper (optional)
# -------------------------------------------------------------------
echo -e "${GOLD}🦆 DuckDNS Setup (optional)${NC}"
echo "   Skip? Press Enter without typing."
echo ""

read -p "   DuckDNS subdomain (e.g. myfamily): " DUCK_SUB
if [ -n "$DUCK_SUB" ]; then
    read -p "   DuckDNS token: " DUCK_TOKEN
    if [ -n "$DUCK_TOKEN" ]; then
        # Create update script
        cat > ~/duckdns-update.sh << EOF
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=$DUCK_SUB&token=$DUCK_TOKEN&ip=" | curl -k -o ~/duckdns.log -K -
EOF
        chmod +x ~/duckdns-update.sh

        # Add cron job (every 5 minutes)
        CRON_LINE="*/5 * * * * ~/duckdns-update.sh >/dev/null 2>&1"
        (crontab -l 2>/dev/null | grep -v "duckdns-update"; echo "$CRON_LINE") | crontab -
        echo -e "${GREEN}✅ DuckDNS cron installed — updates every 5 min${NC}"
        echo "   Testing..."
        ~/duckdns-update.sh
        echo -e "   Log: $(cat ~/duckdns.log)"
    fi
else
    echo "   Skipped."
fi
echo ""

# -------------------------------------------------------------------
# 10. Done
# -------------------------------------------------------------------
echo "─────────────────────────────────────────"
echo -e "${GREEN}🕌 RamadanFlow v3.RC1 is deployed!${NC}"
echo ""
echo "   Status:  pm2 status"
echo "   Logs:    pm2 logs ramadanflow"
echo "   Restart: pm2 restart ramadanflow"
echo "   Stop:    pm2 stop ramadanflow"
echo ""
IP=$(hostname -I | awk '{print $1}')
echo -e "   Local:   http://${IP}:3000"
if [ -n "$DUCK_SUB" ]; then
    echo -e "   DuckDNS: https://${DUCK_SUB}.duckdns.org"
fi
echo ""
