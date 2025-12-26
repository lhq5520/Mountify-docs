# UI/UX Design

## Design Philosophy

- **Minimalism with purpose**: Every element serves a function
- **Generous whitespace**: Let content breathe
- **Smooth transitions**: All interactions feel refined (200-500ms)
- **Typography hierarchy**: Clear visual levels
- **Accessibility first**: Focus states, reduced motion, screen reader support

---

## Design System

### CSS Variables

```css
:root {
  /* Colors */
  --color-primary: #007aff; /* Apple blue */
  --color-primary-hover: #0051d5; /* Darker blue for hover */

  --color-text-primary: #1a1a1a; /* Near-black (softer than #000) */
  --color-text-secondary: #666666; /* Gray text */
  --color-text-tertiary: #999999; /* Lighter gray */

  --color-background: #fafafa; /* Off-white page background */
  --color-surface: #ffffff; /* Card/surface white */
  --color-border: #e5e5e5; /* Subtle borders */

  --color-error: #ff3b30; /* Red for errors */
  --color-success: #34c759; /* Green for success */

  /* Radius */
  --radius-md: 12px; /* Cards, inputs */
  --radius-full: 9999px; /* Buttons, pills */
}
```

### Typography Scale

| Level      | Class                                               | Usage                      |
| ---------- | --------------------------------------------------- | -------------------------- |
| Page Title | `text-2xl md:text-3xl font-semibold tracking-tight` | Product name, page headers |
| Section    | `text-lg font-semibold`                             | Section headings           |
| Body       | `text-sm md:text-base`                              | Descriptions, paragraphs   |
| Small      | `text-xs`                                           | Helper text, captions      |
| Label      | `text-[11px] uppercase tracking-[0.16em]`           | Category labels, metadata  |

### Font Stack

```css
font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif;
line-height: 1.6;
text-wrap: pretty;
```

---

## Responsive Breakpoints

```
sm:  640px   → Mobile landscape
md:  768px   → Tablet
lg:  1024px  → Laptop
xl:  1280px  → Desktop
```

### Container

```css
.container-custom {
  @apply w-full max-w-[1280px] mx-auto px-6;
}
```

---

## Component Patterns

### Card

```jsx
className="rounded-2xl bg-white border border-[var(--color-border)]
           shadow-sm hover:shadow-lg transition-all duration-300"
```

### Primary Button

```jsx
className="bg-black text-white hover:bg-gray-900
           rounded-full px-6 py-2.5
           text-sm font-medium
           transition-colors active:scale-95"
```

### Secondary Button

```jsx
className="border border-[var(--color-border)] bg-white
           text-[var(--color-text-secondary)] hover:border-gray-400
           rounded-full px-3 py-1.5 h-9 text-xs font-medium
           transition-colors duration-200"
```

### Dropdown Menu

```jsx
className="absolute right-0 mt-2 w-56 rounded-2xl
           border border-[var(--color-border)] bg-white
           shadow-lg overflow-hidden z-50"
```

### Input Field

```jsx
className="w-full px-4 py-2 rounded-lg
           border border-[var(--color-border)]
           focus:border-[var(--color-primary)] focus:ring-1
           focus:ring-[var(--color-primary)]
           transition-colors"
```

### Quantity Selector

```jsx
<div className="inline-flex items-center rounded-2xl border border-[var(--color-border)] bg-white px-2">
  <button className="h-10 w-10 text-lg text-gray-500">−</button>
  <input className="w-12 text-center border-0 focus:ring-0" />
  <button className="h-10 w-10 text-lg text-gray-500">+</button>
</div>
```

---

## Animation System

### Timing

| Speed | Duration  | Use Case                      |
| ----- | --------- | ----------------------------- |
| Fast  | 150ms     | Micro-interactions, hovers    |
| Base  | 200ms     | Standard transitions          |
| Slow  | 300-500ms | Image transitions, page loads |

### Easing

```css
/* Standard easing for all animations */
cubic-bezier(0.4, 0, 0.2, 1)
```

### Keyframe Animations

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

### Utility Classes

```css
.animate-fadeIn {
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-fadeInUp {
  animation: fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-slideInRight {
  animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
```

---

## Layout Patterns

### Product Grid

```jsx
// Responsive 2→2→3→4 columns (mobile starts at 2)
className = "grid grid-cols-2 gap-4 md:gap-8 lg:grid-cols-3 xl:grid-cols-4";
```

### Product Detail (Two-Column)

```jsx
// Image left, info right
className = "grid min-w-0 gap-10 md:grid-cols-2";
```

### Page Container

```jsx
<main className="bg-gradient-to-b from-[#f5f5f7] to-white min-h-[calc(100vh-64px)]">
  <div className="container-custom py-10 md:py-14">{/* Content */}</div>
</main>
```

---

## Navigation

### Navbar Structure

```
┌────────────────────────────────────────────────────────────┐
│  [≡] (mobile)   Mountify (center/left)   [👤] [🛒]        │
├────────────────────────────────────────────────────────────┤
│  Desktop: Logo | Search | Products | Account | Cart       │
│  Mobile:  Hamburger | Logo | Avatar | Cart                 │
└────────────────────────────────────────────────────────────┘
```

### Navbar Styles

```jsx
<nav className="bg-white/95 backdrop-blur border-b border-[var(--color-border)] sticky top-0 z-50">
```

### Account Dropdown

```jsx
// Trigger button
<button
  className="inline-flex items-center gap-2 rounded-full border 
                   border-[var(--color-border)] bg-[var(--color-surface)] 
                   px-3 py-1.5 h-9"
>
  <span
    className="flex h-6 w-6 items-center justify-center rounded-full 
                   bg-black text-[11px] font-semibold text-white"
  >
    {initial}
  </span>
  <span>{name}</span>
  <ChevronDown size={14} />
</button>
```

### Cart Badge

```jsx
<span
  className="absolute -top-2 -right-2 bg-[var(--color-primary)] 
                 text-white text-xs font-semibold rounded-full 
                 w-5 h-5 flex items-center justify-center"
>
  {count}
</span>
```

---

## Product Card

### Structure

```jsx
<article className="group flex flex-col">
  {/* Image with hover effect */}
  <Link className="relative w-full overflow-hidden rounded-xl md:rounded-2xl bg-[#f1f2f4]">
    <div className="relative aspect-[4/5]">
      {/* Main image */}
      <Image className="object-cover transition-opacity duration-300 group-hover:opacity-0" />
      {/* Hover image */}
      <Image className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {/* Stock badges */}
    </div>
  </Link>

  {/* Product info */}
  <div className="mt-2 md:mt-3">
    <h2 className="text-sm font-medium">{name}</h2>
    <p className="text-sm font-semibold">${price}</p>
  </div>
</article>
```

### Stock Badges

```jsx
// Out of Stock
<div className="absolute top-2 left-2 bg-red-500 text-white text-[10px]
                md:text-xs font-medium px-1.5 py-0.5 md:px-2 md:py-1 rounded-full">
  Out of Stock
</div>

// Low Stock
<div className="absolute top-2 left-2 bg-orange-500 text-white ...">
  Low Stock
</div>
```

---

## Toast Notifications

### Structure

```jsx
<div className="fixed top-20 right-6 z-50 animate-slideInRight">
  <div
    className="flex items-center gap-3 rounded-2xl px-5 py-4 shadow-xl min-w-[320px]"
    style={{
      backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)",
    }}
  >
    {/* Icon */}
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
      <CheckCircle className="text-green-600" />
    </div>

    {/* Message */}
    <div>
      <p className="text-sm font-medium">Success</p>
      <p className="text-xs text-[var(--color-text-secondary)]">{message}</p>
    </div>

    {/* Close */}
    <button className="h-8 w-8 rounded-lg hover:bg-gray-100">
      <X size={16} />
    </button>
  </div>
</div>
```

### Toast Types

| Type    | Icon            | Background                          |
| ------- | --------------- | ----------------------------------- |
| Success | `CheckCircle`   | `bg-green-100` / `text-green-600`   |
| Error   | `XCircle`       | `bg-red-100` / `text-red-600`       |
| Warning | `AlertTriangle` | `bg-yellow-100` / `text-yellow-600` |

---

## Loading States

### Skeleton Loading

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-border) 0%,
    var(--color-surface) 50%,
    var(--color-border) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite linear;
  border-radius: var(--radius-md);
}
```

### Product Grid Skeleton

```jsx
{
  Array.from({ length: 8 }).map((_, i) => (
    <div key={i} className="flex flex-col gap-2 md:gap-3 animate-pulse">
      <div className="aspect-[4/5] w-full rounded-xl md:rounded-2xl bg-gray-200" />
      <div className="h-3 md:h-4 w-3/4 rounded bg-gray-200" />
      <div className="h-3 md:h-4 w-1/2 rounded bg-gray-200" />
    </div>
  ));
}
```

### Avatar Skeleton

```jsx
<div className="h-8 w-8 rounded-full bg-[var(--color-background)] animate-pulse" />
```

---

## Empty States

```jsx
<div className="text-center py-16">
  <p className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
    No products found
  </p>
  <p className="text-sm text-[var(--color-text-secondary)] mb-4">
    Try adjusting your filters or browse all products
  </p>
  <button
    className="inline-flex items-center gap-2 rounded-full bg-black 
                     px-6 py-2.5 text-sm font-medium text-white 
                     hover:bg-gray-900 transition"
  >
    View All Products
  </button>
</div>
```

---

## Accessibility

### Focus States

```css
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Smooth Scrolling

```css
html {
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  scrollbar-gutter: stable;
}
```

---

## Scrollbar Styling

```css
html {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) var(--color-background);
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: var(--radius-full);
  border: 2px solid transparent;
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-tertiary);
}
```

---

## Print Styles

```css
@media print {
  .no-print {
    display: none !important;
  }

  body {
    background: white;
    color: black;
  }

  a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 0.8em;
    color: #666;
  }
}
```

---

## Glass Effect

```css
.glass {
  @apply bg-white/80 border border-white/30 backdrop-blur-md;
}

@media (prefers-color-scheme: dark) {
  .glass {
    background: rgba(28, 28, 30, 0.65);
    border-color: rgba(255, 255, 255, 0.1);
  }
}
```

---

## Filter UI

### Dropdown Button

```jsx
<button
  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full 
                   border border-[var(--color-border)] bg-white text-sm 
                   hover:border-gray-400 transition"
>
  <span>{selectedLabel}</span>
  <ChevronDown size={14} />
</button>
```

### Active Filter Chip

```jsx
// With remove button
<button
  onClick={clearFilter}
  className="flex items-center gap-1 px-3 py-1 rounded-full 
                   bg-black text-white text-xs font-medium"
>
  {filterValue}
  <X size={12} />
</button>
```

---

## Color Semantics

| Color        | CSS Variable             | Usage                          |
| ------------ | ------------------------ | ------------------------------ |
| Black        | `bg-black`               | Primary buttons, avatars       |
| Primary Blue | `--color-primary`        | Links, focus, cart badge       |
| Red          | `text-red-500/600`       | Errors, sign out, out of stock |
| Orange       | `text-orange-500/600`    | Warnings, low stock            |
| Green        | `text-green-600`         | Success, in stock              |
| Gray         | `--color-text-secondary` | Secondary text, icons          |

---

## Design Inspirations

| Source           | Element                                             |
| ---------------- | --------------------------------------------------- |
| **Apple**        | Color palette, subtle shadows, refined interactions |
| **MyProtein**    | 4-column grid, hover image transitions              |
| **Verve Coffee** | Clean typography, generous spacing                  |
| **Pure Cycles**  | Minimalist product cards                            |

---

## Mobile Considerations

### Touch Targets

- Minimum 44x44px for interactive elements
- Increased padding on mobile (`py-2.5` vs `py-1.5`)

### Mobile Navigation

- Hamburger menu on left
- Logo centered
- Avatar + Cart on right
- Dropdown closes when switching between menus

### Mobile Product Grid

- 2 columns with smaller gaps (`gap-4` vs `gap-8`)
- Smaller border radius (`rounded-xl` vs `rounded-2xl`)
- Reduced font sizes (`text-[10px]` badges)

---

## Performance Optimizations

### Image Loading

```jsx
<Image
  fill
  sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
  className="object-cover"
/>
```

### Animation Performance

```css
.animate-fadeIn,
.animate-fadeInUp,
.animate-scaleIn {
  will-change: transform, opacity;
}
```
