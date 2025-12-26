# Database Design

## Design Philosophy

The database schema follows these principles:

1. **Normalize first, denormalize for performance** - Start with clean relationships, add redundancy only when measured
2. **Constraints at DB level** - Don't rely solely on application logic
3. **Explicit naming** - Self-documenting constraints and indexes
4. **Foreign keys with intent** - CASCADE for disposable data, RESTRICT for historical

## Schema Overview

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

## Key Design Decisions

### 1. Price Snapshot in order_items

```sql
-- order_items stores price at time of purchase
price NUMERIC(10,2) NOT NULL  -- Snapshot, not reference
```

**Reason:** Products change price over time. Orders must reflect what customer actually paid.

```
Product price: $29.99 → Customer buys → order_items.price = 29.99
Product price changes to: $34.99
Customer order still shows: $29.99 ✓
```

---

### 2. ON DELETE Strategies

```sql
-- ✅ CASCADE: Disposable/dependent data
addresses      → users(id)    ON DELETE CASCADE  -- User deleted → addresses cleared
cart_items     → users(id)    ON DELETE CASCADE  -- User deleted → cart cleared
cart_items     → products(id) ON DELETE CASCADE  -- Product deleted → remove from carts
order_items    → orders(id)   ON DELETE CASCADE  -- Order deleted → items deleted
product_images → products(id) ON DELETE CASCADE  -- Product deleted → images deleted
password_reset_tokens → users(id) ON DELETE CASCADE

-- ⚠️ SET NULL: Preserve history, remove reference
products → categories(id) ON DELETE SET NULL
-- Category deleted → products remain, category_id becomes NULL

-- 🔒 RESTRICT (default): Protect historical records
orders → users(id)  -- No ON DELETE specified = RESTRICT
order_items → products(id)  -- Can't delete product with order history
```

---

### 3. CHECK Constraints for Data Integrity

```sql
-- Role validation at database level
role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))

-- Order status state machine
status VARCHAR(50) CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'expired'))

-- Inventory can't go negative
on_hand INTEGER NOT NULL CHECK (on_hand >= 0)
reserved INTEGER DEFAULT 0 NOT NULL CHECK (reserved >= 0)

-- Cart quantity limits (prevent abuse)
quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000)

-- Order items must have positive quantity
quantity INTEGER NOT NULL CHECK (quantity > 0)
```

---

### 4. UNIQUE Constraints (Auto-Indexed)

```sql
-- Single column UNIQUE
users.email              -- PostgreSQL auto-creates: users_email_key
categories.name          -- CITEXT for case-insensitive uniqueness
categories.slug          -- URL-friendly unique identifier
password_reset_tokens.user_id  -- One active token per user

-- Composite UNIQUE for cart deduplication
UNIQUE(user_id, product_id)
-- Same product → UPDATE quantity, not INSERT duplicate
```

---

### 5. Special Index Patterns

```sql
-- Partial unique index: Only one default address per user
CREATE UNIQUE INDEX uq_addresses_one_default_per_user
ON addresses(user_id) WHERE is_default = true;

-- Deduplication index: Prevent duplicate addresses
CREATE UNIQUE INDEX uq_addresses_dedupe
ON addresses(user_id, line1, postal_code);

-- Composite index for common query pattern
CREATE INDEX idx_addresses_user_default_created
ON addresses(user_id, is_default, created_at DESC);
-- Optimizes: Get user's addresses, default first, then by date
```

---

## Indexing Strategy

### Auto-Created Indexes (Don't Duplicate!)

```sql
-- Primary keys: Automatically indexed
id SERIAL PRIMARY KEY  -- Creates: tablename_pkey

-- UNIQUE constraints: Automatically indexed
email TEXT UNIQUE      -- Creates: users_email_key
```

### Manual Indexes for Query Patterns

```sql
-- Foreign key lookups
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_cart_items_user ON cart_items(user_id);
CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Specific query optimizations
CREATE INDEX idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX idx_reset_tokens_token ON password_reset_tokens(token_hash);
CREATE INDEX idx_inventory_updated_at ON inventory(updated_at);
```

### When NOT to Index

| Scenario                      | Reason                                          |
| ----------------------------- | ----------------------------------------------- |
| `orders.status` (6 values)    | Low cardinality, full scan often faster         |
| `is_default` BOOLEAN          | Only 2 values, use partial index instead        |
| Already in composite index    | First column of composite covers single lookups |
| Write-heavy, read-rare tables | Index maintenance overhead                      |

---

## Query Patterns

### 1. Batch Queries over N+1

```sql
-- ❌ N+1 Problem (in loop)
for each item in cart:
    SELECT * FROM products WHERE id = ?  -- N queries

-- ✅ Batch Query
SELECT * FROM products WHERE id = ANY($1::int[])  -- 1 query
-- TypeScript: query(sql, [[1, 5, 8]])
```

### 2. UPSERT for Cart Operations

```sql
INSERT INTO cart_items (user_id, product_id, quantity)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, product_id)
DO UPDATE SET
  quantity = cart_items.quantity + EXCLUDED.quantity,
  updated_at = now();

-- First add: INSERT
-- Same product again: UPDATE (increment quantity)
-- Atomic, no race conditions
```

### 3. JOINs for Order History

```sql
SELECT
  o.id, o.total, o.status, o.created_at,
  o.tracking_number, o.carrier,
  json_agg(json_build_object(
    'name', p.name,
    'quantity', oi.quantity,
    'price', oi.price,
    'image_url', p.image_url
  )) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.user_id = $1
GROUP BY o.id
ORDER BY o.created_at DESC;
```

### 4. Inventory Reservation Pattern

```sql
-- Reserve inventory (checkout start)
UPDATE inventory
SET reserved = reserved + $2,
    updated_at = now()
WHERE sku_id = $1
  AND on_hand - reserved >= $2  -- Check available stock
RETURNING *;

-- Commit inventory (payment success)
UPDATE inventory
SET on_hand = on_hand - $2,
    reserved = reserved - $2,
    updated_at = now()
WHERE sku_id = $1;

-- Release inventory (payment failed/expired)
UPDATE inventory
SET reserved = reserved - $2,
    updated_at = now()
WHERE sku_id = $1;
```

---

## Connection Pooling

```typescript
// src/lib/db.ts
import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

// Singleton pool - reuse across hot reloads in dev
export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool; // Persist across Next.js hot reloads
}

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release(); // Return to pool, don't close
  }
}
```

### Why This Pattern?

| Problem                              | Solution                      |
| ------------------------------------ | ----------------------------- |
| Connection creation ~50ms            | Pool reuse ~1ms               |
| Next.js hot reload creates new pools | Global singleton persists     |
| Serverless cold starts               | Pool persists across requests |
| Connection exhaustion                | Pool limits max connections   |

---

## Triggers

### Auto-Update Timestamps

```sql
-- Reusable function
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to tables
CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Benefit:** `updated_at` always accurate, no need to remember in application code.

---

## Data Types Choices

| Column             | Type            | Reason                                           |
| ------------------ | --------------- | ------------------------------------------------ |
| `price`, `total`   | `NUMERIC(10,2)` | Exact decimal, no floating point errors          |
| `name`, `slug`     | `CITEXT`        | Case-insensitive comparison (requires extension) |
| `shipping_address` | `JSONB`         | Flexible structure, queryable                    |
| `tracking_details` | `JSONB`         | Variable structure from 17track API              |
| `status`           | `VARCHAR(50)`   | Readable, with CHECK constraint                  |
| `id`               | `SERIAL`        | Auto-increment integer                           |
| `sku_id`           | `BIGINT`        | Matches product.id, allows future expansion      |

---

## Schema Conventions

```sql
-- Naming: snake_case for everything
user_id, created_at, is_default, tracking_number

-- Timestamps: Always TIMESTAMPTZ (timezone-aware)
created_at TIMESTAMPTZ DEFAULT now()

-- Booleans: is_ or has_ prefix
is_default, is_primary, inventory_reserved

-- Foreign keys: Referenced table (singular) + _id
user_id, product_id, category_id, order_id

-- Indexes: idx_{table}_{columns}
idx_cart_items_user, idx_orders_tracking_number

-- Unique indexes: uq_{table}_{purpose}
uq_addresses_dedupe, uq_addresses_one_default_per_user
```
