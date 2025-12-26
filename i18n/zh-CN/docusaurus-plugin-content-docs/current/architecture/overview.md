# Mountify - 系统设计

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              客户端 (浏览器)                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  React 页面    │  │  购物车上下文   │  │  Toast/UI      │  │  会话         │  │
│  │  (SSR + CSR)   │  │  (全局状态)    │  │  组件          │  │  (NextAuth)   │  │
│  └───────┬────────┘  └───────┬────────┘  └────────────────┘  └───────┬───────┘  │
└──────────┼───────────────────┼───────────────────────────────────────┼──────────┘
           │                   │                                       │
           ▼                   ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS 服务器 (App Router)                           │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                              API 路由                                        ││
│  │                                                                             ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ ││
│  │  │  /api/       │  │  /api/       │  │  /api/       │  │  /api/auth/      │ ││
│  │  │  products    │  │  cart        │  │  checkout    │  │  [...nextauth]   │ ││
│  │  │  categories  │  │  orders      │  │  webhooks    │  │  register        │ ││
│  │  │  inventory   │  │  user/*      │  │  /stripe     │  │  forgot-password │ ││
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ ││
│  │         │                 │                 │                   │           ││
│  └─────────┼─────────────────┼─────────────────┼───────────────────┼───────────┘│
│            │                 │                 │                   │            │
│  ┌─────────┼─────────────────┼─────────────────┼───────────────────┼───────────┐│
│  │         │        管理后台 API 路由          │                   │           ││
│  │         │   ┌──────────────────────────────┐│                   │           ││
│  │         │   │  /api/admin/                 ││                   │           ││
│  │         │   │  products, orders, stats     ││                   │           ││
│  │         │   │  categories, inventory       ││                   │           ││
│  │         │   │  shipping, upload-image      ││                   │           ││
│  │         │   └──────────────────────────────┘│                   │           ││
│  └─────────┼───────────────────────────────────┼───────────────────┼───────────┘│
└────────────┼───────────────────────────────────┼───────────────────┼────────────┘
             │                                   │                   │
             ▼                                   ▼                   ▼
┌─────────────────────┐  ┌─────────────────────────────────────────────────────────┐
│                     │  │                   外部服务                               │
│    数据层           │  │                                                         │
│                     │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  ┌───────────────┐  │  │  │   Stripe    │  │   Resend    │  │   Cloudinary    │  │
│  │  PostgreSQL   │  │  │  │             │  │             │  │                 │  │
│  │    (Neon)     │  │  │  │ • 结账      │  │ • 订单      │  │ • 商品          │  │
│  │               │  │  │  │ • 会话      │  │   确认      │  │   图片          │  │
│  │ • users       │  │  │  │ • Webhooks  │  │ • 发货      │  │ • 上传/         │  │
│  │ • products    │  │  │  │ • 支付      │  │   通知      │  │   删除          │  │
│  │ • categories  │  │  │  │             │  │ • 密码      │  │                 │  │
│  │ • orders      │  │  │  └──────┬──────┘  │   重置      │  └─────────────────┘  │
│  │ • order_items │  │  │         │         └─────────────┘                       │
│  │ • cart_items  │  │  │         │                                               │
│  │ • addresses   │  │  │         ▼                                               │
│  │ • inventory   │  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ • password_   │  │  │  │   Google    │  │   17track   │  │     Redis       │  │
│  │   reset_tokens│  │  │  │   OAuth     │  │     API     │  │   (Upstash)     │  │
│  └───────────────┘  │  │  │             │  │             │  │                 │  │
│                     │  │  │ • SSO 登录  │  │ • 物流      │  │ • 商品缓存      │  │
│                     │  │  │ • 用户信息  │  │   信息      │  │ • 限流          │  │
│                     │  │  │             │  │ • 状态      │  │ • 会话存储      │  │
│                     │  │  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────┘  └─────────────────────────────────────────────────────────┘
```

## 技术栈

| 层级 | 技术 | 用途 |
| ---- | ---- | ---- |
| 前端 | Next.js 16 (App Router) | SSR/CSR React 框架 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 状态 | React Context | 购物车状态管理 |
| 认证 | NextAuth v5 (Auth.js) | JWT 会话、凭证 + Google OAuth |
| 数据库 | PostgreSQL (Neon) | Serverless PostgreSQL |
| 缓存 | Redis (Upstash) | 商品缓存、限流 |
| 支付 | Stripe | 结账会话、Webhooks |
| 邮件 | Resend | 事务性邮件 |
| 图片 | Cloudinary | 图片托管与优化 |
| 物流 | 17track API | 物流追踪 |
| 部署 | Docker + VPS | 容器化部署 |

## 数据流图

### 1. 用户认证流程

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  客户端   │────▶│  /api/auth   │────▶│  NextAuth   │────▶│PostgreSQL│
└──────────┘     └──────────────┘     └─────────────┘     └──────────┘
     │                                       │
     │         ┌─────────────────────────────┘
     │         ▼
     │    ┌─────────────┐
     │    │   Google    │ (OAuth 流程)
     │    │   OAuth     │
     │    └─────────────┘
     │         │
     ▼         ▼
┌─────────────────────┐
│   JWT 会话          │
│   (httpOnly cookie) │
└─────────────────────┘
```

### 2. 结账与支付流程

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  客户端   │────▶│/api/checkout │────▶│   Stripe    │
│  (购物车) │     │              │     │  Checkout   │
└──────────┘     └──────────────┘     └──────┬──────┘
                                             │
                      ┌──────────────────────┘
                      ▼
               ┌─────────────┐     ┌──────────────┐     ┌──────────┐
               │   Stripe    │────▶│/api/webhooks │────▶│ 数据库    │
               │  (支付)     │     │   /stripe    │     │  更新     │
               └─────────────┘     └──────┬───────┘     └──────────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │   Resend    │
                                   │ (邮件)      │
                                   └─────────────┘
```

### 3. 商品目录流程（含缓存）

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  客户端   │────▶│/api/products │────▶│    Redis    │
└──────────┘     └──────────────┘     │   (缓存)    │
                        │             └──────┬──────┘
                        │                    │
                        │  缓存未命中         │ 缓存命中
                        ▼                    │
                 ┌─────────────┐             │
                 │ PostgreSQL  │             │
                 │   (Neon)    │             │
                 └──────┬──────┘             │
                        │                    │
                        └────────────────────┘
                                   │
                                   ▼
                            ┌─────────────┐
                            │  响应       │
                            │  (JSON)     │
                            └─────────────┘
```

### 4. 订单发货流程

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│ 管理面板     │────▶│/api/admin/orders │────▶│  数据库      │
│ (发货订单)   │     │  /[id]/ship      │     │   更新       │
└──────────────┘     └────────┬─────────┘     └─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Resend      │
                    │ (发货通知邮件)  │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    17track      │
                    │ (注册包裹)      │
                    └─────────────────┘
```

## 数据库架构 (ERD)

```
┌───────────────────────┐
│        users          │
├───────────────────────┤
│ id          SERIAL PK │
│ email       TEXT UQ   │
│ password_hash TEXT    │
│ role        TEXT      │  ──┐  'customer' | 'admin'
│ created_at  TIMESTAMPTZ   │
└───────────┬───────────┘   │
            │               │
            │ 1:N           │
    ┌───────┴───────┬───────┴───────┬─────────────────┐
    │               │               │                 │
    ▼               ▼               ▼                 ▼
┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│     addresses       │  │   cart_items    │  │         orders          │  │  password_reset_tokens  │
├─────────────────────┤  ├─────────────────┤  ├─────────────────────────┤  ├─────────────────────────┤
│ id        SERIAL PK │  │ id     SERIAL PK│  │ id          SERIAL PK   │  │ id          SERIAL PK   │
│ user_id   INT FK    │  │ user_id   INT FK│  │ user_id     INT FK      │  │ user_id     INT FK UQ   │
│ name      TEXT      │  │ product_id INT FK│ │ email       TEXT        │  │ token_hash  TEXT        │
│ phone     TEXT      │  │ quantity  INT   │  │ total       NUMERIC     │  │ expires_at  TIMESTAMPTZ │
│ line1     TEXT      │  │ created_at      │  │ status      VARCHAR(50) │  │ used        BOOLEAN     │
│ line2     TEXT      │  │ updated_at      │  │ stripe_session_id TEXT  │  │ created_at  TIMESTAMPTZ │
│ city      TEXT      │  │                 │  │ inventory_reserved BOOL │  └─────────────────────────┘
│ state     TEXT      │  │ UQ(user,product)│  │ reserved_until TIMESTAMPTZ
│ postal_code TEXT    │  └────────┬────────┘  │ shipping_name   TEXT    │
│ country   TEXT      │           │           │ shipping_phone  TEXT    │
│ is_default BOOLEAN  │           │           │ shipping_address JSONB  │
│ created_at          │           │           │ tracking_number TEXT    │
│ updated_at          │           │           │ carrier         TEXT    │
└─────────────────────┘           │           │ shipped_at   TIMESTAMPTZ│
                                  │           │ tracking_details JSONB  │
                                  │           │ tracking_last_sync      │
                                  │           │ created_at, updated_at  │
                                  │           └────────────┬────────────┘
                                  │                        │
                                  │                        │ 1:N
                                  │                        ▼
                                  │           ┌─────────────────────────┐
                                  │           │      order_items        │
                                  │           ├─────────────────────────┤
                                  │           │ id          SERIAL PK   │
                                  │           │ order_id    INT FK      │
                                  │           │ product_id  INT FK      │◀─┐
                                  │           │ quantity    INT         │  │
                                  │           │ price       NUMERIC     │  │
                                  │           │                         │  │
                                  │           │ UQ(order_id, product_id)│  │
                                  │           └─────────────────────────┘  │
                                  │                                        │
                                  └────────────────────────────────────────┤
                                                                           │
┌───────────────────────┐       ┌─────────────────────────┐                │
│      categories       │       │        products         │                │
├───────────────────────┤       ├─────────────────────────┤                │
│ id       SERIAL PK    │       │ id        SERIAL PK     │────────────────┘
│ name     CITEXT UQ    │◀──────│ category_id INT FK      │
│ slug     CITEXT UQ    │       │ name      TEXT          │
│ description TEXT      │       │ price     NUMERIC(10,2) │
│ display_order INT     │       │ description TEXT        │
│ created_at TIMESTAMPTZ│       │ detailed_description    │
└───────────────────────┘       │ image_url TEXT          │
                                │ image_url_hover TEXT    │
                                │ image_public_id TEXT    │  ── Cloudinary
                                │ image_hover_public_id   │  ── Cloudinary
                                │ created_at TIMESTAMPTZ  │
                                └────────────┬────────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                         │ 1:N               │ 1:1               │ 1:N
                         ▼                   ▼                   ▼
              ┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
              │   product_images    │  │    inventory    │  │   (cart_items)      │
              ├─────────────────────┤  ├─────────────────┤  │   (order_items)     │
              │ id       SERIAL PK  │  │ sku_id BIGINT PK│  └─────────────────────┘
              │ product_id INT FK   │  │ on_hand    INT  │
              │ image_url TEXT      │  │ reserved   INT  │
              │ cloudinary_public_id│  │ updated_at      │
              │ display_order INT   │  └─────────────────┘
              │ is_primary BOOLEAN  │   * sku_id = product_id
              │ created_at          │
              └─────────────────────┘
```

## API 端点

### 公开 API

| 方法 | 端点 | 描述 |
| ---- | ---- | ---- |
| GET | `/api/products` | 获取所有商品（已缓存） |
| GET | `/api/products/[id]` | 获取商品详情 |
| GET | `/api/products/search` | 搜索商品 |
| GET | `/api/categories` | 获取分类列表 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/forgot-password` | 请求密码重置 |
| POST | `/api/auth/reset-password` | 重置密码 |

### 受保护 API（需要登录）

| 方法 | 端点 | 描述 |
| ---- | ---- | ---- |
| GET/POST/DELETE | `/api/cart` | 购物车操作 |
| POST | `/api/checkout` | 创建 Stripe 会话 |
| GET | `/api/orders/my-orders` | 用户订单历史 |
| GET/PUT | `/api/user/profile` | 用户资料 |
| GET/POST/DELETE | `/api/user/addresses` | 地址管理 |
| PUT | `/api/user/change-password` | 修改密码 |

### 管理 API（需要管理员权限）

| 方法 | 端点 | 描述 |
| ---- | ---- | ---- |
| GET/POST | `/api/admin/products` | 商品增删改查 |
| GET/POST | `/api/admin/categories` | 分类管理 |
| GET/PUT | `/api/admin/inventory` | 库存管理 |
| GET/PUT | `/api/admin/orders` | 订单管理 |
| POST | `/api/admin/orders/[id]/ship` | 发货 |
| GET | `/api/admin/stats` | 仪表盘统计 |
| POST | `/api/admin/upload-image` | 图片上传 |

### Webhooks

| 方法 | 端点 | 描述 |
| ---- | ---- | ---- |
| POST | `/api/webhooks/stripe` | Stripe 支付事件 |

## 安全机制

- **认证**：基于 JWT 的会话（httpOnly cookies）
- **密码**：bcrypt 哈希（盐轮数：10）
- **OAuth**：Google SSO，自动创建/更新用户
- **授权**：基于角色（customer/admin），通过中间件控制
- **CSRF**：NextAuth 内置保护
- **限流**：基于 Redis（Upstash）

## 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                         VPS                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │                    Docker                         │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │           Next.js 容器                      │  │  │
│  │  │  • 生产构建 (next start)                   │  │  │
│  │  │  • 端口 3000                               │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                          ▼                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │                     Nginx                         │  │
│  │  • 反向代理                                       │  │
│  │  • SSL 终端 (Let's Encrypt)                       │  │
│  │  • 静态文件服务                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │     外部服务 (SaaS)             │
        │  • Neon (PostgreSQL)            │
        │  • Upstash (Redis)              │
        │  • Stripe                       │
        │  • Cloudinary                   │
        │  • Resend                       │
        │  • 17track                      │
        └─────────────────────────────────┘
```

## 性能优化

1. **Redis 缓存**：商品列表缓存 10 分钟
2. **图片 CDN**：Cloudinary 自动优化和响应式图片
3. **SSR**：服务端渲染提升 SEO 和首屏加载
4. **连接池**：Neon serverless 驱动复用连接
5. **懒加载**：重组件动态导入

## 设计理念

### 为什么选择这个技术栈？

| 选择 | 原因 |
| ---- | ---- |
| **Next.js 16** | 前后端统一，App Router 支持现代模式 |
| **PostgreSQL** | ACID 兼容，复杂查询，数据完整性 |
| **Redis** | 亚 10ms 读取，完美适合缓存和限流 |
| **Stripe** | PCI 合规，Webhooks 保证可靠性 |
| **JWT 会话** | 无状态，Edge 兼容，无需每次请求查库 |

### 数据流模式

**读取路径（商品）：**

```
请求 → 检查 Redis 缓存 → 缓存命中？返回缓存
                       → 缓存未命中？查询 PostgreSQL → 缓存结果 → 返回
```

**写入路径（订单）：**

```
结账 → 验证价格（数据库）→ 创建待支付订单 → Stripe 会话
    → 用户支付 → 收到 Webhook → 更新订单状态 → 清空购物车
```

**认证路径：**

```
登录 → bcrypt 验证 → 生成 JWT → 存入 httpOnly cookie
    → 后续请求：JWT 在 Edge 验证（无需查库）
```

## 安全层级

```
第 1 层：TypeScript     → 编译时类型安全
第 2 层：输入验证       → API 路由运行时检查
第 3 层：参数化 SQL     → 防止 SQL 注入
第 4 层：数据库约束     → CHECK、UNIQUE、REFERENCES
第 5 层：中间件         → 页面加载前路由保护
```

## 性能策略

| 技术 | 应用场景 | 效果 |
| ---- | -------- | ---- |
| Redis 缓存 | 商品列表 | 快 5 倍（455ms → 86ms） |
| 乐观更新 | 购物车操作 | 即时 UI 反馈 |
| 数据库索引 | user_id、product_id | 查询提升 10 倍 |
| JWT 会话 | 认证检查 | 无需每次查库 |
| Edge 中间件 | 路由保护 | \<10ms 认证检查 |

## 可扩展性考量

**当前（单区域）：**

- Neon PostgreSQL（serverless，自动扩展）
- Upstash Redis（全球化，Edge 兼容）
- Vercel Edge Functions

**未来扩展路径：**

- PostgreSQL 读副本
- Redis 集群分布式缓存
- 静态资源 CDN
- Webhook 处理队列系统
