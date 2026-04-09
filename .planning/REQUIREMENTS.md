# Requirements: Backorder & Condition-Based Cart/Checkout Notices

**Defined:** 2026-04-09
**Core Value:** Customers must see clear, unmissable warnings about backorder items and clearance no-refund policies before they hit "Place Order."

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Layer

- [ ] **DATA-01**: Cart GraphQL fragment includes `stockStatus` on simple product nodes (override `CartFragment.gql` in root)
- [ ] **DATA-02**: Cart GraphQL fragment includes `productCategories` on product nodes for clearance category detection
- [ ] **DATA-03**: `useCartNotices()` composable returns computed list of backorder items from cart state
- [ ] **DATA-04**: `useCartNotices()` composable returns computed list of clearance items by matching cart items against `clearance-items` category (slug: `clearance-items`)
- [ ] **DATA-05**: `useCartNotices()` handles null/empty cart state without errors (guards against `resetInitialState()` nuking cart)

### Cart Display

- [ ] **CART-01**: Reusable `CartNotice.vue` component accepts condition type (warning/info/error), message string, and optional icon
- [ ] **CART-02**: `CartNotice.vue` renders yellow background styling for warning type (consistent with existing `StockStatus.vue` backorder colour)
- [ ] **CART-03**: Per-item yellow "On Backorder" badge appears next to each backorder item in cart page
- [ ] **CART-04**: Per-item "Non-refundable" badge appears next to each clearance item in cart page
- [ ] **CART-05**: Cart drawer/mini-cart sidebar shows backorder and clearance badges on affected line items
- [ ] **CART-06**: Badges disappear when item is removed from cart or stock status changes on refresh

### Checkout Display

- [ ] **CHKT-01**: Summary banner at top of checkout page reads "Your order contains items on backorder" when any cart item has `ON_BACKORDER` status
- [ ] **CHKT-02**: Summary banner at top of checkout page reads "Your order contains clearance items that are not refundable" when any cart item is in `clearance-items` category
- [ ] **CHKT-03**: Summary banners are informational only — no blocking, no acknowledgment required
- [ ] **CHKT-04**: Summary banners disappear if the triggering items are removed from cart

### Order Metadata

- [ ] **META-01**: Each backorder line item includes `metaData: { key: 'Backorder', value: 'Yes' }` in the WooCommerce order
- [ ] **META-02**: Order-level note added when order contains backorder items: "Contains backorder items: [list of SKUs or product names]"
- [ ] **META-03**: Order-level note added when order contains clearance items: "Contains non-refundable clearance items: [list of SKUs or product names]"
- [ ] **META-04**: Metadata injection works for the Helcim admin order path (`server/api/create-admin-order.post.ts`)
- [ ] **META-05**: Metadata injection works for the GraphQL checkout path (`GqlCheckout` mutation)
- [ ] **META-06**: Metadata is injected once at submission time (just-in-time), not reactively on cart changes

### Internationalization

- [ ] **I18N-01**: All notice messages have en-CA translations in `locales/en-CA.json`
- [ ] **I18N-02**: All notice messages have fr-CA translations in `locales/fr-CA.json`

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Notices

- **V2-01**: Low-stock quantity warnings ("Only X left!") via same `CartNotice.vue` component
- **V2-02**: Pre-order notice type for products not yet released
- **V2-03**: Shipping delay notices for items shipping from alternate warehouses

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Blocking modal / forced acknowledgment | Informational only — fewer friction points per project decision |
| Custom email templates for backorder | Line item meta auto-renders in standard WC emails; sufficient for now |
| Real-time stock polling in cart | Cart data refreshed via `refreshCart()`; polling adds complexity for no user value |
| Toast-based backorder warnings | Toasts are transient; backorder needs persistent visibility in cart/checkout |
| `woonuxt_base/` modifications | Architecture rule: all changes via root overrides |
| WordPress plugin changes | No server-side CMS modifications required |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| CART-01 | — | Pending |
| CART-02 | — | Pending |
| CART-03 | — | Pending |
| CART-04 | — | Pending |
| CART-05 | — | Pending |
| CART-06 | — | Pending |
| CHKT-01 | — | Pending |
| CHKT-02 | — | Pending |
| CHKT-03 | — | Pending |
| CHKT-04 | — | Pending |
| META-01 | — | Pending |
| META-02 | — | Pending |
| META-03 | — | Pending |
| META-04 | — | Pending |
| META-05 | — | Pending |
| META-06 | — | Pending |
| I18N-01 | — | Pending |
| I18N-02 | — | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23 ⚠️

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after initialization*
