---
slug: /
title: Mountify - 简介
hide_table_of_contents: true
---

<div align="center">

# 🏔️ Mountify

**基于 Next.js 构建的生产级电商平台**

[快速开始](./guide/getting-started) · [在线演示](https://demo.mountify.shop) · [GitHub](https://github.com/lhq5520/Mountify-Commerce)

</div>

---

## 为什么选择 Mountify？

> 从零开始构建，记录每一步。这不仅仅是代码——而是一段从 MVP 到生产环境的学习之旅。

| 你将理解的内容 | 技术实现 |
| -------------- | -------- |
| **身份认证** | NextAuth.js v5、JWT、bcrypt、Google OAuth |
| **支付系统** | Stripe Checkout、Webhooks、幂等性处理 |
| **性能优化** | Redis 缓存、查询速度提升 56 倍 |
| **安全防护** | 限流、输入验证、RBAC 权限控制 |
| **DevOps** | Docker、PM2、Vercel 部署 |

---

## 📚 文档导航

### 快速开始

> 配置开发环境并在本地运行。

- **[快速开始](./guide/getting-started)** — 克隆、配置、运行
- **[环境配置](./guide/getting-started#environment-setup)** — 必需的 API 密钥和服务

### 系统架构

> 理解系统设计和数据流。

- **[系统设计](./architecture/overview)** — 高层架构概览
- **[数据库设计](./modules/database)** — 表结构、关系、索引

### 功能模块

> 深入了解每个功能模块。

| 模块 | 描述 |
| ---- | ---- |
| [身份认证](./modules/authentication) | NextAuth、JWT、OAuth、密码重置 |
| [支付系统](./modules/payments) | Stripe 集成、Webhook 处理 |
| [缓存策略](./modules/caching) | Redis 策略、缓存失效 |
| [安全机制](./modules/security) | 纵深防御、限流 |
| [UI/UX](./modules/ui-design) | 设计系统、组件 |

### 部署指南

> 三种生产环境部署方式。

| 方式 | 适用场景 | 指南 |
| ---- | -------- | ---- |
| ⚡ Vercel | 零配置、即时部署 | [部署 →](./deploy/vercel) |
| 🐳 Docker | 完全控制、环境一致 | [部署 →](./deploy/docker) |
| 📦 PM2 | 简单 VPS、无需容器 | [部署 →](./deploy/pm2) |

### 开发日志

> 版本迭代开发记录。

```
v1.0  基础搭建      API 路由、购物车上下文
v2.0  数据库        PostgreSQL、Stripe Webhooks
v3.0  UI/UX        设计系统、价格验证
v4.0  认证与缓存    NextAuth、Redis 缓存 ← MVP
v5.0  后台管理      管理面板、OAuth、搜索
v6.0  物流追踪      物流追踪集成
```

[查看完整日志 →](./dev-log/overview)

---

## 🛠️ 技术栈

```
前端         Next.js 16 · React 18 · TypeScript · Tailwind CSS
后端         API Routes · NextAuth.js v5 · Edge Middleware
数据库       PostgreSQL (Neon) · Redis (Upstash)
第三方服务   Stripe · Cloudinary · Resend · Google OAuth
```

---

## ⚡ 快速开始

```bash
git clone https://github.com/lhq5520/Mountify-Commerce.git
cd Mountify-Commerce
npm install
mkdir .env.local -> 手动配置 .env.local
npm run dev
```

:::tip 测试支付
使用测试卡号 `4242 4242 4242 4242`，任意未来日期和 CVC。
:::

---

## 📊 性能指标

| 指标 | 优化前 | 优化后 | 提升 |
| ---- | ------ | ------ | ---- |
| 商品列表 API | 450ms | 8ms | **快 56 倍** |
| 支付成功率 | 70% | 95% | **+25%** |

---

## 🎯 设计原则

:::info 1. 安全优先
服务端价格验证。bcrypt 密码加密。参数化 SQL 查询。敏感接口限流保护。
:::

:::info 2. 渐进式增强
先实现 MVP（v4.0），再逐步增强。每个版本只添加一个概念。尽早发布，快速迭代。
:::

:::info 3. 纵深防御
`TypeScript → API 验证 → 数据库约束`  
一层失效，其他层兜底。
:::

---

<div align="center">

**准备好开始了吗？**

[**快速开始 →**](./guide/getting-started)

</div>
