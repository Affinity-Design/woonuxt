# Phase 2: Detection Composable — Summary

**Completed:** 2026-04-09
**Duration:** ~5 minutes

## What Was Done

### DATA-03: backorderItems computed list ✅
`useCartNotices().backorderItems` returns reactive list of cart items where `product.node.stockStatus === 'ON_BACKORDER'`. Reads directly from cart state — no API calls needed.

### DATA-04: clearanceItems computed list ✅
`useCartNotices().clearanceItems` returns reactive list of cart items whose product is in the `clearance-items` category. Uses `server/api/cart-item-categories.post.ts` from Phase 1 for batch category lookup, with smart caching (only fetches missing slugs).

### DATA-05: null/empty cart handling ✅
Both computed lists guard against null cart (`cart.value?.contents?.nodes`), null product nodes, and missing slugs. Returns empty arrays when cart is null (after `resetInitialState()`).

## Files Changed

| File | Change |
|------|--------|
| `composables/useCartNotices.ts` | **Created** — Detection composable with backorder/clearance lists |

## Verification

- [x] `nuxt prepare` succeeds
- [x] No TypeScript errors in composable
- [x] Handles null cart state (returns empty arrays)
- [x] Reactive: watches `cartItemSlugs` and auto-fetches categories on change
- [x] Convenience booleans: `hasBackorderItems`, `hasClearanceItems`, `hasAnyNotices`
