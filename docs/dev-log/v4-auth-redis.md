# Version 4: Auth & Redis (MVP)

> **Focus:** NextAuth, Redis Caching, Rate Limiting  
> **Status:** MVP Milestone

---

## MVP Milestone

Version 4.0 marks the **Minimal Viable Product**:

- ✅ User authentication
- ✅ Database-backed products
- ✅ Stripe payments with webhooks
- ✅ Order history per user
- ✅ Role-based access control
- ✅ Performance optimization

**Everything after v4 is enhancement, not core functionality.**

---

## 4A - NextAuth Integration

### Objective

Implement user authentication with JWT sessions.

### Setup

**File:** `src/auth.ts`

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials;

        // Query user from database
        const result = await query(
          "SELECT id, email, password_hash, role FROM users WHERE email = $1",
          [email]
        );

        if (result.rows.length === 0) return null;

        const user = result.rows[0];

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return null;

        return {
          id: user.id.toString(),
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      return session;
    },
  },

  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
});
```

### User Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Registration API

```typescript
export async function POST(req: Request) {
  const { email, password } = await req.json();

  // Validate
  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Check existing
  const existing = await query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "Email exists" }, { status: 400 });
  }

  // Hash password (10 rounds ≈ 100ms)
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  await query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [
    email,
    passwordHash,
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
```

### Password Security

| Property   | Implementation                  |
| ---------- | ------------------------------- |
| Hashing    | bcrypt with 10 rounds           |
| Salt       | Auto-generated per password     |
| Comparison | `bcrypt.compare()` (no decrypt) |
| Storage    | Only hash stored, never plain   |

---

## 4B - Middleware Protection

### Objective

Route-level access control.

**File:** `src/middleware.ts`

```typescript
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Dynamic cookie name (HTTPS vs HTTP)
  const isSecure = req.url.startsWith("https");
  const cookieName = isSecure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    cookieName,
  });

  const protectedRoutes = ["/orders", "/profile", "/settings"];
  const isProtectedRoute = protectedRoutes.some((r) => pathname.startsWith(r));
  const isAdminRoute = pathname.startsWith("/admin");

  // Authentication check
  if ((isProtectedRoute || isAdminRoute) && !token) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
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
  ],
};
```

### Access Matrix

| Route       | Guest      | Customer  | Admin |
| ----------- | ---------- | --------- | ----- |
| `/products` | ✅         | ✅        | ✅    |
| `/cart`     | ✅         | ✅        | ✅    |
| Checkout    | ✅ (email) | ✅        | ✅    |
| `/orders`   | ❌ → Login | ✅        | ✅    |
| `/admin/*`  | ❌ → Login | ❌ → Home | ✅    |

---

## 4C - Redis Caching

### Objective

Reduce database load and improve response times.

### Setup

**File:** `src/lib/redis.ts`

```typescript
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const CACHE_KEYS = {
  PRODUCTS_ALL: "products:all",
};

export const CACHE_TTL = {
  PRODUCTS: 60 * 10, // 10 minutes
};
```

### Cache-Aside Pattern

```typescript
export async function GET() {
  // 1. Check cache
  const cached = await redis.get(CACHE_KEYS.PRODUCTS_ALL);
  if (cached) {
    return NextResponse.json({ products: cached, source: "cache" });
  }

  // 2. Query database
  const result = await query("SELECT * FROM products ORDER BY id ASC");

  // 3. Populate cache
  await redis.set(CACHE_KEYS.PRODUCTS_ALL, JSON.stringify(result.rows), {
    ex: CACHE_TTL.PRODUCTS,
  });

  return NextResponse.json({ products: result.rows, source: "database" });
}
```

### Performance Results

| Endpoint | Without Cache | With Cache | Improvement    |
| -------- | ------------- | ---------- | -------------- |
| Products | ~450ms        | ~8ms       | **56x faster** |

### Why Upstash?

| Feature            | Standard Redis  | Upstash       |
| ------------------ | --------------- | ------------- |
| Edge Runtime       | ❌ TCP required | ✅ HTTP-based |
| Connection pooling | Required        | Not needed    |
| Serverless         | Complex         | Zero config   |

---

## 4D - Rate Limiting

### Objective

Protect against abuse.

### Implementation

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

### Checkout Rate Limiting

```typescript
export async function POST(req: Request) {
  const session = await auth();

  // Identify by user ID or IP
  const identifier = session?.user?.id
    ? `user:${session.user.id}`
    : `ip:${req.headers.get("x-forwarded-for") || "unknown"}`;

  const rateLimitKey = `ratelimit:checkout:${identifier}`;
  const count = await redis.incr(rateLimitKey);

  if (count === 1) {
    await redis.expire(rateLimitKey, 60);
  }

  if (count > 10) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  // ... continue with checkout
}
```

### Rate Limits

| Endpoint | Limit | Window |
| -------- | ----- | ------ |
| Checkout | 10    | 60s    |
| Register | 5/IP  | 10min  |
| Login    | 10/IP | 15min  |

---

## 4E - Order History

### Objective

Link orders to authenticated users.

### Schema Update

```sql
ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id);
```

### My Orders API

```typescript
export async function GET(req: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await query(
    `
    SELECT o.id, o.total, o.status, o.created_at,
           json_agg(json_build_object(
             'name', p.name,
             'quantity', oi.quantity,
             'price', oi.price
           )) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE o.user_id = $1
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `,
    [session.user.id]
  );

  return NextResponse.json({ orders: result.rows });
}
```

### Guest vs Authenticated Checkout

```typescript
// Checkout associates user if logged in
const userId = session?.user?.id ? parseInt(session.user.id) : null;

await query(
  "INSERT INTO orders (email, total, user_id, ...) VALUES ($1, $2, $3, ...)",
  [email, total, userId] // userId is NULL for guests
);
```

| Checkout Type | user_id | Visible in "My Orders" |
| ------------- | ------- | ---------------------- |
| Guest         | NULL    | ❌                     |
| Authenticated | User ID | ✅                     |

---

## Architecture (MVP)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js    │────▶│ PostgreSQL  │
│   + JWT     │     │  + NextAuth │     │   (Neon)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │   Redis     │ ← Cache + Rate Limit
       │            │  (Upstash)  │
       │            └─────────────┘
       │
       ▼
┌─────────────┐
│ Middleware  │ ← Route Protection
│  (Edge)     │
└─────────────┘
```

---

## Security Layers

```
Layer 1: TypeScript      → Compile-time checking
Layer 2: Input Validation → API-level sanitization
Layer 3: Parameterized SQL → Injection prevention
Layer 4: DB Constraints   → Data integrity
Layer 5: Middleware       → Route protection
Layer 6: Rate Limiting    → Abuse prevention
Layer 7: bcrypt           → Password security
Layer 8: JWT              → Stateless sessions
```

---

## Files Created

| File                                    | Purpose                |
| --------------------------------------- | ---------------------- |
| `src/auth.ts`                           | NextAuth configuration |
| `src/middleware.ts`                     | Route protection       |
| `src/lib/redis.ts`                      | Redis client + helpers |
| `src/app/api/auth/register/route.ts`    | User registration      |
| `src/app/api/orders/my-orders/route.ts` | User's orders          |
| `src/app/auth/signin/page.tsx`          | Login page             |
| `src/types/next-auth.d.ts`              | Type extensions        |

---

## MVP Checklist

- [x] User can register
- [x] User can login
- [x] User can browse products
- [x] User can add to cart
- [x] User can checkout (guest or logged in)
- [x] User can view order history
- [x] Admin can access admin routes
- [x] Products are cached
- [x] Endpoints are rate limited
- [x] Passwords are hashed
- [x] Sessions are JWT-based

---

## Next Version Preview

**Version 5.0** will add an admin panel, Google OAuth, search functionality, and email notifications.
