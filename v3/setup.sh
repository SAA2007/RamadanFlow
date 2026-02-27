#!/bin/bash
# RamadanFlow automated setup script for Raspberry Pi
# Run this script inside the v3 directory: ./setup.sh

set -e

echo "======================================"
echo "🕌 RamadanFlow automated setup for Pi"
echo "======================================"
echo ""

# 1. Check for Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js via NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 22
    nvm use 22
else
    echo "✅ Node.js is already installed: $(node -v)"
fi

# 2. Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 2.5 Create SSL folder
mkdir -p ssl

# 3. Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "🔑 Generating secure .env file..."
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "PORT=3000" > .env
    echo "JWT_SECRET=$SECRET" >> .env
else
    echo "✅ .env file already exists."
fi

# 4. Install PM2 without sudo (works best for nvm users)
if ! command -v pm2 >/dev/null 2>&1; then
    echo "🚀 Installing PM2 process manager..."
    npm install -g pm2
else
    echo "✅ PM2 is already installed."
fi

# 5. Start app with PM2
echo "🔄 Starting RamadanFlow with PM2..."
pm2 start ecosystem.config.js || pm2 restart ecosystem.config.js

# 6. Save PM2 state
pm2 save

# 7. Configure PM2 to start on boot automatically
echo "⚙️ Configuring PM2 to start on boot..."
PM2_STARTUP_CMD=$(pm2 startup | tail -n 1)
if [[ "$PM2_STARTUP_CMD" == *"sudo env PATH"* ]]; then
    echo "Running PM2 startup script automatically..."
    eval "$PM2_STARTUP_CMD"
else
    echo "Could not auto-configure startup. Try running: pm2 startup"
fi

echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "RamadanFlow is now running in the background."
echo "URL: http://localhost:3000 (or your Pi's IP address)"
echo "======================================"
