# Payment Processing

## Design Philosophy

- **Never trust frontend prices**: Backend fetches from database
- **Webhooks for reliability**: Don't rely on redirect success
- **Atomic order creation**: Pending order before Stripe redirect
- **Idempotent processing**: Same webhook twice = same result
- **Inventory reservation**: Lock stock during checkout, release on failure/expiry

---

## Payment Flow

```
┌──────────┐   ┌───────────────┐   ┌──────────┐   ┌──────────┐
│  Cart    │──▶│   Checkout    │──▶│  Stripe  │──▶│ Success  │
│  Page    │   │   API         │   │  Hosted  │   │  Page    │
└──────────┘   └───────┬───────┘   └────┬─────┘   └────┬─────┘
                       │                │              │
          ┌────────────┼────────────────┼──────────────┘
          │            │                │
          ▼            ▼                ▼
    ┌───────────┐  ┌────────────┐  ┌────────────┐
    │   Rate    │  │  Reserve   │  │  Webhook   │
    │  Limiting │  │  Inventory │  │  Handler   │
    │  (Redis)  │  │ (Postgres) │  │            │
    └───────────┘  └────────────┘  └─────┬──────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   │                     │                     │
                   ▼                     ▼                     ▼
            ┌────────────┐       ┌────────────────┐    ┌─────────────┐
            │  Update    │       │    Deduct      │    │    Send     │
            │  Status    │       │   Inventory    │    │   Email     │
            │  → paid    │       │  on_hand -= N  │    │  (Resend)   │
            └────────────┘       └────────────────┘    └─────────────┘
```

---

## Inventory Reservation Model

### State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                     INVENTORY TABLE                              │
│  sku_id │ on_hand │ reserved │ available (on_hand - reserved)   │
├─────────┼─────────┼──────────┼───────────────────────────────────┤
│   101   │   100   │    0     │  100 (can sell)                  │
└─────────┴─────────┴──────────┴───────────────────────────────────┘
                              │
                    User starts checkout
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│   101   │   100   │    5     │   95 (5 reserved for user)       │
└─────────┴─────────┴──────────┴───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
        Payment Success                  Payment Failed/Expired
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ on_hand = 100 - 5 = 95  │     │ reserved = 5 - 5 = 0    │
│ reserved = 5 - 5 = 0    │     │ on_hand unchanged       │
│ (Stock sold)            │     │ (Stock released)        │
└─────────────────────────┘     └─────────────────────────┘
```

### Reservation SQL

```sql
-- Reserve: Check available AND lock atomically
UPDATE inventory
SET reserved = reserved + $1,
    updated_at = NOW()
WHERE sku_id = $2
  AND (on_hand - reserved) >= $1  -- Only if enough available
RETURNING sku_id;

-- If rowCount = 0 → Insufficient stock, ROLLBACK
```

### Deduction SQL (on payment success)

```sql
UPDATE inventory i
SET on_hand = i.on_hand - oi.quantity,
    reserved = i.reserved - oi.quantity,
    updated_at = NOW()
FROM order_items oi
WHERE oi.order_id = $1
  AND i.sku_id = oi.product_id;
```

### Release SQL (on expiry/failure)

```sql
UPDATE inventory i
SET reserved = GREATEST(0, i.reserved - oi.quantity),
    updated_at = NOW()
FROM order_items oi
WHERE oi.order_id = $1
  AND i.sku_id = oi.product_id;
```

---

## Checkout API

### File: `src/app/api/checkout/route.ts`

```typescript
const RESERVATION_MINUTES = 30;

export async function POST(req: Request) {
  const session = await auth();

  // ─────────────────────────────────────────────────────
  // 1. RATE LIMITING (Redis)
  // ─────────────────────────────────────────────────────
  const identifier = session?.user?.id
    ? `user:${session.user.id}`
    : `ip:${req.headers.get("x-forwarded-for") || "unknown"}`;

  const rateLimitKey = `ratelimit:checkout:${identifier}`;
  const requestCount = await redis.incr(rateLimitKey);

  if (requestCount === 1) {
    await redis.expire(rateLimitKey, 60); // 60 second window
  }

  if (requestCount > 10) {
    return NextResponse.json(
      { error: "Too many checkout attempts", retryAfter: 60 },
      { status: 429 }
    );
  }

  // ─────────────────────────────────────────────────────
  // 2. INPUT VALIDATION
  // ─────────────────────────────────────────────────────
  const body = await req.json();

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "No items" }, { status: 400 });
  }

  for (const item of body.items) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    ) {
      return NextResponse.json(
        { error: "Quantity must be 1-100" },
        { status: 400 }
      );
    }
  }

  // ─────────────────────────────────────────────────────
  // 3. MERGE DUPLICATE ITEMS
  // ─────────────────────────────────────────────────────
  // User might add same product multiple times → merge into single row
  const mergedMap = new Map<number, number>();
  for (const item of body.items) {
    mergedMap.set(
      item.productId,
      (mergedMap.get(item.productId) || 0) + item.quantity
    );
  }
  const mergedItems = Array.from(mergedMap.entries()).map(
    ([productId, quantity]) => ({ productId, quantity })
  );

  // ─────────────────────────────────────────────────────
  // 4. DATABASE TRANSACTION
  // ─────────────────────────────────────────────────────
  const client = await pool.connect();
  let orderId: number | null = null;

  try {
    await client.query("BEGIN");

    // 4a. Load products from DB (NEVER trust frontend prices)
    const productResult = await client.query(
      "SELECT id, price, name FROM products WHERE id = ANY($1)",
      [mergedItems.map((i) => i.productId)]
    );

    // Verify all products exist
    const foundIds = productResult.rows.map((r) => r.id);
    const missingIds = mergedItems
      .map((i) => i.productId)
      .filter((id) => !foundIds.includes(id));
    if (missingIds.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `Products not found: ${missingIds}` },
        { status: 400 }
      );
    }

    const productMap = new Map(productResult.rows.map((r) => [r.id, r]));

    // 4b. Ensure inventory rows exist (for new products)
    await client.query(
      `INSERT INTO inventory (sku_id, on_hand, reserved)
       SELECT unnest($1::bigint[]), 0, 0
       ON CONFLICT (sku_id) DO NOTHING`,
      [mergedItems.map((i) => i.productId)]
    );

    // 4c. Reserve inventory (atomic, prevents oversell)
    for (const item of mergedItems) {
      const reserveRes = await client.query(
        `UPDATE inventory
         SET reserved = reserved + $1, updated_at = NOW()
         WHERE sku_id = $2 AND (on_hand - reserved) >= $1
         RETURNING sku_id`,
        [item.quantity, item.productId]
      );

      if (reserveRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Insufficient stock", productId: item.productId },
          { status: 409 }
        );
      }
    }

    // 4d. Calculate total from DB prices
    const total = mergedItems.reduce((sum, item) => {
      const p = productMap.get(item.productId);
      return sum + Number(p.price) * item.quantity;
    }, 0);

    // 4e. Create pending order
    const reservedUntil = new Date(
      Date.now() + RESERVATION_MINUTES * 60 * 1000
    );
    const orderRes = await client.query(
      `INSERT INTO orders (email, total, status, user_id, inventory_reserved, reserved_until)
       VALUES ($1, $2, 'pending', $3, TRUE, $4)
       RETURNING id`,
      [email, total, userId, reservedUntil]
    );
    orderId = orderRes.rows[0].id;

    // 4f. Insert order items
    for (const item of mergedItems) {
      const p = productMap.get(item.productId);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (order_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [orderId, item.productId, item.quantity, p.price]
      );
    }

    await client.query("COMMIT");

    // ─────────────────────────────────────────────────────
    // 5. CREATE STRIPE SESSION (outside transaction)
    // ─────────────────────────────────────────────────────
    let stripeSession: Stripe.Checkout.Session;
    try {
      stripeSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: mergedItems.map((item) => {
          const p = productMap.get(item.productId);
          return {
            quantity: item.quantity,
            price_data: {
              currency: "usd",
              product_data: { name: p.name },
              unit_amount: Math.round(p.price * 100),
            },
          };
        }),
        success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/cart`,
        customer_email: email ?? undefined,
        shipping_address_collection: {
          allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "JP", "CN"],
        },
        phone_number_collection: { enabled: true },
        custom_text: {
          submit: {
            message: "We will process your order as soon as possible.",
          },
        },
        expires_at: Math.floor(Date.now() / 1000) + RESERVATION_MINUTES * 60,
      });
    } catch (stripeErr) {
      // Stripe failed → release reservation
      await releaseInventory(orderId);
      await cancelOrder(orderId);
      throw stripeErr;
    }

    // 5b. Save stripe_session_id
    await query(
      `UPDATE orders SET stripe_session_id = $1 WHERE id = $2 AND stripe_session_id IS NULL`,
      [stripeSession.id, orderId]
    );

    return NextResponse.json({ url: stripeSession.url });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

### Rate Limiting

| Limit       | Window     | Key Pattern                                                    |
| ----------- | ---------- | -------------------------------------------------------------- |
| 10 requests | 60 seconds | `ratelimit:checkout:user:{id}` or `ratelimit:checkout:ip:{ip}` |

---

## Webhook Handler

### File: `src/app/api/webhooks/stripe/route.ts`

### Event: `checkout.session.completed`

```typescript
if (session.payment_status === "paid") {
  // 1. Update order status + save shipping snapshot
  await query(
    `UPDATE orders
     SET status = 'paid',
         shipping_name = $2,
         shipping_phone = $3,
         shipping_address = $4,
         updated_at = NOW()
     WHERE stripe_session_id = $1 AND status = 'pending'
     RETURNING id`,
    [session.id, shippingName, shippingPhone, shippingAddress]
  );

  // 2. Deduct inventory (idempotent via inventory_reserved flag)
  const deductRes = await query(
    `UPDATE orders
     SET inventory_reserved = FALSE
     WHERE stripe_session_id = $1 AND inventory_reserved = TRUE
     RETURNING id`,
    [session.id]
  );

  if (deductRes.rows.length > 0) {
    const orderId = deductRes.rows[0].id;
    await query(
      `UPDATE inventory i
       SET on_hand = i.on_hand - oi.quantity,
           reserved = i.reserved - oi.quantity,
           updated_at = NOW()
       FROM order_items oi
       WHERE oi.order_id = $1 AND i.sku_id = oi.product_id`,
      [orderId]
    );
  }

  // 3. Send confirmation email
  const orderData = await query(`SELECT ... JOIN ...`, [session.id]);
  await sendOrderConfirmationEmail(orderData);

  // 4. Save address to user's address book (if logged in)
  if (userId && session.customer_details?.address) {
    await query(
      `INSERT INTO addresses (user_id, name, line1, ..., is_default)
       VALUES ($1, $2, $3, ..., NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1))
       ON CONFLICT (user_id, line1, postal_code) DO NOTHING`,
      [userId, ...]
    );
  }
}
```

### Event: `checkout.session.expired`

```typescript
// Release reserved inventory
const releaseRes = await query(
  `UPDATE orders
   SET status = 'expired', inventory_reserved = FALSE
   WHERE stripe_session_id = $1 AND inventory_reserved = TRUE
   RETURNING id`,
  [session.id]
);

if (releaseRes.rows.length > 0) {
  await query(
    `UPDATE inventory i
     SET reserved = GREATEST(0, i.reserved - oi.quantity),
         updated_at = NOW()
     FROM order_items oi
     WHERE oi.order_id = $1 AND i.sku_id = oi.product_id`,
    [releaseRes.rows[0].id]
  );
}
```

### Webhook Flow Diagram

```
                    Stripe sends webhook
                            │
                            ▼
                ┌───────────────────────┐
                │  Verify signature     │
                │  constructEvent()     │
                └───────────┬───────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
    checkout.session              checkout.session
       .completed                    .expired
            │                               │
            ▼                               ▼
    ┌───────────────┐              ┌───────────────┐
    │payment_status │              │ Release       │
    │   = paid?     │              │ inventory     │
    └───────┬───────┘              │ reserved -= N │
            │                      └───────────────┘
            ▼
    ┌───────────────┐
    │ Update order  │
    │ status='paid' │
    │ + shipping    │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Deduct stock  │
    │ on_hand -= N  │
    │ reserved -= N │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Send email    │
    │ (Resend)      │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ Save address  │
    │ (if logged in)│
    └───────────────┘
```

---

## Idempotency Guarantees

| Operation           | Mechanism                                      |
| ------------------- | ---------------------------------------------- |
| Order status update | `WHERE status = 'pending'` (only updates once) |
| Inventory deduction | `WHERE inventory_reserved = TRUE` flag         |
| Address save        | `ON CONFLICT ... DO NOTHING`                   |
| Stripe session link | `WHERE stripe_session_id IS NULL`              |

**Why it matters:** Stripe may send the same webhook multiple times. Each operation is designed to produce the same result regardless of how many times it runs.

---

## Failure Scenarios

### Stripe API Fails After DB Commit

```typescript
try {
  stripeSession = await stripe.checkout.sessions.create(...);
} catch (err) {
  // Rollback: release inventory + cancel order
  await query(
    `UPDATE inventory i
     SET reserved = GREATEST(0, i.reserved - oi.quantity)
     FROM order_items oi
     WHERE oi.order_id = $1 AND i.sku_id = oi.product_id`,
    [orderId]
  );

  await query(
    `UPDATE orders SET status = 'cancelled', inventory_reserved = FALSE WHERE id = $1`,
    [orderId]
  );

  throw err;
}
```

### User Abandons Checkout

Stripe session expires after 30 minutes → `checkout.session.expired` webhook fires → inventory released automatically.

---

## Security Measures

| Measure             | Implementation                              |
| ------------------- | ------------------------------------------- |
| Price validation    | Fetch from DB, ignore frontend              |
| Quantity limits     | 1-100 per item                              |
| Product existence   | Verify all IDs exist before processing      |
| Webhook signature   | `stripe.webhooks.constructEvent()`          |
| Idempotency         | Flag-based checks prevent double processing |
| Rate limiting       | 10 requests/minute per user or IP           |
| Reservation timeout | 30 minute expiry                            |

---

## Stripe Configuration

### Checkout Session Options

```typescript
stripe.checkout.sessions.create({
  mode: "payment",

  // Collect shipping info
  shipping_address_collection: {
    allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "JP", "CN"],
  },

  // Collect phone
  phone_number_collection: { enabled: true },

  // Custom submit button text
  custom_text: {
    submit: { message: "We will process your order as soon as possible." },
  },

  // Session expires in 30 minutes (matches reservation)
  expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
});
```

---

## Testing Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the webhook secret (whsec_...) to .env.local
```

### Test Cards

| Card Number           | Result             |
| --------------------- | ------------------ |
| `4242 4242 4242 4242` | Success            |
| `4000 0000 0000 0002` | Decline            |
| `4000 0027 6000 3184` | 3D Secure          |
| `4000 0000 0000 9995` | Insufficient funds |

---

## Order Status State Machine

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐     ┌─────────┐     ┌───────────┐
    │  paid   │     │ expired │     │ cancelled │
    └────┬────┘     └─────────┘     └───────────┘
         │
         ▼
    ┌─────────┐
    │ shipped │
    └────┬────┘
         │
         ▼
    ┌───────────┐
    │ delivered │
    └───────────┘
```

### Status Transitions

| From    | To        | Trigger                             |
| ------- | --------- | ----------------------------------- |
| pending | paid      | Webhook: `payment_status = paid`    |
| pending | expired   | Webhook: `checkout.session.expired` |
| pending | cancelled | Stripe API failure / manual         |
| paid    | shipped   | Admin: add tracking number          |
| shipped | delivered | Tracking API / manual               |
