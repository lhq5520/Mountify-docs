# Security

## Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: TypeScript                       │
│              Compile-time type checking                      │
├─────────────────────────────────────────────────────────────┤
│                  Layer 2: Input Validation                   │
│          API-level sanitization & format checks              │
├─────────────────────────────────────────────────────────────┤
│                 Layer 3: Parameterized SQL                   │
│               SQL injection prevention                       │
├─────────────────────────────────────────────────────────────┤
│                 Layer 4: DB Constraints                      │
│     CHECK, UNIQUE, FK constraints for data integrity         │
├─────────────────────────────────────────────────────────────┤
│                  Layer 5: Middleware                         │
│           Route-level authentication & RBAC                  │
├─────────────────────────────────────────────────────────────┤
│                  Layer 6: Rate Limiting                      │
│          Redis-based abuse prevention                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication Security

### Password Hashing (bcrypt)

```typescript
// Registration: 10 rounds = ~100ms intentionally slow
const hash = await bcrypt.hash(password, 10);

// Login: Re-hash input with stored salt and compare
const valid = await bcrypt.compare(inputPassword, storedHash);
```

| Property      | Security Benefit                         |
| ------------- | ---------------------------------------- |
| One-way       | Cannot reverse hash to get password      |
| Salted        | Same password → different hash each time |
| Slow (~100ms) | Defeats brute-force attacks              |
| Cost factor   | Can increase rounds as hardware improves |

### JWT Security

```
Token: header.payload.signature
       eyJ...  .  eyJ...  .  SflK...
```

| Aspect      | Implementation                          |
| ----------- | --------------------------------------- |
| Storage     | httpOnly cookie (not accessible via JS) |
| Signature   | HMAC-SHA256 with `AUTH_SECRET`          |
| Payload     | Contains only `id`, `email`, `role`     |
| Never store | Passwords, credit cards, secrets        |

**Tamper Detection:**

```
Attacker modifies: { "role": "admin" }
                         ↓
         Server verifies signature
                         ↓
              MISMATCH → Request rejected ❌
```

### Cookie Security

```typescript
// Dynamic cookie name based on protocol
const isSecure = req.url.startsWith("https");
const cookieName = isSecure
  ? "__Secure-authjs.session-token" // Production (HTTPS)
  : "authjs.session-token"; // Development (HTTP)
```

---

## Input Validation

### Quantity Validation

```typescript
// Type check (no coercion)
if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
  return NextResponse.json(
    { error: "Invalid quantity format" },
    { status: 400 }
  );
}

// Range check
if (quantity < 1 || quantity > 100) {
  return NextResponse.json(
    { error: "Quantity must be between 1 and 100" },
    { status: 400 }
  );
}
```

**Why `Number.isFinite()` over `isNaN()`:**

```javascript
isNaN("hello"); // true  (coerces string, unreliable)
isNaN(NaN); // true
isNaN(100); // false

Number.isFinite(NaN); // false (no coercion, reliable)
Number.isFinite("100"); // false (string rejected)
Number.isFinite(100); // true
Number.isFinite(Infinity); // false
```

### Email Validation

```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
}

// Normalization
const normalizedEmail = email.toLowerCase().trim();
```

### URL Validation

```typescript
const urlRegex = /^https?:\/\/.+/i;
if (!urlRegex.test(imageUrl)) {
  return NextResponse.json(
    { error: "Image URL must be a valid URL (http:// or https://)" },
    { status: 400 }
  );
}
```

### Password Validation

```typescript
if (!password || typeof password !== "string" || password.length < 6) {
  return NextResponse.json(
    { error: "Password must be at least 6 characters" },
    { status: 400 }
  );
}
```

### Slug Validation

```typescript
const slugRegex = /^[a-z0-9-]+$/;
if (!slugRegex.test(slug)) {
  return NextResponse.json(
    { error: "Slug can only contain lowercase letters, numbers, and hyphens" },
    { status: 400 }
  );
}
```

---

## Price Security

### Never Trust Frontend Prices

```typescript
// ❌ VULNERABLE: Frontend can send any price
const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

// ✅ SECURE: Always fetch from database
const productResult = await query(
  "SELECT id, price, name FROM products WHERE id = ANY($1)",
  [productIds]
);

const productMap = new Map(productResult.rows.map((r) => [r.id, r]));

const total = items.reduce((sum, item) => {
  const product = productMap.get(item.productId);
  return sum + Number(product.price) * item.quantity; // DB price!
}, 0);
```

### Price Snapshot in Orders

```typescript
// Store price at time of purchase
await query(
  `INSERT INTO order_items (order_id, product_id, quantity, price)
   VALUES ($1, $2, $3, $4)`,
  [orderId, item.productId, item.quantity, product.price] // Snapshot
);
```

---

## SQL Injection Prevention

### Parameterized Queries

```typescript
// ❌ VULNERABLE (string concatenation)
query(`SELECT * FROM users WHERE email = '${email}'`);
// Attack: email = "'; DROP TABLE users; --"

// ✅ SECURE (parameterized)
query("SELECT * FROM users WHERE email = $1", [email]);
// PostgreSQL escapes the parameter automatically
```

### Dynamic Query Building (Safe)

```typescript
// Building WHERE clause safely
const conditions: string[] = [];
const params: any[] = [];
let paramIndex = 1;

if (category) {
  conditions.push(`c.slug = $${paramIndex}`);
  params.push(category);
  paramIndex++;
}

if (search) {
  conditions.push(`p.name ILIKE $${paramIndex}`);
  params.push(`%${search}%`); // Parameter, not concatenation
  paramIndex++;
}

const whereClause =
  conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

await query(`SELECT * FROM products ${whereClause}`, params);
```

---

## Authorization (RBAC)

### Role Definition

```sql
role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))
```

### Middleware Protection

```typescript
// src/middleware.ts
export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  const isProtectedRoute = ["/orders", "/profile", "/settings"].some((r) =>
    pathname.startsWith(r)
  );
  const isAdminRoute = pathname.startsWith("/admin");

  // Authentication check
  if ((isProtectedRoute || isAdminRoute) && !token) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  // Authorization check (admin only)
  if (isAdminRoute && token?.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/orders/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
```

### API-Level Authorization

```typescript
// Every admin API endpoint
export async function GET(req: Request) {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  // ... admin logic ...
}
```

### Access Matrix

| Route          | Guest      | Customer | Admin |
| -------------- | ---------- | -------- | ----- |
| `/products`    | ✅         | ✅       | ✅    |
| `/cart`        | ✅         | ✅       | ✅    |
| Checkout       | ✅ (email) | ✅       | ✅    |
| `/orders`      | ❌ → 401   | ✅       | ✅    |
| `/profile`     | ❌ → 401   | ✅       | ✅    |
| `/settings`    | ❌ → 401   | ✅       | ✅    |
| `/admin/*`     | ❌ → 401   | ❌ → 403 | ✅    |
| `/api/admin/*` | ❌ → 401   | ❌ → 403 | ✅    |

---

## Rate Limiting

### Implementation Pattern

```typescript
async function rateLimitFixedWindow(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}
```

### Rate Limits by Endpoint

| Endpoint                    | Limit | Window | Response               |
| --------------------------- | ----- | ------ | ---------------------- |
| Checkout                    | 10    | 60s    | 429 + `retryAfter: 60` |
| Register (per IP)           | 5     | 10min  | 429                    |
| Register (per email)        | 1     | 10min  | 429                    |
| Forgot Password (per IP)    | 10    | 5min   | 200 (silent)           |
| Forgot Password (per email) | 3     | 15min  | 200 (silent)           |
| Forgot Password (cooldown)  | 1     | 60s    | 200 (silent)           |
| Reset Password (per IP)     | 10    | 15min  | 429                    |
| Reset Password (per token)  | 5     | 15min  | 429                    |
| Change Password             | 3     | 15min  | 429                    |

### Silent Failure (Enumeration Prevention)

```typescript
// Forgot password: Always return success to prevent email enumeration
if (userResult.rows.length === 0) {
  return NextResponse.json({
    success: true,
    message: "If an account exists, a reset link has been sent.",
  });
}
```

---

## Webhook Security

### Stripe Signature Verification

```typescript
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Signature valid, process event...
}
```

### Idempotent Processing

```typescript
// Only update if not already processed
await query(
  `UPDATE orders 
   SET status = 'paid'
   WHERE stripe_session_id = $1 AND status = 'pending'  -- Idempotent
   RETURNING id`,
  [session.id]
);

// Flag-based idempotency for inventory
await query(
  `UPDATE orders
   SET inventory_reserved = FALSE
   WHERE stripe_session_id = $1 AND inventory_reserved = TRUE
   RETURNING id`,
  [session.id]
);
```

---

## Password Reset Security

### Token Generation

```typescript
// 1. Generate cryptographically secure token
const token = crypto.randomBytes(32).toString("hex");

// 2. Store only the hash (even if DB leaked, token is safe)
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

// 3. Send plain token in email, store hash in DB
await query(
  `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
   VALUES ($1, $2, NOW() + INTERVAL '1 hour')
   ON CONFLICT (user_id) DO UPDATE SET ...`,
  [user.id, tokenHash]
);
```

### Token Consumption (Atomic)

```typescript
await client.query("BEGIN");

// Atomically mark token as used
const consume = await client.query(
  `UPDATE password_reset_tokens
   SET used = TRUE
   WHERE token_hash = $1
     AND used = FALSE
     AND expires_at > NOW()
   RETURNING user_id`,
  [tokenHash]
);

if (consume.rows.length === 0) {
  await client.query("ROLLBACK");
  return { error: "Invalid or expired reset link" };
}

// Update password
await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
  newHash,
  consume.rows[0].user_id,
]);

await client.query("COMMIT");
```

### Security Properties

| Property           | Implementation                  |
| ------------------ | ------------------------------- |
| Secure random      | `crypto.randomBytes(32)`        |
| Token hashing      | SHA-256 hash stored, plain sent |
| One-time use       | `used = TRUE` on consumption    |
| Expiration         | 1 hour TTL                      |
| Atomic consumption | Transaction prevents race       |
| One per user       | `ON CONFLICT (user_id)`         |

---

## Database Constraints

### Data Integrity

```sql
-- Role validation
role TEXT CHECK (role IN ('customer', 'admin'))

-- Order status state machine
status VARCHAR(50) CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'expired'))

-- Inventory non-negative
on_hand INTEGER CHECK (on_hand >= 0)
reserved INTEGER CHECK (reserved >= 0)

-- Quantity limits
quantity INTEGER CHECK (quantity > 0 AND quantity <= 1000)
```

### Unique Constraints (Prevent Duplicates)

```sql
-- One cart entry per user-product
UNIQUE (user_id, product_id)

-- One default address per user
CREATE UNIQUE INDEX uq_addresses_one_default_per_user
ON addresses(user_id) WHERE is_default = true;

-- Address deduplication
CREATE UNIQUE INDEX uq_addresses_dedupe
ON addresses(user_id, line1, postal_code);
```

---

## OAuth Security

### OAuth Users Cannot Use Password Login

```typescript
// In authorize callback
const user = result.rows[0];

// OAuth users have password_hash = NULL
if (!user.password_hash) {
  return null; // Reject password login attempt
}
```

### Auto-Create OAuth Users

```typescript
// Upsert prevents duplicate accounts
const res = await query(
  `
  INSERT INTO users (email, password_hash, role)
  VALUES ($1, NULL, 'customer')
  ON CONFLICT (email)
  DO UPDATE SET email = EXCLUDED.email
  RETURNING id, role
`,
  [email]
);
```

---

## Error Handling Security

### Don't Leak Sensitive Information

```typescript
// ❌ BAD: Leaks internal details
return NextResponse.json({ error: e.message }, { status: 500 });

// ✅ GOOD: Generic message, log internally
console.error("Database error:", e);
return NextResponse.json(
  { error: "Failed to process request" },
  { status: 500 }
);
```

### Consistent Error Responses

```typescript
// Don't reveal if email exists
if (userResult.rows.length === 0) {
  return NextResponse.json({
    success: true, // Same as success case
    message: "If an account exists, a reset link has been sent.",
  });
}
```

---

## Security Checklist

### ✅ Implemented

| Feature                        | Location                    |
| ------------------------------ | --------------------------- |
| bcrypt password hashing        | `src/auth.ts`, register API |
| Parameterized SQL queries      | All DB queries              |
| Input validation               | All API endpoints           |
| JWT httpOnly cookies           | NextAuth config             |
| Rate limiting (Redis)          | Auth, checkout endpoints    |
| Webhook signature verification | Stripe webhook              |
| Role-based access control      | Middleware + API            |
| Password reset token hashing   | forgot/reset password       |
| Email enumeration prevention   | forgot password             |
| Idempotent webhook processing  | Stripe webhook              |
| Database constraints           | Schema constraints          |
| OAuth user separation          | No password for OAuth       |

### ⚠️ Future Considerations

| Feature              | Notes                     |
| -------------------- | ------------------------- |
| Email verification   | Verify email before login |
| CSRF tokens          | Currently via NextAuth    |
| Account lockout      | After N failed attempts   |
| 2FA support          | TOTP/SMS                  |
| Audit logging        | Track admin actions       |
| Password complexity  | Require special chars     |
| Session invalidation | Logout from all devices   |
| IP allowlist (admin) | Restrict admin access     |

---

## Common Attack Prevention

| Attack             | Prevention                             |
| ------------------ | -------------------------------------- |
| SQL Injection      | Parameterized queries (`$1, $2`)       |
| XSS                | React auto-escapes, httpOnly cookies   |
| CSRF               | SameSite cookies, NextAuth protection  |
| Brute Force        | Rate limiting, bcrypt slowness         |
| Price Manipulation | Server-side price lookup               |
| Email Enumeration  | Consistent responses                   |
| Token Theft        | httpOnly, Secure cookies               |
| Replay Attacks     | Idempotent operations, one-time tokens |
