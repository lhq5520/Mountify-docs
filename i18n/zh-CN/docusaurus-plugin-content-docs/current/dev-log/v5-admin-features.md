# v5.0 - 管理后台

## 概述

构建完整的管理面板：商品管理、订单管理、库存跟踪、分类系统。

---

## 5A - 商品管理

### 商品 CRUD API

```typescript
// POST /api/admin/products - 创建商品
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { name, price, description, imageUrl, categoryId } = await req.json();

  // 验证
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "商品名称至少 2 个字符" }, { status: 400 });
  }

  if (typeof price !== "number" || price <= 0) {
    return NextResponse.json({ error: "价格必须为正数" }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO products (name, price, description, image_url, category_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name.trim(), price, description, imageUrl, categoryId]
  );

  // 清除缓存
  await redis.del(CACHE_KEYS.PRODUCTS_ALL);

  return NextResponse.json({ product: result.rows[0] }, { status: 201 });
}
```

### 图片上传（Cloudinary）

```typescript
// POST /api/admin/upload
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "mountify/products" }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      })
      .end(buffer);
  });

  return NextResponse.json({
    url: result.secure_url,
    publicId: result.public_id,
  });
}
```

---

## 5B - 订单管理

### 订单列表

```typescript
// GET /api/admin/orders
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;

  let whereClause = "";
  const params: any[] = [];

  if (status && status !== "all") {
    whereClause = "WHERE o.status = $1";
    params.push(status);
  }

  const result = await query(
    `SELECT o.*, u.email as user_email,
            json_agg(json_build_object(
              'product_name', p.name,
              'quantity', oi.quantity,
              'price', oi.price
            )) as items
     FROM orders o
     LEFT JOIN users u ON o.user_id = u.id
     LEFT JOIN order_items oi ON o.id = oi.order_id
     LEFT JOIN products p ON oi.product_id = p.id
     ${whereClause}
     GROUP BY o.id, u.email
     ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );

  return NextResponse.json({ orders: result.rows });
}
```

### 更新订单状态

```typescript
// PUT /api/admin/orders/[id]
export async function PUT(req: Request, { params }) {
  const { status, trackingNumber } = await req.json();

  // 验证状态转换
  const validStatuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "无效状态" }, { status: 400 });
  }

  const result = await query(
    `UPDATE orders 
     SET status = $1, tracking_number = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, trackingNumber, params.id]
  );

  return NextResponse.json({ order: result.rows[0] });
}
```

---

## 5C - 库存管理

### 库存表

```sql
CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  sku_id BIGINT NOT NULL UNIQUE REFERENCES products(id),
  on_hand INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 可用 = on_hand - reserved
```

### 库存更新

```typescript
// PUT /api/admin/inventory/[skuId]
export async function PUT(req: Request, { params }) {
  const { onHand } = await req.json();

  if (typeof onHand !== "number" || onHand < 0) {
    return NextResponse.json({ error: "库存必须为非负数" }, { status: 400 });
  }

  const result = await query(
    `UPDATE inventory 
     SET on_hand = $1, updated_at = NOW()
     WHERE sku_id = $2
     RETURNING *`,
    [onHand, params.skuId]
  );

  return NextResponse.json({ inventory: result.rows[0] });
}
```

---

## 5D - 分类系统

### 分类表

```sql
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER DEFAULT 0
);
```

### 分类 CRUD

```typescript
// POST /api/admin/categories
export async function POST(req: Request) {
  const { name, slug, description, displayOrder } = await req.json();

  // Slug 验证
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return NextResponse.json(
      { error: "Slug 只能包含小写字母、数字和连字符" },
      { status: 400 }
    );
  }

  const result = await query(
    `INSERT INTO categories (name, slug, description, display_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, slug, description, displayOrder || 0]
  );

  await redis.del("categories:all");

  return NextResponse.json({ category: result.rows[0] }, { status: 201 });
}
```

---

## 学到的经验

1. **RBAC 很重要**：每个管理 API 都验证角色
2. **缓存失效**：CUD 操作后清除相关缓存
3. **审计日志**：考虑记录管理操作
4. **批量操作**：未来可添加批量更新库存
