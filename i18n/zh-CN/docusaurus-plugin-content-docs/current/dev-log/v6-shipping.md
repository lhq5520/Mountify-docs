# v6.0 - 物流与邮件

## 概述

完善订单流程：收货地址收集、物流追踪、邮件通知、用户地址簿。

---

## 6A - 收货地址

### Stripe 地址收集

```typescript
const session = await stripe.checkout.sessions.create({
  // ... 其他配置
  shipping_address_collection: {
    allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "JP", "CN"],
  },
  phone_number_collection: { enabled: true },
});
```

### 地址快照存储

```sql
-- orders 表新增字段
ALTER TABLE orders ADD COLUMN shipping_name TEXT;
ALTER TABLE orders ADD COLUMN shipping_phone TEXT;
ALTER TABLE orders ADD COLUMN shipping_address JSONB;
```

```typescript
// Webhook 处理
const shippingAddress = {
  line1: session.shipping_details?.address?.line1,
  line2: session.shipping_details?.address?.line2,
  city: session.shipping_details?.address?.city,
  state: session.shipping_details?.address?.state,
  postal_code: session.shipping_details?.address?.postal_code,
  country: session.shipping_details?.address?.country,
};

await query(
  `UPDATE orders 
   SET shipping_name = $1, shipping_phone = $2, shipping_address = $3
   WHERE stripe_session_id = $4`,
  [
    session.shipping_details?.name,
    session.customer_details?.phone,
    JSON.stringify(shippingAddress),
    session.id,
  ]
);
```

---

## 6B - 用户地址簿

### 地址表

```sql
CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  phone TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, line1, postal_code)
);
```

### 自动保存地址

```typescript
// 支付成功后保存地址（如已登录）
if (userId && session.shipping_details?.address) {
  await query(
    `INSERT INTO addresses (user_id, name, line1, line2, city, state, postal_code, country, phone, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 
             NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1))
     ON CONFLICT (user_id, line1, postal_code) DO NOTHING`,
    [
      userId,
      session.shipping_details.name,
      session.shipping_details.address.line1,
      session.shipping_details.address.line2,
      session.shipping_details.address.city,
      session.shipping_details.address.state,
      session.shipping_details.address.postal_code,
      session.shipping_details.address.country,
      session.customer_details?.phone,
    ]
  );
}
```

---

## 6C - 物流追踪

### 运单号存储

```sql
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN carrier TEXT;
```

### 更新运单

```typescript
// PUT /api/admin/orders/[id]/shipping
export async function PUT(req: Request, { params }) {
  const { trackingNumber, carrier } = await req.json();

  const result = await query(
    `UPDATE orders 
     SET tracking_number = $1, carrier = $2, status = 'shipped', updated_at = NOW()
     WHERE id = $3 AND status = 'paid'
     RETURNING *`,
    [trackingNumber, carrier, params.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "订单不存在或状态不允许" }, { status: 400 });
  }

  // 发送发货通知邮件
  await sendShippingNotificationEmail(result.rows[0]);

  return NextResponse.json({ order: result.rows[0] });
}
```

---

## 6D - 邮件通知

### Resend 配置

```typescript
// src/lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderConfirmationEmail(order: Order) {
  await resend.emails.send({
    from: "Mountify <orders@yourdomain.com>",
    to: order.email,
    subject: `订单确认 #${order.id}`,
    html: `
      <h1>感谢您的订单！</h1>
      <p>订单号: #${order.id}</p>
      <p>总计: $${order.total}</p>
      <h2>商品</h2>
      <ul>
        ${order.items.map((item) => `<li>${item.name} x ${item.quantity}</li>`).join("")}
      </ul>
      <h2>收货地址</h2>
      <p>${order.shipping_name}<br>
         ${order.shipping_address.line1}<br>
         ${order.shipping_address.city}, ${order.shipping_address.state} ${order.shipping_address.postal_code}
      </p>
    `,
  });
}

export async function sendShippingNotificationEmail(order: Order) {
  await resend.emails.send({
    from: "Mountify <orders@yourdomain.com>",
    to: order.email,
    subject: `您的订单已发货 #${order.id}`,
    html: `
      <h1>您的订单已发货！</h1>
      <p>运单号: ${order.tracking_number}</p>
      <p>承运商: ${order.carrier}</p>
      <p><a href="${getTrackingUrl(order.carrier, order.tracking_number)}">追踪包裹</a></p>
    `,
  });
}
```

---

## 订单状态流转

```
pending → paid → shipped → delivered
    ↓       ↓
 expired  cancelled
```

---

## 学到的经验

1. **地址快照**：订单地址不应引用地址表（用户可能修改/删除）
2. **幂等保存**：`ON CONFLICT DO NOTHING` 防止重复地址
3. **邮件模板**：考虑使用 React Email 创建精美模板
4. **物流集成**：未来可集成 EasyPost 等 API
