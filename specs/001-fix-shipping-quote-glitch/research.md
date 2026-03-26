# Research: Fix Shipping Quote Glitch

**Branch**: `001-fix-shipping-quote-glitch` | **Date**: 2026-03-26

## Research Questions

### RQ-1: Where does premature shipping data originate in the cart state?

**Decision**: The WPGraphQL `Cart` fragment (`CartFragment.gql`) always returns `shippingTotal`, `chosenShippingMethods`, and `availableShippingMethods` in every cart response. When WooCommerce has a previously cached shipping session (from a prior visitor session or address entry), these fields may contain stale rates even when no address is currently associated with the cart. The `useCart` composable stores whatever the server returns in `cart` state via `useState`, and every mutation (`addToCart`, `removeItem`, `updateItemQuantity`, `emptyCart`, `applyCoupon`) calls `updateCart()` which replaces the full cart object — including shipping fields — with the server response.

**Rationale**: The root cause is that the frontend trusts the backend's shipping data unconditionally. The `Cart.vue` (cart drawer) already has a partial fix — it manually subtracts `shippingTotal` from `rawTotal` to display a shipping-free total. However, `OrderSummary.vue` has a different approach using `hasShippingAddress` (checks for postal code only). Neither is comprehensive.

**Alternatives considered**:
- Stripping shipping data in `updateCart()` — rejected because it would break checkout when a valid address _is_ present
- Creating a separate "display cart" object — rejected as over-engineering; simpler to control display logic per-surface

### RQ-2: How does the current `hasShippingAddress` check work, and what are its gaps?

**Decision**: The custom `OrderSummary.vue` uses a `hasShippingAddress` computed property that only checks `customer.value?.billing?.postcode` for a non-empty value. This is insufficient per the spec — it must check ALL address fields: country, province/state, city, postal code, AND street address (`address1`).

**Rationale**: The billing postal code check fails in multiple scenarios:
1. User enters postal code first, then fills other fields → shipping shows prematurely
2. User with saved account data that has only partial address → may pass check falsely
3. Doesn't respect `shipToDifferentAddress` toggle — always checks billing, even when shipping should use a different address

**Alternatives considered**:
- Checking only country + postal code (common e-commerce pattern) — rejected per spec clarification Q1 answer (all fields required)
- Using `cart.availableShippingMethods.length > 0` as the signal — rejected because the backend may return methods even without a full address

### RQ-3: Which files/components need changes?

**Decision**: Seven files need changes across three categories:

**Category A — Shipping display suppression (cart surfaces)**:
1. `components/shopElements/Cart.vue` — Cart drawer. Already subtracts shipping from total, but still needs to ensure no shipping text/method leaks. Needs to show product subtotal only per spec.
2. `components/shopElements/OrderSummary.vue` — Checkout order summary. Has partial `hasShippingAddress` check; needs full address validation, spinner during loading.

**Category B — Shipping quote gating (checkout)**:
3. `pages/checkout.vue` — Checkout page. The shipping methods section renders when `cart.availableShippingMethods.length > 0` — this must also be gated by full address validity.
4. `components/forms/BillingDetails.vue` — Triggers `updateShippingLocation()` on field changes. Currently fires on individual field blur/change events, which can trigger partial-address shipping lookups.
5. `composables/useCheckout.ts` — The `updateShippingLocation()` function sends whatever address data is available to the backend. Should gate on full address completeness before calling the API.

**Category C — Shared logic (new composable or utility)**:
6. New: Address validation helper — shared `isShippingAddressComplete()` function that checks all 5 required fields (country, state, city, postcode, address1). Used by OrderSummary, checkout, and BillingDetails.

**Rationale**: Keeping the validation logic in a shared function prevents the same bug from being fixed inconsistently across surfaces.

### RQ-4: How does the `shipToDifferentAddress` toggle affect shipping address resolution?

**Decision**: When `orderInput.shipToDifferentAddress` is `true`, the shipping address comes from `customer.value.shipping`. When `false`, it comes from `customer.value.billing`. The `updateShippingLocation()` function already handles this branching. The address validation function must use the same logic — check billing address by default, but check shipping address when the toggle is active.

**Rationale**: This matches the existing `useCheckout.ts` pattern in `updateShippingLocation()` and `processCheckout()`.

### RQ-5: What is the best approach for the loading spinner (FR-012)?

**Decision**: Use the existing `isUpdatingCart` state from `useCart()` as the loading signal. When `updateShippingLocation()` is called, it sets `isUpdatingCart.value = true` at the start and the cart watcher resets it when the cart updates. The `OrderSummary.vue` already has a loading overlay that triggers on `isUpdatingCart`. For the shipping methods section in checkout, add a spinner conditional that shows when `isUpdatingCart` is true AND the address is complete (meaning a quote is being fetched).

**Rationale**: Reuses existing infrastructure. No new state variables needed.

**Alternatives considered**:
- New `isFetchingShippingRates` state — rejected as redundant with `isUpdatingCart`
- Text-based loading message — rejected per spec clarification Q3 (spinner only, no text)

### RQ-6: How does the cart drawer currently handle shipping, and what changes are needed?

**Decision**: `Cart.vue` already computes `formattedCartTotal` by subtracting `shippingTotal` from `rawTotal`. This is the right approach. However, the current implementation is fragile — it parses HTML price strings and does arithmetic subtraction. The cart drawer does NOT display shipping as a line item (good — matches spec), but the total subtraction is a workaround for the backend including shipping in the total.

Per spec clarification Q4: Cart defers to checkout entirely. No shipping display needed. The current total calculation (subtract shipping) should continue. No changes needed to Cart.vue behavior — just verify it doesn't show shipping methods or rates.

**Rationale**: Cart.vue already correctly suppresses shipping display. Its total calculation approach is validated by the spec.

### RQ-7: What is the impact on payment integrations?

**Decision**: None. The shipping suppression is purely display-layer. The Helcim payment flow reads `cart.value.shippingTotal` and `cart.chosenShippingMethods` at payment time (after address entry on checkout), so those values will be populated normally when the user reaches payment. The `processCheckout()` function passes `shippingMethod: cart.value?.chosenShippingMethods` — this is only called after payment, by which time a valid address and shipping method must be selected.

**Rationale**: The payment flow occurs sequentially after address entry. The fix gates _display_, not the underlying cart state.

### RQ-8: Does `updateShippingLocation()` need to be gated, or just the display?

**Decision**: Both. The spec says "Shipping quotes MUST NOT be requested until the full address is provided" (based on clarification Q1). Therefore, `updateShippingLocation()` should check address completeness before sending the `GqlUpdateCustomer` mutation. This prevents unnecessary API calls and avoids the backend calculating rates for incomplete addresses.

However, the display suppression is still the primary defense. Even if the backend returns shipping data, the frontend must hide it when the address is incomplete (per clarification Q2 — frontend treats backend data as untrusted).

**Rationale**: Defense in depth. Gating the API call reduces backend load; gating the display prevents the bug regardless of backend behavior.

## Technology Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Address validation | Shared helper function in `composables/useCheckout.ts` | Collocated with `updateShippingLocation()` which already reason about address completeness |
| Loading state | Reuse `isUpdatingCart` from `useCart()` | Already wired through cart update lifecycle |
| Cart total | Keep existing subtraction approach in Cart.vue | Already works, spec confirms cart shows product subtotal only |
| Shipping gating | Dual: gate API call + gate display | Defense in depth per spec clarifications Q1+Q2 |
| Active address resolution | Follow `shipToDifferentAddress` toggle | Consistent with existing `updateShippingLocation()` and `processCheckout()` |
