# Version 5: Admin & Features

> **Focus:** Admin Panel, OAuth, Search, Email, Inventory

---

## Overview

Version 5 transforms the MVP into a full-featured platform with comprehensive admin tools, social login, search, email notifications, and inventory management.

---

## 5A - Admin Panel

### Objective

Product, order, and category management interface.

### Routes Structure

```
/admin
├── /products        → Product CRUD
├── /categories      → Category management
├── /orders          → Order list + status
└── /inventory       → Stock management
```

### Product Management

**List Products:**

```typescript
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.created_at DESC
  `);

  return NextResponse.json({ products: result.rows });
}
```

**Create Product:**

```typescript
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, price, description, imageUrl, categoryId } = await req.json();

  // Validation
  if (!name || !price || price <= 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO products (name, price, description, image_url, category_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, price, description, imageUrl, categoryId]
  );

  // Invalidate cache
  await redis.del(CACHE_KEYS.PRODUCTS_ALL);

  return NextResponse.json({ product: result.rows[0] }, { status: 201 });
}
```

### Image Upload (Cloudinary)

```typescript
import cloudinary from "@/lib/cloudinary";

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

### Cache Invalidation

```typescript
// After any admin CRUD operation
await redis.del(CACHE_KEYS.PRODUCTS_ALL);
await redis.del(CACHE_KEYS.CATEGORIES_ALL);
```

---

## 5B - Google OAuth

### Objective

One-click social login.

### Configuration

```typescript
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({ ... }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      // Credentials login
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // Google OAuth: Auto-create user
      if (account?.provider === "google") {
        const email = token.email;
        if (!email) return token;

        // Upsert: Create new or return existing
        const res = await query(`
          INSERT INTO users (email, password_hash, role)
          VALUES ($1, NULL, 'customer')
          ON CONFLICT (email)
          DO UPDATE SET email = EXCLUDED.email
          RETURNING id, role
        `, [email]);

        token.id = res.rows[0].id.toString();
        token.role = res.rows[0].role;
      }

      return token;
    },
  },
});
```

### OAuth User Behavior

| Aspect           | Behavior                                     |
| ---------------- | -------------------------------------------- |
| First login      | Auto-create user with `password_hash = NULL` |
| Subsequent login | Return existing user                         |
| Password login   | Blocked (no password set)                    |
| Role             | Default `customer`                           |

---

## 5C - Search

### Objective

Product search with filters.

### URL-Based State

```
/products?category=mounts&sort=price_asc&page=2&search=phone
```

### API Implementation

```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") || "newest";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 12;

  // Build dynamic WHERE
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

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort mapping
  const orderMap = {
    newest: "p.created_at DESC",
    price_asc: "p.price ASC",
    price_desc: "p.price DESC",
    name: "p.name ASC",
  };

  // Query
  const result = await query(
    `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY ${orderMap[sort]}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
    [...params, limit, (page - 1) * limit]
  );

  return NextResponse.json({
    products: result.rows,
    pagination: { page, limit, total, totalPages },
  });
}
```

### Cache Strategy

- **No filters**: Use cache
- **With filters**: Skip cache, query DB directly

---

## 5D - Email Notifications

### Objective

Transactional emails via Resend.

### Setup

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderConfirmationEmail({
  orderId,
  email,
  total,
  items,
}: OrderEmailParams) {
  await resend.emails.send({
    from: "Mountify <orders@mountify.com>",
    to: email,
    subject: `Order Confirmation #${orderId}`,
    html: `
      <h1>Thank you for your order!</h1>
      <p>Order #${orderId}</p>
      <h2>Items:</h2>
      <ul>
        ${items
          .map(
            (item) =>
              `<li>${item.name} x ${item.quantity} - $${item.price}</li>`
          )
          .join("")}
      </ul>
      <p><strong>Total: $${total.toFixed(2)}</strong></p>
    `,
  });
}
```

### Email Types

| Email                 | Trigger                          |
| --------------------- | -------------------------------- |
| Order Confirmation    | Webhook: `payment_status = paid` |
| Shipping Notification | Admin clicks "Ship Order"        |
| Password Reset        | User requests reset              |

---

## 5E - Password Reset

### Objective

Secure password recovery flow.

### Flow

```
1. User enters email → POST /api/auth/forgot-password
2. Generate secure token → Hash with SHA-256 → Store hash in DB
3. Send email with plain token
4. User clicks link → POST /api/auth/reset-password
5. Hash submitted token → Compare with DB → Update password
```

### Security Features

```typescript
// Generate token
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

// Store only hash
await query(
  `
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
  VALUES ($1, $2, NOW() + INTERVAL '1 hour')
  ON CONFLICT (user_id) DO UPDATE SET ...
`,
  [userId, tokenHash]
);

// Atomic consumption
const result = await query(
  `
  UPDATE password_reset_tokens
  SET used = TRUE
  WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()
  RETURNING user_id
`,
  [tokenHash]
);
```

| Security Property | Implementation               |
| ----------------- | ---------------------------- |
| Token hashing     | SHA-256, only hash stored    |
| One-time use      | `used = TRUE` on consumption |
| Expiration        | 1 hour TTL                   |
| Rate limiting     | 3 requests/email/15min       |
| Email enumeration | Same response regardless     |

---

## 5F - Address Management

### Objective

Save and reuse shipping addresses.

### Schema

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
  country TEXT NOT NULL,
  phone TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One default per user
CREATE UNIQUE INDEX uq_addresses_one_default_per_user
ON addresses(user_id) WHERE is_default = true;

-- Prevent duplicates
CREATE UNIQUE INDEX uq_addresses_dedupe
ON addresses(user_id, line1, postal_code);
```

### Auto-Save from Checkout

```typescript
// In webhook handler, after payment success
if (userId && session.customer_details?.address) {
  await query(
    `
    INSERT INTO addresses (user_id, name, line1, city, postal_code, country, is_default)
    VALUES ($1, $2, $3, $4, $5, $6, NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1))
    ON CONFLICT (user_id, line1, postal_code) DO NOTHING
  `,
    [userId, ...addressFields]
  );
}
```

---

## 5G - Inventory Management

### Objective

Track stock with reservation system.

### Schema

```sql
CREATE TABLE inventory (
  sku_id BIGINT PRIMARY KEY REFERENCES products(id),
  on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Stock Model

```
on_hand:   Total physical stock
reserved:  Locked during checkout
available: on_hand - reserved
```

### Reservation Flow

```typescript
// 1. Reserve (checkout start)
const result = await query(
  `
  UPDATE inventory
  SET reserved = reserved + $1
  WHERE sku_id = $2 AND (on_hand - reserved) >= $1
  RETURNING sku_id
`,
  [quantity, productId]
);

if (result.rowCount === 0) {
  throw new Error("Insufficient stock");
}

// 2. Deduct (payment success)
await query(
  `
  UPDATE inventory
  SET on_hand = on_hand - $1, reserved = reserved - $1
  WHERE sku_id = $2
`,
  [quantity, productId]
);

// 3. Release (payment failed/expired)
await query(
  `
  UPDATE inventory
  SET reserved = reserved - $1
  WHERE sku_id = $2
`,
  [quantity, productId]
);
```

---

## 5H - Image Gallery

### Objective

Multi-image product display.

### Schema

```sql
CREATE TABLE product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  public_id TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE
);
```

### Gallery Component

```tsx
export default function ImageGallery({ images, productName }) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      {/* Main image */}
      <div className="aspect-square relative">
        <Image
          src={images[activeIndex].url}
          alt={productName}
          fill
          className="object-cover"
        />
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 mt-4">
        {images.map((img, i) => (
          <button
            key={img.id}
            onClick={() => setActiveIndex(i)}
            className={`w-16 h-16 rounded-lg overflow-hidden 
              ${i === activeIndex ? "ring-2 ring-black" : ""}`}
          >
            <Image src={img.url} alt="" fill className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Files Created

| File                                        | Purpose                  |
| ------------------------------------------- | ------------------------ |
| `src/app/admin/products/page.tsx`           | Product management       |
| `src/app/admin/orders/page.tsx`             | Order management         |
| `src/app/admin/categories/page.tsx`         | Category management      |
| `src/app/api/admin/*`                       | Admin API routes         |
| `src/lib/email.ts`                          | Email helpers            |
| `src/lib/cloudinary.ts`                     | Image upload             |
| `src/app/api/auth/forgot-password/route.ts` | Password reset request   |
| `src/app/api/auth/reset-password/route.ts`  | Password reset execution |
| `src/app/api/user/addresses/route.ts`       | Address CRUD             |
| `src/app/api/inventory/route.ts`            | Stock queries            |

---

## Feature Summary

| Feature                    | Status |
| -------------------------- | ------ |
| Admin product CRUD         | ✅     |
| Admin order management     | ✅     |
| Admin category management  | ✅     |
| Google OAuth               | ✅     |
| Product search             | ✅     |
| Filter + sort + pagination | ✅     |
| Order confirmation email   | ✅     |
| Password reset email       | ✅     |
| Address management         | ✅     |
| Inventory tracking         | ✅     |
| Stock reservation          | ✅     |
| Image gallery              | ✅     |

---

## Next Version Preview

**Version 6.0** will add shipping integration with 17track API and shipping notification emails.
