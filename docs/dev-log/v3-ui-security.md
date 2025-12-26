# Version 3: UI/UX & Security

> **Focus:** Design System, Price Validation, Loading States

---

## Overview

Version 3 establishes a consistent design system and fixes the critical price manipulation vulnerability from v2.

```
Goal: Polish UI + Eliminate Security Vulnerabilities
```

---

## 3A - Design System

### Objective

Create a consistent, polished visual design language.

### CSS Variables

**File:** `src/app/globals.css`

```css
:root {
  /* Colors */
  --color-primary: #007aff;
  --color-primary-hover: #0051d5;

  --color-text-primary: #1a1a1a;
  --color-text-secondary: #666666;
  --color-text-tertiary: #999999;

  --color-background: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e5e5e5;

  --color-error: #ff3b30;
  --color-success: #34c759;

  /* Radius */
  --radius-md: 12px;
  --radius-full: 9999px;
}
```

### Typography Scale

| Level      | Class                                     | Usage                 |
| ---------- | ----------------------------------------- | --------------------- |
| Page Title | `text-2xl md:text-3xl font-semibold`      | Product name, headers |
| Section    | `text-lg font-semibold`                   | Section headings      |
| Body       | `text-sm md:text-base`                    | Descriptions          |
| Small      | `text-xs`                                 | Helper text           |
| Label      | `text-[11px] uppercase tracking-[0.16em]` | Category labels       |

### Component Patterns

**Primary Button:**

```jsx
className="bg-black text-white hover:bg-gray-900
           rounded-full px-6 py-2.5 text-sm font-medium
           transition-colors active:scale-95"
```

**Secondary Button:**

```jsx
className="border border-[var(--color-border)] bg-white
           text-[var(--color-text-secondary)] hover:border-gray-400
           rounded-full px-3 py-1.5 h-9 text-xs font-medium"
```

**Card:**

```jsx
className="rounded-2xl bg-white border border-[var(--color-border)]
           shadow-sm hover:shadow-lg transition-all duration-300"
```

### Animation System

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

| Speed | Duration  | Use Case             |
| ----- | --------- | -------------------- |
| Fast  | 150ms     | Micro-interactions   |
| Base  | 200ms     | Standard transitions |
| Slow  | 300-500ms | Page loads, images   |

### Design Inspirations

| Source       | Element                       |
| ------------ | ----------------------------- |
| Apple        | Color palette, subtle shadows |
| Verve Coffee | Typography, spacing           |
| Pure Cycles  | Minimalist cards              |

---

## 3B - Price Validation

### Objective

Eliminate price manipulation vulnerability.

### The Problem

```typescript
// ❌ v2: Frontend sends price (VULNERABLE)
const { items } = await req.json();
// items = [{ id: 1, price: 0.01, quantity: 100 }]  ← Attacker modified!

const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
// total = $1.00 instead of $2,999.00
```

### The Fix

```typescript
// ✅ v3: Backend fetches price from database
export async function POST(req: Request) {
  const { items } = await req.json();

  // Only trust productId and quantity from frontend
  const productIds = items.map((item) => item.productId);

  // Fetch REAL prices from database
  const result = await query(
    "SELECT id, price, name FROM products WHERE id = ANY($1)",
    [productIds]
  );

  const productMap = new Map(result.rows.map((r) => [r.id, r]));

  // Calculate total using DATABASE prices
  const total = items.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    return sum + Number(product.price) * item.quantity;
  }, 0);

  // ... create Stripe session with database prices
}
```

### Additional Validations

**Quantity Limits:**

```typescript
for (const item of items) {
  if (
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 100
  ) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }
}
```

**Product Existence:**

```typescript
const foundIds = result.rows.map((r) => r.id);
const missingIds = productIds.filter((id) => !foundIds.includes(id));

if (missingIds.length > 0) {
  return NextResponse.json(
    { error: `Products not found: ${missingIds.join(", ")}` },
    { status: 400 }
  );
}
```

---

## 3C - Loading States

### Objective

Polish user experience during async operations.

### Skeleton Loading

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-border) 0%,
    var(--color-surface) 50%,
    var(--color-border) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite linear;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

### Product Grid Skeleton

```jsx
{
  loading && (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5] rounded-2xl bg-gray-200" />
          <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-1/2 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
```

### Empty States

```jsx
{
  !loading && products.length === 0 && (
    <div className="text-center py-16">
      <p className="text-lg font-medium mb-2">No products found</p>
      <p className="text-sm text-gray-500 mb-4">Try adjusting your filters</p>
      <button className="bg-black text-white rounded-full px-6 py-2.5">
        View All Products
      </button>
    </div>
  );
}
```

---

## 3D - Responsive Design

### Breakpoints

```
sm:  640px   → Mobile landscape
md:  768px   → Tablet
lg:  1024px  → Laptop
xl:  1280px  → Desktop
```

### Product Grid

```jsx
// 2 columns mobile → 4 columns desktop
className = "grid grid-cols-2 gap-4 md:gap-8 lg:grid-cols-3 xl:grid-cols-4";
```

### Product Card Adjustments

| Element       | Mobile        | Desktop       |
| ------------- | ------------- | ------------- |
| Border radius | `rounded-xl`  | `rounded-2xl` |
| Gap           | `gap-4`       | `gap-8`       |
| Badge text    | `text-[10px]` | `text-xs`     |
| Margin        | `mt-2`        | `mt-3`        |

---

## 3E - Accessibility

### Focus States

```css
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Semantic HTML

```jsx
// Use semantic elements
<main>
  <section>
    <article> {/* Product card */}
      <h2>{product.name}</h2>
    </article>
  </section>
</main>

// Use aria labels
<button aria-label="Add to cart">
  <ShoppingCart />
</button>
```

---

## Security Status After v3

| Vulnerability      | v2 Status     | v3 Status   |
| ------------------ | ------------- | ----------- |
| Price Manipulation | ⚠️ Vulnerable | ✅ Fixed    |
| SQL Injection      | ✅ Safe       | ✅ Safe     |
| Quantity Abuse     | ⚠️ No limit   | ✅ 1-100    |
| Invalid Products   | ⚠️ No check   | ✅ Verified |

---

## Files Modified

| File                                 | Changes                   |
| ------------------------------------ | ------------------------- |
| `src/app/globals.css`                | Design tokens, animations |
| `src/app/api/checkout/route.ts`      | Price validation          |
| `src/app/products/page.tsx`          | Skeleton loading          |
| `src/app/products/[id]/page.tsx`     | Loading states            |
| `src/app/components/ProductCard.tsx` | New design                |

---

## Design Decisions

### Why CSS Variables?

```css
/* Easy to update, consistent across app */
background: var(--color-background);

/* vs. hardcoded */
background: #fafafa; /* What if we need dark mode? */
```

### Why Tailwind?

- **Utility-first**: Fast iteration
- **Responsive**: Built-in breakpoints
- **Consistent**: Design tokens via config
- **No naming**: No `.product-card-container-wrapper`

### Why Not Component Library?

- **Learning**: Build from scratch to understand
- **Customization**: Full control over design
- **Bundle size**: Only what we need

---

## Next Version Preview

**Version 4.0** will add user authentication with NextAuth and Redis caching for performance. This marks the **MVP milestone**.
