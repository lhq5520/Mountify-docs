# Deploy with Docker

> **Recommended for:** Self-hosted VPS, full control over infrastructure

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Ubuntu)                        │
│                                                             │
│   ┌──────────────────┐                                      │
│   │      Nginx       │◀──── HTTPS (443)                    │
│   │  (Host Service)  │                                      │
│   └────────┬─────────┘                                      │
│            │ proxy_pass :3524                               │
│            ▼                                                │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   Docker Engine                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │           mountify_web                      │   │   │
│   │   │           (Next.js)                         │   │   │
│   │   │           Port 3000 → 3524                  │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- VPS with Ubuntu 20.04+ (DigitalOcean, Vultr, Linode, etc.)
- Domain name pointing to VPS IP
- SSH access to server

---

## Docker Configuration

### Dockerfile

```dockerfile
# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 3: Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# Copy build artifacts
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/next.config.* ./

# Fix cache directory permissions
RUN mkdir -p .next/cache/images && chown -R nextjs:nextjs .next

USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]
```

### docker-compose.yml

```yaml
services:
  web:
    build: .
    container_name: mountify_web
    ports:
      - "3524:3000"
    env_file:
      - .env.production
    restart: unless-stopped
```

---

## Step-by-Step Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Install Nginx
sudo apt install nginx -y

# Verify
docker --version
docker compose version
nginx -v
```

### 2. Clone Repository

```bash
mkdir -p /var/www/mountify
cd /var/www/mountify
git clone https://github.com/yourusername/mountify.git .
```

### 3. Environment Configuration

Create `.env.production`:

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

### 4. SSL Certificate

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d yourdomain.com
```

### 5. Nginx Configuration

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

    location / {
        proxy_pass http://127.0.0.1:3524;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /_next/static {
        proxy_pass http://127.0.0.1:3524;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mountify /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Build and Start

```bash
cd /var/www/mountify
docker compose up -d --build
```

---

## Common Commands

```bash
# View logs
docker compose logs -f web

# Restart
docker compose restart web

# Rebuild after code changes
docker compose up -d --build

# Stop
docker compose down

# Clean up unused images
docker system prune -af
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
            docker compose up -d --build
            docker system prune -f
```

---

## Pros & Cons

| Pros                      | Cons                           |
| ------------------------- | ------------------------------ |
| ✅ Full control           | ❌ Server maintenance required |
| ✅ Consistent environment | ❌ Manual scaling              |
| ✅ Easy rollback          | ❌ Need to manage SSL          |
| ✅ Works offline          | ❌ Higher learning curve       |
