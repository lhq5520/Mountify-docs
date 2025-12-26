# 支付处理

## 设计理念

- **永远不信任前端价格**：后端从数据库获取
- **Webhooks 保证可靠性**：不依赖重定向成功
- **原子订单创建**：Stripe 重定向前创建待支付订单
- **幂等性处理**：同一 webhook 触发两次 = 相同结果
- **库存预留**：结账时锁定库存，失败/过期时释放

---

## 支付流程

```
┌──────────┐   ┌───────────────┐   ┌──────────┐   ┌──────────┐
│  购物车   │──▶│   结账 API    │──▶│  Stripe  │──▶│  成功页  │
│   页面   │   │              │   │  托管页  │   │         │
└──────────┘   └───────┬───────┘   └────┬─────┘   └────┬─────┘
                       │                │              │
          ┌────────────┼────────────────┼──────────────┘
          │            │                │
          ▼            ▼                ▼
    ┌───────────┐  ┌────────────┐  ┌────────────┐
    │   限流    │  │  预留库存   │  │  Webhook   │
    │  (Redis)  │  │ (Postgres) │  │   处理器   │
    └───────────┘  └────────────┘  └─────┬──────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   │                     │                     │
                   ▼                     ▼                     ▼
            ┌────────────┐       ┌────────────────┐    ┌─────────────┐
            │  更新状态   │       │    扣减库存    │    │   发送邮件  │
            │  → paid    │       │  on_hand -= N  │    │  (Resend)   │
            └────────────┘       └────────────────┘    └─────────────┘
```

---

## 库存预留模型

### 状态转换

```
┌─────────────────────────────────────────────────────────────────┐
│                     库存表                                       │
│  sku_id │ on_hand │ reserved │ 可用 (on_hand - reserved)        │
├─────────┼─────────┼──────────┼───────────────────────────────────┤
│   101   │   100   │    0     │  100 (可售)                       │
└─────────┴─────────┴──────────┴───────────────────────────────────┘
                              │
                    用户开始结账
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│   101   │   100   │    5     │   95 (5 已为用户预留)             │
└─────────┴─────────┴──────────┴───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
         支付成功                        支付失败/过期
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ on_hand = 100 - 5 = 95  │     │ reserved = 5 - 5 = 0    │
│ reserved = 5 - 5 = 0    │     │ on_hand 不变            │
│ (库存已售出)             │     │ (库存已释放)            │
└─────────────────────────┘     └─────────────────────────┘
```

### 预留 SQL

```sql
-- 预留：原子性检查可用量并锁定
UPDATE inventory
SET reserved = reserved + $1,
    updated_at = NOW()
WHERE sku_id = $2
  AND (on_hand - reserved) >= $1  -- 仅当有足够可用时
RETURNING sku_id;

-- 如果 rowCount = 0 → 库存不足，ROLLBACK
```

### 扣减 SQL（支付成功时）

```sql
UPDATE inventory i
SET on_hand = i.on_hand - oi.quantity,
    reserved = i.reserved - oi.quantity,
    updated_at = NOW()
FROM order_items oi
WHERE oi.order_id = $1
  AND i.sku_id = oi.product_id;
```

### 释放 SQL（过期/失败时）

```sql
UPDATE inventory i
SET reserved = GREATEST(0, i.reserved - oi.quantity),
    updated_at = NOW()
FROM order_items oi
WHERE oi.order_id = $1
  AND i.sku_id = oi.product_id;
```

---

## 幂等性保证

| 操作 | 机制 |
| ---- | ---- |
| 订单状态更新 | `WHERE status = 'pending'`（仅更新一次） |
| 库存扣减 | `WHERE inventory_reserved = TRUE` 标志 |
| 地址保存 | `ON CONFLICT ... DO NOTHING` |
| Stripe 会话关联 | `WHERE stripe_session_id IS NULL` |

**为什么重要：** Stripe 可能多次发送相同的 webhook。每个操作都设计为无论运行多少次都产生相同结果。

---

## 安全措施

| 措施 | 实现 |
| ---- | ---- |
| 价格验证 | 从数据库获取，忽略前端 |
| 数量限制 | 每商品 1-100 |
| 商品存在性 | 处理前验证所有 ID 存在 |
| Webhook 签名 | `stripe.webhooks.constructEvent()` |
| 幂等性 | 基于标志的检查防止重复处理 |
| 限流 | 每用户或 IP 每分钟 10 次请求 |
| 预留超时 | 30 分钟过期 |

---

## 本地测试

```bash
# 安装 Stripe CLI
brew install stripe/stripe-cli/stripe

# 登录
stripe login

# 转发 webhook 到本地
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# 复制 webhook 密钥 (whsec_...) 到 .env.local
```

### 测试卡号

| 卡号 | 结果 |
| ---- | ---- |
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0002` | 拒绝 |
| `4000 0027 6000 3184` | 3D Secure |
| `4000 0000 0000 9995` | 余额不足 |

---

## 订单状态状态机

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

### 状态转换

| 从 | 到 | 触发 |
| -- | -- | ---- |
| pending | paid | Webhook: `payment_status = paid` |
| pending | expired | Webhook: `checkout.session.expired` |
| pending | cancelled | Stripe API 失败 / 手动 |
| paid | shipped | 管理员：添加运单号 |
| shipped | delivered | 物流 API / 手动 |
