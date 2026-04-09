# Feature Landscape

**Domain:** E-commerce backorder & condition-based cart/checkout notices
**Project:** ProSkaters Place Canada — WooNuxt headless WooCommerce
**Researched:** 2026-04-09

## Table Stakes

Features customers expect from any store that sells backorder or final-sale/clearance items. Missing any of these creates confusion, support tickets, or chargebacks.

| #   | Feature                                                           | Why Expected                                                                                                                                                                                                                                                           | Complexity | Notes                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | **Per-line-item backorder indicator in cart**                     | Every major e-commerce platform (Shopify, WooCommerce default, Amazon) shows stock status per item in cart. Customers who added an item 3 days ago and forgot it was backorder will be confused at checkout.                                                           | Low        | CartCard.vue already has a `isLowStock` badge pattern — backorder badge follows identical pattern. Data: `variation.node.stockStatus` already in cart fragment for variable products. Simple products need fragment extension. |
| T2  | **Summary banner at checkout for backorder items**                | Standard WooCommerce cart shows "Available on backorder" per line and a top-level notice. Shopify shows "Pre-order" or "Ships later" prominently. Users scanning quickly at payment need an unmissable aggregate warning.                                              | Low        | Single computed check over `cart.contents.nodes`. Render above payment form in `checkout.vue`. Checkout is client-only so no SSR concerns.                                                                                     |
| T3  | **Per-line-item clearance/final-sale indicator in cart**          | Any store with non-refundable items (clearance, final sale) must mark them. This is a consumer protection expectation — Canada's Competition Act requires pre-purchase disclosure of return policy exceptions. Missing it exposes the business to chargeback disputes. | Low        | Need to detect `clearance-items` category (slug: `clearance-items`, ID: 2531) from product category data in cart. Same badge pattern as T1.                                                                                    |
| T4  | **Summary banner at checkout for clearance/non-refundable items** | Same rationale as T2 but for return policy. Customers must see "Items marked Clearance are non-refundable" before clicking Place Order.                                                                                                                                | Low        | Same computed check pattern as T2 but filtering by category.                                                                                                                                                                   |
| T5  | **Order metadata for backorder status**                           | Fulfilment team must instantly see which line items are on backorder without looking up each product. WooCommerce default cart writes `Backorder` line item meta natively — headless checkout bypasses this, so the meta must be explicitly injected.                  | Low–Med    | Two paths: Helcim admin order (REST API — `create-admin-order.post.ts` already maps `lineItem.metaData`) and GQL checkout (`GqlCheckout` mutation with `metaData` arrays). Both need injection.                                |
| T6  | **Order metadata for clearance status**                           | Same as T5. Order notes / line item meta so fulfilment knows which items are final-sale and non-refundable before processing a return request.                                                                                                                         | Low–Med    | Same two paths. Simpler than T5 because clearance is a category tag, not a stock status field.                                                                                                                                 |
| T7  | **Bilingual notice text (en-CA / fr-CA)**                         | Site is bilingual. All user-facing strings must have both locale keys per project constraints. Customers browsing in French must see warnings in French.                                                                                                               | Low        | Add keys to `locales/en-CA.json` and `locales/fr-CA.json`. Existing i18n infrastructure handles the rest.                                                                                                                      |

## Differentiators

Features that go beyond baseline expectations. These reduce support load, build trust, or improve conversion. Not expected, but valued.

| #   | Feature                                              | Value Proposition                                                                                                                                                                                                                                                                                 | Complexity | Notes                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Estimated shipping timeline per backorder item**   | Amazon, Best Buy, and REI show per-item estimated arrival. "Expected to ship: May 15-22" reduces "when will I get this?" emails dramatically. Most small e-commerce stores do NOT do this — it's a trust signal.                                                                                  | High       | Requires a data source for backorder ETAs. WooCommerce doesn't store this natively. Would need custom meta field on product/variation in WordPress, exposed via GraphQL. **Not feasible without WordPress changes — defer.**                                                                   |
| D2  | **Reusable condition-driven notice component**       | Instead of a hardcoded "BackorderNotice" and a separate "ClearanceNotice", a single `CartNotice.vue` that evaluates a condition function and renders a message with a type (warning/info/error). Future conditions (low stock, pre-order, custom bundle warnings) plug in without new components. | Low–Med    | Aligns with PROJECT.md design intent. Pattern: `{ condition: (item) => boolean, type: 'warning', message: string, icon?: string }`. Worth the small abstraction cost because at least 2 conditions (backorder, clearance) ship simultaneously and low-stock is explicitly mentioned as future. |
| D3  | **Order-level notes (not just line item meta)**      | WooCommerce admin order screen shows notes in a timeline. A note like "⚠️ Contains backorder items: SKU-A, SKU-B" and "🚫 Contains non-refundable clearance items: SKU-C" surfaces instantly when CS opens the order — faster than scanning each line item.                                       | Low        | WooCommerce REST API supports `customer_note` on order creation. Helcim path already has order data construction. Add note string after computing which items qualify.                                                                                                                         |
| D4  | **Visual consistency with product page StockStatus** | `StockStatus.vue` already uses yellow for backorder (`text-yellow-600`). Matching that exact colour in cart badges and checkout banners creates visual continuity — customer recognizes the same "backorder = yellow" signal across the shopping journey.                                         | Trivial    | Design decision, not a feature build. Just ensure Tailwind classes match: `text-yellow-600`, `bg-yellow-100`, `border-yellow-200`.                                                                                                                                                             |
| D5  | **Cart drawer notice (not just checkout)**           | Most stores only warn at checkout. Surfacing a small notice in the slide-out cart drawer (Cart.vue) means the user sees it before they even navigate to checkout. Reduces surprise and improves perceived transparency.                                                                           | Low        | Cart.vue is the slide-out drawer. Add summary notice above the checkout button. Same computed logic as T2/T4, reused.                                                                                                                                                                          |
| D6  | **Accessibility: ARIA roles on notices**             | Screen readers should announce warnings. `role="alert"` or `role="status"` on notice banners ensures compliance with WCAG 2.1 AA. Many e-commerce stores skip this.                                                                                                                               | Trivial    | Add `role="alert"` to warning-type notices, `role="status"` to info-type. Toast system already uses `role="alert"`.                                                                                                                                                                            |

## Anti-Features

Features to deliberately NOT build. Each has a clear reason.

| #   | Anti-Feature                                           | Why Avoid                                                                                                                                                                                                                                                                                                           | What to Do Instead                                                                                                                                                                                    |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Blocking modal / forced checkbox acknowledgment**    | PROJECT.md explicitly scopes this out. Blocking modals hurt conversion rate (extra friction). Legal obligations in Canada for clearance disclosure are met by visible inline warnings — an acknowledgment checkbox is not required. Adds complexity to checkout flow state management for no legal or UX benefit.   | Informational inline banners and badges. If legal team later requires acknowledgment, it can be added as a separate phase.                                                                            |
| A2  | **Dedicated backorder email template section**         | WooCommerce order emails already render line item meta (`metaData`) automatically. Building a custom email template section means maintaining WordPress PHP email templates — that's US backend infrastructure (`wordpress/` scope), cross-site impact, and ongoing maintenance for negligible benefit.             | Rely on line item meta auto-rendering in standard WC order emails. `Backorder: Yes` and `Clearance: Non-refundable` meta values will appear in the email's line item table with zero additional work. |
| A3  | **Low stock quantity warnings ("Only 2 left!")**       | PROJECT.md lists this as "may add later via same component." Building it now adds scope. The `CartCard.vue` already has a `isLowStock` computed, but it's product-page context — cart data may not have `lowStockAmount` reliably. Furthermore, scarcity messaging is a different UX concern (urgency vs. warning). | Note as future enhancement. The reusable `CartNotice.vue` (D2) will support it when ready — just add another condition function.                                                                      |
| A4  | **Real-time stock status polling / WebSocket updates** | Cart is a point-in-time snapshot. Polling stock status while user is on the checkout page adds API load, complexity, and edge cases (what if status changes mid-payment?). No competing headless WooCommerce store does this.                                                                                       | Stock status is evaluated when cart loads and refreshes. `refreshCart()` already re-fetches from GraphQL on key actions.                                                                              |
| A5  | **Toast notifications for backorder/clearance**        | Toasts are transient (auto-dismiss). Backorder/clearance warnings must be persistently visible. A toast that appears for 5 seconds and disappears is worse than no warning — customer might claim they were never told.                                                                                             | Persistent inline badges (per item) and banners (summary). Toasts remain for cart add/remove/error events only.                                                                                       |
| A6  | **Modifying `woonuxt_base/`**                          | Architectural constraint. Base layer is read-only upstream code. Any modification creates merge conflicts on upstream updates.                                                                                                                                                                                      | Override by copying files to root. CartFragment.gql goes to root `gql/` override directory. Components go to root `components/`.                                                                      |
| A7  | **WordPress plugin changes for clearance detection**   | PROJECT.md constraint: "Must work with existing WPGraphQL schema — no WordPress plugin changes." Clearance is already a WooCommerce category with known slug/ID.                                                                                                                                                    | Detect clearance via `productCategories` nodes on cart items. Category data already flows through GraphQL.                                                                                            |

## Feature Dependencies

```
T1 (backorder badge)  ──→ T5 (order meta: backorder)
    ↑                         ↑
    │                         │
    └─── D2 (reusable component) ───→ requires nothing (standalone pattern)
              │
T3 (clearance badge) ──→ T6 (order meta: clearance)

T2 (checkout backorder banner) ──→ needs T1's detection logic (shared computed)
T4 (checkout clearance banner) ──→ needs T3's detection logic (shared computed)

D5 (cart drawer notice) ──→ needs T2/T4's summary computed logic

T7 (i18n) ──→ all user-facing features (T1-T4, D5)

D2 (reusable component) ──→ T1, T3, T2, T4, D5 all consume it
    ↑
    └── D3 (order notes) is independent (server-side, no UI dependency)
```

**Critical path:** D2 (reusable component) → T1+T3 (per-item badges) → T2+T4 (summary banners) → T5+T6 (order meta) → D3 (order notes)

**Parallel work:** T7 (i18n strings) can be done alongside any other feature. D6 (ARIA) is applied during component build, not standalone.

## Cart Fragment Data Gap

A key implementation prerequisite cuts across multiple features:

**Problem:** `CartFragment.gql` returns `stockStatus` on `variation.node` (variable products) but NOT on `product.node` (simple products). Simple products can also be on backorder.

**Impact:** T1, T2, T5 all depend on having `stockStatus` for ALL cart items (simple + variable).

**Solution:** Override `CartFragment.gql` by copying to root `gql/` directory and adding `stockStatus` to the product node fields. This is the architectural pattern (A6 constraint).

**Clearance detection** does NOT have this gap — `product.node.productCategories` is already available in the cart fragment (categories are on the product, not the variation).

## MVP Recommendation

**Prioritize (delivers full customer-facing value):**

1. D2 — Reusable `CartNotice.vue` component (foundation for everything else)
2. T1 + T3 — Per-line-item backorder and clearance badges in cart
3. T2 + T4 — Summary banners at checkout
4. D5 — Cart drawer summary (reuses T2/T4 logic, tiny incremental cost)
5. T7 — i18n strings (must ship with any user-facing feature)
6. D4 + D6 — Visual consistency and accessibility (applied during build, not standalone)

**Then (back-office value):**

7. T5 + T6 — Order metadata injection (both Helcim and GQL paths)
8. D3 — Order-level notes

**Defer:**

- D1 (estimated shipping timeline) — requires WordPress backend changes, out of scope
- A3 (low stock warnings) — future enhancement, notice component supports it when ready

## Competitor Landscape (Informing Priority)

| Platform / Store              | Backorder in Cart                           | Clearance/Final-Sale Warning            | Order Meta              | ETA per Item           |
| ----------------------------- | ------------------------------------------- | --------------------------------------- | ----------------------- | ---------------------- |
| **WooCommerce (default PHP)** | ✅ Yellow "Available on backorder" per line | ❌ Not built-in (plugin territory)      | ✅ Auto line item meta  | ❌                     |
| **Shopify**                   | ✅ "Pre-order" or custom badge              | ✅ "Final Sale" badge (theme-dependent) | ✅ Line item properties | ❌ (unless app)        |
| **Amazon**                    | ✅ "Temporarily out of stock" with ETA      | ✅ "Non-returnable" badge               | ✅ Internal             | ✅                     |
| **Best Buy**                  | ✅ "Coming Soon" / "Backordered"            | ✅ "Final Sale"                         | ✅ Internal             | ✅ Estimated ship date |
| **Small headless stores**     | ⚠️ Often missing (data gap)                 | ⚠️ Often missing                        | ⚠️ Often missing        | ❌                     |

**Key insight:** ProSkaters Place implementing T1-T4 puts it ahead of most small/medium headless WooCommerce stores, which commonly drop stock status visibility when moving from PHP templates to headless. The data gap (simple product `stockStatus` missing from cart fragment) is the #1 reason headless stores lose this — and it's a known WooNuxt limitation this project directly addresses.

## Sources

- WooCommerce core: backorder stock status is native to `StockStatusEnum` (`IN_STOCK`, `OUT_OF_STOCK`, `ON_BACKORDER`) — verified in codebase (`#woo` import, `StockStatus.vue`)
- Shopify inventory docs: "Continue selling when out of stock" setting controls backorder behavior — display is theme-controlled
- Existing codebase: `CartCard.vue` already has `isLowStock` badge pattern; `StockStatus.vue` has yellow backorder styling; `ToastContainer.vue` has warning type with `role="alert"`
- Canada Competition Act: pricing and return policy must be disclosed before purchase — no specific UI pattern mandated, but visibility is required
- WooCommerce REST API: `customer_note` field on order creation, `meta_data` array on line items and order level — verified in `create-admin-order.post.ts`

---

_Feature landscape analysis: 2026-04-09_
