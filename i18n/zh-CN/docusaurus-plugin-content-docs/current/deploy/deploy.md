# 线上演示与部署

## 🌐 线上演示

**生产环境 URL：** [https://demo.mountify.shop](https://demo.mountify.shop)

### 测试账号

| 角色 | 邮箱 | 密码 |
| ---- | ---- | ---- |
| 普通用户 | `demo@example.com` | `demo123` |
| 管理员 | `按需申请` | `按需申请` |

### 测试支付

使用 Stripe 测试卡：`4242 4242 4242 4242`

- 过期日期：任意未来日期
- CVC：任意 3 位数字

---

## 🏗️ 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Ubuntu)                        │
│                                                             │
│   ┌──────────────────┐                                      │
│   │      Nginx       │◀──── HTTPS (443)                    │
│   │  (主机服务)       │                                      │
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

**流量路径：**

```
用户 → HTTPS (443) → Nginx → localhost:3000 → Docker (3000) → Next.js
```

---

## 📦 Docker 配置

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
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
```

---

## 🔧 Nginx 配置

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name mountify.yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS 服务器
server {
    listen 443 ssl http2;
    server_name mountify.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/mountify.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mountify.yourdomain.com/privkey.pem;

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

    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }
}
```

---

## 🚀 部署命令

```bash
# 克隆仓库
git clone https://github.com/yourusername/mountify.git
cd mountify

# 创建环境变量文件
cp .env.example .env.production
nano .env.production

# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f web

# 重启
docker compose restart web

# 停止
docker compose down
```

---

## 📋 部署检查清单

- [ ] 环境变量已配置
- [ ] 数据库已迁移
- [ ] SSL 证书已安装
- [ ] Nginx 配置正确
- [ ] Stripe Webhook 已设置
- [ ] Google OAuth 回调 URL 已更新
- [ ] 域名 DNS 已配置
