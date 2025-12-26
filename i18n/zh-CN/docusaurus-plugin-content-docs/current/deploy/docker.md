# Docker 部署

> **推荐场景：** 自托管 VPS，完全控制基础设施

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Ubuntu)                        │
│                                                             │
│   ┌──────────────────┐                                      │
│   │      Nginx       │◀──── HTTPS (443)                    │
│   │  (主机服务)       │                                      │
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

## 前置要求

- 运行 Ubuntu 20.04+ 的 VPS（DigitalOcean、Vultr、Linode 等）
- 域名已解析到 VPS IP
- SSH 访问服务器

---

## Docker 配置

### Dockerfile

```dockerfile
# ---- 阶段 1：依赖 ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 阶段 2：构建 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 阶段 3：运行 ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户以提高安全性
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# 复制构建产物
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/next.config.* ./

# 修复缓存目录权限
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

## 部署步骤

### 1. 服务器配置

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo apt install docker-compose-plugin -y

# 安装 Nginx
sudo apt install nginx -y

# 验证
docker --version
docker compose version
nginx -v
```

### 2. 克隆仓库

```bash
mkdir -p /var/www/mountify
cd /var/www/mountify
git clone https://github.com/yourusername/mountify.git .
```

### 3. 环境配置

创建 `.env.production`：

```bash
# 数据库
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# 认证
AUTH_SECRET="使用 openssl rand -base64 32 生成"
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

# 邮件
RESEND_API_KEY="re_..."

# 图片
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

### 4. SSL 证书

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d yourdomain.com
```

### 5. Nginx 配置

创建 `/etc/nginx/sites-available/mountify`：

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

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/mountify /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 6. 构建并启动

```bash
cd /var/www/mountify
docker compose up -d --build
```

---

## 常用命令

```bash
# 查看日志
docker compose logs -f web

# 重启
docker compose restart web

# 代码更新后重新构建
docker compose up -d --build

# 停止
docker compose down

# 清理未使用的镜像
docker system prune -af
```

---

## CI/CD（可选）

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

## 优缺点

| 优点 | 缺点 |
| ---- | ---- |
| ✅ 完全控制 | ❌ 需要维护服务器 |
| ✅ 环境一致 | ❌ 手动扩容 |
| ✅ 易于回滚 | ❌ 需要管理 SSL |
| ✅ 离线可用 | ❌ 学习曲线较高 |
