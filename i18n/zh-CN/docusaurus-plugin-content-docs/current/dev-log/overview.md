# 开发日志

本章节记录了 Mountify 从初始 MVP 到生产就绪平台的时间顺序开发过程。

---

## 版本时间线

| 版本 | 重点 | 状态 |
| ---- | ---- | ---- |
| [1.0](./v1-foundation) | 基础（API、路由、购物车） | ✅ 完成 |
| [2.0](./v2-database-payments) | 数据库 & Stripe | ✅ 完成 |
| [3.0](./v3-ui-security) | UI/UX & 安全 | ✅ 完成 |
| [4.0](./v4-auth-redis) | 认证 & Redis | ✅ MVP |
| [5.0](./v5-admin-features) | 后台 & 功能 | ✅ 完成 |
| [6.0](./v6-shipping) | 物流集成 | ✅ 完成 |

---

## MVP 里程碑

**版本 4.0** 标志着最小可行产品：

- ✅ 用户认证
- ✅ 数据库驱动的商品
- ✅ Stripe 支付
- ✅ 订单历史

之后的一切都是增强。

---

## 架构演进

```
v1: 硬编码 JSON → React 状态
              ↓
v2: PostgreSQL → API → Stripe → Webhooks
              ↓
v3: 设计系统 → 价格验证
              ↓
v4: NextAuth → Redis 缓存 → 限流  ← MVP
              ↓
v5: 管理面板 → OAuth → 搜索 → 邮件
              ↓
v6: 17track → 发货通知
```

---

## 快速链接

### 核心概念

- [v1: API 路由 & 动态路由](./v1-foundation#1a---api-routes)
- [v1: 购物车上下文](./v1-foundation#1c---cart-context)
- [v2: 数据库连接](./v2-database-payments#2a---postgresql-integration)
- [v2: Stripe Webhooks](./v2-database-payments#2e---webhook-integration)

### 安全

- [v3: 价格验证](./v3-ui-security#3b---price-validation)
- [v4: JWT 认证](./v4-auth-redis#4a---nextauth-integration)
- [v4: 限流](./v4-auth-redis#4d---rate-limiting)
- [v5: 密码重置](./v5-admin-features#5e---password-reset)

### 性能

- [v4: Redis 缓存](./v4-auth-redis#4c---redis-caching)
- [v6: 渐进式轮询](./v6-shipping#6f---progressive-polling-optimization)

### 功能

- [v5: 管理面板](./v5-admin-features#5a---admin-panel)
- [v5: Google OAuth](./v5-admin-features#5b---google-oauth)
- [v5: 库存管理](./v5-admin-features#5g---inventory-management)
- [v6: 物流追踪](./v6-shipping#6a---17track-integration)

---

## 技术栈演进

| 版本 | 新增 |
| ---- | ---- |
| v1 | Next.js、React、TypeScript |
| v2 | PostgreSQL (Neon)、Stripe |
| v3 | Tailwind CSS、CSS 变量 |
| v4 | NextAuth、bcrypt、Redis (Upstash) |
| v5 | Cloudinary、Resend、Google OAuth |
| v6 | 17track API |

---

## 经验教训

### 1. 从简单开始，迭代优化

v1 是硬编码 JSON。到 v6，它是一个生产平台。每个版本只添加一个概念。

### 2. 安全是迭代的

v2 有价格篡改漏洞。v3 修复了它。始终审计之前的假设。

### 3. 用户体验驱动架构

v6 的渐进式轮询技术上不优雅，但实现了 95% 的成功率。UX 获胜。

### 4. 缓存失效很难

决定使用 TTL 过期 + 管理操作时显式失效。简单但有效。

### 5. 幂等性至关重要

Webhooks 可能多次触发。每次状态变更都使用标志或条件更新。
