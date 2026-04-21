# Phase 2: Detection Composable - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Create `useCartNotices()` composable that provides computed backorder and clearance item lists from the current cart state. Infrastructure composable — no visual output.

</domain>

<decisions>
## Implementation Decisions

### Agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase.

Key approach decisions already resolved:
- Backorder detection: Read `stockStatus` directly from cart product node (already in GraphQL response)
- Clearance detection: Call `server/api/cart-item-categories.post.ts` with cart item slugs, match against `clearance-items` category
- Composable returns reactive computed lists that update when cart changes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `composables/useCart.ts` — provides `cart` state via `useState('cart')`
- `server/api/cart-item-categories.post.ts` — batch category lookup from Phase 1
- `StockStatusEnum` from `#woo` — includes `ON_BACKORDER` value

### Established Patterns
- Composables use `useState()` for shared reactive state
- Cart items at `cart.value.contents.nodes`
- Product node at `item.product.node` with `stockStatus` on SimpleProduct/VariableProduct
- `$fetch` for server API calls in client-side code

### Integration Points
- Consumed by Phase 4 (cart badges) and Phase 5 (checkout banners)
- Must handle null cart (after `resetInitialState()`)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
