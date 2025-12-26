# 安全机制

## 纵深防御

```
┌─────────────────────────────────────────────────────────────┐
│                    第 1 层：TypeScript                       │
│              编译时类型检查                                  │
├─────────────────────────────────────────────────────────────┤
│                  第 2 层：输入验证                           │
│          API 级别的清理和格式检查                            │
├─────────────────────────────────────────────────────────────┤
│                 第 3 层：参数化 SQL                          │
│               SQL 注入防护                                   │
├─────────────────────────────────────────────────────────────┤
│                 第 4 层：数据库约束                          │
│     CHECK、UNIQUE、FK 约束保证数据完整性                     │
├─────────────────────────────────────────────────────────────┤
│                  第 5 层：中间件                             │
│           路由级别的认证和 RBAC                              │
├─────────────────────────────────────────────────────────────┤
│                  第 6 层：限流                               │
│          基于 Redis 的滥用防护                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 认证安全

### 密码哈希（bcrypt）

```typescript
// 注册：10 轮 = ~100ms 故意慢速
const hash = await bcrypt.hash(password, 10);

// 登录：使用存储的盐重新哈希输入并比较
const valid = await bcrypt.compare(inputPassword, storedHash);
```

| 特性 | 安全优势 |
| ---- | -------- |
| 单向 | 无法从哈希反推密码 |
| 加盐 | 相同密码 → 每次不同的哈希 |
| 慢速（~100ms） | 抵御暴力破解 |
| 成本因子 | 可随硬件升级增加轮数 |

### JWT 安全

| 方面 | 实现 |
| ---- | ---- |
| 存储 | httpOnly cookie（JS 无法访问） |
| 签名 | 使用 `AUTH_SECRET` 的 HMAC-SHA256 |
| 载荷 | 仅包含 `id`、`email`、`role` |
| 永不存储 | 密码、信用卡、密钥 |

---

## 输入验证

### 数量验证

```typescript
// 类型检查（无强制转换）
if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
  return NextResponse.json({ error: "数量格式无效" }, { status: 400 });
}

// 范围检查
if (quantity < 1 || quantity > 100) {
  return NextResponse.json({ error: "数量必须在 1-100 之间" }, { status: 400 });
}
```

### 邮箱验证

```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return NextResponse.json({ error: "邮箱格式无效" }, { status: 400 });
}

// 标准化
const normalizedEmail = email.toLowerCase().trim();
```

---

## 价格安全

### 永远不信任前端价格

```typescript
// ❌ 有漏洞：前端可以发送任意价格
const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

// ✅ 安全：始终从数据库获取
const productResult = await query(
  "SELECT id, price, name FROM products WHERE id = ANY($1)",
  [productIds]
);

const productMap = new Map(productResult.rows.map((r) => [r.id, r]));

const total = items.reduce((sum, item) => {
  const product = productMap.get(item.productId);
  return sum + Number(product.price) * item.quantity; // 数据库价格！
}, 0);
```

---

## SQL 注入防护

### 参数化查询

```typescript
// ❌ 有漏洞（字符串拼接）
query(`SELECT * FROM users WHERE email = '${email}'`);
// 攻击：email = "'; DROP TABLE users; --"

// ✅ 安全（参数化）
query("SELECT * FROM users WHERE email = $1", [email]);
// PostgreSQL 自动转义参数
```

---

## 授权（RBAC）

### 角色定义

```sql
role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))
```

### 访问矩阵

| 路由 | 游客 | 普通用户 | 管理员 |
| ---- | ---- | -------- | ------ |
| `/products` | ✅ | ✅ | ✅ |
| `/cart` | ✅ | ✅ | ✅ |
| 结账 | ✅（需邮箱） | ✅ | ✅ |
| `/orders` | ❌ → 登录 | ✅ | ✅ |
| `/admin/*` | ❌ → 登录 | ❌ → 首页 | ✅ |

---

## 限流

| 端点 | 限制 | 窗口 |
| ---- | ---- | ---- |
| 结账 | 10 次/用户或 IP | 60 秒 |
| 注册 | 5 次/IP, 1 次/邮箱 | 10 分钟 |
| 忘记密码 | 10 次/IP, 3 次/邮箱 | 5-15 分钟 |
| 重置密码 | 10 次/IP, 5 次/令牌 | 15 分钟 |

---

## 安全检查清单

- [x] 密码使用 bcrypt 哈希（成本因子 10）
- [x] JWT 存储在 httpOnly cookie
- [x] 所有 SQL 查询参数化
- [x] 服务端价格验证
- [x] 所有敏感端点限流
- [x] 管理路由 RBAC 保护
- [x] 输入验证（数量、邮箱、URL）
- [x] Stripe Webhook 签名验证
- [x] CSRF 保护（NextAuth 内置）
