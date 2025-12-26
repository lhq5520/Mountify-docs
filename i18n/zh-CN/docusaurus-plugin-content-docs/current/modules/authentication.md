# 身份认证

## 设计理念

- **JWT 优于会话**：无状态、Edge 兼容、无需每次请求查库
- **bcrypt 加密密码**：单向哈希、故意慢速（抗暴力破解）
- **纵深防御**：多层验证 + 限流
- **支持游客结账**：降低摩擦，鼓励但不强制注册
- **OAuth 集成**：Google SSO 自动创建账户

---

## 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   浏览器     │────▶│  NextAuth   │────▶│  PostgreSQL │
│   Cookie    │     │  (Auth.js)  │     │  (users)    │
│   httpOnly  │◀────│             │◀────│             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │   Google    │  ← OAuth 提供商
       │            │   OAuth     │
       │            └─────────────┘
       ▼
┌─────────────┐
│  中间件      │
│  (Edge)     │  ← JWT 在此验证，无需查库
└─────────────┘
```

---

## 核心配置

### 文件：`src/auth.ts`

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,

  // 抑制日志中的凭证错误噪音
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
      /* 静默 */
    },
  },

  providers: [
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // 邮箱/密码
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

        // OAuth 用户无法使用密码登录
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
      // 凭证登录
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // Google OAuth：自动创建或关联用户
      if (account?.provider === "google") {
        const email = token.email;
        if (!email) return token;

        // Upsert：创建新用户或获取现有用户
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

## 认证流程

### 1. 凭证登录

```
用户提交邮箱/密码
        │
        ▼
┌───────────────────────────────┐
│ 查询：SELECT ... WHERE email  │
└───────────────┬───────────────┘
                │
        ┌───────┴───────┐
        │               │
    未找到          找到用户
        │               │
        ▼               ▼
    return null   ┌─────────────────┐
                  │ password_hash   │
                  │ 存在？          │
                  └────────┬────────┘
                           │
                  ┌────────┴────────┐
                  │                 │
              NULL (OAuth)    有哈希
                  │                 │
                  ▼                 ▼
             return null    bcrypt.compare()
                                   │
                           ┌───────┴───────┐
                           │               │
                        无效           有效
                           │               │
                           ▼               ▼
                      return null    return { id, email, role }
                                           │
                                           ▼
                                    JWT 创建并存储
```

### 2. Google OAuth 登录

```
用户点击"使用 Google 登录"
        │
        ▼
┌─────────────────────────┐
│   Google OAuth 流程     │
│   (授权页面)            │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│  jwt 回调：account.provider = google    │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  UPSERT 到 users 表                     │
│  INSERT ... ON CONFLICT (email)         │
│  DO UPDATE SET email = EXCLUDED.email   │
│  RETURNING id, role                     │
└───────────────────┬─────────────────────┘
                    │
            ┌───────┴───────┐
            │               │
      新用户创建       现有用户
                      （已关联）
            │               │
            └───────┬───────┘
                    │
                    ▼
           JWT 包含 id, role
```

**关键点**：OAuth 用户的 `password_hash = NULL`，阻止凭证登录尝试。

---

## 密码安全

### 注册

```typescript
// 生成哈希（~100ms，故意慢速）
const passwordHash = await bcrypt.hash(password, 10);
// 10 = 盐轮数（成本因子）

await query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [
  email,
  passwordHash,
]);
```

### 登录验证

```typescript
// bcrypt.compare 不会解密
// 它使用相同的盐重新哈希输入并比较
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

### 为什么 bcrypt 安全

| 特性 | 优势 |
| ---- | ---- |
| 单向 | 无法从哈希反推密码 |
| 加盐 | 相同密码 → 每次不同的哈希 |
| 慢速（~100ms） | 抵御暴力破解 |
| 成本因子 | 可随硬件升级增加轮数 |

---

## 密码重置流程

### 架构

```
┌──────────┐    ┌──────────────┐    ┌─────────┐    ┌─────────┐
│  客户端   │───▶│ forgot-pwd   │───▶│  Redis  │    │   DB    │
│          │    │ API          │    │ (限流)  │    │ (令牌)  │
└──────────┘    └──────┬───────┘    └─────────┘    └────┬────┘
                       │                                │
                       ▼                                │
                ┌─────────────┐                         │
                │   Resend    │                         │
                │   (邮件)    │                         │
                └─────────────┘                         │
                                                        │
┌──────────┐    ┌──────────────┐                        │
│  客户端   │───▶│ reset-pwd    │───────────────────────┘
│ (令牌)   │    │ API          │
└──────────┘    └──────────────┘
```

### 步骤 1：请求重置（`/api/auth/forgot-password`）

```typescript
// 1. 生成安全令牌
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

// 2. Upsert 令牌（每用户一个活跃令牌）
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

// 3. 发送包含明文令牌（非哈希）的邮件
const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
await sendPasswordResetEmail(email, resetUrl);
```

### 步骤 2：重置密码（`/api/auth/reset-password`）

```typescript
// 1. 哈希 URL 中的令牌
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

// 2. 原子性令牌消费（事务）
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
  return { error: "无效或过期的重置链接" };
}

// 3. 更新密码
const passwordHash = await bcrypt.hash(newPassword, 10);
await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
  passwordHash,
  consume.rows[0].user_id,
]);

await client.query("COMMIT");
```

### 安全特性

| 特性 | 实现 |
| ---- | ---- |
| 令牌哈希 | 只在数据库存储哈希，URL 中是明文 |
| 一次性使用 | 消费时设置 `used = TRUE` |
| 过期机制 | `expires_at > NOW()` 检查 |
| 原子消费 | 事务防止竞态条件 |
| 防邮箱枚举 | 始终返回相同消息 |

---

## 限流

### 实现模式

```typescript
// Redis 固定窗口限流
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

### 各端点限流配置

| 端点 | 限制 | 窗口 | Key |
| ---- | ---- | ---- | --- |
| **注册** |
| 按 IP | 5 次 | 10 分钟 | `rl:register:ip:{ip}` |
| 按邮箱 | 1 次 | 10 分钟 | `rl:register:email:{email}` |
| **忘记密码** |
| 按 IP | 10 次 | 5 分钟 | `rl:forgot:ip:{ip}` |
| 按邮箱 | 3 次 | 15 分钟 | `rl:forgot:email:{email}` |
| 冷却 | 1 次 | 60 秒 | `cooldown:forgot:email:{email}` |
| **重置密码** |
| 按 IP | 10 次 | 15 分钟 | `rl:reset:ip:{ip}` |
| 按令牌 | 5 次 | 15 分钟 | `rl:reset:tokenhash:{hash}` |
| **修改密码** |
| 按用户 | 3 次 | 15 分钟 | `rl:change-password:user:{id}` |

---

## 中间件保护

### 文件：`src/middleware.ts`

```typescript
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 根据协议动态确定 cookie 名称
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

### Cookie 名称逻辑

| 环境 | 协议 | Cookie 名称 |
| ---- | ---- | ----------- |
| 生产 | HTTPS | `__Secure-authjs.session-token` |
| 开发 | HTTP | `authjs.session-token` |

---

## 基于角色的访问控制

### 数据库架构

```sql
ALTER TABLE users
ADD COLUMN role TEXT DEFAULT 'customer'
CHECK (role IN ('customer', 'admin'));
```

### 访问矩阵

| 路由 | 游客 | 普通用户 | 管理员 |
| ---- | ---- | -------- | ------ |
| `/products` | ✅ | ✅ | ✅ |
| `/cart` | ✅ | ✅ | ✅ |
| 结账 | ✅（需要邮箱） | ✅ | ✅ |
| `/orders` | ❌ → 登录 | ✅ | ✅ |
| `/profile` | ❌ → 登录 | ✅ | ✅ |
| `/settings` | ❌ → 登录 | ✅ | ✅ |
| `/admin/*` | ❌ → 登录 | ❌ → 首页 | ✅ |
| `/api/admin/*` | ❌ 401 | ❌ 403 | ✅ |

---

## JWT 安全

### 令牌内容

```json
{
  "id": "1",
  "email": "user@example.com",
  "role": "customer",
  "iat": 1701792000,
  "exp": 1704384000
}
```

### 为什么 JWT 安全

```
攻击者修改：{ "role": "admin" }
        │
        ▼
服务器验证签名
        │
        ▼
不匹配 → 请求被拒绝 ❌
```

| 特性 | 安全优势 |
| ---- | -------- |
| 签名 | 通过 HMAC 检测篡改 |
| httpOnly cookie | JavaScript 无法访问（防 XSS） |
| 服务端密钥 | 只有服务器能创建有效令牌 |
| 过期时间 | 限制被盗用的时间窗口 |

---

## 类型扩展

### 文件：`src/types/next-auth.d.ts`

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

## 游客 vs 已登录用户结账

```typescript
// 购物车页面确定邮箱来源
const emailToUse = session?.user?.email || guestEmail;

// 结账 API 关联用户（如已登录）
const userId = session?.user?.id ? parseInt(session.user.id) : null;

await query(
  "INSERT INTO orders (email, user_id, ...) VALUES ($1, $2, ...)",
  [emailToUse, userId] // 游客时 userId 为 NULL
);
```

| 结账类型 | user_id | 邮箱来源 | 在"我的订单"可见 |
| -------- | ------- | -------- | ---------------- |
| 游客 | NULL | 表单输入 | ❌ |
| 已登录 | 用户 ID | 会话 | ✅ |

---

## 安全检查清单

- [x] 密码使用 bcrypt 哈希（成本因子 10）
- [x] JWT 存储在 httpOnly cookie
- [x] 通过 NextAuth 实现 CSRF 保护
- [x] 所有认证端点都有限流
- [x] 防邮箱枚举
- [x] 一次性密码重置令牌
- [x] 令牌过期（1 小时）
- [x] OAuth 用户无法使用密码登录
- [x] 基于角色的访问控制
- [x] 生产环境使用安全 cookie 名称
