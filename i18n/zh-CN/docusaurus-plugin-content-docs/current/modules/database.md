# 数据库设计

## 设计理念

数据库架构遵循以下原则：

1. **先规范化，为性能而反规范化** - 从清晰的关系开始，仅在经过测量后才添加冗余
2. **数据库级约束** - 不仅仅依赖应用层逻辑
3. **显式命名** - 自文档化的约束和索引
4. **有意图的外键** - 可丢弃数据使用 CASCADE，历史数据使用 RESTRICT

## 架构概览

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

## 关键设计决策

### 1. order_items 中的价格快照

```sql
-- order_items 存储购买时的价格
price NUMERIC(10,2) NOT NULL  -- 快照，非引用
```

**原因：** 商品价格会随时间变化。订单必须反映客户实际支付的金额。

```
商品价格：$29.99 → 客户购买 → order_items.price = 29.99
商品价格变为：$34.99
客户订单仍显示：$29.99 ✓
```

---

### 2. ON DELETE 策略

```sql
-- ✅ CASCADE：可丢弃/依赖数据
addresses      → users(id)    ON DELETE CASCADE  -- 用户删除 → 地址清除
cart_items     → users(id)    ON DELETE CASCADE  -- 用户删除 → 购物车清空
cart_items     → products(id) ON DELETE CASCADE  -- 商品删除 → 从购物车移除
order_items    → orders(id)   ON DELETE CASCADE  -- 订单删除 → 明细删除
product_images → products(id) ON DELETE CASCADE  -- 商品删除 → 图片删除
password_reset_tokens → users(id) ON DELETE CASCADE

-- ⚠️ SET NULL：保留历史，移除引用
products → categories(id) ON DELETE SET NULL
-- 分类删除 → 商品保留，category_id 变为 NULL

-- 🔒 RESTRICT（默认）：保护历史记录
orders → users(id)  -- 未指定 ON DELETE = RESTRICT
order_items → products(id)  -- 有订单历史的商品无法删除
```

---

### 3. CHECK 约束保证数据完整性

```sql
-- 数据库级角色验证
role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))

-- 订单状态状态机
status VARCHAR(50) CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'expired'))

-- 库存不能为负
on_hand INTEGER NOT NULL CHECK (on_hand >= 0)
reserved INTEGER DEFAULT 0 NOT NULL CHECK (reserved >= 0)

-- 购物车数量限制（防止滥用）
quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000)

-- 订单明细必须有正数量
quantity INTEGER NOT NULL CHECK (quantity > 0)
```

---

### 4. UNIQUE 约束（自动索引）

```sql
-- 单列 UNIQUE
users.email              -- PostgreSQL 自动创建：users_email_key
categories.name          -- CITEXT 实现大小写不敏感唯一性
categories.slug          -- URL 友好的唯一标识符
password_reset_tokens.user_id  -- 每用户一个活跃令牌

-- 复合 UNIQUE 用于购物车去重
UNIQUE(user_id, product_id)
-- 相同商品 → UPDATE 数量，而非 INSERT 重复
```

---

### 5. 特殊索引模式

```sql
-- 部分唯一索引：每用户只有一个默认地址
CREATE UNIQUE INDEX uq_addresses_one_default_per_user
ON addresses(user_id) WHERE is_default = true;

-- 去重索引：防止重复地址
CREATE UNIQUE INDEX uq_addresses_dedupe
ON addresses(user_id, line1, postal_code);

-- 复合索引用于常见查询模式
CREATE INDEX idx_addresses_user_default_created
ON addresses(user_id, is_default, created_at DESC);
-- 优化：获取用户地址，默认优先，然后按日期
```

---

## 索引策略

### 自动创建的索引（不要重复！）

```sql
-- 主键：自动索引
id SERIAL PRIMARY KEY  -- 创建：tablename_pkey

-- UNIQUE 约束：自动索引
email TEXT UNIQUE      -- 创建：users_email_key
```

### 手动索引用于查询模式

```sql
-- 外键查找
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_cart_items_user ON cart_items(user_id);
CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- 特定查询优化
CREATE INDEX idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX idx_reset_tokens_token ON password_reset_tokens(token_hash);
CREATE INDEX idx_inventory_updated_at ON inventory(updated_at);
```

### 何时不建索引

| 场景 | 原因 |
| ---- | ---- |
| `orders.status`（6 个值） | 低基数，全表扫描通常更快 |
| `is_default` BOOLEAN | 只有 2 个值，改用部分索引 |
| 已在复合索引中 | 复合索引的第一列覆盖单列查找 |
| 写多读少的表 | 索引维护开销 |

---

## 查询模式

### 1. 批量查询优于 N+1

```sql
-- ❌ N+1 问题（循环中）
for each item in cart:
    SELECT * FROM products WHERE id = ?  -- N 次查询

-- ✅ 批量查询
SELECT * FROM products WHERE id = ANY($1::int[])  -- 1 次查询
-- TypeScript: query(sql, [[1, 5, 8]])
```

### 2. UPSERT 用于购物车操作

```sql
INSERT INTO cart_items (user_id, product_id, quantity)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, product_id)
DO UPDATE SET
  quantity = cart_items.quantity + EXCLUDED.quantity,
  updated_at = now();

-- 首次添加：INSERT
-- 再次添加相同商品：UPDATE（增加数量）
-- 原子操作，无竞态条件
```

### 3. JOIN 用于订单历史

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

### 4. 库存预留模式

```sql
-- 预留库存（结账开始）
UPDATE inventory
SET reserved = reserved + $2,
    updated_at = now()
WHERE sku_id = $1
  AND on_hand - reserved >= $2  -- 检查可用库存
RETURNING *;

-- 确认库存（支付成功）
UPDATE inventory
SET on_hand = on_hand - $2,
    reserved = reserved - $2,
    updated_at = now()
WHERE sku_id = $1;

-- 释放库存（支付失败/过期）
UPDATE inventory
SET reserved = reserved - $2,
    updated_at = now()
WHERE sku_id = $1;
```

---

## 连接池

```typescript
// src/lib/db.ts
import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

// 单例池 - 在开发热重载时复用
export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool; // 跨 Next.js 热重载持久化
}

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release(); // 返回池，不关闭
  }
}
```

### 为什么用这个模式？

| 问题 | 解决方案 |
| ---- | -------- |
| 连接创建 ~50ms | 池复用 ~1ms |
| Next.js 热重载创建新池 | 全局单例持久化 |
| Serverless 冷启动 | 池跨请求持久化 |
| 连接耗尽 | 池限制最大连接数 |

---

## 触发器

### 自动更新时间戳

```sql
-- 可复用函数
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用到表
CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**好处**：`updated_at` 始终准确，无需在应用代码中记住。

---

## 数据类型选择

| 列 | 类型 | 原因 |
| -- | ---- | ---- |
| `price`、`total` | `NUMERIC(10,2)` | 精确小数，无浮点误差 |
| `name`、`slug` | `CITEXT` | 大小写不敏感比较（需要扩展） |
| `shipping_address` | `JSONB` | 灵活结构，可查询 |
| `tracking_details` | `JSONB` | 来自 17track API 的可变结构 |
| `status` | `VARCHAR(50)` | 可读，带 CHECK 约束 |
| `id` | `SERIAL` | 自增整数 |
| `sku_id` | `BIGINT` | 匹配 product.id，允许未来扩展 |

---

## 架构约定

```sql
-- 命名：全部使用 snake_case
user_id, created_at, is_default, tracking_number

-- 时间戳：始终使用 TIMESTAMPTZ（时区感知）
created_at TIMESTAMPTZ DEFAULT now()

-- 布尔值：is_ 或 has_ 前缀
is_default, is_primary, inventory_reserved

-- 外键：引用表（单数）+ _id
user_id, product_id, category_id, order_id

-- 索引：idx_{表}_{列}
idx_cart_items_user, idx_orders_tracking_number

-- 唯一索引：uq_{表}_{用途}
uq_addresses_dedupe, uq_addresses_one_default_per_user
```
