---
slug: /
title: Mountify - Intro
hide_table_of_contents: true
---

<div align="center">

# 🏔️ Mountify

**A production-grade e-commerce platform built with Next.js**

[Get Started](./guide/getting-started) · [Live Demo](https://demo.mountify.shop) · [GitHub](https://github.com/lhq5520/Mountify-Commerce)

</div>

---

## Why Mountify?

> Built from scratch, documented every step. This isn't just code—it's a learning journey from MVP to production.

| What You'll understand | Implementation                            |
| ---------------------- | ----------------------------------------- |
| **Authentication**     | NextAuth.js v5, JWT, bcrypt, Google OAuth |
| **Payments**           | Stripe Checkout, webhooks, idempotency    |
| **Performance**        | Redis caching, 56x faster queries         |
| **Security**           | Rate limiting, input validation, RBAC     |
| **DevOps**             | Docker, PM2, Vercel deployment            |

---

## 📚 Documentation

### Getting Started

> Setup your development environment and run locally.

- **[Quick Start](./guide/getting-started)** — Clone, configure, run
- **[Environment Setup](./guide/getting-started#environment-setup)** — Required API keys and services

### Architecture

> Understand the system design and data flow.

- **[System Design](./architecture/overview)** — High-level architecture
- **[Database Schema](./modules/database)** — Tables, relations, indexes

### Modules

> Deep dive into each feature module.

| Module                                     | Description                          |
| ------------------------------------------ | ------------------------------------ |
| [Authentication](./modules/authentication) | NextAuth, JWT, OAuth, password reset |
| [Payment](./modules/payments)              | Stripe integration, webhook handling |
| [Caching](./modules/caching)               | Redis strategy, cache invalidation   |
| [Security](./modules/security)             | Defense in depth, rate limiting      |
| [UI/UX](./modules/ui-design)               | Design system, components            |

### Deployment

> Three ways to deploy to production.

| Method    | Best For                     | Guide                       |
| --------- | ---------------------------- | --------------------------- |
| ⚡ Vercel | Zero config, instant deploy  | [Deploy →](./deploy/vercel) |
| 🐳 Docker | Full control, consistent env | [Deploy →](./deploy/docker) |
| 📦 PM2    | Simple VPS, no containers    | [Deploy →](./deploy/pm2)    |

### Development Log

> Version-by-version build history.

```
v1.0  Foundation      API routes, cart context
v2.0  Database        PostgreSQL, Stripe webhooks
v3.0  UI/UX           Design system, price validation
v4.0  Auth & Redis    NextAuth, caching ← MVP
v5.0  Admin           Dashboard, OAuth, search
v6.0  Shipping        Tracking integration
```

[View Full Log →](./dev-log/overview)

---

## 🛠️ Tech Stack

```
Frontend     Next.js 16 · React 18 · TypeScript · Tailwind CSS
Backend      API Routes · NextAuth.js v5 · Edge Middleware
Database     PostgreSQL (Neon) · Redis (Upstash)
Services     Stripe · Cloudinary · Resend · Google OAuth
```

---

## ⚡ Quick Start

```bash
git clone https://github.com/lhq5520/Mountify-Commerce.git
cd Mountify-Commerce
npm install
mkdir .env.local -> setup .env.local manually
npm run dev
```

:::tip Test Payment
Use card `4242 4242 4242 4242` with any future expiry and CVC.
:::

---

## 📊 Performance

| Metric           | Before | After | Improvement    |
| ---------------- | ------ | ----- | -------------- |
| Product List API | 450ms  | 8ms   | **56x faster** |
| Checkout Success | 70%    | 95%   | **+25%**       |

---

## 🎯 Design Principles

:::info 1. Security First
Price validation server-side. Passwords with bcrypt. Parameterized SQL. Rate limiting on sensitive endpoints.
:::

:::info 2. Progressive Enhancement  
MVP first (v4.0), then enhance. Every version adds one concept. Ship early, iterate often.
:::

:::info 3. Defense in Depth
`TypeScript → API Validation → DB Constraints`  
If one layer fails, others catch it.
:::

---

<div align="center">

**Ready to dive in?**

[**Get Started →**](./guide/getting-started)

</div>
