# Research Summary

**Generated:** 2026-04-09
**Domain:** Backorder & condition-based cart/checkout notices for Nuxt 3 + WPGraphQL headless WooCommerce

---

## Stack Verdict

**Zero new dependencies needed.** The entire feature builds on existing patterns:

- Vue 3 `computed()` reactivity for condition detection
- Tailwind colour classes for notice styling (yellow/warning matches existing `StockStatus.vue`)
- `nuxt-graphql-client` fragment overrides for cart data enrichment
- `@nuxtjs/i18n` `$t()` for bilingual messages
- `useState` composable pattern for shared cart state

**~10 files touched** (3 new components/composables, 7 edited). All within root override layer — zero `woonuxt_base/` modifications.

---

## Feature Landscape

### Table Stakes (Must Ship)

| Feature                                                 | Complexity | Dependency                              |
| ------------------------------------------------------- | ---------- | --------------------------------------- |
| CartFragment override (stockStatus + productCategories) | Low        | **Prerequisite for everything**         |
| Per-item backorder badge in cart                        | Low        | Fragment override                       |
| Per-item clearance badge in cart                        | Low        | Fragment override + category detection  |
| Backorder summary banner in checkout                    | Low        | Detection composable                    |
| Clearance summary banner in checkout                    | Low        | Detection composable                    |
| Line item meta + order note for backorder               | Low-Med    | Detection composable + both order paths |
| Bilingual i18n keys (en-CA + fr-CA)                     | Low        | None                                    |

### Differentiators (Should Ship)

| Feature                                 | Value                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| **Reusable `CartNotice.vue` component** | Enables future conditions (low stock, etc.) with zero new code |
| Cart drawer integration                 | Easy incremental win — notices appear in mini-cart too         |

### Anti-Features (Do NOT Build)

- Blocking modals / forced acknowledgment
- Custom email templates (line item meta auto-renders in WC emails)
- Real-time stock polling (cart data is fresh from `refreshCart()`)
- Toast-based backorder warnings (toasts are transient; backorder needs persistent visibility)
- Any `woonuxt_base/` modifications

---

## Architecture

### Data Flow

```
Cart Refresh (GqlGetCart)
  → CartFragment.gql (with stockStatus + productCategories)
  → cart.value (useState)
  → useCartNotices() composable (computed detection)
  → CartNotice.vue (renders per-item badges + summary banners)
  → processCheckout() (injects metadata at submission time)
  → Order creation (Helcim REST / GraphQL mutation)
```

### Build Order (Dependencies Drive Sequence)

1. **Data foundation** — CartFragment override + `useCartNotices` composable
2. **Display layer** — `CartNotice.vue` + cart/checkout integration + i18n
3. **Order metadata** — Metadata injection into both checkout paths

### Critical Architectural Decision

Order metadata must be injected **upstream of the Helcim/GraphQL branch point** — not inside either path separately. Both paths consume the same `lineItems` array, so enrichment happens once during `processCheckout()` preparation.

---

## Top Pitfalls

| #   | Pitfall                                                                                                  | Prevention                                                           | Phase   |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| 1   | **Dual order path divergence** — metadata injected in one path but not the other                         | Inject upstream of Helcim/GQL branch                                 | Phase 3 |
| 2   | **CartFragment data gaps** — simple products missing stockStatus, all products missing productCategories | Single comprehensive fragment override                               | Phase 1 |
| 3   | **Cart null-state crash** — `resetInitialState()` nukes cart, collapsing computed notices                | Guard `useCartNotices` with `cart.value?.contents?.nodes` null check | Phase 1 |
| 4   | **Metadata duplication** — reactive watchers pushing meta on every cart change                           | Just-in-time injection at submission, not reactive push              | Phase 3 |
| 5   | **i18n partial deployment** — one locale file updated, other forgotten                                   | Atomic update to both en-CA.json and fr-CA.json in same commit       | Phase 2 |

---

## Open Questions (Resolve in Phase 1)

1. Does `productCategories` resolve on cart product nodes in WPGraphQL's cart context? (Needs runtime test with real cart data)
2. Does adding `productCategories` to the cart fragment add noticeable latency to `GetCart`? (Unlikely, but profile)
