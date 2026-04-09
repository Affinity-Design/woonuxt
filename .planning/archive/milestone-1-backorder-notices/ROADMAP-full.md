# Roadmap: Backorder & Condition-Based Cart/Checkout Notices

## Overview

This roadmap delivers a reusable notice system that warns ProSkaters Place customers about backorder status and clearance no-refund policies before checkout. The build follows a strict dependency chain: cart data enrichment → condition detection → visual display → order metadata — ensuring each phase has verified foundations before building on them.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Cart Data Foundation** - Override CartFragment.gql to expose stockStatus and productCategories on cart product nodes
- [x] **Phase 2: Detection Composable** - useCartNotices() composable with computed backorder/clearance detection and null guards
- [x] **Phase 3: Notice Component** - Reusable CartNotice.vue accepting condition type, message, and icon with warning styling
- [x] **Phase 4: Cart Line Item Badges** - Per-item backorder/clearance badges on cart page and cart drawer
- [x] **Phase 5: Checkout Summary Banners** - Summary warning banners at top of checkout page
- [x] **Phase 6: Order Metadata Injection** - Line item meta and order notes for both Helcim and GraphQL checkout paths
- [x] **Phase 7: Internationalization** - All notice strings in en-CA and fr-CA locale files

## Phase Details

### Phase 1: Cart Data Foundation

**Goal**: Cart GraphQL responses include all data needed for backorder and clearance detection
**Depends on**: Nothing (first phase — prerequisite for everything)
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

1. `getCart` query returns `stockStatus` field on simple product nodes in cart
2. `getCart` query returns `productCategories` on product nodes in cart
3. Existing cart functionality (add, remove, update quantity) works unchanged after fragment override

**Plans:** 1 plan

Plans:

- [ ] 01-01-PLAN.md — Override CartFragment.gql: copy base queries to root, add productCategories to product.node, update documentPaths

### Phase 2: Detection Composable

**Goal**: Application can programmatically identify backorder and clearance items in the current cart
**Depends on**: Phase 1
**Requirements**: DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):

1. `useCartNotices().backorderItems` returns the correct list of items with `ON_BACKORDER` status
2. `useCartNotices().clearanceItems` returns the correct list of items in `clearance-items` category
3. Both computed lists react to cart changes (add/remove items updates lists immediately)
4. Empty or null cart state produces empty lists without errors
   **Plans**: TBD

### Phase 3: Notice Component

**Goal**: A reusable, styled notice component exists that can render any condition-based warning
**Depends on**: Nothing (can parallelize with Phase 2 if desired)
**Requirements**: CART-01, CART-02
**Success Criteria** (what must be TRUE):

1. `CartNotice.vue` renders a yellow-background warning when given `type="warning"`
2. Component accepts and displays different message strings and optional icons
3. Component visual style is consistent with existing `StockStatus.vue` backorder colour
   **Plans**: TBD

### Phase 4: Cart Line Item Badges

**Goal**: Customers see per-item condition badges on every cart surface
**Depends on**: Phase 2, Phase 3
**Requirements**: CART-03, CART-04, CART-05, CART-06
**Success Criteria** (what must be TRUE):

1. Backorder items show yellow "On Backorder" badge next to them on the cart page
2. Clearance items show "Non-refundable" badge next to them on the cart page
3. Same badges appear on affected items in the cart drawer/mini-cart sidebar
4. Badges disappear immediately when the triggering item is removed from cart
   **Plans**: TBD

### Phase 5: Checkout Summary Banners

**Goal**: Checkout page displays prominent summary warnings about backorder and clearance items
**Depends on**: Phase 2, Phase 3
**Requirements**: CHKT-01, CHKT-02, CHKT-03, CHKT-04
**Success Criteria** (what must be TRUE):

1. "Your order contains items on backorder" banner appears at top of checkout when cart has backorder items
2. "Your order contains clearance items that are not refundable" banner appears when cart has clearance items
3. Banners are informational only — checkout proceeds without any blocking or acknowledgment
4. Banners disappear when the triggering items are removed from cart
   **Plans**: TBD

### Phase 6: Order Metadata Injection

**Goal**: WooCommerce orders contain all backorder and clearance metadata for fulfillment team visibility
**Depends on**: Phase 2
**Requirements**: META-01, META-02, META-03, META-04, META-05, META-06
**Success Criteria** (what must be TRUE):

1. Backorder line items have `Backorder: Yes` metadata visible in WC admin order view
2. Order-level notes list SKUs/names for both backorder and clearance items
3. Metadata appears correctly for orders placed via Helcim admin order path
4. Metadata appears correctly for orders placed via GraphQL checkout path
5. Metadata is written once at order submission time, not reactively during cart changes
   **Plans**: TBD

### Phase 7: Internationalization

**Goal**: All notice messages display correctly in both English and French Canadian
**Depends on**: Phase 3, Phase 4, Phase 5
**Requirements**: I18N-01, I18N-02
**Success Criteria** (what must be TRUE):

1. All notice messages render in English when locale is en-CA
2. All notice messages render in French when locale is fr-CA
3. No hardcoded English strings remain in notice components or composables
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7
(Phases 3 and 2 can parallelize; Phases 4 and 5 can parallelize after their dependencies)

| Phase                       | Plans Complete | Status   | Completed  |
| --------------------------- | -------------- | -------- | ---------- |
| 1. Cart Data Foundation     | 1/1            | Complete | 2026-04-09 |
| 2. Detection Composable     | 1/1            | Complete | 2026-04-09 |
| 3. Notice Component         | 1/1            | Complete | 2026-04-09 |
| 4. Cart Line Item Badges    | 1/1            | Complete | 2026-04-09 |
| 5. Checkout Summary Banners | 1/1            | Complete | 2026-04-09 |
| 6. Order Metadata Injection | 1/1            | Complete | 2026-04-09 |
| 7. Internationalization     | 1/1            | Complete | 2026-04-09 |
