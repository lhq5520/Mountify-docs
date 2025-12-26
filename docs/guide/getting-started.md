# Getting Started

## Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- Redis instance (Upstash recommended)
- Stripe account (Can use sandbox for testing)
- Cloudinary account (for images)

## Installation

```bash
git clone https://github.com/lhq5520/Mountify-Commerce.git
cd Mountify-Commerce
npm install
```

## Environment Setup {#environment-setup}

Create `.env.local`:

```env
# Application base URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Database
DATABASE_URL=postgres://user:pass@host.neon.tech/dbname?sslmode=require

# Authentication
AUTH_SECRET=generate-32-char-random-string
NEXTAUTH_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your secrect

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@xxx.com

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# 17Track shipment tracking API
TRACK17_API_KEY=D79...
```

## Database Setup

Run in Neon console:

```sql
-- ============================================
-- Mountify E-Commerce Database Schema
-- PostgreSQL 18+
-- ============================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. Functions
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Tables (in dependency order)
-- ============================================

-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name CITEXT NOT NULL UNIQUE,
    slug CITEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    description TEXT,
    detailed_description TEXT,
    image_url TEXT,
    image_url_hover TEXT,
    image_public_id TEXT,        -- Cloudinary public_id for main image
    image_hover_public_id TEXT,  -- Cloudinary public_id for hover image
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Product Images (multiple images per product)
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    cloudinary_public_id TEXT,
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory
CREATE TABLE inventory (
    sku_id BIGINT PRIMARY KEY,
    on_hand INTEGER NOT NULL CHECK (on_hand >= 0),
    reserved INTEGER DEFAULT 0 NOT NULL CHECK (reserved >= 0),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Addresses
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    state TEXT,
    postal_code TEXT NOT NULL,
    country TEXT DEFAULT 'US' NOT NULL,
    is_default BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Cart Items
CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, product_id)
);

-- Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    email TEXT,
    total NUMERIC(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL
        CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'expired')),
    stripe_session_id TEXT,
    inventory_reserved BOOLEAN DEFAULT false NOT NULL,
    reserved_until TIMESTAMPTZ,
    -- Shipping info
    shipping_name TEXT,
    shipping_phone TEXT,
    shipping_address JSONB,
    -- Tracking info
    tracking_number TEXT,
    carrier TEXT,
    shipped_at TIMESTAMPTZ,
    tracking_details JSONB,
    tracking_last_sync TIMESTAMPTZ,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Order Items
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10,2) NOT NULL
);

-- Password Reset Tokens
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. Indexes
-- ============================================

-- Addresses
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_user_default_created ON addresses(user_id, is_default, created_at DESC);
CREATE UNIQUE INDEX uq_addresses_dedupe ON addresses(user_id, line1, postal_code);
CREATE UNIQUE INDEX uq_addresses_one_default_per_user ON addresses(user_id) WHERE is_default = true;

-- Cart
CREATE INDEX idx_cart_items_user ON cart_items(user_id);

-- Products & Images
CREATE INDEX idx_product_images_product ON product_images(product_id);

-- Inventory
CREATE INDEX idx_inventory_updated_at ON inventory(updated_at);

-- Orders
CREATE UNIQUE INDEX uq_orders_stripe_session_id ON orders(stripe_session_id);
CREATE INDEX idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE UNIQUE INDEX uq_order_items_order_product ON order_items(order_id, product_id);

-- Password Reset
CREATE INDEX idx_reset_tokens_token ON password_reset_tokens(token_hash);

-- ============================================
-- 5. Triggers
-- ============================================

CREATE TRIGGER trg_addresses_updated_at
    BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## Running Locally

```bash
# Start dev server
npm run dev

# In separate terminal: Start Stripe webhook forwarding
stripe listen --forward-to localhost:3000/api/webhooks/stripe

or

# Start dev server with "concurrently"(stripe cli and npm dev will run together)
npm run dev:all

```

## Test Credentials

```
Stripe Test Card: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
```

## Next Steps

- [Architecture Overview](../architecture/overview) - Understand the system design
- [Authentication Module](../modules/authentication) - Set up user auth
- [Payment Flow](../modules/payments) - Configure Stripe
