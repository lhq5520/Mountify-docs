# v2.0 - 数据库与支付

## 概述

集成 PostgreSQL 数据库和 Stripe 支付系统，从硬编码数据转向持久化存储。

---

## 2A - PostgreSQL 集成

### Neon Serverless

```typescript
// src/lib/db.ts
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
```

### 核心表结构

```sql
-- 用户表
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'customer'
);

-- 商品表
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  description TEXT,
  image_url TEXT
);

-- 订单表
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  email TEXT,
  total NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  stripe_session_id TEXT
);

-- 订单明细表
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL
);
```

---

## 2B - Stripe 集成

### 创建结账会话

```typescript
// src/app/api/checkout/route.ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { items } = await req.json();

  // 从数据库获取价格（永不信任前端）
  const productResult = await query(
    "SELECT id, price, name FROM products WHERE id = ANY($1)",
    [items.map((i: any) => i.productId)]
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: items.map((item: any) => {
      const product = productResult.rows.find((p) => p.id === item.productId);
      return {
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          product_data: { name: product.name },
          unit_amount: Math.round(product.price * 100),
        },
      };
    }),
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cart`,
  });

  return NextResponse.json({ url: session.url });
}
```

---

## 2C - Webhook 处理

```typescript
// src/app/api/webhooks/stripe/route.ts
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: "签名无效" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // 更新订单状态
    await query(
      "UPDATE orders SET status = 'paid' WHERE stripe_session_id = $1",
      [session.id]
    );
  }

  return NextResponse.json({ received: true });
}
```

---

## 学到的经验

1. **价格验证**：前端价格可被篡改，必须服务端验证
2. **Webhook 可靠性**：不依赖重定向成功，用 webhook 确认支付
3. **连接池**：Serverless 环境复用数据库连接
4. **幂等性**：Webhook 可能重复触发，需要处理
