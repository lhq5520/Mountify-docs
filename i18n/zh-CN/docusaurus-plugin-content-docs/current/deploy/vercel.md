# Vercel 部署

> **推荐场景：** 最快部署，零服务器管理

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel Edge                          │
│                                                             │
│   ┌──────────────────┐    ┌──────────────────┐              │
│   │   Edge Network   │    │  Serverless Fns  │              │
│   │   (CDN + SSL)    │    │  (API 路由)      │              │
│   └────────┬─────────┘    └────────┬─────────┘              │
│            │                       │                        │
│            └───────────┬───────────┘                        │
│                        │                                    │
│                        ▼                                    │
│              ┌──────────────────┐                           │
│              │    Next.js App   │                           │
│              │  (自动部署)       │                           │
│              └──────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐      ┌─────────────┐
    │ PostgreSQL  │      │    Redis    │
    │   (Neon)    │      │  (Upstash)  │
    └─────────────┘      └─────────────┘
```

---

## 前置要求

- GitHub/GitLab/Bitbucket 账号
- Vercel 账号（有免费套餐）
- 包含 Next.js 项目的仓库

---

## 部署步骤

### 1. 连接仓库

1. 访问 [vercel.com](https://vercel.com) 并登录
2. 点击 **"Add New Project"**
3. 导入你的 Git 仓库
4. 选择包含 Mountify 的仓库

### 2. 配置项目

**框架预设：** Next.js（自动检测）

**构建设置：**

```
Build Command: npm run build
Output Directory: .next
Install Command: npm ci
```

### 3. 环境变量

在 Vercel 仪表盘添加所有环境变量：

| 变量 | 值 |
| ---- | -- |
| `DATABASE_URL` | `postgresql://...` |
| `AUTH_SECRET` | `你的密钥` |
| `NEXTAUTH_URL` | `https://your-project.vercel.app` |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `UPSTASH_REDIS_REST_URL` | `https://...` |
| `UPSTASH_REDIS_REST_TOKEN` | `...` |
| `GOOGLE_CLIENT_ID` | `...` |
| `GOOGLE_CLIENT_SECRET` | `...` |
| `RESEND_API_KEY` | `re_...` |
| `CLOUDINARY_CLOUD_NAME` | `...` |
| `CLOUDINARY_API_KEY` | `...` |
| `CLOUDINARY_API_SECRET` | `...` |

> **提示：** 使用"Add from .env"按钮可以粘贴整个 `.env.production` 文件

### 4. 部署

点击 **"Deploy"** 等待构建完成。

你的应用现在上线了：`https://your-project.vercel.app`

---

## 自定义域名

### 1. 在 Vercel 添加域名

1. 前往 Project Settings → Domains
2. 添加你的域名：`yourdomain.com`
3. Vercel 会显示需要配置的 DNS 记录

### 2. 配置 DNS

在域名注册商添加以下记录：

| 类型 | 名称 | 值 |
| ---- | ---- | -- |
| A | @ | `76.76.21.21` |
| CNAME | www | `cname.vercel-dns.com` |

### 3. 更新环境变量

更新 `NEXTAUTH_URL` 为你的自定义域名：

```
NEXTAUTH_URL=https://yourdomain.com
```

### 4. 更新 OAuth 重定向 URI

在 Google Cloud Console 添加：

- `https://yourdomain.com/api/auth/callback/google`

### 5. 更新 Stripe Webhook

在 Stripe 仪表盘更新 webhook 端点：

- `https://yourdomain.com/api/webhooks/stripe`

---

## Vercel 配置

### vercel.json（可选）

```json
{
  "framework": "nextjs",
  "regions": ["sfo1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/home",
      "destination": "/",
      "permanent": true
    }
  ]
}
```

### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  // 可选：减少冷启动时间
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
```

---

## 自动部署

Vercel 自动部署：

| 触发器 | 环境 |
| ------ | ---- |
| Push 到 `main` | 生产 |
| Push 到其他分支 | 预览 |
| Pull Request | 预览 |

### 预览部署

每个 PR 都有唯一的预览 URL：

```
https://mountify-git-feature-branch-username.vercel.app
```

---

## 按分支设置环境变量

为不同环境设置不同变量：

| 变量 | 生产 | 预览 | 开发 |
| ---- | ---- | ---- | ---- |
| `NEXTAUTH_URL` | `https://yourdomain.com` | `https://preview.vercel.app` | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | `sk_live_...` | `sk_test_...` | `sk_test_...` |

---

## Vercel CLI（可选）

### 安装

```bash
npm i -g vercel
```

### 命令

```bash
# 登录
vercel login

# 部署预览
vercel

# 部署生产
vercel --prod

# 拉取环境变量到本地
vercel env pull .env.local

# 查看日志
vercel logs your-project.vercel.app
```

---

## 监控

### 内置分析

在 Project Settings → Analytics 启用

追踪：

- Web Vitals（LCP、FID、CLS）
- 页面浏览量
- 独立访客

### 日志

查看实时日志：

1. 前往 Project → Deployments
2. 点击部署
3. 查看"Functions"标签获取 API 日志

---

## Serverless 函数限制

| 资源 | Hobby（免费） | Pro |
| ---- | ------------- | --- |
| 执行超时 | 10s | 60s |
| 内存 | 1024 MB | 3008 MB |
| 每日部署 | 100 | 无限 |
| 带宽 | 100 GB | 1 TB |

### 处理长时间操作

对于超时的操作：

```typescript
// 使用流式响应
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 分块处理
      for (const chunk of data) {
        controller.enqueue(encoder.encode(JSON.stringify(chunk)));
      }
      controller.close();
    },
  });

  return new Response(stream);
}
```

---

## 故障排查

### 构建失败

```bash
# 在 Vercel 仪表盘检查构建日志
# 常见问题：

# 1. 缺少环境变量
Error: DATABASE_URL is not defined

# 2. TypeScript 错误
Type error: Property 'x' does not exist

# 3. ESLint 错误
npm run lint -- --fix
```

### 函数错误

```bash
# 检查函数日志
# 常见问题：

# 1. 超时（增加或优化）
# 2. 内存超限
# 3. 冷启动延迟（尽可能使用 edge runtime）
```

### 数据库连接问题

```javascript
// 使用连接池适配 serverless
// Neon 原生支持 ?sslmode=require
DATABASE_URL = "postgresql://...?sslmode=require&pgbouncer=true";
```

---

## 优缺点

| 优点 | 缺点 |
| ---- | ---- |
| ✅ 零配置 | ❌ 厂商锁定 |
| ✅ 自动 SSL | ❌ 函数超时限制 |
| ✅ 全球 CDN | ❌ 冷启动 |
| ✅ 预览部署 | ❌ 规模化定价 |
| ✅ 内置分析 | ❌ 控制有限 |
| ✅ 自动扩容 | ❌ 无持久存储 |

---

## 成本对比

| 套餐 | 价格 | 适合 |
| ---- | ---- | ---- |
| Hobby | 免费 | 个人项目 |
| Pro | $20/月 | 生产应用 |
| Enterprise | 定制 | 大型团队 |

### 免费套餐包含

- 无限部署
- 100 GB 带宽/月
- SSL 证书
- 预览部署
- 基础分析

---

## Vercel vs 自托管

| 方面 | Vercel | 自托管（Docker/PM2） |
| ---- | ------ | -------------------- |
| 配置时间 | 5 分钟 | 1-2 小时 |
| 维护 | 无 | 定期更新 |
| 扩展 | 自动 | 手动 |
| 成本（低流量） | 免费 | ~$5-10/月 |
| 成本（高流量） | $20+/月 | 固定服务器成本 |
| 控制 | 有限 | 完全 |
| 冷启动 | 有 | 无 |
