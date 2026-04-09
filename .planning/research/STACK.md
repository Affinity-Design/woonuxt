# Technology Stack: Backorder & Condition-Based Cart/Checkout Notices

**Project:** ProSkaters Place Canada — Condition Notice System
**Researched:** 2026-04-09
**Overall Confidence:** HIGH — All recommendations use patterns already proven in this codebase

## Executive Summary

This feature requires **zero new dependencies**. Every capability needed exists in the current stack. The work is a composition problem (assembling existing primitives into a notice system), not a technology selection problem.

The stack recommendation is: one new composable (`useCartNotices`), one new component (`CartNotice.vue`), one overridden GraphQL fragment (`CartFragment.gql`), metadata injection into two existing order-creation paths, and i18n key additions to two locale files. All patterns follow conventions already established in this codebase.

---

## Recommended Stack (All Existing — No New Dependencies)

### Component Layer

| Technology | Version | Purpose | Why This, Not Something Else |
|---|---|---|---|
| Vue 3 SFC (Nuxt auto-import) | via Nuxt 3.13.2 | `CartNotice.vue` inline alert component | Already the component model. No component library needed — Tailwind + Icon + props replaces any alert library. |
| `@nuxt/icon` (Iconify `ion` set) | 1.10.3 | Warning/info icons in notices | Already used in `ToastContainer.vue` for `ion:warning`, `ion:alert-circle`. Consistent icon language. |
| Tailwind CSS | via `@nuxtjs/tailwindcss 6.13.1` | Yellow/amber warning styles, badge styles | Existing colour system. `CartCard.vue` already uses yellow for low-stock badges — extend the same palette. |
| Vue `<Transition>` | built-in | Animate notice show/hide | Already used in `ToastContainer.vue` (`<TransitionGroup>`). No library needed. |

### Data Layer

| Technology | Purpose | Why |
|---|---|---|
| `nuxt-graphql-client` + overridden `CartFragment.gql` | Extend cart product data with `stockStatus` + `productCategories` | The **only** way to get product-level stock status and category membership from cart items. Fragment override is the established pattern (root `queries/` takes precedence over `woonuxt_base`). |
| `useState()` composable (`useCartNotices`) | Compute notice conditions from cart state | Follows existing state pattern (`useCart`, `useCheckout`, `useToast`). No Pinia/Vuex needed. |
| `StockStatusEnum` from `#woo` | Type-safe backorder detection | Already used in `StockStatus.vue`. Provides `ON_BACKORDER`, `IN_STOCK`, `OUT_OF_STOCK` constants. |

### Order Metadata Layer

| Technology | Purpose | Why |
|---|---|---|
| WPGraphQL `createOrder` mutation (`lineItem.metaData`) | Backorder/clearance line-item meta on Helcim orders | Already used in `create-admin-order.post.ts` for variation attributes. Same `metaData` array — just append entries. |
| WPGraphQL `checkout` mutation (`metaData: [MetaDataInput]`) | Order-level backorder/clearance meta on GraphQL checkout | Already used in `useCheckout.ts` `orderInput.metaData` array. Append new entries before submission. |
| WooCommerce REST API order notes | Post-creation order notes with affected SKUs | Already used in `create-admin-order.post.ts` for post-creation updates. Add note after order creation. |

### I18n Layer

| Technology | Purpose | Why |
|---|---|---|
| `@nuxtjs/i18n 8.5.5` with `$t()` / `useI18n()` | All notice message strings | Established pattern. `StockStatus.vue` already uses `$t("messages.shop.onBackorder")`. Add keys under `messages.shop.notices.*`. |
| `locales/en-CA.json` + `locales/fr-CA.json` | Bilingual notice text | Required by project constraints. |

---

## Alternatives Considered (And Rejected)

| Approach | Rejected | Why Not |
|---|---|---|
| Headless UI / Radix-Vue alert component | Overkill | A `<div>` with Tailwind classes + Icon is sufficient. No ARIA dialog semantics needed for inline warnings. |
| Pinia store for notice state | Unnecessary | Notices are computed from cart state, not independent. A composable returning `computed()` values is simpler and follows existing patterns. |
| Server-side notice generation (Nitro middleware) | Wrong layer | Cart/checkout are `ssr: false`. Notices are client-only computed values. Server has no role here. |
| WordPress plugin for backorder notices | Outside constraints | PROJECT.md constraint: "Must work with existing WPGraphQL schema — no WordPress plugin changes." |
| Separate GraphQL query for stock/category per item | N+1 problem | One extended cart fragment is cheaper than querying each item individually. Cart already fetches product data. |
| Custom WPGraphQL extension (PHP) | Outside scope | Would require WordPress code changes. Category data is already available through `productCategories` fragment on the `Product` type — just need to include it in the cart fragment. |

---

## Architecture Patterns

### Pattern 1: Condition-Driven Notice Component (CartNotice.vue)

**What:** A single reusable component that renders an inline alert banner. Accepts `type` (warning/info/error), `message`, optional `icon`, and optional slot for custom content.

**Why this pattern:** Matches `ToastContainer.vue`'s type→colour mapping approach, but for inline (non-floating) use. The existing toast system proves the colour-map-by-type pattern works in this codebase. Notices differ from toasts: they're persistent (not auto-dismissing), inline (not overlaid), and driven by cart conditions (not user actions).

**Component API (prescriptive):**

```vue
<CartNotice type="warning" :message="$t('messages.shop.notices.backorderSummary')" />
<CartNotice type="info" :message="$t('messages.shop.notices.clearanceSummary')" />
```

Props:
- `type: 'warning' | 'info' | 'error'` — drives colour and icon
- `message: string` — i18n-resolved display text
- `icon?: string` — override default icon (default: `ion:warning` for warning, `ion:information-circle` for info)
- `dismissible?: boolean` — optional close button (default `false` — notices should persist)

**Colour map (consistent with existing palette):**

| Type | Background | Text | Border | Icon | Precedent |
|---|---|---|---|---|---|
| `warning` | `bg-yellow-50` | `text-yellow-800` | `border-yellow-300` | `ion:warning` | `StockStatus.vue` uses `text-yellow-600` for backorder; `CartCard.vue` uses `bg-yellow-100` for Low Stock badge |
| `info` | `bg-blue-50` | `text-blue-800` | `border-blue-300` | `ion:information-circle` | `ToastContainer.vue` uses `bg-blue-600` for info toasts |
| `error` | `bg-red-50` | `text-red-800` | `border-red-300` | `ion:alert-circle` | `ToastContainer.vue` uses `bg-red-600` for error toasts |

**Why inline div and not toast:** Toasts are ephemeral — they disappear after `duration` ms. Backorder/clearance warnings must be **persistent and visible** at time of purchase decision. They sit in the DOM alongside cart items, not floating over content.

**Confidence:** HIGH — Pattern directly mirrors `ToastContainer.vue` type-mapping with `StockStatus.vue` colour palette. Both are in this codebase.

---

### Pattern 2: Cart Condition Composable (useCartNotices)

**What:** A composable that computes which notices should display based on current cart contents.

**Why this pattern:** Separates detection logic from rendering. Cart state changes → computed values update → components react. Follows the `useCart()`, `useCheckout()`, `useToast()` pattern where business logic lives in composables, not components.

**API (prescriptive):**

```typescript
export function useCartNotices() {
  const { cart } = useCart();

  const backorderItems = computed(() => { /* filter cart items by stockStatus === ON_BACKORDER */ });
  const clearanceItems = computed(() => { /* filter cart items by category slug === 'clearance-items' */ });
  
  const hasBackorderItems = computed(() => backorderItems.value.length > 0);
  const hasClearanceItems = computed(() => clearanceItems.value.length > 0);
  
  // Structured notice objects ready for CartNotice component
  const notices = computed(() => {
    const result = [];
    if (hasBackorderItems.value) result.push({ type: 'warning', messageKey: 'messages.shop.notices.backorderSummary' });
    if (hasClearanceItems.value) result.push({ type: 'info', messageKey: 'messages.shop.notices.clearanceSummary' });
    return result;
  });

  return { backorderItems, clearanceItems, hasBackorderItems, hasClearanceItems, notices };
}
```

**Backorder detection logic:**

```typescript
// For variation products: item.variation.node.stockStatus (already in CartFragment)
// For simple products: item.product.node.stockStatus (needs CartFragment extension)
const getItemStockStatus = (item: CartItem): string | null => {
  return item.variation?.node?.stockStatus ?? item.product?.node?.stockStatus ?? null;
};

const isOnBackorder = (status: string | null) => {
  if (!status) return false;
  const normalized = status.toLowerCase().replace(/[\s_-]/g, '');
  return normalized === 'onbackorder';
};
```

**Clearance detection logic:**

```typescript
// Category slug match against 'clearance-items'
const CLEARANCE_SLUG = 'clearance-items';

const isInClearance = (item: CartItem): boolean => {
  const categories = item.product?.node?.productCategories?.nodes ?? [];
  return categories.some(cat => cat.slug === CLEARANCE_SLUG);
};
```

**Why compute from cart state, not from a separate query:** Cart already carries the product data. Extending the fragment (Pattern 3) is cheaper than a separate query per item. The composable is reactive — when `useCart()` updates `cart.value`, all computeds recompute automatically.

**Confidence:** HIGH — Uses `computed()` + `useState()` pattern identical to every existing composable in the project.

---

### Pattern 3: CartFragment.gql Override (Data Extension)

**What:** Copy `woonuxt_base/app/queries/fragments/CartFragment.gql` to root `queries/fragments/CartFragment.gql` and extend the `product.node` block.

**Why this pattern:** The two-layer architecture's override mechanism. Root `queries/fragments/CartFragment.gql` takes precedence via `nuxt-graphql-client` auto-import. No base layer modification needed.

**What to add to the fragment:**

The existing `product.node` block has `...SimpleProduct` and `...VariableProduct` spreads, which both include `stockStatus`. However, these are **type-conditional fragments** — they only resolve when WPGraphQL returns the concrete type. The PROJECT.md reports this doesn't reliably work for simple products in the cart context.

**Prescriptive fix — add explicit inline fragments:**

```gql
product {
  node {
    name
    slug
    sku
    databaseId
    type
    # Existing spreads
    ...SimpleProduct
    ...VariableProduct
    ...ExternalProduct
    # === NEW: Explicit fields for notice system ===
    # stockStatus via inline fragments (belt-and-suspenders with existing spreads)
    ... on SimpleProduct {
      stockStatus
    }
    ... on VariableProduct {
      stockStatus
    }
    # Category data for clearance detection
    productCategories {
      nodes {
        slug
        databaseId
      }
    }
  }
}
```

**Why inline fragments AND existing spreads:** The existing `...SimpleProduct` fragment includes `stockStatus` but also includes many fields we don't need in the cart (weight, dimensions, lowStockAmount, etc.). The inline fragment is surgical — it requests only what the notice system needs. If the full fragment spread already provides the data, GraphQL deduplicates. If the spread doesn't resolve (which is the reported bug), the inline fragment provides the fallback.

**Why productCategories on cart items:** Required for clearance detection. The `ProductCategoriesFragment.gql` exists but isn't included in the cart fragment. Adding it inline (slug + databaseId only) adds minimal payload (~50 bytes per item) while enabling client-side category matching.

**Risk:** Adding `productCategories` to every cart item increases cart response size. For a typical cart of 3-5 items with 2-3 categories each, this adds ~300 bytes. Negligible for a client-only page.

**Confidence:** HIGH — Fragment override is the documented pattern. `productCategories` is a standard WPGraphQL field on `Product` type. Verified via existing `ProductCategoriesFragment.gql`.

---

### Pattern 4: Order Metadata Injection (Two Paths)

**What:** Inject backorder/clearance status into both order-creation paths so WooCommerce admin and emails show the information.

**Two distinct paths exist (both must handle this):**

#### Path A: Helcim Orders (Admin API)

File: `server/api/create-admin-order.post.ts`

The admin order endpoint already accepts and processes `lineItem.metaData` (see line 330: `lineItem.metaData = item.variation.attributes.map(...)`). The pattern is to **append** to whatever metaData already exists on each line item, plus add order-level metaData and a post-creation order note.

**Injection points:**

1. **Line-item meta** — For each backorder item, add `{ key: 'Backorder', value: 'Yes' }` to `lineItem.metaData` array. For each clearance item, add `{ key: 'Clearance', value: 'Non-refundable' }`.

2. **Order-level meta** — Add to the existing `metaData` array in the mutation variables:
   ```typescript
   { key: '_contains_backorder_items', value: 'yes' }
   { key: '_backorder_skus', value: 'SKU1, SKU2' }
   { key: '_contains_clearance_items', value: 'yes' }
   { key: '_clearance_skus', value: 'SKU3, SKU4' }
   ```

3. **Order note** — After order creation, use the existing WooCommerce REST API update flow to add an internal order note: `"⚠️ Contains backorder items: SKU1, SKU2"` and/or `"⚠️ Contains non-refundable clearance items: SKU3, SKU4"`.

**Where the data comes from:** The client sends backorder/clearance flags alongside the existing `lineItems` array. The `useCartNotices` composable computes which items are affected. The checkout page reads these computed values and enriches the payload before calling `/api/create-admin-order`.

#### Path B: GraphQL Checkout (Standard WooCommerce)

File: `woonuxt_base/app/queries/checkout.gql` (mutation accepts `metaData: [MetaDataInput]`)

The GraphQL checkout mutation supports **order-level metaData only** — not per-line-item. This is a WPGraphQL limitation.

**Injection point:** Append to `orderInput.metaData` array (in `useCheckout.ts`) before calling `GqlCheckout`:

```typescript
// In useCheckout.ts processCheckout(), before GqlCheckout call:
if (hasBackorderItems.value) {
  orderInput.value.metaData.push(
    { key: '_contains_backorder_items', value: 'yes' },
    { key: '_backorder_skus', value: backorderSkus.join(', ') }
  );
}
if (hasClearanceItems.value) {
  orderInput.value.metaData.push(
    { key: '_contains_clearance_items', value: 'yes' },
    { key: '_clearance_skus', value: clearanceSkus.join(', ') }
  );
}
```

**Limitation:** No per-line-item meta through GraphQL checkout. Order-level meta is sufficient for fulfillment team visibility. WooCommerce standard emails will show order meta but not per-line-item custom fields unless a template is customized (out of scope per PROJECT.md).

**Confidence:** HIGH — Both paths already use metaData injection. This is pattern extension, not new capability.

---

### Pattern 5: Per-Line-Item Badges in Cart

**What:** Small inline badges (like the existing "Low Stock" and "Save X%" badges in `CartCard.vue`) for backorder and clearance items.

**Why this pattern:** `CartCard.vue` already renders conditional badges with this exact visual pattern:

```vue
<!-- Existing in CartCard.vue -->
<span v-if="isLowStock"
  class="text-[10px] border-yellow-200 leading-none bg-yellow-100 inline-block p-0.5 rounded text-orange-500 border whitespace-nowrap">
  Low Stock
</span>
```

**New badges follow identical structure:**

```vue
<span v-if="isItemOnBackorder"
  class="text-[10px] border-yellow-200 leading-none bg-yellow-100 inline-block p-0.5 rounded text-yellow-700 border whitespace-nowrap">
  {{ $t('messages.shop.notices.backorderBadge') }}
</span>
<span v-if="isItemClearance"
  class="text-[10px] border-red-200 leading-none bg-red-50 inline-block p-0.5 rounded text-red-600 border whitespace-nowrap">
  {{ $t('messages.shop.notices.clearanceBadge') }}
</span>
```

**Confidence:** HIGH — Copy-paste of existing badge pattern in the same file.

---

## I18n Keys (Prescriptive)

New keys to add under `messages.shop.notices` in both locale files:

**`locales/en-CA.json`:**
```json
{
  "messages": {
    "shop": {
      "notices": {
        "backorderSummary": "Your order contains items currently on backorder. These items will ship when they become available.",
        "clearanceSummary": "Your order contains clearance items that are final sale and not eligible for returns or refunds.",
        "backorderBadge": "Backorder",
        "clearanceBadge": "Final Sale",
        "backorderCheckout": "⚠ This order contains items on backorder",
        "clearanceCheckout": "⚠ This order contains non-refundable clearance items"
      }
    }
  }
}
```

**`locales/fr-CA.json`:**
```json
{
  "messages": {
    "shop": {
      "notices": {
        "backorderSummary": "Votre commande contient des articles en rupture de stock. Ces articles seront expédiés dès qu'ils seront disponibles.",
        "clearanceSummary": "Votre commande contient des articles en liquidation qui sont en vente finale et ne sont pas admissibles aux retours ou remboursements.",
        "backorderBadge": "En commande",
        "clearanceBadge": "Vente finale",
        "backorderCheckout": "⚠ Cette commande contient des articles en rupture de stock",
        "clearanceCheckout": "⚠ Cette commande contient des articles de liquidation non remboursables"
      }
    }
  }
}
```

**Confidence:** HIGH — Follows existing i18n key structure under `messages.shop.*`.

---

## File Change Map

| File | Action | Purpose |
|---|---|---|
| `queries/fragments/CartFragment.gql` | **CREATE** (override) | Add `stockStatus` inline fragments + `productCategories` to product node |
| `composables/useCartNotices.ts` | **CREATE** | Backorder/clearance detection from cart state |
| `components/CartNotice.vue` | **CREATE** | Reusable inline alert component |
| `components/cartElements/CartCard.vue` | **EDIT** | Add per-item backorder/clearance badges |
| `components/shopElements/Cart.vue` | **EDIT** | Add summary notices above cart item list |
| `pages/checkout.vue` | **EDIT** | Add summary notices above order summary |
| `composables/useCheckout.ts` | **EDIT** | Inject backorder/clearance metaData before checkout |
| `server/api/create-admin-order.post.ts` | **EDIT** | Inject line-item meta + order notes for Helcim path |
| `locales/en-CA.json` | **EDIT** | Add notice i18n keys |
| `locales/fr-CA.json` | **EDIT** | Add notice i18n keys (French) |

**Files NOT changed:**
- `woonuxt_base/` — Read-only constraint respected
- No WordPress/PHP files — Schema constraint respected
- No new npm packages — Everything exists

---

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| Component pattern (`CartNotice.vue`) | HIGH | Mirrors existing `ToastContainer.vue` + `StockStatus.vue` patterns verbatim |
| Composable pattern (`useCartNotices`) | HIGH | Identical to existing `useCart`, `useToast` — `computed()` over `useState()` |
| CartFragment override | HIGH | Two-layer override is the documented pattern; `productCategories` is a standard WPGraphQL field |
| Helcim order metadata | HIGH | `lineItem.metaData` already used for variation attributes in same file |
| GraphQL checkout metadata | HIGH | `orderInput.metaData` array already populated with 15+ entries in `useCheckout.ts` |
| Per-line-item GraphQL checkout meta | N/A | Not possible — WPGraphQL `checkout` mutation doesn't support it. Order-level meta is sufficient. |
| Clearance category detection | HIGH | `productCategories.nodes[].slug` matching against `'clearance-items'` — standard GraphQL field |
| I18n integration | HIGH | Uses existing `$t()` + locale file pattern |

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| CartFragment `productCategories` field doesn't resolve in cart context | LOW | `productCategories` is on the `Product` interface in WPGraphQL, not a type-specific field. Should resolve for all product types. Test with a real cart containing categorized products. |
| `stockStatus` inline fragments still don't resolve for simple products | LOW | Fallback: query stock status separately via `GqlGetStockStatus(slug)` for items missing status. But this is unlikely — the inline fragment is the documented WPGraphQL approach. |
| Cart response size increase from `productCategories` | NEGLIGIBLE | ~50 bytes per item × 5 items = 250 bytes. Cart/checkout are client-only pages, not SSR-cached. |
| Race condition: cart updates while user is on checkout | LOW | Notices are reactive (`computed`). If cart refreshes, notices update. Existing `isUpdatingCart` guard prevents stale reads. |

---

## Sources

- **Existing codebase** (primary source for all patterns):
  - `woonuxt_base/app/queries/fragments/CartFragment.gql` — Current cart data shape
  - `components/productElements/StockStatus.vue` — Backorder display pattern and `StockStatusEnum` usage
  - `components/ToastContainer.vue` — Type→colour mapping pattern for alerts
  - `components/cartElements/CartCard.vue` — Per-line-item badge rendering pattern
  - `composables/useToast.ts` — Composable return shape and `useState` pattern
  - `composables/useCheckout.ts` — `orderInput.metaData` injection pattern
  - `server/api/create-admin-order.post.ts` — Admin order `lineItem.metaData` and REST API note pattern
  - `woonuxt_base/app/queries/fragments/ProductCategoriesFragment.gql` — Category data shape
- **WPGraphQL** — `stockStatus` field on Product interface, `productCategories` connection
- **Nuxt 3** — `useState()` composable pattern, component auto-import, `queries/` directory override

---

_Stack research: 2026-04-09_
