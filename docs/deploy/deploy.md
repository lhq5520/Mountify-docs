# Live Demo & Deployment

## 🌐 Live Demo

**Production URL:** [https://demo.mountify.shop](https://demo.mountify.shop)

### Test Accounts

| Role     | Email               | Password            |
| -------- | ------------------- | ------------------- |
| Customer | `demo@example.com`  | `demo123`           |
| Admin    | `request on demand` | `request on demand` |

### Test Payment

Use Stripe test card: `4242 4242 4242 4242`

- Expiry: Any future date
- CVC: Any 3 digits

---

## 🏗️ Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Ubuntu)                        │
│                                                             │
│   ┌──────────────────┐                                      │
│   │      Nginx       │◀──── HTTPS (443)                    │
│   │  (Host Service)  │                                      │
│   └────────┬─────────┘                                      │
│            │ proxy_pass :3000                               │
│            ▼                                                │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   Docker Engine                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │           mountify_web                      │   │   │
│   │   │           (Next.js)                         │   │   │
│   │   │           Port 3000 → 3000                  │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐      ┌─────────────┐
    │ PostgreSQL  │      │    Redis    │
    │   (Neon)    │      │  (Upstash)  │
    └─────────────┘      └─────────────┘
```

**Traffic Flow:**

```
User → HTTPS (443) → Nginx → localhost:3000 → Docker (3000) → Next.js
```

---

## 📦 Docker Setup

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
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
```

**Note:**

- Port `3000` is mapped to `3000` inside the container.
- Environment variables are loaded from the `.env.production` file.
- `restart: unless-stopped` ensures the container automatically restarts if it crashes.

---

## 🔧 Nginx Configuration (Host)

Nginx is installed directly on the VPS (not in Docker) and acts as a reverse proxy to the container's port 3000.

### /etc/nginx/sites-available/mountify

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name mountify.yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name mountify.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/mountify.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mountify.yourdomain.com/privkey.pem;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

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

    # Static files caching
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }
}
```

### Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/mountify /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🚀 Deployment Steps

### 1. VPS Setup

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

# Verify installation
docker --version
docker compose version
nginx -v
```

### 2. Clone Repository

```bash
# Create app directory
mkdir -p /var/www/mountify
cd /var/www/mountify

# Clone your repo
git clone https://github.com/yourusername/mountify.git .
```

### 3. Environment Configuration

```bash
# Create production env file
nano .env.production
```

**.env.production contents:**

```bash
# Database (Neon)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Auth
AUTH_SECRET="your-super-secret-key-min-32-chars"
NEXTAUTH_URL="https://mountify.yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Email (Resend)
RESEND_API_KEY="re_..."

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

### 4. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d mountify.yourdomain.com

# Auto-renew (already configured by certbot)
sudo systemctl status certbot.timer
```

### 5. Configure Nginx

```bash
# Create site config
sudo nano /etc/nginx/sites-available/mountify

# (Paste the nginx config from above)

# Enable site
sudo ln -s /etc/nginx/sites-available/mountify /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Build and Deploy

```bash
cd /var/www/mountify

# Build and start container
docker compose up -d --build

# Check logs
docker compose logs -f

# Verify container running
docker compose ps
```

---

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database migrations run
- [ ] SSL certificate obtained
- [ ] Domain DNS pointing to VPS IP

### Post-Deployment

- [ ] Site loads over HTTPS
- [ ] User registration works
- [ ] Google OAuth works
- [ ] Test checkout completes
- [ ] Webhook receives events
- [ ] Admin panel accessible
- [ ] Emails sending correctly

---

## 🔄 CI/CD with GitHub Actions

### .github/workflows/deploy.yml

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
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

### GitHub Secrets Required

| Secret        | Description                 |
| ------------- | --------------------------- |
| `VPS_HOST`    | VPS IP address              |
| `VPS_USER`    | SSH username (e.g., `root`) |
| `VPS_SSH_KEY` | Private SSH key             |

### Setup Stripe Webhook

```bash
# In Stripe Dashboard:
# 1. Go to Developers → Webhooks
# 2. Add endpoint: https://mountify.yourdomain.com/api/webhooks/stripe
# 3. Select events:
#    - checkout.session.completed
#    - checkout.session.expired
# 4. Copy webhook signing secret to .env.production
```

---

## 🛠️ Common Commands

### Container Management

```bash
# View running containers
docker compose ps

# View logs
docker compose logs -f web

# Restart app
docker compose restart web

# Rebuild and restart
docker compose up -d --build

# Stop
docker compose down

# Stop and remove volumes
docker compose down -v
```

### Maintenance

```bash
# Update app
cd /var/www/mountify
git pull origin main
docker compose up -d --build

# Renew SSL (certbot handles this automatically)
sudo certbot renew

# Reload nginx after config change
sudo nginx -t && sudo systemctl reload nginx

# Clean up Docker
docker system prune -af
docker volume prune -f
```

### Debugging

```bash
# Enter container shell
docker compose exec web sh

# Check app is responding
curl http://localhost:3000

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Check container logs
docker logs mountify_web --tail 100
```

---

## 📊 Monitoring

### Health Check Endpoint

**File:** `src/app/api/health/route.ts`

```typescript
export async function GET() {
  try {
    // Test database connection
    await query("SELECT 1");

    // Test Redis connection
    await redis.ping();

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        redis: "connected",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: "unhealthy", error: error.message },
      { status: 503 }
    );
  }
}
```

### Simple Uptime Monitoring

```bash
# Add to crontab (crontab -e)
*/5 * * * * curl -sf http://localhost:3000 > /dev/null || echo "Mountify down" | mail -s "Alert" you@email.com
```

Or use external services like UptimeRobot (free tier available).

---

## 🔒 Security Hardening

### Firewall (UFW)

```bash
# Enable firewall
sudo ufw enable

# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP (redirect)
sudo ufw allow 443   # HTTPS

# Check status
sudo ufw status
```

### Fail2Ban (SSH Protection)

```bash
# Install
sudo apt install fail2ban -y

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Docker Security

Security measures already implemented in the Dockerfile:

```dockerfile
# Non-root user
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
USER nextjs
```

| Measure           | Description                                              |
| ----------------- | ------------------------------------------------------- |
| Non-root user     | Runs the container as the `nextjs` user, not root       |
| Minimal image     | Uses Alpine as the base image to reduce attack surface  |
| Multi-stage build | Final image excludes build tools for smaller footprint  |

---

## 📈 Performance

### Build Size

| Component        | Size   |
| ---------------- | ------ |
| Docker Image     | ~200MB |
| .next/standalone | ~50MB  |
| Static Assets    | ~10MB  |

### Response Times (Cached)

| Endpoint       | Time   |
| -------------- | ------ |
| Homepage       | ~50ms  |
| Product List   | ~80ms  |
| Product Detail | ~60ms  |
| Checkout       | ~200ms |

---

## 🌍 Infrastructure Costs

| Service             | Tier          | Cost/Month    |
| ------------------- | ------------- | ------------- |
| VPS (DigitalOcean)  | Basic Droplet | $6            |
| PostgreSQL (Neon)   | Free          | $0            |
| Redis (Upstash)     | Free          | $0            |
| Domain              | .com          | ~$1           |
| SSL (Let's Encrypt) | Free          | $0            |
| **Total**           |               | **~$7/month** |

---

## 🔗 External Services Setup

### Neon (PostgreSQL)

1. Create account at [neon.tech](https://neon.tech)
2. Create new project
3. Copy connection string to `DATABASE_URL`

### Upstash (Redis)

1. Create account at [upstash.com](https://upstash.com)
2. Create new Redis database
3. Copy REST URL and token to `.env`

### Stripe

1. Create account at [stripe.com](https://stripe.com)
2. Get API keys from Dashboard → Developers
3. Configure webhook endpoint

### Resend (Email)

1. Create account at [resend.com](https://resend.com)
2. Verify domain or use their test domain
3. Get API key

### Cloudinary (Images)

1. Create account at [cloudinary.com](https://cloudinary.com)
2. Get cloud name, API key, and secret from Dashboard
