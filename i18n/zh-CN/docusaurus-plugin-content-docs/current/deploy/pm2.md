# PM2 部署

> **推荐场景：** 简单 VPS 部署，无需容器化

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Ubuntu)                        │
│                                                             │
│   ┌──────────────────┐                                      │
│   │      Nginx       │◀──── HTTPS (443)                     │
│   │  (反向代理)       │                                      │
│   └────────┬─────────┘                                      │
│            │ proxy_pass :3000                               │
│            ▼                                                │
│   ┌──────────────────┐                                      │
│   │       PM2        │                                      │
│   │  (进程管理器)     │                                      │
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

## 前置要求

- 运行 Ubuntu 20.04+ 的 VPS
- 域名已解析到 VPS IP
- 已安装 Node.js 20+

---

## 部署步骤

### 1. 服务器配置

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 全局安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt install nginx -y

# 验证
node --version
pm2 --version
nginx -v
```

### 2. 克隆仓库

```bash
mkdir -p /var/www/mountify
cd /var/www/mountify
git clone https://github.com/yourusername/mountify.git .
```

### 3. 安装依赖并构建

```bash
# 安装依赖
npm ci

# 创建生产环境配置文件
nano .env.production
```

**.env.production：**

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

```bash
# 构建应用
npm run build
```

### 4. PM2 配置

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [
    {
      name: "mountify",
      script: "npm",
      args: "start",
      cwd: "/var/www/mountify",
      instances: "max", // 使用所有 CPU 核心
      exec_mode: "cluster", // 集群模式负载均衡
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // 崩溃后自动重启
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      // 日志
      error_file: "/var/log/pm2/mountify-error.log",
      out_file: "/var/log/pm2/mountify-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
```

创建日志目录：

```bash
sudo mkdir -p /var/log/pm2
sudo chown $USER:$USER /var/log/pm2
```

### 5. 使用 PM2 启动应用

```bash
# 使用 ecosystem 配置启动
pm2 start ecosystem.config.js --env production

# 保存 PM2 进程列表（重启后保持）
pm2 save

# 设置 PM2 开机启动脚本
pm2 startup
# 运行它输出的命令（sudo env PATH=...）
```

### 6. SSL 证书

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### 7. Nginx 配置

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

    # Gzip 压缩
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

    # 缓存静态资源
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

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/mountify /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 常用命令

### PM2 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs mountify

# 重启
pm2 restart mountify

# 停止
pm2 stop mountify

# 从 PM2 删除
pm2 delete mountify

# 监控（实时仪表盘）
pm2 monit
```

### 更新应用

```bash
cd /var/www/mountify

# 拉取最新代码
git pull origin main

# 安装新依赖（如果有）
npm ci

# 重新构建
npm run build

# 重载 PM2（零停机）
pm2 reload mountify
```

---

## 部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash
set -e

cd /var/www/mountify

echo "拉取最新代码..."
git pull origin main

echo "安装依赖..."
npm ci

echo "构建..."
npm run build

echo "重载 PM2..."
pm2 reload mountify

echo "部署完成！"
```

```bash
chmod +x deploy.sh
./deploy.sh
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
            npm ci
            npm run build
            pm2 reload mountify
```

---

## 优缺点

| 优点 | 缺点 |
| ---- | ---- |
| ✅ 配置简单 | ❌ 无容器化 |
| ✅ 开销低 | ❌ Node 版本依赖主机 |
| ✅ 调试方便 | ❌ 手动管理依赖 |
| ✅ 内置集群 | ❌ 隔离性较差 |
| ✅ 零停机重载 | ❌ 环境可能有差异 |

---

## PM2 vs Docker

| 方面 | PM2 | Docker |
| ---- | --- | ------ |
| 配置复杂度 | 低 | 高 |
| 资源占用 | 低 | 略高 |
| 环境一致性 | 依赖主机 | 保证一致 |
| 扩展性 | 单服务器 | 多服务器就绪 |
| 回滚 | 基于 Git | 基于镜像 |
