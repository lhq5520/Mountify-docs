# v4.0 - 认证与缓存（MVP）

## 概述

实现完整的用户认证系统和 Redis 缓存层。**这是 MVP 里程碑**——应用可以上线了。

---

## 4A - NextAuth.js v5

### 配置

```typescript
// src/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const user = await query(
          "SELECT * FROM users WHERE email = $1",
          [credentials.email]
        );

        if (!user.rows[0]) return null;

        const valid = await bcrypt.compare(
          credentials.password,
          user.rows[0].password_hash
        );

        if (!valid) return null;

        return {
          id: user.rows[0].id,
          email: user.rows[0].email,
          role: user.rows[0].role,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
```

### 中间件保护

```typescript
// src/middleware.ts
export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  const isProtectedRoute = ["/orders", "/profile"].some((r) =>
    req.nextUrl.pathname.startsWith(r)
  );

  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");

  if ((isProtectedRoute || isAdminRoute) && !token) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  if (isAdminRoute && token?.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}
```

---

## 4B - Redis 缓存

### Upstash 客户端

```typescript
// src/lib/redis.ts
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const CACHE_KEYS = {
  PRODUCTS_ALL: "products:all",
};

export const CACHE_TTL = {
  PRODUCTS: 60 * 10, // 10 分钟
};
```

### Cache-Aside 模式

```typescript
export async function GET() {
  // 1. 检查缓存
  const cached = await redis.get(CACHE_KEYS.PRODUCTS_ALL);
  if (cached) {
    return NextResponse.json({ products: cached, source: "cache" });
  }

  // 2. 缓存未命中，查询数据库
  const result = await query("SELECT * FROM products");

  // 3. 填充缓存
  await redis.set(CACHE_KEYS.PRODUCTS_ALL, JSON.stringify(result.rows), {
    ex: CACHE_TTL.PRODUCTS,
  });

  return NextResponse.json({ products: result.rows, source: "database" });
}
```

### 缓存失效

```typescript
// 管理员创建/更新/删除商品后
await redis.del(CACHE_KEYS.PRODUCTS_ALL);
```

---

## 4C - 限流

```typescript
export async function POST(req: Request) {
  const session = await auth();

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
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 继续处理...
}
```

---

## 性能提升

| 指标 | 无缓存 | 有缓存 | 提升 |
| ---- | ------ | ------ | ---- |
| 商品列表 | ~450ms | ~8ms | **56x** |
| 缓存命中率 | - | ~80% | - |

---

## 学到的经验

1. **Upstash 适合 Serverless**：HTTP 协议，无连接管理
2. **Cache-Aside 简单有效**：读缓存 → 回退数据库 → 填充缓存
3. **限流必要**：防止滥用和爬虫
4. **MVP 定义**：认证 + 支付 + 缓存 = 可上线
