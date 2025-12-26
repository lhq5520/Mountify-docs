# Deploy with PM2

> **Recommended for:** Simple VPS deployment without containerization

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Ubuntu)                        │
│                                                             │
│   ┌──────────────────┐                                      │
│   │      Nginx       │◀──── HTTPS (443)                     │
│   │  (Reverse Proxy) │                                      │
│   └────────┬─────────┘                                      │
│            │ proxy_pass :3000                               │
│            ▼                                                │
│   ┌──────────────────┐                                      │
│   │       PM2        │                                      │
│   │  (Process Mgr)   │                                      │
│   └────────┬─────────┘                                      │
│            │                                                │
│            ▼                                                │
│   ┌──────────────────┐                                      │
│   │    Next.js       │                                      │
│   │   (Node.js)      │                                      │
│   └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- VPS with Ubuntu 20.04+
- Domain name pointing to VPS IP
- Node.js 20+ installed

---

## Step-by-Step Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Verify
node --version
pm2 --version
nginx -v
```

### 2. Clone Repository

```bash
mkdir -p /var/www/mountify
cd /var/www/mountify
git clone https://github.com/yourusername/mountify.git .
```

### 3. Install Dependencies & Build

```bash
# Install dependencies
npm ci

# Create production env file
nano .env.production
```

**.env.production:**

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# Auth
AUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."

# Redis
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Email
RESEND_API_KEY="re_..."

# Images
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

```bash
# Build the application
npm run build
```

### 4. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "mountify",
      script: "npm",
      args: "start",
      cwd: "/var/www/mountify",
      instances: "max", // Use all CPU cores
      exec_mode: "cluster", // Cluster mode for load balancing
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      // Logging
      error_file: "/var/log/pm2/mountify-error.log",
      out_file: "/var/log/pm2/mountify-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
```

Create log directory:

```bash
sudo mkdir -p /var/log/pm2
sudo chown $USER:$USER /var/log/pm2
```

### 5. Start Application with PM2

```bash
# Start with ecosystem config
pm2 start ecosystem.config.js --env production

# Save PM2 process list (survives reboot)
pm2 save

# Setup PM2 startup script
pm2 startup
# Run the command it outputs (sudo env PATH=...)
```

### 6. SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### 7. Nginx Configuration

Create `/etc/nginx/sites-available/mountify`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }

    location /public {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=86400";
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mountify /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## Common Commands

### PM2 Management

```bash
# View status
pm2 status

# View logs
pm2 logs mountify

# Restart
pm2 restart mountify

# Stop
pm2 stop mountify

# Delete from PM2
pm2 delete mountify

# Monitor (live dashboard)
pm2 monit
```

### Update Application

```bash
cd /var/www/mountify

# Pull latest code
git pull origin main

# Install new dependencies (if any)
npm ci

# Rebuild
npm run build

# Restart PM2 (zero-downtime reload)
pm2 reload mountify
```

---

## Deploy Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

cd /var/www/mountify

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Reloading PM2..."
pm2 reload mountify

echo "Deployment complete!"
```

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## CI/CD (Optional)

### .github/workflows/deploy.yml

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /var/www/mountify
            git pull origin main
            npm ci
            npm run build
            pm2 reload mountify
```

---

## Pros & Cons

| Pros                    | Cons                                |
| ----------------------- | ----------------------------------- |
| ✅ Simple setup         | ❌ No containerization              |
| ✅ Low overhead         | ❌ Node version tied to host        |
| ✅ Easy debugging       | ❌ Manual dependency management     |
| ✅ Built-in clustering  | ❌ Less isolation                   |
| ✅ Zero-downtime reload | ❌ Environment differences possible |

---

## PM2 vs Docker

| Aspect                  | PM2            | Docker             |
| ----------------------- | -------------- | ------------------ |
| Setup complexity        | Lower          | Higher             |
| Resource usage          | Lower          | Slightly higher    |
| Environment consistency | Host-dependent | Guaranteed         |
| Scaling                 | Single server  | Multi-server ready |
| Rollback                | Git-based      | Image-based        |
