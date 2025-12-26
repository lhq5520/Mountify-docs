# Authentication

## Design Philosophy

- **JWT over sessions**: Stateless, Edge-compatible, no DB query per request
- **bcrypt for passwords**: One-way hash, intentionally slow (brute-force resistant)
- **Defense in depth**: Multiple validation layers + rate limiting
- **Guest checkout supported**: Lower friction, encourage signup without forcing
- **OAuth integration**: Google SSO with automatic account creation

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  NextAuth   │────▶│  PostgreSQL │
│   Cookie    │     │  (Auth.js)  │     │  (users)    │
│   httpOnly  │◀────│             │◀────│             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │   Google    │  ← OAuth Provider
       │            │   OAuth     │
       │            └─────────────┘
       ▼
┌─────────────┐
│  Middleware │
│  (Edge)     │  ← JWT verified here, no DB needed
└─────────────┘
```

---

## Core Configuration

### File: `src/auth.ts`

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,

  // Suppress noisy credential errors in logs
  logger: {
    error(error) {
      if (error.name !== "CredentialsSignin") {
        console.error("[Auth Error]", error);
      }
    },
    warn(code) {
      console.warn("[Auth Warning]", code);
    },
    debug(code, metadata) {
      /* silent */
    },
  },

  providers: [
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // Email/Password
    Credentials({
      async authorize(credentials) {
        const email = String(credentials?.email || "");
        const password = String(credentials?.password || "");

        if (!email || !password) return null;

        const result = await query(
          "SELECT id, email, password_hash, role FROM users WHERE email = $1",
          [email]
        );

        if (result.rows.length === 0) return null;

        const user = result.rows[0];

        // OAuth users cannot login with password
        if (!user.password_hash) return null;

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
    async jwt({ token, user, account }) {
      // Credentials login
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // Google OAuth: Auto-create or link user
      if (account?.provider === "google") {
        const email = token.email;
        if (!email) return token;

        // Upsert: Create new user or get existing
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

        token.id = res.rows[0].id.toString();
        token.role = res.rows[0].role;
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

---

## Authentication Flows

### 1. Credentials Login

```
User submits email/password
        │
        ▼
┌───────────────────────────────┐
│ Query: SELECT ... WHERE email │
└───────────────┬───────────────┘
                │
        ┌───────┴───────┐
        │               │
    Not found     Found user
        │               │
        ▼               ▼
    return null   ┌─────────────────┐
                  │ password_hash   │
                  │ exists?         │
                  └────────┬────────┘
                           │
                  ┌────────┴────────┐
                  │                 │
              NULL (OAuth)    Has hash
                  │                 │
                  ▼                 ▼
             return null    bcrypt.compare()
                                   │
                           ┌───────┴───────┐
                           │               │
                       Invalid          Valid
                           │               │
                           ▼               ▼
                      return null    return { id, email, role }
                                           │
                                           ▼
                                    JWT created & stored
```

### 2. Google OAuth Login

```
User clicks "Sign in with Google"
        │
        ▼
┌─────────────────────────┐
│   Google OAuth Flow     │
│   (consent screen)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│  jwt callback: account.provider = google │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  UPSERT into users table                │
│  INSERT ... ON CONFLICT (email)         │
│  DO UPDATE SET email = EXCLUDED.email   │
│  RETURNING id, role                     │
└───────────────────┬─────────────────────┘
                    │
            ┌───────┴───────┐
            │               │
      New user         Existing user
      created          (linked)
            │               │
            └───────┬───────┘
                    │
                    ▼
           JWT with id, role
```

**Key Point:** OAuth users have `password_hash = NULL`, preventing credential login attempts.

---

## Password Security

### Registration

```typescript
// Generate hash (~100ms intentionally slow)
const passwordHash = await bcrypt.hash(password, 10);
// 10 = salt rounds (cost factor)

await query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [
  email,
  passwordHash,
]);
```

### Login Verification

```typescript
// bcrypt.compare does NOT decrypt
// It re-hashes input with same salt and compares
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

### Why bcrypt is Secure

| Property      | Benefit                                  |
| ------------- | ---------------------------------------- |
| One-way       | Cannot reverse hash to get password      |
| Salted        | Same password → different hash each time |
| Slow (~100ms) | Defeats brute-force attacks              |
| Cost factor   | Can increase rounds as hardware improves |

---

## Password Reset Flow

### Architecture

```
┌──────────┐    ┌──────────────┐    ┌─────────┐    ┌─────────┐
│  Client  │───▶│ forgot-pwd   │───▶│  Redis  │    │   DB    │
│          │    │ API          │    │ (rate   │    │ (token) │
└──────────┘    └──────┬───────┘    │ limit)  │    └────┬────┘
                       │            └─────────┘         │
                       ▼                                │
                ┌─────────────┐                         │
                │   Resend    │                         │
                │   (email)   │                         │
                └─────────────┘                         │
                                                        │
┌──────────┐    ┌──────────────┐                        │
│  Client  │───▶│ reset-pwd    │───────────────────────┘
│ (token)  │    │ API          │
└──────────┘    └──────────────┘
```

### Step 1: Request Reset (`/api/auth/forgot-password`)

```typescript
// 1. Generate secure token
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

// 2. Upsert token (one active token per user)
await query(
  `
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used)
  VALUES ($1, $2, NOW() + INTERVAL '1 hour', false)
  ON CONFLICT (user_id)
  DO UPDATE SET token_hash = EXCLUDED.token_hash,
                expires_at = NOW() + INTERVAL '1 hour',
                used = false
`,
  [user.id, tokenHash]
);

// 3. Send email with plain token (NOT hash)
const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
await sendPasswordResetEmail(email, resetUrl);
```

### Step 2: Reset Password (`/api/auth/reset-password`)

```typescript
// 1. Hash the token from URL
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

// 2. Atomic token consumption (transaction)
await client.query("BEGIN");

const consume = await client.query(
  `
  UPDATE password_reset_tokens
  SET used = TRUE
  WHERE token_hash = $1
    AND used = FALSE
    AND expires_at > NOW()
  RETURNING user_id
`,
  [tokenHash]
);

if (consume.rows.length === 0) {
  await client.query("ROLLBACK");
  return { error: "Invalid or expired reset link" };
}

// 3. Update password
const passwordHash = await bcrypt.hash(newPassword, 10);
await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
  passwordHash,
  consume.rows[0].user_id,
]);

await client.query("COMMIT");
```

### Security Features

| Feature                      | Implementation                             |
| ---------------------------- | ------------------------------------------ |
| Token hashing                | Only hash stored in DB, plain token in URL |
| One-time use                 | `used = TRUE` on consumption               |
| Expiration                   | `expires_at > NOW()` check                 |
| Atomic consumption           | Transaction prevents race conditions       |
| Email enumeration prevention | Always return same message                 |

---

## Rate Limiting

### Implementation Pattern

```typescript
// Fixed-window rate limiting with Redis
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

| Endpoint            | Limit       | Window | Key                             |
| ------------------- | ----------- | ------ | ------------------------------- |
| **Register**        |
| Per IP              | 5 requests  | 10 min | `rl:register:ip:{ip}`           |
| Per email           | 1 request   | 10 min | `rl:register:email:{email}`     |
| **Forgot Password** |
| Per IP              | 10 requests | 5 min  | `rl:forgot:ip:{ip}`             |
| Per email           | 3 requests  | 15 min | `rl:forgot:email:{email}`       |
| Cooldown            | 1 request   | 60 sec | `cooldown:forgot:email:{email}` |
| **Reset Password**  |
| Per IP              | 10 requests | 15 min | `rl:reset:ip:{ip}`              |
| Per token           | 5 attempts  | 15 min | `rl:reset:tokenhash:{hash}`     |
| **Change Password** |
| Per user            | 3 attempts  | 15 min | `rl:change-password:user:{id}`  |

---

## Middleware Protection

### File: `src/middleware.ts`

```typescript
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Dynamic cookie name based on protocol
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

  if (isProtectedRoute || isAdminRoute) {
    if (!token) {
      const signInUrl = new URL("/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }

    if (isAdminRoute && token.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
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

### Cookie Name Logic

| Environment | Protocol | Cookie Name                     |
| ----------- | -------- | ------------------------------- |
| Production  | HTTPS    | `__Secure-authjs.session-token` |
| Development | HTTP     | `authjs.session-token`          |

---

## Role-Based Access Control

### Database Schema

```sql
ALTER TABLE users
ADD COLUMN role TEXT DEFAULT 'customer'
CHECK (role IN ('customer', 'admin'));
```

### Access Matrix

| Route          | Guest               | Customer  | Admin |
| -------------- | ------------------- | --------- | ----- |
| `/products`    | ✅                  | ✅        | ✅    |
| `/cart`        | ✅                  | ✅        | ✅    |
| Checkout       | ✅ (email required) | ✅        | ✅    |
| `/orders`      | ❌ → Login          | ✅        | ✅    |
| `/profile`     | ❌ → Login          | ✅        | ✅    |
| `/settings`    | ❌ → Login          | ✅        | ✅    |
| `/admin/*`     | ❌ → Login          | ❌ → Home | ✅    |
| `/api/admin/*` | ❌ 401              | ❌ 403    | ✅    |

---

## JWT Security

### Token Contents

```json
{
  "id": "1",
  "email": "user@example.com",
  "role": "customer",
  "iat": 1701792000,
  "exp": 1704384000
}
```

### Why JWT is Safe

```
Attacker modifies: { "role": "admin" }
        │
        ▼
Server verifies signature
        │
        ▼
MISMATCH → Request rejected ❌
```

| Property        | Security Benefit                               |
| --------------- | ---------------------------------------------- |
| Signed          | Tampering detected via HMAC                    |
| httpOnly cookie | Not accessible via JavaScript (XSS protection) |
| Server secret   | Only server can create valid tokens            |
| Expiration      | Limits window of compromise                    |

---

## Type Extensions

### File: `src/types/next-auth.d.ts`

```typescript
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}
```

---

## Guest vs Authenticated Checkout

```typescript
// Cart page determines email source
const emailToUse = session?.user?.email || guestEmail;

// Checkout API associates user if logged in
const userId = session?.user?.id ? parseInt(session.user.id) : null;

await query(
  "INSERT INTO orders (email, user_id, ...) VALUES ($1, $2, ...)",
  [emailToUse, userId] // userId is NULL for guests
);
```

| Checkout Type | user_id | Email Source | Visible in "My Orders" |
| ------------- | ------- | ------------ | ---------------------- |
| Guest         | NULL    | Form input   | ❌                     |
| Authenticated | User ID | Session      | ✅                     |

---

## Security Checklist

- [x] Passwords hashed with bcrypt (cost factor 10)
- [x] JWT stored in httpOnly cookie
- [x] CSRF protection via NextAuth
- [x] Rate limiting on all auth endpoints
- [x] Email enumeration prevention
- [x] One-time password reset tokens
- [x] Token expiration (1 hour)
- [x] OAuth users cannot use password login
- [x] Role-based access control
- [x] Secure cookie names in production
