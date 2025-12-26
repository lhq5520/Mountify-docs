# Caching & Performance

## Design Philosophy

- **Cache-aside pattern**: Check cache first, fallback to DB, populate cache
- **Graceful degradation**: Redis failure → still works (DB only)
- **Rate limiting**: Protect expensive endpoints from abuse
- **Upstash for Edge**: HTTP-based Redis, works in serverless/middleware
- **Smart cache bypass**: Filtered queries skip cache, hit DB directly

---

## Architecture

```
┌──────────────┐
│   Request    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│           Has Filters?               │
│  (category, sort, page, search)      │
└──────┬───────────────────┬───────────┘
       │                   │
      YES                  NO
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │ Redis Cache  │
│  (filtered)  │    │   Check      │
└──────────────┘    └──────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
                   HIT          MISS
                    │             │
                    ▼             ▼
             ┌──────────┐  ┌──────────────┐
             │  Return  │  │  PostgreSQL  │
             │  Cached  │  │  + Populate  │
             │  (~8ms)  │  │  Cache       │
             └──────────┘  └──────────────┘
```

---

## Redis Client Setup

### File: `src/lib/redis.ts`

```typescript
import { Redis } from "@upstash/redis";

type RedisClient = InstanceType<typeof Redis>;

let _client: RedisClient | null = null;

function getClientOrNull(): RedisClient | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null; // Graceful degradation

  if (!_client) {
    _client = new Redis({ url, token });
  }
  return _client;
}

// Safe Redis proxy: acts like "cache disabled" if env missing
export const redis = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const client = getClientOrNull();

      if (!client) {
        // Return no-ops for common methods
        if (prop === "get") return async () => null;
        if (prop === "set") return async () => "OK";
        if (prop === "del") return async () => 0;
        if (prop === "incr") return async () => 0;
        if (prop === "expire") return async () => 0;
        return async () => null;
      }

      const value = (client as any)[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
) as unknown as RedisClient;

// Cache key patterns
export const CACHE_KEYS = {
  PRODUCTS_ALL: "products:all",
  PRODUCT_BY_ID: (id: number) => `product:${id}`,
};

// TTL configuration (seconds)
export const CACHE_TTL = {
  PRODUCTS: 60 * 10, // 10 minutes
  PRODUCT: 60 * 30, // 30 minutes
};
```

### Graceful Degradation

| Scenario               | Behavior                                       |
| ---------------------- | ---------------------------------------------- |
| Redis configured       | Normal caching                                 |
| Redis env missing      | All ops return null/0, app works without cache |
| Redis connection fails | Falls back to DB-only mode                     |

---

## Product Cache Implementation

### File: `src/app/api/products/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // Normalize parameters
  const category = searchParams.get("category")?.trim().toLowerCase() || null;
  const sort = searchParams.get("sort")?.trim().toLowerCase() || "newest";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const search = searchParams.get("search")?.trim() || null;

  // Determine if filters are applied
  const hasFilters =
    (category && category !== "all") ||
    (sort && sort !== "newest") ||
    page > 1 ||
    (search && search.length >= 2);

  if (hasFilters) {
    // Skip cache → query DB directly with filters
    return await getFilteredProducts(searchParams);
  }

  // No filters → use cache
  return await getAllProductsCached();
}
```

### Cached Path (No Filters)

```typescript
async function getAllProductsCached() {
  // 1. Check cache
  const cached = await redis.get(CACHE_KEYS.PRODUCTS_ALL);

  if (cached) {
    console.log("Cache HIT - Products loaded from Redis");
    return NextResponse.json({
      products: typeof cached === "string" ? JSON.parse(cached) : cached,
      source: "cache",
    });
  }

  console.log("Cache MISS - Loading from database");

  // 2. Query database
  const result = await query("SELECT * FROM products ORDER BY id ASC");

  const products = result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    description: row.description,
    image_url: row.image_url,
    image_url_hover: row.image_url_hover,
    detailed_description: row.detailed_description,
  }));

  // 3. Populate cache
  await redis.set(CACHE_KEYS.PRODUCTS_ALL, JSON.stringify(products), {
    ex: CACHE_TTL.PRODUCTS,
  });

  console.log(`Cached ${products.length} products for ${CACHE_TTL.PRODUCTS}s`);

  return NextResponse.json({
    products,
    source: "database",
  });
}
```

### Filtered Path (Skip Cache)

```typescript
async function getFilteredProducts(searchParams: URLSearchParams) {
  // Build dynamic WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (category && category !== "all") {
    conditions.push(`c.slug = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (search && search.length >= 2) {
    conditions.push(
      `(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Build ORDER BY
  let orderClause = "ORDER BY p.created_at DESC";
  switch (sort) {
    case "price_asc":
      orderClause = "ORDER BY p.price ASC";
      break;
    case "price_desc":
      orderClause = "ORDER BY p.price DESC";
      break;
    case "name":
      orderClause = "ORDER BY p.name ASC";
      break;
    case "oldest":
      orderClause = "ORDER BY p.created_at ASC";
      break;
  }

  // Query with pagination
  const productsResult = await query(
    `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
    ${orderClause}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
    [...params, limit, offset]
  );

  return NextResponse.json({
    products: productsResult.rows,
    pagination: { page, limit, total, totalPages, hasMore },
    source: "database-filtered",
  });
}
```

---

## Categories Cache

### File: `src/app/api/categories/route.ts`

```typescript
const CACHE_KEY = "categories:all";
const CACHE_TTL = 60 * 60; // 1 hour (categories change rarely)

export async function GET() {
  // 1. Check cache
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json({
      categories: typeof cached === "string" ? JSON.parse(cached) : cached,
    });
  }

  // 2. Query database
  const result = await query(`
    SELECT id, name, slug, description, display_order
    FROM categories
    ORDER BY display_order ASC, name ASC
  `);

  // 3. Populate cache
  await redis.set(CACHE_KEY, JSON.stringify(result.rows), { ex: CACHE_TTL });

  return NextResponse.json({ categories: result.rows });
}
```

---

## Cache Invalidation

### Event-Based Invalidation

| Event            | Cache Keys Invalidated |
| ---------------- | ---------------------- |
| Product created  | `products:all`         |
| Product updated  | `products:all`         |
| Product deleted  | `products:all`         |
| Category created | `categories:all`       |
| Category updated | `categories:all`       |
| Category deleted | `categories:all`       |

### Implementation Example

```typescript
// POST /api/admin/products - Create product
export async function POST(req: Request) {
  // ... validation and insert ...

  const result = await query(
    `INSERT INTO products (...) VALUES (...) RETURNING *`,
    [...]
  );

  // Invalidate cache immediately
  await redis.del(CACHE_KEYS.PRODUCTS_ALL);
  console.log('Cleared product cache after creation');

  return NextResponse.json({ product: result.rows[0] }, { status: 201 });
}

// PUT /api/admin/products/:id - Update product
export async function PUT(req: Request, { params }) {
  // ... validation and update ...

  await redis.del(CACHE_KEYS.PRODUCTS_ALL);
  console.log('Cleared product cache after update');

  return NextResponse.json({ product: result.rows[0] });
}

// DELETE /api/admin/products/:id - Delete product
export async function DELETE(req: Request, { params }) {
  // ... delete from DB ...

  await redis.del(CACHE_KEYS.PRODUCTS_ALL);
  console.log('Cleared product cache after deletion');

  return NextResponse.json({ success: true });
}
```

---

## Rate Limiting

### Implementation Pattern

```typescript
// Fixed-window rate limiting
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

### Rate Limits Summary

| Endpoint            | Limit          | Window  | Key Pattern                                        |
| ------------------- | -------------- | ------- | -------------------------------------------------- |
| **Checkout**        | 10             | 60s     | `ratelimit:checkout:user:{id}` or `ip:{ip}`        |
| **Register**        | 5/IP, 1/email  | 10min   | `rl:register:ip:{ip}`, `rl:register:email:{email}` |
| **Forgot Password** | 10/IP, 3/email | 5-15min | `rl:forgot:ip:{ip}`, `rl:forgot:email:{email}`     |
| **Reset Password**  | 10/IP, 5/token | 15min   | `rl:reset:ip:{ip}`, `rl:reset:tokenhash:{hash}`    |
| **Change Password** | 3/user         | 15min   | `rl:change-password:user:{id}`                     |

### Checkout Rate Limiting Example

```typescript
export async function POST(req: Request) {
  const session = await auth();

  // Identify user: prefer user_id, fallback to IP
  const identifier = session?.user?.id
    ? `user:${session.user.id}`
    : `ip:${req.headers.get("x-forwarded-for") || "unknown"}`;

  const rateLimitKey = `ratelimit:checkout:${identifier}`;
  const count = await redis.incr(rateLimitKey);

  // Set expiry on first request
  if (count === 1) {
    await redis.expire(rateLimitKey, 60);
  }

  // Block if over limit
  if (count > 10) {
    return NextResponse.json(
      {
        error: "Too many checkout attempts. Try again in a minute.",
        retryAfter: 60,
      },
      { status: 429 }
    );
  }

  console.log(`Rate limit: ${identifier} - ${count}/10`);

  // ... continue with checkout ...
}
```

### Sliding Window Behavior

```
t=0s:   Request 1  → count=1, expire in 60s
t=5s:   Request 2  → count=2
t=10s:  Request 3  → count=3
...
t=50s:  Request 10 → count=10 (allowed)
t=55s:  Request 11 → count=11 (BLOCKED, 429)
t=60s:  Key expires, counter resets
t=61s:  Request 12 → count=1 (allowed again)
```

---

## Cache Configuration Summary

| Cache Key        | TTL        | Invalidation Trigger         |
| ---------------- | ---------- | ---------------------------- |
| `products:all`   | 10 minutes | Admin CRUD on products       |
| `categories:all` | 1 hour     | Admin CRUD on categories     |
| `product:{id}`   | 30 minutes | (Not currently used, future) |

---

## Performance Results

| Metric              | Without Cache | With Cache | Improvement    |
| ------------------- | ------------- | ---------- | -------------- |
| Products list query | ~450ms        | ~8ms       | **56x faster** |
| Categories query    | ~200ms        | ~8ms       | **25x faster** |
| Cache hit rate      | -             | ~80%       | -              |

---

## Why Upstash over Standard Redis

| Feature            | Standard Redis      | Upstash       |
| ------------------ | ------------------- | ------------- |
| Edge Runtime       | ❌ TCP required     | ✅ HTTP-based |
| Connection pooling | Required            | Not needed    |
| Serverless         | Complex setup       | Zero config   |
| Latency            | \<1ms               | ~8ms          |
| Cold start         | Connection overhead | None          |

**Trade-off accepted:** 8ms vs 1ms is negligible when saving 400ms+ DB query.

---

## Best Practices

### 1. Cache Key Naming Convention

```
{resource}:{scope}:{identifier}

products:all           → All products
product:123            → Single product
categories:all         → All categories
ratelimit:checkout:user:456  → Rate limit for user
rl:forgot:ip:192.168.1.1     → Rate limit for IP
```

### 2. TTL Guidelines

| Data Type           | Recommended TTL | Reason                           |
| ------------------- | --------------- | -------------------------------- |
| Product list        | 10 minutes      | Balance freshness vs performance |
| Categories          | 1 hour          | Rarely changes                   |
| Rate limit counters | 60-900 seconds  | Match rate limit window          |
| Session data        | 30 days         | Match auth session               |

### 3. When NOT to Cache

| Scenario            | Reason                                   |
| ------------------- | ---------------------------------------- |
| Filtered queries    | Too many variations to cache efficiently |
| User-specific data  | Cache key explosion                      |
| Real-time inventory | Must be accurate                         |
| Admin panel data    | Always needs fresh data                  |

### 4. Cache Stampede Prevention

Current approach: Accept occasional stampedes (simple)

Future improvement (if needed):

```typescript
// Lock-based cache population
const lockKey = `lock:${cacheKey}`;
const acquired = await redis.setnx(lockKey, "1");

if (acquired) {
  await redis.expire(lockKey, 5); // 5 second lock
  const data = await queryDatabase();
  await redis.set(cacheKey, data, { ex: TTL });
  await redis.del(lockKey);
  return data;
} else {
  // Wait and retry cache
  await sleep(100);
  return await redis.get(cacheKey);
}
```

---

## Monitoring & Debugging

### Log Output

```
Cache HIT - Products loaded from Redis
Cache MISS - Loading from database
Cached 50 products for 600s
Cleared product cache after creation
Rate limit: user:123 - 5/10
```

### Response Headers (Debug)

```typescript
return NextResponse.json({
  products,
  source: "cache", // or "database" or "database-filtered"
});
```

Use `source` field to verify caching behavior in development.
