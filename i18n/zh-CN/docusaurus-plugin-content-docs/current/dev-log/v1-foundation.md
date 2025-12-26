# v1.0 - 基础搭建

## 概述

建立项目基础：Next.js 设置、API 路由、React 组件结构、购物车状态管理。

---

## 1A - API 路由

### Next.js App Router API

```typescript
// src/app/api/products/route.ts
export async function GET() {
  const products = [
    { id: 1, name: "产品 A", price: 29.99 },
    { id: 2, name: "产品 B", price: 49.99 },
  ];
  return NextResponse.json({ products });
}
```

### 动态路由

```typescript
// src/app/api/products/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const product = products.find(p => p.id === parseInt(params.id));
  if (!product) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }
  return NextResponse.json({ product });
}
```

---

## 1B - 组件结构

```
src/
├── app/
│   ├── layout.tsx        # 根布局
│   ├── page.tsx          # 首页
│   ├── products/
│   │   └── [id]/page.tsx # 商品详情
│   └── cart/page.tsx     # 购物车
├── components/
│   ├── ProductCard.tsx
│   ├── CartItem.tsx
│   └── Navbar.tsx
└── context/
    └── CartContext.tsx
```

---

## 1C - 购物车上下文

```typescript
// src/context/CartContext.tsx
interface CartItem {
  productId: number;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
}

export const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (productId: number, quantity: number) => {
    setItems(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        return prev.map(item =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { productId, quantity }];
    });
  };

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}
```

---

## 学到的经验

1. **App Router vs Pages Router**：App Router 更适合现代 React 模式
2. **Context 用于全局状态**：简单的购物车不需要 Redux
3. **TypeScript 接口**：尽早定义类型避免后期重构
