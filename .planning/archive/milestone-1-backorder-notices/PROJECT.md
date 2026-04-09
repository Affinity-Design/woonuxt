# Backorder & Condition-Based Cart/Checkout Notices

## What This Is

A reusable notice system for the ProSkaters Place Canada checkout flow that warns customers about product conditions (backorder status, clearance no-refund policy) before they complete purchase. Notices appear inline per line item and as summary banners in both cart and checkout. Order metadata is written to WooCommerce so backorder/clearance status is visible in admin and emails.

## Core Value

Customers must see clear, unmissable warnings about backorder items and clearance no-refund policies before they hit "Place Order" — preventing disputes and setting correct expectations.

## Requirements

### Validated

- ✓ GraphQL schema exposes `stockStatus` (`ON_BACKORDER`) on products and variations — existing
- ✓ `StockStatusEnum` TypeScript enum available via `#woo` — existing
- ✓ `StockStatus.vue` component renders backorder in yellow on product pages — existing
- ✓ Toast notification system exists (`useToast`, `ToastContainer.vue`) — existing
- ✓ WooCommerce `clearance-items` category (slug: `clearance-items`, ID: 2531) exists — existing
- ✓ Cart fragment returns `variation.node.stockStatus` — existing
- ✓ Order creation supports `lineItem.metaData` and `metaData` arrays — existing

### Active

- [ ] Reusable `CartNotice.vue` component — condition-driven, accepts type (warning/info/error), message, and icon; styled yellow for warnings
- [ ] Extend `CartFragment.gql` override to include `stockStatus` on the product node (simple products)
- [ ] Per-line-item backorder badge in cart drawer/page — yellow indicator next to each backorder item
- [ ] Per-line-item clearance badge in cart drawer/page — indicator that item is non-refundable
- [ ] Summary backorder banner at top of checkout — "Your order contains items on backorder"
- [ ] Summary clearance banner at top of checkout — "Your order contains clearance items that are not refundable"
- [ ] Computed helper in `useCart` (or new composable) to detect backorder/clearance items in cart
- [ ] Clearance detection: match cart items against `clearance-items` product category (slug/ID)
- [ ] Pass backorder status as line item meta (`Backorder: Yes`) during order creation
- [ ] Add order-level note when order contains backorder items ("Contains backorder items: [SKUs]")
- [ ] Add order-level note when order contains clearance items ("Contains non-refundable clearance items: [SKUs]")
- [ ] i18n keys for all notice messages (en-CA and fr-CA)

### Out of Scope

- Blocking modal / forced acknowledgment before payment — informational only for now
- Dedicated email template section — line item meta auto-renders in standard WC emails
- Low-stock quantity warnings ("Only 2 left!") — may add later via same component
- Modifying the base layer (`woonuxt_base/`) — all changes via root overrides

## Context

- **Brownfield project**: ProSkaters Place Canada is live. This adds a new feature layer on top.
- **Two-layer architecture**: `woonuxt_base/` is read-only. Override cart fragment and components by copying to root.
- **Cart data gap**: `CartFragment.gql` returns `stockStatus` on variation nodes but NOT on product nodes for simple products. Need to extend the fragment.
- **Clearance detection**: Products in WooCommerce category `clearance-items` (slug: `clearance-items`, cat ID: 2531). Category data comes through GraphQL on product nodes (`productCategories`).
- **Order creation path**: Helcim orders go through `server/api/create-admin-order.post.ts` which already maps `lineItem.metaData` (variation attributes). GraphQL-based checkout uses `GqlCheckout` mutation. Both paths need backorder metadata injection.
- **Existing stock display**: `components/productElements/StockStatus.vue` already shows "On Backorder" in yellow on product pages — new component should use consistent colour/messaging.

## Constraints

- **Architecture**: Must not modify `woonuxt_base/`. Override by copying files to root.
- **Data**: Must work with existing WPGraphQL schema — no WordPress plugin changes.
- **Rendering**: Cart/checkout are client-only (`ssr: false`). Notices render client-side only.
- **i18n**: All user-facing strings must have en-CA and fr-CA translations.
- **Reusability**: Notice component must be generic (condition + message + type), not hardcoded to backorder.

## Key Decisions

| Decision                                                      | Rationale                                                                            | Outcome   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| Reusable condition-based notice vs. dedicated BackorderNotice | Future conditions (clearance, low stock) use same component                          | — Pending |
| Informational only, no blocking                               | Fewer friction points; backorder/clearance are pre-purchase warnings not legal gates | — Pending |
| Line item meta + order note (both)                            | Maximum visibility in WC admin and emails for fulfillment team                       | — Pending |
| Extend CartFragment for simple product stockStatus            | Simple products can also be on backorder; variation-only coverage is insufficient    | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-09 after initialization_
