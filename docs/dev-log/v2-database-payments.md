# Version 2: Database & Stripe

> **Focus:** PostgreSQL Integration, Stripe Checkout, Webhooks  
> **Status:** ✅ Complete

---

## Overview

Version 2 replaces hardcoded data with a real PostgreSQL database and implements secure payment processing with Stripe Checkout and webhooks.

```
Goal: Database → API → Stripe → Webhooks → Order Lifecycle
```

---

## 2A - PostgreSQL Integration

### Objective

Replace hardcoded JSON with real database queries.

### Database Setup

**Provider:** Neon (Serverless PostgreSQL)

**Schema:**

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO products (name, price, description) VALUES
  ('Phone Mount Pro', 29.99, 'Universal phone mount'),
  ('Car Mount Elite', 39.99, 'Dashboard car mount'),
  ('Bike Mount', 24.99, 'Handlebar mount');
```

### Database Connection

**File:** `src/lib/db.ts`

```typescript
import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

// Reuse pool in dev mode (avoid connection exhaustion from hot reload)
if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
```

### Updated API

**Before (v1):**

```typescript
const products = [{ id: 1, name: "...", price: 29.99 }];
return NextResponse.json({ products });
```

**After (v2):**

```typescript
import { query } from "@/lib/db";

export async function GET() {
  const result = await query("SELECT * FROM products ORDER BY id ASC");
  return NextResponse.json({ products: result.rows });
}
```

### Key Learning

- **Connection Pooling**: Reuse connections instead of creating new ones
- **Parameterized Queries**: `$1, $2` syntax prevents SQL injection
- **Global Singleton**: Persist pool across Next.js hot reloads

---

## 2B - Product Detail API

### Objective

Optimize detail page to fetch single product by ID.

### Implementation

**Before:**

```typescript
// Inefficient: fetch all, then filter
const products = await fetch("/api/products");
const product = products.find((p) => p.id === id);
```

**After:**

```typescript
// Efficient: query single row
export async function GET(req, { params }) {
  const { id } = await params;

  const result = await query("SELECT * FROM products WHERE id = $1", [id]);

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ product: result.rows[0] });
}
```

### Architecture

```
Database → API (list + single) → Frontend (list + detail)
```

---

## 2C - Order Creation

### Objective

Persist orders to database when user checks out.

### Schema

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL
);
```

### API Endpoint

**File:** `src/app/api/orders/route.ts`

```typescript
export async function POST(req: Request) {
  const { email, items } = await req.json();

  // Calculate total
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Insert order
  const orderResult = await query(
    "INSERT INTO orders (email, total) VALUES ($1, $2) RETURNING id",
    [email, total]
  );
  const orderId = orderResult.rows[0].id;

  // Insert order items
  for (const item of items) {
    await query(
      "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)",
      [orderId, item.id, item.quantity, item.price]
    );
  }

  return NextResponse.json({ orderId });
}
```

---

## 2D - Stripe Checkout (Sandbox)

### Objective

Integrate Stripe's hosted checkout page.

### Flow

```
Cart Page → /api/checkout → Stripe Session → Hosted Payment → Success/Cancel
```

### Implementation

**File:** `src/app/api/checkout/route.ts`

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { items } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: "usd",
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100), // Cents
      },
    })),
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart`,
  });

  return NextResponse.json({ url: session.url });
}
```

### Test Cards

| Card Number           | Result  |
| --------------------- | ------- |
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Decline |

### Limitations Identified

- ⚠️ **Trusting frontend prices** (security vulnerability)
- ⚠️ **No webhook verification** (can't confirm actual payment)

---

## 2E - Webhook Integration

### Objective

Production-grade payment verification via Stripe webhooks.

### Schema Update

```sql
ALTER TABLE orders ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN stripe_session_id TEXT;
```

### Complete Flow

```
1. User clicks Checkout
2. /api/checkout creates order (status='pending') + Stripe session
3. User pays on Stripe's hosted page
4. Stripe sends webhook to /api/webhooks/stripe
5. Webhook verifies signature, updates status='paid'
6. Success page polls until status changes
```

### Webhook Handler

**File:** `src/app/api/webhooks/stripe/route.ts`

```typescript
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  // Verify webhook is from Stripe
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Handle payment completion
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === "paid") {
      await query(
        "UPDATE orders SET status = 'paid' WHERE stripe_session_id = $1",
        [session.id]
      );
    }
  }

  return NextResponse.json({ received: true });
}
```

### Updated Checkout API

```typescript
// 1. Create pending order FIRST
const orderResult = await query(
  "INSERT INTO orders (email, total, status, stripe_session_id) VALUES ($1, $2, 'pending', $3) RETURNING id",
  [email, total, "placeholder"]
);

// 2. Create Stripe session
const session = await stripe.checkout.sessions.create({ ... });

// 3. Update order with real session ID
await query(
  "UPDATE orders SET stripe_session_id = $1 WHERE id = $2",
  [session.id, orderResult.rows[0].id]
);
```

### Success Page Polling

```typescript
useEffect(() => {
  const poll = async () => {
    const res = await fetch(`/api/orders/session/${sessionId}`);
    const data = await res.json();

    if (data.status === "paid") {
      setStatus("paid");
      clearInterval(timerId);
    }
  };

  const timerId = setInterval(poll, 2000);
  return () => clearInterval(timerId);
}, [sessionId]);
```

### Local Testing

```bash
# Install Stripe CLI
stripe login

# Forward webhooks to localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy webhook secret (whsec_...) to .env.local
```

---

## Architecture Achieved

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js    │────▶│  PostgreSQL │
│             │     │  API Routes │     │   (Neon)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Stripe    │
                    │  Checkout   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Webhook    │
                    │  Handler    │
                    └─────────────┘
```

---

## Order Lifecycle

```
pending ──────────────────────────────────────▶ paid
   │         (webhook: payment_status=paid)      │
   │                                             │
   └──────────────▶ expired ◀────────────────────┘
        (session timeout)    (refund/chargeback)
```

---

## Files Created

| File                                              | Purpose                   |
| ------------------------------------------------- | ------------------------- |
| `src/lib/db.ts`                                   | Database connection pool  |
| `src/app/api/orders/route.ts`                     | Order creation            |
| `src/app/api/checkout/route.ts`                   | Stripe session creation   |
| `src/app/api/webhooks/stripe/route.ts`            | Webhook handler           |
| `src/app/api/orders/session/[sessionId]/route.ts` | Order status by session   |
| `src/app/checkout/success/page.tsx`               | Success page with polling |

---

## Security Status

| Issue                | Status                              |
| -------------------- | ----------------------------------- |
| SQL Injection        | ✅ Fixed (parameterized queries)    |
| Price Manipulation   | ⚠️ Still vulnerable (fixed in v3)   |
| Webhook Verification | ✅ Fixed (signature check)          |
| Session Validation   | ✅ Fixed (webhook confirms payment) |

---

## Next Version Preview

**Version 3.0** will add a design system and fix the price manipulation vulnerability with server-side validation.
