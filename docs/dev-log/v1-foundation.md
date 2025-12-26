# Version 1: Foundation

> **Focus:** API Routes, Dynamic Routing, Cart State

---

## Overview

Version 1 establishes the foundational architecture: connecting frontend to backend via API routes, implementing dynamic routing for product pages, and creating global cart state management.

```
Goal: Browser → API → Data Response → Render
```

---

## 1A - API Routes

### Objective

Create the first API endpoint and connect frontend to backend.

### Implementation

**API Endpoint:** `/api/products/route.ts`

```typescript
// Initial version: hardcoded data
export async function GET() {
  const products = [
    { id: 1, name: "Phone Mount", price: 29.99 },
    { id: 2, name: "Car Mount", price: 39.99 },
    // ...
  ];

  return NextResponse.json({ products });
}
```

**Frontend:** `/products/page.tsx`

```typescript
export default function ProductsPage() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products));
  }, []);

  return (
    <div className="grid grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

### Key Learning

- **API Routes**: Next.js convention for backend endpoints
- **fetch()**: Browser's native HTTP client
- **useState + useEffect**: React's data fetching pattern

### Verification

```
✅ Visit /products
✅ See product grid rendered
✅ Network tab shows /api/products request
```

---

## 1B - Dynamic Routing

### Objective

Implement product detail pages with URL parameters.

### Implementation

**Dynamic Route:** `/products/[id]/page.tsx`

```typescript
export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((res) => res.json())
      .then((data) => setProduct(data.product));
  }, [id]);

  if (!product) return <div>Loading...</div>;

  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </div>
  );
}
```

**API Endpoint:** `/api/products/[id]/route.ts`

```typescript
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const product = products.find((p) => p.id === parseInt(params.id));

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ product });
}
```

### Key Learning

| Concept        | Practical Meaning                        |
| -------------- | ---------------------------------------- |
| `[id]` folder  | Dynamic URL segments                     |
| `useParams()`  | Read URL parameters in client components |
| Route handlers | Backend logic per route                  |

### Verification

```
✅ Click product card → navigates to /products/1
✅ Detail page shows correct product
✅ "Loading..." flash confirms async fetch
```

---

## 1C - Cart Context

### Objective

Global cart state accessible from any page.

### Implementation

**Context Provider:** `/context/CartContext.tsx`

```typescript
interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
    setCart((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => setCart([]);

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
```

**Layout Integration:** `/app/layout.tsx`

```typescript
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CartProvider>
          <Navbar />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
```

**Usage in Components:**

```typescript
// Product detail page
const { addToCart } = useCart();
<button onClick={() => addToCart(product)}>Add to Cart</button>;

// Cart page
const { cart, removeFromCart, updateQuantity } = useCart();
```

### Key Learning

| Concept           | Practical Meaning                 |
| ----------------- | --------------------------------- |
| Context API       | Share state without prop drilling |
| Custom Hook       | Reusable logic encapsulation      |
| Immutable Updates | `setCart(prev => [...])` pattern  |
| Provider Pattern  | Wrap app to make state available  |

### Verification

```
✅ Add product from /products/1
✅ Navigate to /cart → item appears
✅ Add same product → quantity increases
✅ Remove item → disappears from cart
```

---

## Architecture Achieved

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  /products  │────▶│ /api/       │────▶│  Hardcoded  │
│  /products/ │     │ products    │     │  JSON Data  │
│  [id]       │     │ /[id]       │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│ CartContext │
│ (React)     │
└─────────────┘
```

---

## Files Created

| File                                 | Purpose                    |
| ------------------------------------ | -------------------------- |
| `src/app/api/products/route.ts`      | Product list endpoint      |
| `src/app/api/products/[id]/route.ts` | Single product endpoint    |
| `src/app/products/page.tsx`          | Product listing page       |
| `src/app/products/[id]/page.tsx`     | Product detail page        |
| `src/app/cart/page.tsx`              | Cart page                  |
| `src/app/context/CartContext.tsx`    | Global cart state          |
| `src/app/layout.tsx`                 | Root layout with providers |

---

## Limitations (To Address in v2)

| Limitation        | Impact              |
| ----------------- | ------------------- |
| Hardcoded data    | No real database    |
| Client-side cart  | Lost on refresh     |
| No persistence    | Orders not saved    |
| No authentication | Anyone can checkout |

---

## Next Version Preview

**Version 2.0** will replace hardcoded JSON with PostgreSQL database and add Stripe payment processing.
