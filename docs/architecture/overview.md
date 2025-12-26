# Mountify - System Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  React Pages   │  │  Cart Context  │  │  Toast/UI      │  │  Session      │  │
│  │  (SSR + CSR)   │  │  (Global State)│  │  Components    │  │  (NextAuth)   │  │
│  └───────┬────────┘  └───────┬────────┘  └────────────────┘  └───────┬───────┘  │
└──────────┼───────────────────┼───────────────────────────────────────┼──────────┘
           │                   │                                       │
           ▼                   ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS SERVER (App Router)                           │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                              API ROUTES                                     ││
│  │                                                                             ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ ││
│  │  │  /api/       │  │  /api/       │  │  /api/       │  │  /api/auth/      │ ││
│  │  │  products    │  │  cart        │  │  checkout    │  │  [...nextauth]   │ ││
│  │  │  categories  │  │  orders      │  │  webhooks    │  │  register        │ ││
│  │  │  inventory   │  │  user/*      │  │  /stripe     │  │  forgot-password │ ││
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ ││
│  │         │                 │                 │                   │           ││
│  └─────────┼─────────────────┼─────────────────┼───────────────────┼───────────┘│
│            │                 │                 │                   │            │
│  ┌─────────┼─────────────────┼─────────────────┼───────────────────┼───────────┐│
│  │         │        ADMIN API ROUTES           │                   │           ││
│  │         │   ┌──────────────────────────────┐│                   │           ││
│  │         │   │  /api/admin/                 ││                   │           ││
│  │         │   │  products, orders, stats     ││                   │           ││
│  │         │   │  categories, inventory       ││                   │           ││
│  │         │   │  shipping, upload-image      ││                   │           ││
│  │         │   └──────────────────────────────┘│                   │           ││
│  └─────────┼───────────────────────────────────┼───────────────────┼───────────┘│
└────────────┼───────────────────────────────────┼───────────────────┼────────────┘
             │                                   │                   │
             ▼                                   ▼                   ▼
┌─────────────────────┐  ┌─────────────────────────────────────────────────────────┐
│                     │  │                   EXTERNAL SERVICES                     │
│    DATA LAYER       │  │                                                         │
│                     │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  ┌───────────────┐  │  │  │   Stripe    │  │   Resend    │  │   Cloudinary    │  │
│  │  PostgreSQL   │  │  │  │             │  │             │  │                 │  │
│  │    (Neon)     │  │  │  │ • Checkout  │  │ • Order     │  │ • Product       │  │
│  │               │  │  │  │ • Sessions  │  │   confirm   │  │   images        │  │
│  │ • users       │  │  │  │ • Webhooks  │  │ • Shipping  │  │ • Upload/       │  │
│  │ • products    │  │  │  │ • Payments  │  │   notify    │  │   Delete        │  │
│  │ • categories  │  │  │  │             │  │ • Password  │  │                 │  │
│  │ • orders      │  │  │  └──────┬──────┘  │   reset     │  └─────────────────┘  │
│  │ • order_items │  │  │         │         └─────────────┘                       │
│  │ • cart_items  │  │  │         │                                               │
│  │ • addresses   │  │  │         ▼                                               │
│  │ • inventory   │  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ • password_   │  │  │  │   Google    │  │   17track   │  │     Redis       │  │
│  │   reset_tokens│  │  │  │   OAuth     │  │     API     │  │   (Upstash)     │  │
│  └───────────────┘  │  │  │             │  │             │  │                 │  │
│                     │  │  │ • SSO Login │  │ • Tracking  │  │ • Product cache │  │
│                     │  │  │ • User info │  │   info      │  │ • Rate limiting │  │
│                     │  │  │             │  │ • Status    │  │ • Session store │  │
│                     │  │  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────┘  └─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer      | Technology              | Purpose                                  |
| ---------- | ----------------------- | ---------------------------------------- |
| Frontend   | Next.js 16 (App Router) | SSR/CSR React framework                  |
| Styling    | Tailwind CSS            | Utility-first CSS                        |
| State      | React Context           | Cart state management                    |
| Auth       | NextAuth v5 (Auth.js)   | JWT sessions, Credentials + Google OAuth |
| Database   | PostgreSQL (Neon)       | Serverless Postgres                      |
| Cache      | Redis (Upstash)         | Product cache, rate limiting             |
| Payments   | Stripe                  | Checkout sessions, webhooks              |
| Email      | Resend                  | Transactional emails                     |
| Images     | Cloudinary              | Image hosting & optimization             |
| Tracking   | 17track API             | Shipment tracking                        |
| Deployment | Docker + VPS            | Containerized deployment                 |

## Data Flow Diagrams

### 1. User Authentication Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Client  │────▶│  /api/auth   │────▶│  NextAuth   │────▶│ PostgreSQL│
└──────────┘     └──────────────┘     └─────────────┘     └──────────┘
     │                                       │
     │         ┌─────────────────────────────┘
     │         ▼
     │    ┌─────────────┐
     │    │   Google    │ (OAuth flow)
     │    │   OAuth     │
     │    └─────────────┘
     │         │
     ▼         ▼
┌─────────────────────┐
│   JWT Session       │
│   (httpOnly cookie) │
└─────────────────────┘
```

### 2. Checkout & Payment Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Client  │────▶│/api/checkout │────▶│   Stripe    │
│  (Cart)  │     │              │     │  Checkout   │
└──────────┘     └──────────────┘     └──────┬──────┘
                                             │
                      ┌──────────────────────┘
                      ▼
               ┌─────────────┐     ┌──────────────┐     ┌──────────┐
               │   Stripe    │────▶│/api/webhooks │────▶│ Database │
               │  (payment)  │     │   /stripe    │     │  Update  │
               └─────────────┘     └──────┬───────┘     └──────────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │   Resend    │
                                   │ (Email)     │
                                   └─────────────┘
```

### 3. Product Catalog Flow (with Caching)

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Client  │────▶│/api/products │────▶│    Redis    │
└──────────┘     └──────────────┘     │   (Cache)   │
                        │             └──────┬──────┘
                        │                    │
                        │  Cache Miss        │ Cache Hit
                        ▼                    │
                 ┌─────────────┐             │
                 │ PostgreSQL  │             │
                 │   (Neon)    │             │
                 └──────┬──────┘             │
                        │                    │
                        └────────────────────┘
                                   │
                                   ▼
                            ┌─────────────┐
                            │  Response   │
                            │  (JSON)     │
                            └─────────────┘
```

### 4. Order Shipping Flow

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Admin Panel  │────▶│/api/admin/orders │────▶│  Database   │
│ (Ship Order) │     │  /[id]/ship      │     │   Update    │
└──────────────┘     └────────┬─────────┘     └─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Resend      │
                    │ (Shipment Email)│
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    17track      │
                    │ (Register PKG)  │
                    └─────────────────┘
```

## Database Schema (ERD)

```
┌───────────────────────┐
│        users          │
├───────────────────────┤
│ id          SERIAL PK │
│ email       TEXT UQ   │
│ password_hash TEXT    │
│ role        TEXT      │  ──┐  'customer' | 'admin'
│ created_at  TIMESTAMPTZ   │
└───────────┬───────────┘   │
            │               │
            │ 1:N           │
    ┌───────┴───────┬───────┴───────┬─────────────────┐
    │               │               │                 │
    ▼               ▼               ▼                 ▼
┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│     addresses       │  │   cart_items    │  │         orders          │  │  password_reset_tokens  │
├─────────────────────┤  ├─────────────────┤  ├─────────────────────────┤  ├─────────────────────────┤
│ id        SERIAL PK │  │ id     SERIAL PK│  │ id          SERIAL PK   │  │ id          SERIAL PK   │
│ user_id   INT FK    │  │ user_id   INT FK│  │ user_id     INT FK      │  │ user_id     INT FK UQ   │
│ name      TEXT      │  │ product_id INT FK│ │ email       TEXT        │  │ token_hash  TEXT        │
│ phone     TEXT      │  │ quantity  INT   │  │ total       NUMERIC     │  │ expires_at  TIMESTAMPTZ │
│ line1     TEXT      │  │ created_at      │  │ status      VARCHAR(50) │  │ used        BOOLEAN     │
│ line2     TEXT      │  │ updated_at      │  │ stripe_session_id TEXT  │  │ created_at  TIMESTAMPTZ │
│ city      TEXT      │  │                 │  │ inventory_reserved BOOL │  └─────────────────────────┘
│ state     TEXT      │  │ UQ(user,product)│  │ reserved_until TIMESTAMPTZ
│ postal_code TEXT    │  └────────┬────────┘  │ shipping_name   TEXT    │
│ country   TEXT      │           │           │ shipping_phone  TEXT    │
│ is_default BOOLEAN  │           │           │ shipping_address JSONB  │
│ created_at          │           │           │ tracking_number TEXT    │
│ updated_at          │           │           │ carrier         TEXT    │
└─────────────────────┘           │           │ shipped_at   TIMESTAMPTZ│
                                  │           │ tracking_details JSONB  │
                                  │           │ tracking_last_sync      │
                                  │           │ created_at, updated_at  │
                                  │           └────────────┬────────────┘
                                  │                        │
                                  │                        │ 1:N
                                  │                        ▼
                                  │           ┌─────────────────────────┐
                                  │           │      order_items        │
                                  │           ├─────────────────────────┤
                                  │           │ id          SERIAL PK   │
                                  │           │ order_id    INT FK      │
                                  │           │ product_id  INT FK      │◀─┐
                                  │           │ quantity    INT         │  │
                                  │           │ price       NUMERIC     │  │
                                  │           │                         │  │
                                  │           │ UQ(order_id, product_id)│  │
                                  │           └─────────────────────────┘  │
                                  │                                        │
                                  └────────────────────────────────────────┤
                                                                           │
┌───────────────────────┐       ┌─────────────────────────┐                │
│      categories       │       │        products         │                │
├───────────────────────┤       ├─────────────────────────┤                │
│ id       SERIAL PK    │       │ id        SERIAL PK     │────────────────┘
│ name     CITEXT UQ    │◀──────│ category_id INT FK      │
│ slug     CITEXT UQ    │       │ name      TEXT          │
│ description TEXT      │       │ price     NUMERIC(10,2) │
│ display_order INT     │       │ description TEXT        │
│ created_at TIMESTAMPTZ│       │ detailed_description    │
└───────────────────────┘       │ image_url TEXT          │
                                │ image_url_hover TEXT    │
                                │ image_public_id TEXT    │  ── Cloudinary
                                │ image_hover_public_id   │  ── Cloudinary
                                │ created_at TIMESTAMPTZ  │
                                └────────────┬────────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                         │ 1:N               │ 1:1               │ 1:N
                         ▼                   ▼                   ▼
              ┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
              │   product_images    │  │    inventory    │  │   (cart_items)      │
              ├─────────────────────┤  ├─────────────────┤  │   (order_items)     │
              │ id       SERIAL PK  │  │ sku_id BIGINT PK│  └─────────────────────┘
              │ product_id INT FK   │  │ on_hand    INT  │
              │ image_url TEXT      │  │ reserved   INT  │
              │ cloudinary_public_id│  │ updated_at      │
              │ display_order INT   │  └─────────────────┘
              │ is_primary BOOLEAN  │   * sku_id = product_id
              │ created_at          │
              └─────────────────────┘
```

## API Endpoints

### Public APIs

| Method | Endpoint                    | Description                |
| ------ | --------------------------- | -------------------------- |
| GET    | `/api/products`             | List all products (cached) |
| GET    | `/api/products/[id]`        | Get product detail         |
| GET    | `/api/products/search`      | Search products            |
| GET    | `/api/categories`           | List categories            |
| POST   | `/api/auth/register`        | User registration          |
| POST   | `/api/auth/forgot-password` | Request password reset     |
| POST   | `/api/auth/reset-password`  | Reset password             |

### Protected APIs (Auth Required)

| Method          | Endpoint                    | Description           |
| --------------- | --------------------------- | --------------------- |
| GET/POST/DELETE | `/api/cart`                 | Cart operations       |
| POST            | `/api/checkout`             | Create Stripe session |
| GET             | `/api/orders/my-orders`     | User's order history  |
| GET/PUT         | `/api/user/profile`         | User profile          |
| GET/POST/DELETE | `/api/user/addresses`       | Address management    |
| PUT             | `/api/user/change-password` | Change password       |

### Admin APIs (Admin Role Required)

| Method   | Endpoint                      | Description          |
| -------- | ----------------------------- | -------------------- |
| GET/POST | `/api/admin/products`         | Product CRUD         |
| GET/POST | `/api/admin/categories`       | Category CRUD        |
| GET/PUT  | `/api/admin/inventory`        | Inventory management |
| GET/PUT  | `/api/admin/orders`           | Order management     |
| POST     | `/api/admin/orders/[id]/ship` | Ship order           |
| GET      | `/api/admin/stats`            | Dashboard statistics |
| POST     | `/api/admin/upload-image`     | Image upload         |

### Webhooks

| Method | Endpoint               | Description           |
| ------ | ---------------------- | --------------------- |
| POST   | `/api/webhooks/stripe` | Stripe payment events |

## Security

- **Authentication**: JWT-based sessions (httpOnly cookies)
- **Password**: bcrypt hashing (salt rounds: 10)
- **OAuth**: Google SSO with automatic user upsert
- **Authorization**: Role-based (customer/admin) via middleware
- **CSRF**: Built-in NextAuth protection
- **Rate Limiting**: Redis-based (Upstash)

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                         VPS                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │                    Docker                         │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │           Next.js Container                 │  │  │
│  │  │  • Production build (next start)            │  │  │
│  │  │  • Port 3000                                │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                          ▼                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │                     Nginx                         │  │
│  │  • Reverse proxy                                  │  │
│  │  • SSL termination (Let's Encrypt)                │  │
│  │  • Static file serving                            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │     External Services (SaaS)    │
        │  • Neon (PostgreSQL)            │
        │  • Upstash (Redis)              │
        │  • Stripe                       │
        │  • Cloudinary                   │
        │  • Resend                       │
        │  • 17track                      │
        └─────────────────────────────────┘
```

## Performance Optimizations

1. **Redis Caching**: Product listings cached for 10 minutes
2. **Image CDN**: Cloudinary auto-optimization & responsive images
3. **SSR**: Server-side rendering for SEO & initial load
4. **Connection Pooling**: Neon serverless driver with connection reuse
5. **Lazy Loading**: Dynamic imports for heavy components

## Design Philosophy

### Why This Stack?

| Choice           | Reasoning                                                |
| ---------------- | -------------------------------------------------------- |
| **Next.js 16**   | Unified frontend/backend, App Router for modern patterns |
| **PostgreSQL**   | ACID compliance, complex queries, data integrity         |
| **Redis**        | Sub-10ms reads, perfect for caching and rate limiting    |
| **Stripe**       | PCI compliance handled, webhooks for reliability         |
| **JWT Sessions** | Stateless, Edge-compatible, no DB query per request      |

### Data Flow Patterns

**Read Path (Products):**

```
Request → Check Redis Cache → Cache HIT? Return cached
                           → Cache MISS? Query PostgreSQL → Cache result → Return
```

**Write Path (Orders):**

```
Checkout → Validate prices (DB) → Create pending order → Stripe Session
        → User pays → Webhook received → Update order status → Clear cart
```

**Auth Path:**

```
Login → bcrypt verify → Generate JWT → Store in httpOnly cookie
      → Subsequent requests: JWT verified at Edge (no DB needed)
```

## Security Layers

```
Layer 1: TypeScript      → Compile-time type safety
Layer 2: Input Validation → Runtime checks in API routes
Layer 3: Parameterized SQL → Prevent SQL injection
Layer 4: DB Constraints   → CHECK, UNIQUE, REFERENCES
Layer 5: Middleware       → Route protection before page load
```

## Performance Strategy

| Technique          | Where Used          | Impact                   |
| ------------------ | ------------------- | ------------------------ |
| Redis caching      | Product listings    | 5x faster (455ms → 86ms) |
| Optimistic updates | Cart operations     | Instant UI feedback      |
| Database indexes   | user_id, product_id | 10x query improvement    |
| JWT sessions       | Auth checks         | No DB hit per request    |
| Edge Middleware    | Route protection    | &lt;10ms auth checks     |

## Scalability Considerations

**Current (Single Region):**

- Neon PostgreSQL (serverless, auto-scales)
- Upstash Redis (global, Edge-compatible)
- Vercel Edge Functions

**Future Scaling Path:**

- Read replicas for PostgreSQL
- Redis cluster for cache distribution
- CDN for static assets
- Queue system for webhook processing
