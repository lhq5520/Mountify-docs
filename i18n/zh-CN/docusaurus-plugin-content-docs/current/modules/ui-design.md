# UI/UX 设计

## 设计理念

- **极简主义**：简洁布局，聚焦产品
- **移动优先**：响应式设计，触控优化
- **一致性**：CSS 变量定义设计令牌
- **可访问性**：语义化 HTML，键盘导航
- **性能**：优化图片，懒加载

---

## 设计系统

### 颜色方案

```css
:root {
  /* 主色 */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  
  /* 中性色 */
  --color-text: #1f2937;
  --color-text-muted: #6b7280;
  --color-background: #ffffff;
  --color-border: #e5e7eb;
  
  /* 状态色 */
  --color-success: #10b981;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
}
```

### 排版

```css
:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
}
```

### 间距

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
}
```

---

## 组件模式

### 按钮

```tsx
// 主按钮
<button className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover">
  添加到购物车
</button>

// 次按钮
<button className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">
  取消
</button>

// 危险按钮
<button className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">
  删除
</button>
```

### 卡片

```tsx
<div className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow">
  <img src={product.image} alt={product.name} className="w-full aspect-square object-cover rounded" />
  <h3 className="mt-2 font-medium">{product.name}</h3>
  <p className="text-gray-600">${product.price}</p>
</div>
```

### Toast 通知

```tsx
// 成功
<div className="bg-green-50 border-l-4 border-green-500 p-4">
  <p className="text-green-700">商品已添加到购物车</p>
</div>

// 错误
<div className="bg-red-50 border-l-4 border-red-500 p-4">
  <p className="text-red-700">操作失败，请重试</p>
</div>
```

---

## 响应式设计

### 断点

```css
/* 移动优先 */
/* 默认 */        → 手机
/* sm: 640px */   → 大手机
/* md: 768px */   → 平板
/* lg: 1024px */  → 笔记本
/* xl: 1280px */  → 桌面
```

### 网格布局

```tsx
// 商品网格
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {products.map(product => (
    <ProductCard key={product.id} product={product} />
  ))}
</div>
```

---

## 图片优化

### Cloudinary 转换

```tsx
// 响应式图片
<img
  src={`https://res.cloudinary.com/${cloud}/image/upload/w_400,q_auto,f_auto/${publicId}`}
  srcSet={`
    ${getCloudinaryUrl(publicId, 400)} 400w,
    ${getCloudinaryUrl(publicId, 800)} 800w,
    ${getCloudinaryUrl(publicId, 1200)} 1200w
  `}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
  alt={product.name}
  loading="lazy"
/>
```

---

## 加载状态

### 骨架屏

```tsx
<div className="animate-pulse">
  <div className="bg-gray-200 aspect-square rounded-lg" />
  <div className="mt-2 h-4 bg-gray-200 rounded w-3/4" />
  <div className="mt-1 h-4 bg-gray-200 rounded w-1/2" />
</div>
```

### 按钮加载

```tsx
<button disabled className="flex items-center gap-2 opacity-50">
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  </svg>
  处理中...
</button>
```

---

## 表单设计

### 输入框

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    邮箱
  </label>
  <input
    type="email"
    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
    placeholder="your@email.com"
  />
</div>
```

### 错误状态

```tsx
<input
  className="border-red-500 focus:ring-red-500"
  aria-invalid="true"
  aria-describedby="email-error"
/>
<p id="email-error" className="mt-1 text-sm text-red-500">
  请输入有效的邮箱地址
</p>
```

---

## 可访问性

- 语义化 HTML（`<nav>`、`<main>`、`<article>`）
- ARIA 标签用于动态内容
- 键盘导航支持
- 足够的颜色对比度（4.5:1）
- 焦点状态可见
- 图片 alt 属性
