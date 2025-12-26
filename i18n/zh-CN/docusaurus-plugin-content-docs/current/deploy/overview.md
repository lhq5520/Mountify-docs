# 部署指南

选择最适合你需求的部署方式。

---

## 部署选项

| 方式 | 难度 | 成本 | 适用场景 |
| ---- | ---- | ---- | -------- |
| [Vercel](./vercel) | ⭐ 简单 | 免费 - $20/月 | 快速上线，无需 DevOps |
| [Docker](./docker) | ⭐⭐⭐ 进阶 | ~$6/月 VPS | 完全控制，环境一致 |
| [PM2](./pm2) | ⭐⭐ 中等 | ~$6/月 VPS | 简单 VPS，无需容器 |

---

## 快速对比

### 配置时间

```
Vercel:  ████░░░░░░  ~5 分钟
PM2:     ██████░░░░  ~30 分钟
Docker:  ████████░░  ~1 小时
```

### 控制度 vs 便捷度

```
                    更多控制
                         ▲
                         │
              Docker ────┼──── 更多工作量
                         │
                PM2 ─────┤
                         │
             Vercel ─────┼──── 更少工作量
                         │
                         ▼
                    更便捷
```

---

## 决策指南

### 选择 Vercel 如果：

- ✅ 你想要最快的部署速度
- ✅ 你不想管理服务器
- ✅ 你的应用符合 serverless 约束
- ✅ 你需要自动扩容
- ✅ 预览部署很重要

### 选择 Docker 如果：

- ✅ 你需要完全控制基础设施
- ✅ 你想要一致的环境（开发 = 生产）
- ✅ 你计划扩展到多台服务器
- ✅ 你需要自定义服务器配置
- ✅ 你想避免厂商锁定

### 选择 PM2 如果：

- ✅ 你有一台简单的 VPS
- ✅ 你不需要容器化
- ✅ 你想要最小开销
- ✅ 你熟悉 Node.js
- ✅ 你想要简单的调试

---

## 外部服务（所有方式通用）

无论选择哪种部署方式，你都需要：

| 服务 | 用途 | 免费额度 |
| ---- | ---- | -------- |
| [Neon](https://neon.tech) | PostgreSQL | ✅ 慷慨 |
| [Upstash](https://upstash.com) | Redis | ✅ 每天 10K 命令 |
| [Stripe](https://stripe.com) | 支付 | 按交易收费 |
| [Resend](https://resend.com) | 邮件 | ✅ 每天 100 封 |
| [Cloudinary](https://cloudinary.com) | 图片 | ✅ 25K 转换 |
| [Google Cloud](https://console.cloud.google.com) | OAuth | ✅ 免费 |

---

## 环境变量

所有部署方式都需要这些环境变量：

```bash
# 数据库
DATABASE_URL="postgresql://..."

# 认证
AUTH_SECRET="..."
NEXTAUTH_URL="https://yourdomain.com"

# Stripe 支付
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."

# Redis 缓存
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# OAuth 登录
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# 邮件
RESEND_API_KEY="re_..."

# 图片
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

---

## 部署后检查清单

- [ ] 网站通过 HTTPS 加载
- [ ] 用户注册正常
- [ ] Google OAuth 正常
- [ ] 测试结账完成（使用 `4242 4242 4242 4242`）
- [ ] Webhook 接收事件（检查 Stripe 仪表盘）
- [ ] 管理面板可访问
- [ ] 邮件发送正常
- [ ] 图片从 Cloudinary 加载

---

## Stripe Webhook 配置

部署后，配置 Stripe webhook：

1. 前往 [Stripe 仪表盘](https://dashboard.stripe.com/webhooks)
2. 点击 **"添加端点"**
3. 输入 URL：`https://yourdomain.com/api/webhooks/stripe`
4. 选择事件：
   - `checkout.session.completed`
   - `checkout.session.expired`
5. 复制 webhook 签名密钥到环境变量

---

## Google OAuth 配置

1. 前往 [Google Cloud Console](https://console.cloud.google.com)
2. 创建或选择项目
3. 启用 "Google+ API"
4. 前往凭据 → 创建 OAuth 客户端 ID
5. 添加授权重定向 URI：
   - `https://yourdomain.com/api/auth/callback/google`
6. 复制客户端 ID 和密钥到环境变量

---

## 故障排查

### 常见问题

| 问题 | 原因 | 解决方案 |
| ---- | ---- | -------- |
| 500 错误 | 缺少环境变量 | 检查所有变量已设置 |
| OAuth 失败 | 重定向 URI 错误 | 更新 Google Console |
| 支付失败 | Webhook URL 错误 | 更新 Stripe 仪表盘 |
| 图片损坏 | Cloudinary 未配置 | 检查 cloud name |
| 认证循环 | NEXTAUTH_URL 不匹配 | 匹配实际域名 |

### 调试检查清单

```bash
# 1. 检查环境变量已加载
# 2. 检查数据库连接
# 3. 检查 Redis 连接
# 4. 检查 Stripe webhook 日志
# 5. 检查应用日志
```
