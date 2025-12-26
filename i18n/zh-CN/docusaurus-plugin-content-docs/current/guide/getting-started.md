# 快速开始

## 前置要求

- Node.js 18+
- PostgreSQL 数据库（推荐 Neon）
- Redis 实例（推荐 Upstash）
- Stripe 账号（可使用沙盒测试）
- Cloudinary 账号（用于图片存储）

## 安装

```bash
git clone https://github.com/lhq5520/Mountify-Commerce.git
cd Mountify-Commerce
npm install
```

## 环境配置

创建 `.env.local` 文件：

```env
# 应用基础 URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 数据库
DATABASE_URL=postgres://user:pass@host.neon.tech/dbname?sslmode=require

# 身份认证
AUTH_SECRET=生成32位随机字符串
NEXTAUTH_URL=http://localhost:3000

# Stripe 支付
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Redis 缓存
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Cloudinary 图片存储
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# 邮件服务
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@xxx.com

# OAuth 登录
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# 17Track 物流追踪 API
TRACK17_API_KEY=D79...
```

## 数据库配置

在 Neon 控制台执行以下 SQL：

```sql
-- ============================================
-- Mountify 电商数据库架构
-- PostgreSQL 18+
-- ============================================

-- 1. 扩展
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. 函数
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. 数据表（按依赖顺序）
-- ============================================

-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 分类表
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name CITEXT NOT NULL UNIQUE,
    slug CITEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 商品表
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    description TEXT,
    detailed_description TEXT,
    image_url TEXT,
    image_url_hover TEXT,
    image_public_id TEXT,        -- Cloudinary 主图 public_id
    image_hover_public_id TEXT,  -- Cloudinary 悬停图 public_id
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 商品图片表（每个商品可有多张图片）
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    cloudinary_public_id TEXT,
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 库存表
CREATE TABLE inventory (
    sku_id BIGINT PRIMARY KEY,
    on_hand INTEGER NOT NULL CHECK (on_hand >= 0),
    reserved INTEGER DEFAULT 0 NOT NULL CHECK (reserved >= 0),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 地址表
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

-- 购物车表
CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, product_id)
);

-- 订单表
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
    -- 收货信息
    shipping_name TEXT,
    shipping_phone TEXT,
    shipping_address JSONB,
    -- 物流信息
    tracking_number TEXT,
    carrier TEXT,
    shipped_at TIMESTAMPTZ,
    tracking_details JSONB,
    tracking_last_sync TIMESTAMPTZ,
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 订单明细表
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10,2) NOT NULL
);

-- 密码重置令牌表
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. 索引
-- ============================================

-- 地址索引
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_user_default_created ON addresses(user_id, is_default, created_at DESC);
CREATE UNIQUE INDEX uq_addresses_dedupe ON addresses(user_id, line1, postal_code);
CREATE UNIQUE INDEX uq_addresses_one_default_per_user ON addresses(user_id) WHERE is_default = true;

-- 购物车索引
CREATE INDEX idx_cart_items_user ON cart_items(user_id);

-- 商品和图片索引
CREATE INDEX idx_product_images_product ON product_images(product_id);

-- 库存索引
CREATE INDEX idx_inventory_updated_at ON inventory(updated_at);

-- 订单索引
CREATE UNIQUE INDEX uq_orders_stripe_session_id ON orders(stripe_session_id);
CREATE INDEX idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE UNIQUE INDEX uq_order_items_order_product ON order_items(order_id, product_id);

-- 密码重置索引
CREATE INDEX idx_reset_tokens_token ON password_reset_tokens(token_hash);

-- ============================================
-- 5. 触发器
-- ============================================

CREATE TRIGGER trg_addresses_updated_at
    BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## 本地运行

```bash
# 启动开发服务器
npm run dev

# 在另一个终端：启动 Stripe Webhook 转发
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# 或者

# 使用 "concurrently" 同时启动（Stripe CLI 和 npm dev 一起运行）
npm run dev:all

```

## 测试凭证

```
Stripe 测试卡号: 4242 4242 4242 4242
有效期: 任意未来日期
CVC: 任意 3 位数字
```

## 下一步

- [架构概览](../architecture/overview) - 了解系统设计
- [身份认证模块](../modules/authentication) - 配置用户认证
- [支付流程](../modules/payments) - 配置 Stripe 支付
