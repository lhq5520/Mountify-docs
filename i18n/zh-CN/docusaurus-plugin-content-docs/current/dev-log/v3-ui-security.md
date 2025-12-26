# v3.0 - UI/UX 与安全

## 概述

建立设计系统，修复价格篡改漏洞，增强输入验证。

---

## 3A - 设计系统

### CSS 变量

```css
:root {
  /* 颜色 */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-text: #1f2937;
  --color-background: #ffffff;
  --color-border: #e5e7eb;

  /* 间距 */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;

  /* 圆角 */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
}
```

### 响应式网格

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {products.map((product) => (
    <ProductCard key={product.id} product={product} />
  ))}
</div>
```

---

## 3B - 价格验证

### 漏洞发现

v2 版本存在价格篡改漏洞：

```javascript
// ❌ 有漏洞：前端可以发送任意价格
fetch("/api/checkout", {
  body: JSON.stringify({
    items: [{ productId: 1, price: 0.01, quantity: 10 }], // 篡改价格！
  }),
});
```

### 修复方案

```typescript
// ✅ 安全：忽略前端价格，从数据库获取
export async function POST(req: Request) {
  const { items } = await req.json();

  // 从数据库获取真实价格
  const productResult = await query(
    "SELECT id, price FROM products WHERE id = ANY($1)",
    [items.map((i) => i.productId)]
  );

  const productMap = new Map(productResult.rows.map((r) => [r.id, r]));

  // 使用数据库价格计算总额
  const total = items.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    return sum + Number(product.price) * item.quantity;
  }, 0);
}
```

---

## 3C - 输入验证

### 数量验证

```typescript
// 类型和范围检查
if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
  return NextResponse.json({ error: "数量格式无效" }, { status: 400 });
}

if (quantity < 1 || quantity > 100) {
  return NextResponse.json({ error: "数量必须在 1-100 之间" }, { status: 400 });
}
```

### 商品存在性验证

```typescript
// 验证所有商品 ID 存在
const foundIds = productResult.rows.map((r) => r.id);
const missingIds = items
  .map((i) => i.productId)
  .filter((id) => !foundIds.includes(id));

if (missingIds.length > 0) {
  return NextResponse.json(
    { error: `商品不存在: ${missingIds.join(", ")}` },
    { status: 400 }
  );
}
```

---

## 学到的经验

1. **安全是迭代的**：v2 有漏洞，v3 修复
2. **永不信任前端**：所有价格和敏感数据必须服务端验证
3. **设计系统**：CSS 变量保证一致性
4. **输入验证**：类型、范围、存在性都要检查
