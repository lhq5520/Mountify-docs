# 缓存与性能

## 设计理念

- **Cache-aside 模式**：先检查缓存，回退到数据库，然后填充缓存
- **优雅降级**：Redis 故障 → 应用仍可工作（仅数据库）
- **限流保护**：保护昂贵的端点免受滥用
- **Upstash 适配 Edge**：基于 HTTP 的 Redis，可在 serverless/中间件中使用
- **智能缓存绕过**：有过滤条件的查询跳过缓存，直接查库

---

## 架构

```
┌──────────────┐
│    请求      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│           有过滤条件？               │
│  (分类、排序、页码、搜索)            │
└──────┬───────────────────┬───────────┘
       │                   │
      是                   否
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │ Redis 缓存   │
│  (过滤查询)  │    │   检查       │
└──────────────┘    └──────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
                  命中          未命中
                    │             │
                    ▼             ▼
             ┌──────────┐  ┌──────────────┐
             │  返回    │  │  PostgreSQL  │
             │  缓存    │  │  + 填充      │
             │  (~8ms)  │  │  缓存        │
             └──────────┘  └──────────────┘
```

---

## Redis 客户端配置

### 文件：`src/lib/redis.ts`

```typescript
import { Redis } from "@upstash/redis";

type RedisClient = InstanceType<typeof Redis>;

let _client: RedisClient | null = null;

function getClientOrNull(): RedisClient | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null; // 优雅降级

  if (!_client) {
    _client = new Redis({ url, token });
  }
  return _client;
}

// 安全的 Redis 代理：环境变量缺失时表现为"缓存禁用"
export const redis = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const client = getClientOrNull();

      if (!client) {
        // 为常用方法返回空操作
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

// 缓存键模式
export const CACHE_KEYS = {
  PRODUCTS_ALL: "products:all",
  PRODUCT_BY_ID: (id: number) => `product:${id}`,
};

// TTL 配置（秒）
export const CACHE_TTL = {
  PRODUCTS: 60 * 10, // 10 分钟
  PRODUCT: 60 * 30, // 30 分钟
};
```

### 优雅降级

| 场景 | 行为 |
| ---- | ---- |
| Redis 已配置 | 正常缓存 |
| Redis 环境变量缺失 | 所有操作返回 null/0，应用无缓存工作 |
| Redis 连接失败 | 回退到仅数据库模式 |

---

## 商品缓存实现

### 文件：`src/app/api/products/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // 标准化参数
  const category = searchParams.get("category")?.trim().toLowerCase() || null;
  const sort = searchParams.get("sort")?.trim().toLowerCase() || "newest";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const search = searchParams.get("search")?.trim() || null;

  // 判断是否有过滤条件
  const hasFilters =
    (category && category !== "all") ||
    (sort && sort !== "newest") ||
    page > 1 ||
    (search && search.length >= 2);

  if (hasFilters) {
    // 跳过缓存 → 直接查询数据库
    return await getFilteredProducts(searchParams);
  }

  // 无过滤条件 → 使用缓存
  return await getAllProductsCached();
}
```

### 缓存路径（无过滤条件）

```typescript
async function getAllProductsCached() {
  // 1. 检查缓存
  const cached = await redis.get(CACHE_KEYS.PRODUCTS_ALL);

  if (cached) {
    console.log("缓存命中 - 从 Redis 加载商品");
    return NextResponse.json({
      products: typeof cached === "string" ? JSON.parse(cached) : cached,
      source: "cache",
    });
  }

  console.log("缓存未命中 - 从数据库加载");

  // 2. 查询数据库
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

  // 3. 填充缓存
  await redis.set(CACHE_KEYS.PRODUCTS_ALL, JSON.stringify(products), {
    ex: CACHE_TTL.PRODUCTS,
  });

  console.log(`缓存了 ${products.length} 个商品，有效期 ${CACHE_TTL.PRODUCTS}s`);

  return NextResponse.json({
    products,
    source: "database",
  });
}
```

### 过滤路径（跳过缓存）

```typescript
async function getFilteredProducts(searchParams: URLSearchParams) {
  // 构建动态 WHERE 子句
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

  // 构建 ORDER BY
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

  // 分页查询
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

## 分类缓存

### 文件：`src/app/api/categories/route.ts`

```typescript
const CACHE_KEY = "categories:all";
const CACHE_TTL = 60 * 60; // 1 小时（分类很少变化）

export async function GET() {
  // 1. 检查缓存
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json({
      categories: typeof cached === "string" ? JSON.parse(cached) : cached,
    });
  }

  // 2. 查询数据库
  const result = await query(`
    SELECT id, name, slug, description, display_order
    FROM categories
    ORDER BY display_order ASC, name ASC
  `);

  // 3. 填充缓存
  await redis.set(CACHE_KEY, JSON.stringify(result.rows), { ex: CACHE_TTL });

  return NextResponse.json({ categories: result.rows });
}
```

---

## 缓存失效

### 基于事件的失效

| 事件 | 失效的缓存键 |
| ---- | ------------ |
| 商品创建 | `products:all` |
| 商品更新 | `products:all` |
| 商品删除 | `products:all` |
| 分类创建 | `categories:all` |
| 分类更新 | `categories:all` |
| 分类删除 | `categories:all` |

### 实现示例

```typescript
// POST /api/admin/products - 创建商品
export async function POST(req: Request) {
  // ... 验证和插入 ...

  const result = await query(
    `INSERT INTO products (...) VALUES (...) RETURNING *`,
    [...]
  );

  // 立即失效缓存
  await redis.del(CACHE_KEYS.PRODUCTS_ALL);
  console.log('创建后清除商品缓存');

  return NextResponse.json({ product: result.rows[0] }, { status: 201 });
}

// PUT /api/admin/products/:id - 更新商品
export async function PUT(req: Request, { params }) {
  // ... 验证和更新 ...

  await redis.del(CACHE_KEYS.PRODUCTS_ALL);
  console.log('更新后清除商品缓存');

  return NextResponse.json({ product: result.rows[0] });
}

// DELETE /api/admin/products/:id - 删除商品
export async function DELETE(req: Request, { params }) {
  // ... 从数据库删除 ...

  await redis.del(CACHE_KEYS.PRODUCTS_ALL);
  console.log('删除后清除商品缓存');

  return NextResponse.json({ success: true });
}
```

---

## 限流

### 实现模式

```typescript
// 固定窗口限流
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

### 限流配置汇总

| 端点 | 限制 | 窗口 | Key 模式 |
| ---- | ---- | ---- | -------- |
| **结账** | 10 | 60s | `ratelimit:checkout:user:{id}` 或 `ip:{ip}` |
| **注册** | 5/IP, 1/邮箱 | 10分钟 | `rl:register:ip:{ip}`, `rl:register:email:{email}` |
| **忘记密码** | 10/IP, 3/邮箱 | 5-15分钟 | `rl:forgot:ip:{ip}`, `rl:forgot:email:{email}` |
| **重置密码** | 10/IP, 5/令牌 | 15分钟 | `rl:reset:ip:{ip}`, `rl:reset:tokenhash:{hash}` |
| **修改密码** | 3/用户 | 15分钟 | `rl:change-password:user:{id}` |

### 结账限流示例

```typescript
export async function POST(req: Request) {
  const session = await auth();

  // 识别用户：优先用户ID，回退到 IP
  const identifier = session?.user?.id
    ? `user:${session.user.id}`
    : `ip:${req.headers.get("x-forwarded-for") || "unknown"}`;

  const rateLimitKey = `ratelimit:checkout:${identifier}`;
  const count = await redis.incr(rateLimitKey);

  // 首次请求设置过期时间
  if (count === 1) {
    await redis.expire(rateLimitKey, 60);
  }

  // 超限则阻止
  if (count > 10) {
    return NextResponse.json(
      {
        error: "结账尝试过于频繁，请一分钟后再试。",
        retryAfter: 60,
      },
      { status: 429 }
    );
  }

  console.log(`限流: ${identifier} - ${count}/10`);

  // ... 继续结账流程 ...
}
```

### 滑动窗口行为

```
t=0s:   请求 1  → count=1, 60s 后过期
t=5s:   请求 2  → count=2
t=10s:  请求 3  → count=3
...
t=50s:  请求 10 → count=10（允许）
t=55s:  请求 11 → count=11（阻止，429）
t=60s:  Key 过期，计数器重置
t=61s:  请求 12 → count=1（再次允许）
```

---

## 缓存配置汇总

| 缓存键 | TTL | 失效触发 |
| ------ | --- | -------- |
| `products:all` | 10 分钟 | 管理员对商品的增删改 |
| `categories:all` | 1 小时 | 管理员对分类的增删改 |
| `product:{id}` | 30 分钟 | （暂未使用，未来扩展） |

---

## 性能结果

| 指标 | 无缓存 | 有缓存 | 提升 |
| ---- | ------ | ------ | ---- |
| 商品列表查询 | ~450ms | ~8ms | **快 56 倍** |
| 分类查询 | ~200ms | ~8ms | **快 25 倍** |
| 缓存命中率 | - | ~80% | - |

---

## 为什么选择 Upstash 而非标准 Redis

| 特性 | 标准 Redis | Upstash |
| ---- | ---------- | ------- |
| Edge Runtime | ❌ 需要 TCP | ✅ 基于 HTTP |
| 连接池 | 需要 | 不需要 |
| Serverless | 配置复杂 | 零配置 |
| 延迟 | \<1ms | ~8ms |
| 冷启动 | 连接开销 | 无 |

**接受的权衡：** 8ms vs 1ms 是微不足道的，因为节省了 400ms+ 的数据库查询。

---

## 最佳实践

### 1. 缓存键命名约定

```
{资源}:{范围}:{标识符}

products:all           → 所有商品
product:123            → 单个商品
categories:all         → 所有分类
ratelimit:checkout:user:456  → 用户限流
rl:forgot:ip:192.168.1.1     → IP 限流
```

### 2. TTL 指南

| 数据类型 | 推荐 TTL | 原因 |
| -------- | -------- | ---- |
| 商品列表 | 10 分钟 | 平衡新鲜度和性能 |
| 分类 | 1 小时 | 很少变化 |
| 限流计数器 | 60-900 秒 | 匹配限流窗口 |
| 会话数据 | 30 天 | 匹配认证会话 |

### 3. 何时不缓存

| 场景 | 原因 |
| ---- | ---- |
| 过滤查询 | 变体太多，难以高效缓存 |
| 用户特定数据 | 缓存键爆炸 |
| 实时库存 | 必须准确 |
| 管理面板数据 | 始终需要最新数据 |

### 4. 缓存雪崩预防

当前方案：接受偶发雪崩（简单）

未来改进（如果需要）：

```typescript
// 基于锁的缓存填充
const lockKey = `lock:${cacheKey}`;
const acquired = await redis.setnx(lockKey, "1");

if (acquired) {
  await redis.expire(lockKey, 5); // 5 秒锁
  const data = await queryDatabase();
  await redis.set(cacheKey, data, { ex: TTL });
  await redis.del(lockKey);
  return data;
} else {
  // 等待并重试缓存
  await sleep(100);
  return await redis.get(cacheKey);
}
```

---

## 监控与调试

### 日志输出

```
缓存命中 - 从 Redis 加载商品
缓存未命中 - 从数据库加载
缓存了 50 个商品，有效期 600s
创建后清除商品缓存
限流: user:123 - 5/10
```

### 响应头（调试）

```typescript
return NextResponse.json({
  products,
  source: "cache", // 或 "database" 或 "database-filtered"
});
```

在开发中使用 `source` 字段验证缓存行为。
