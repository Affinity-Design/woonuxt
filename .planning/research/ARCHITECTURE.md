# Architecture: Backorder & Condition-Based Notices

**Domain:** Condition-driven notices in Nuxt 3 headless WooCommerce cart/checkout
**Project:** ProSkaters Place Canada — WooNuxt
**Researched:** 2026-04-09
**Overall confidence:** HIGH — all claims verified against existing codebase

## System Context

The notice system integrates into an existing two-layer Nuxt 3 headless WooCommerce stack. It does NOT introduce new infrastructure. It adds:

1. A detection layer (composable) that reads existing cart state
2. A display layer (components) that renders condition-driven notices
3. A metadata injection layer that tags orders at creation time

All three layers operate within existing architectural boundaries: root overrides only, no `woonuxt_base/` modifications, no WordPress plugin changes.

## Component Boundaries

### Component 1: `useCartNotices` Composable

**Responsibility:** Evaluate cart contents and produce a typed list of active notice conditions.

**Boundary:** Pure computation. Reads `useState('cart')` — writes nothing. No side effects, no API calls, no DOM interaction.

**Inputs:**
- `cart.value.contents.nodes[]` — cart line items (from `useState('cart')`)
- Each node's `product.node.stockStatus` — backorder detection (simple products)
- Each node's `variation.node.stockStatus` — backorder detection (variable products)
- Each node's `product.node.productCategories.nodes[].slug` — clearance detection (match `clearance-items`)

**Outputs:**
```typescript
interface CartNotice {
  type: 'warning' | 'info' | 'error';
  key: string;              // e.g. 'backorder', 'clearance'
  message: string;          // i18n key reference
  icon?: string;            // Icon name for display
  affectedItems: {          // Which line items triggered this notice
    key: string;            // cart item key
    name: string;           // product name
    sku: string;            // for order notes
  }[];
}

// Composable return shape:
{
  notices: ComputedRef<CartNotice[]>;         // All active notices
  hasBackorderItems: ComputedRef<boolean>;    // Quick check
  hasClearanceItems: ComputedRef<boolean>;    // Quick check
  backorderItems: ComputedRef<CartLineItem[]>; // Filtered items
  clearanceItems: ComputedRef<CartLineItem[]>; // Filtered items
  getOrderMetadata: () => OrderMeta[];        // For injection at checkout
  getOrderNotes: () => string[];              // For order-level notes
}
```

**Communicates with:**
- `useCart()` — reads `cart` state (dependency: consumer)
- `useI18n()` — resolves notice message strings
- `useCheckout()` / `create-admin-order.post.ts` — supplies metadata via `getOrderMetadata()` / `getOrderNotes()` (dependency: supplier)

**Does NOT communicate with:**
- GraphQL API (all data already in cart state)
- Cloudflare KV (cart is client-side state, no SSR caching concern)
- WordPress REST API (only indirectly, via checkout composable)

### Component 2: `CartNotice.vue` Display Component

**Responsibility:** Render a single condition-based notice (banner or inline badge).

**Boundary:** Presentational only. Receives props, emits nothing, mutates nothing.

**Props:**
```typescript
{
  type: 'warning' | 'info' | 'error';   // Determines colour scheme
  message: string;                        // Translated text to display
  icon?: string;                          // Optional icon name
  variant: 'banner' | 'badge';          // Full-width summary vs. inline per-item
}
```

**Rendering rules:**
| Type    | Background   | Text           | Border         | ARIA role   |
|---------|-------------|----------------|----------------|-------------|
| warning | bg-yellow-50 | text-yellow-800 | border-yellow-200 | role="alert" |
| info    | bg-blue-50   | text-blue-800   | border-blue-200   | role="status" |
| error   | bg-red-50    | text-red-800    | border-red-200    | role="alert"  |

Visual consistency: `warning` type matches existing `StockStatus.vue` yellow palette (`text-yellow-600` on product pages → `text-yellow-800` + `bg-yellow-50` in notices for sufficient contrast in banner context).

**Communicates with:**
- Parent components only (via props). No composable calls, no state reads.

**Placement (consumed by):**
- `CartCard.vue` — inline `badge` variant per line item
- `Cart.vue` — summary `banner` variant above checkout button
- `checkout.vue` — summary `banner` variant above payment form

### Component 3: CartFragment.gql Override

**Responsibility:** Extend the base cart GraphQL fragment to include `stockStatus` on the `product.node` for simple products, and `productCategories` on `product.node` for clearance detection.

**Boundary:** GraphQL schema query. No runtime code.

**Current gap in `woonuxt_base/app/queries/fragments/CartFragment.gql`:**
```
# Line 33-41: product.node includes ...SimpleProduct, ...VariableProduct, ...ExternalProduct
# SimpleProduct fragment DOES include stockStatus
# BUT: the cart fragment spreads these on `product.node` which is a CartItemProduct,
# not a standalone Product — need to verify the spread resolves stockStatus
#
# Line 53: variation.node.stockStatus ← already present
#
# MISSING: productCategories on product.node (needed for clearance detection)
```

The `SimpleProduct` fragment includes `stockStatus` (verified in `woonuxt_base/app/queries/fragments/SimpleProduct.gql` line 11). The cart's `product.node` spreads `...SimpleProduct`, so `stockStatus` is available on simple product nodes.

**Critical finding:** `productCategories` is NOT included in the cart fragment's product node. The `ProductCategories` fragment exists (`ProductCategoriesFragment.gql`) but is only spread in `getProduct.gql` and `getProductsWithCursor.gql` — not in `CartFragment.gql`.

**Override required:** Copy `CartFragment.gql` to root `gql/queries/fragments/CartFragment.gql` and add `...ProductCategories` spread inside `product { node { ... } }`.

**Communicates with:**
- WPGraphQL server — requests additional fields
- `useCartNotices` composable — provides data for clearance detection
- `nuxt-graphql-client` — auto-imported, type-generated

### Component 4: Order Metadata Injection

**Responsibility:** Attach backorder/clearance metadata to orders at creation time.

**Boundary:** Integration point. Called by checkout flow, not triggered independently.

**Two order creation paths exist:**

| Path | File | Trigger | Metadata Injection Point |
|------|------|---------|--------------------------|
| **Helcim (primary)** | `composables/useCheckout.ts` → `server/api/create-admin-order.post.ts` | Helcim payment completes | `adminOrderData.lineItems[].metaData` + `adminOrderData.metaData` (order-level) |
| **GQL fallback** | `composables/useCheckout.ts` → `GqlCheckout()` | Non-Helcim payment | `orderInput.metaData` (order-level only — GQL checkout mutation has limited line-item meta control) |

**Helcim path (detailed):**

In `useCheckout.ts` around line 215, `cart.value.contents.nodes` is mapped to `lineItems` array. Each item already maps `name`, `sku`, `variation.attributes` as `metaData`. The injection point adds:

```typescript
// Per line item (inside the .map()):
metaData: [
  ...existingVariationMeta,
  // NEW: backorder status
  ...(isBackorder ? [{ key: 'Backorder', value: 'Yes' }] : []),
  // NEW: clearance status
  ...(isClearance ? [{ key: 'Clearance', value: 'Non-refundable' }] : []),
]
```

Order-level notes are added to `adminOrderData.metaData` or `adminOrderData.customerNote` (internal notes visible in WC admin):

```typescript
// Order-level metadata (already in enhancedMetaData array ~line 173):
...getOrderMetadata()  // From useCartNotices composable
```

**GQL fallback path:**

`orderInput.value.metaData` (line 27) is the array that flows to `GqlCheckout`. Order-level meta can be appended here. Line-item-level meta is limited in the GQL checkout mutation — the Helcim admin path is the primary order creation mechanism.

**Communicates with:**
- `useCartNotices` — reads `getOrderMetadata()` and `getOrderNotes()`
- `useCheckout()` — injects into `enhancedMetaData` array
- `server/api/create-admin-order.post.ts` — receives metadata in request body
- WooCommerce REST API — order notes written via REST after order creation

### Component 5: i18n Keys

**Responsibility:** Provide bilingual notice text.

**Boundary:** Static JSON files. No runtime logic.

**Files modified:**
- `locales/en-CA.json` — add keys under `messages.shop.notices.*`
- `locales/fr-CA.json` — add French translations
- `locales/en-US.json` — add English fallback (same as en-CA)

**Key structure:**
```json
{
  "messages": {
    "shop": {
      "notices": {
        "backorderBanner": "Your order contains items currently on backorder. These items will ship when available.",
        "backorderBadge": "On Backorder",
        "clearanceBanner": "Your order contains clearance items that are final sale and non-refundable.",
        "clearanceBadge": "Final Sale",
        "backorderOrderNote": "Contains backorder items",
        "clearanceOrderNote": "Contains non-refundable clearance items"
      }
    }
  }
}
```

**Communicates with:**
- `useCartNotices` — reads via `useI18n().t()`
- `CartNotice.vue` — receives already-translated strings as props

## Data Flow

### Flow 1: Cart Load → Notice Display

```
[WordPress GraphQL]
        │
        ▼
  GqlGetCart() query
  (includes CartFragment.gql override
   with ...ProductCategories on product.node)
        │
        ▼
  useCart().refreshCart()
  → updates useState('cart')
        │
        ▼
  useCartNotices() composable
  (reactive — recomputes when cart changes)
        │
   ┌────┴─────────────────────┐
   │                          │
   ▼                          ▼
  Per-item scan:             Per-item scan:
  stockStatus ===            productCategories
  'ON_BACKORDER'?            includes 'clearance-items'?
   │                          │
   └────┬─────────────────────┘
        │
        ▼
  Computed: notices[], hasBackorderItems, hasClearanceItems
        │
   ┌────┼──────────────┐
   │    │              │
   ▼    ▼              ▼
CartCard.vue    Cart.vue    checkout.vue
(badge per      (banner     (banner
 line item)      above       above
                 checkout    payment
                 button)     form)
```

**Direction:** Unidirectional. GraphQL → Cart state → Composable → Components. No upward data flow.

**Reactivity:** `useCartNotices` uses Vue `computed()` refs over `cart.value.contents.nodes`. When `refreshCart()` updates the cart (add/remove/quantity change), notices recompute automatically.

**Rendering context:** Cart sidebar and checkout page are both `ssr: false` (client-only in `nuxt.config.ts` route rules). No SSR/hydration concerns for notice components.

### Flow 2: Checkout → Order Metadata

```
  useCartNotices().getOrderMetadata()
  useCartNotices().getOrderNotes()
        │
        ▼
  useCheckout().processCheckout()
  (injects into enhancedMetaData array
   and adminOrderData)
        │
        ▼
  $fetch('/api/create-admin-order', { body: adminOrderData })
        │
        ▼
  server/api/create-admin-order.post.ts
  → Maps lineItem.metaData (per-item: Backorder, Clearance)
  → Adds order-level metaData entries
  → Adds order note via WC REST API after creation
        │
        ▼
  WordPress / WooCommerce
  → Line item meta visible in order detail
  → Order note visible in order timeline
  → Auto-rendered in customer email (standard WC template)
```

**Direction:** Frontend composable → Checkout composable → Server API → WordPress. One-way push.

**Trigger:** Only fires when user completes payment (Helcim payment callback → `processCheckout()`). Not on page load, not on cart update.

### Flow 3: CartFragment Override Resolution

```
  woonuxt_base/app/queries/fragments/CartFragment.gql  (base)
        │
        ▼  (Nuxt layer resolution — root takes priority)
  gql/queries/fragments/CartFragment.gql  (root override)
        │
        ▼
  nuxt-graphql-client auto-imports → GqlGetCart() includes
  productCategories and stockStatus on product.node
```

**Key point:** This is a build-time resolution. The `nuxt-graphql-client` module generates TypeScript types from the overridden fragment. No runtime cost.

## Component Interaction Matrix

| Component | Reads From | Writes To | Triggers |
|-----------|-----------|-----------|----------|
| `CartFragment.gql` (override) | WPGraphQL schema | Cart state (via GqlGetCart) | — |
| `useCartNotices` composable | `useState('cart')`, `useI18n()` | Nothing (pure computation) | — |
| `CartNotice.vue` component | Props only | Nothing | — |
| `CartCard.vue` (modified) | `useCartNotices()` | Nothing | — |
| `Cart.vue` (modified) | `useCartNotices()` | Nothing | — |
| `checkout.vue` (modified) | `useCartNotices()` | Nothing | — |
| `useCheckout.ts` (modified) | `useCartNotices().getOrderMetadata()` | `adminOrderData.metaData`, `lineItems[].metaData` | Order creation |
| `create-admin-order.post.ts` (modified) | Request body `metaData`, `lineItems[].metaData` | WordPress order via REST API | Order notes |
| `en-CA.json`, `fr-CA.json` (modified) | — | — | i18n key resolution |

## Architectural Constraints

### 1. Cart Fragment Override is the Critical Foundation

Without `productCategories` on cart item product nodes, clearance detection is impossible. This override **must be built and verified first** because:

- It changes the GraphQL query shape
- It affects TypeScript type generation (`nuxt-graphql-client` regenerates types)
- All downstream components depend on this data being present
- If the override doesn't resolve correctly (Nuxt layer priority issue), everything else fails silently

### 2. Client-Only Rendering

Cart (`/cart`) and checkout (`/checkout/**`) have `ssr: false` in `nuxt.config.ts` route rules. This means:

- No SSR concerns for notice components
- No hydration mismatch risk
- `process.client` guards are unnecessary
- But also: no prerender caching — all notice logic runs client-side on every page load

### 3. Two Order Creation Paths

Helcim admin order (primary) has full control over line item metadata and order notes. GQL checkout (fallback) has limited line-item meta support. The architecture must handle both, but Helcim is the production-critical path.

### 4. Category Data Availability

`productCategories` is available on the `Product` type in WPGraphQL. The `ProductCategories` fragment already exists and returns `{ nodes { databaseId, slug, name, count } }`. Spreading this fragment in the cart's `product.node` should work because the node resolves to a concrete product type (SimpleProduct, VariableProduct) which implements the Product interface.

**Verification needed during build phase:** Confirm that the cart fragment override correctly resolves `productCategories` for both `SimpleProduct` and `VariableProduct` types in the cart context. If WPGraphQL's cart product node doesn't support the `ProductCategories` fragment inline, a fallback strategy (matching against a static product-category map from KV cache) will be needed.

### 5. No Base Layer Modification

All changes are root-level overrides:

| Override | Base File | Root Override Location |
|----------|-----------|----------------------|
| Cart fragment | `woonuxt_base/app/queries/fragments/CartFragment.gql` | `gql/queries/fragments/CartFragment.gql` |
| CartCard | `woonuxt_base/app/components/cartElements/CartCard.vue` | `components/cartElements/CartCard.vue` (already overridden) |
| Cart | `woonuxt_base/app/components/shopElements/Cart.vue` | `components/shopElements/Cart.vue` (already overridden) |

New files (no base equivalent): `composables/useCartNotices.ts`, `components/CartNotice.vue`

## Suggested Build Order

Build order is driven by **data dependency chains**. Each phase must be verifiable independently before the next begins.

### Phase 1: Data Foundation — CartFragment Override + Composable Shell

**Build:**
1. Copy `CartFragment.gql` to `gql/queries/fragments/CartFragment.gql`
2. Add `...ProductCategories` spread inside `product { node { ... } }`
3. Verify: `npm run dev` → open cart → inspect GQL response → confirm `productCategories` and `stockStatus` present on product nodes
4. Create `composables/useCartNotices.ts` with detection logic
5. Verify: Console log or Vue DevTools confirms `hasBackorderItems` / `hasClearanceItems` compute correctly against test cart data

**Why first:** Every other component depends on this data. If the fragment override fails or `productCategories` doesn't resolve in the cart context, the entire approach needs revisiting before building UI.

**Risk:** WPGraphQL may not resolve `productCategories` on the cart item's product union node. Mitigation: if it fails, fall back to matching `product.node.databaseId` against the KV-cached product list (which includes categories). This is slower but works without schema changes.

### Phase 2: Display Layer — CartNotice Component + Cart/Checkout Integration

**Build:**
1. Create `components/CartNotice.vue` (presentational, props-driven)
2. Integrate into `CartCard.vue` — add inline badge per line item
3. Integrate into `Cart.vue` — add summary banner above checkout button
4. Integrate into `checkout.vue` — add summary banner above payment form
5. Add i18n keys to `locales/en-CA.json` and `locales/fr-CA.json`
6. Verify: Visual inspection — add a backorder item and a clearance item to cart, confirm badges and banners appear in both en-CA and fr-CA

**Why second:** Composable + data must work before UI can consume it. No order creation dependency — display is read-only.

**Dependency:** Phase 1 (composable must be functional)

### Phase 3: Order Metadata — Checkout Integration + Server-Side

**Build:**
1. Modify `useCheckout.ts` — call `useCartNotices().getOrderMetadata()` and inject into `enhancedMetaData` array
2. Modify `useCheckout.ts` — call `useCartNotices().getOrderNotes()` and inject into admin order data
3. Modify `server/api/create-admin-order.post.ts` — ensure `lineItem.metaData` pass-through works for new keys (Backorder, Clearance)
4. Add order-level note writing after order creation (REST API call for customer note)
5. Verify: Place test order with backorder + clearance items → confirm metadata visible in WooCommerce admin → confirm note appears in order timeline → confirm line item meta appears in customer email

**Why third:** Display layer (Phase 2) provides visual confirmation that detection works correctly before wiring up the metadata path. Metadata injection is the highest-risk change (touches payment flow, order creation) — it should build on verified detection logic.

**Dependency:** Phase 1 (composable detection), validated by Phase 2 (visual proof)

### Build Order Rationale

```
Phase 1: Data     ─────► Phase 2: Display     ─────► Phase 3: Metadata
(foundation)              (visual verification)         (order integration)
                                                        
Fragment override         CartNotice.vue               useCheckout.ts mods
useCartNotices.ts         CartCard.vue mods            create-admin-order mods
                          Cart.vue mods                Order notes
                          checkout.vue mods
                          i18n keys
```

**Why this order, not another:**

- **Data before display:** You can't render what you can't detect. Fragment override + composable must be confirmed working before building UI against them.
- **Display before metadata:** The display layer has zero risk to the payment flow. It's additive, read-only, and visually verifiable. Getting display right first means the detection logic is proven before touching the order creation path.
- **Metadata last:** Order creation is the most sensitive code path in the system (payment + money). Changes here should be minimal and based on verified detection logic from Phases 1-2. If Phase 1 detection is wrong, Phase 3 would inject incorrect metadata — so Phase 2 acts as a visual validation gate.

## Patterns to Follow

### Pattern 1: Composable + Computed Reactivity

**What:** Detection logic lives in a composable that returns `computed()` refs. Components consume refs declaratively.

**Why:** Matches existing codebase patterns (`useCart`, `useAuth`, `useCheckout` all use `useState` + `computed`). Automatic reactivity means notices update when cart changes — no manual refresh, no event bus, no watchers needed in consuming components.

**Example:**
```typescript
// In useCartNotices.ts
export function useCartNotices() {
  const { cart } = useCart();
  
  const backorderItems = computed(() =>
    cart.value?.contents?.nodes?.filter(item => {
      const status = item.variation?.node?.stockStatus 
        || item.product?.node?.stockStatus;
      return compareStatus(status, StockStatusEnum.ON_BACKORDER);
    }) || []
  );
  
  const hasBackorderItems = computed(() => backorderItems.value.length > 0);
  // ...
}
```

### Pattern 2: Props-Only Presentational Component

**What:** `CartNotice.vue` receives all data via props. No composable calls, no state reads, no side effects.

**Why:** Maximally reusable. Can be tested in isolation. Future notice types (low stock, pre-order) use the same component with different props. Matches the existing pattern where `StockStatus.vue` is purely props-driven.

### Pattern 3: Override by Copy (Nuxt Layers)

**What:** Copy base file to root, modify, let Nuxt layer resolution pick root version.

**Why:** Project constraint. `woonuxt_base/` is read-only. This is the established override mechanism — `CartCard.vue`, `Cart.vue`, and many other components already use this pattern.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching Stock Status Separately

**What:** Making a separate `GqlGetStockStatus` call per cart item to check backorder status.

**Why bad:** N+1 query problem. Cart already contains stock status data (variations) and will contain it for simple products after the fragment override. Separate calls add latency, API load, and race conditions.

**Instead:** Read stock status from existing cart state. The fragment override ensures all needed data arrives in the single `GqlGetCart()` call.

### Anti-Pattern 2: Storing Notice State in useState

**What:** Creating `useState('cartNotices')` to persist notice state.

**Why bad:** Notices are derived data — they're a pure function of cart contents. Storing them separately creates a synchronization problem (cart updates but notices don't, or vice versa). Violates single source of truth.

**Instead:** Return `computed()` refs from the composable. They recompute reactively when `cart` state changes.

### Anti-Pattern 3: Modifying Cart State with Notice Flags

**What:** Enriching cart item objects with `.isBackorder`, `.isClearance` flags after fetching.

**Why bad:** Mutating shared state (`useState('cart')`) with derived fields creates hidden coupling. Other consumers of cart state may break. `refreshCart()` overwrites the cart — flags would be lost.

**Instead:** Compute flags in the composable. Components that need them call `useCartNotices()`.

### Anti-Pattern 4: Hardcoding Category ID for Clearance Detection

**What:** Using `databaseId === 2531` to detect clearance items.

**Why bad:** Database IDs can change across environments (staging vs. production). Brittle.

**Instead:** Match by slug: `slug === 'clearance-items'`. Slugs are human-readable, stable across environments, and already used throughout the codebase for category matching (see `useCategorySEO.ts` line 103, `useFiltering.ts` line 106).

## Sources

All findings verified against codebase files:

| Claim | Source | Confidence |
|-------|--------|------------|
| `stockStatus` on SimpleProduct fragment | `woonuxt_base/app/queries/fragments/SimpleProduct.gql:11` | HIGH |
| `stockStatus` on variation nodes in cart | `woonuxt_base/app/queries/fragments/CartFragment.gql:53` | HIGH |
| `productCategories` NOT in cart fragment | Grep search across `woonuxt_base/app/queries/` — no match in CartFragment.gql | HIGH |
| `ProductCategories` fragment exists | `woonuxt_base/app/queries/fragments/ProductCategoriesFragment.gql` | HIGH |
| Helcim order metadata path | `composables/useCheckout.ts:215-284`, `server/api/create-admin-order.post.ts:301-375` | HIGH |
| Cart/checkout are client-only | `nuxt.config.ts` routeRules (verified in ARCHITECTURE.md codebase analysis) | HIGH |
| StockStatus.vue yellow palette | `components/productElements/StockStatus.vue` — `text-yellow-600` | HIGH |
| Nuxt layer override priority | `nuxt.config.ts` — `priority: 1000` on root layer | HIGH |
| `productCategories` resolution on cart product node | Inferred from WPGraphQL type system — cart product.node resolves to Product interface implementations | MEDIUM — needs runtime verification |

---

*Architecture research: 2026-04-09*
