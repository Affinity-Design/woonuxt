# Implementation Plan: Fix Shipping Quote Glitch

**Branch**: `001-fix-shipping-quote-glitch` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-fix-shipping-quote-glitch/spec.md`

## Summary

Fix a resurfaced bug where WooCommerce backend shipping data (rates, methods, charges) leaks into the cart and checkout UI before the shopper has entered a complete shipping address. The fix is frontend-only: add a shared address validation function to `useCheckout`, gate both the `updateShippingLocation()` API call and all shipping display on full address completeness, and ensure cart surfaces show product subtotal only.

## Technical Context

**Language/Version**: TypeScript / Vue 3 (Nuxt 3.x)
**Primary Dependencies**: Nuxt 3, Vue 3, WPGraphQL (nuxt-graphql-client), Tailwind CSS
**Storage**: Cloudflare KV (caching only — no changes needed for this feature)
**Testing**: Manual testing (no automated test framework configured)
**Target Platform**: Cloudflare Pages (SSR + static)
**Project Type**: Web application (headless e-commerce frontend)
**Performance Goals**: No regression in checkout flow speed; shipping quote fetch time unchanged
**Constraints**: Frontend-only fix — no WordPress/WooCommerce/GraphQL schema changes. Must preserve Helcim, Stripe, PayPal payment integrations. CAD currency display must be maintained.
**Scale/Scope**: ~5 files modified, 1 new shared function, 0 new components, 0 new API endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file (`constitution.md`) contains only the unfilled template — no project-specific gates have been defined. No violations to evaluate.

**Pre-Phase 0**: PASS (no gates defined)
**Post-Phase 1**: PASS (no gates defined)

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-shipping-quote-glitch/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output — codebase research findings
├── data-model.md        # Phase 1 output — entity model and state transitions
├── quickstart.md        # Phase 1 output — testing and verification guide
└── tasks.md             # Phase 2 output (created by /speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (files to modify)

```text
composables/
└── useCheckout.ts          # Add isShippingAddressComplete(); gate updateShippingLocation()

components/
├── shopElements/
│   ├── Cart.vue            # Verify — already shows product subtotal only (no changes expected)
│   └── OrderSummary.vue    # Replace postcode-only check with full address validation; add spinner
└── forms/
    └── BillingDetails.vue  # Gate updateShippingLocation() calls on address completeness

pages/
└── checkout.vue            # Gate shipping methods section on isShippingAddressComplete; add loading spinner
```

**Structure Decision**: No new directories or files beyond `specs/` artifacts. All changes are in existing root-level overrides of `woonuxt_base` components/composables.

## Implementation Approach

### Change 1: Add `isShippingAddressComplete` to `useCheckout.ts`

**File**: `composables/useCheckout.ts`
**What**: Add a computed ref `isShippingAddressComplete` that checks all 5 required address fields (address1, city, state, country, postcode) are non-empty strings. Uses `orderInput.shipToDifferentAddress` to determine whether to check billing or shipping address. Export it from the composable.

**Why**: Centralizes the validation logic so all surfaces (OrderSummary, checkout page, BillingDetails) use the same check. Prevents inconsistent behavior across surfaces.

**Gate `updateShippingLocation()`**: Add an early return at the top of `updateShippingLocation()` that skips the API call when `isShippingAddressComplete` is false. This prevents unnecessary GraphQL mutations for incomplete addresses.

**Spec coverage**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-009

### Change 2: Update `OrderSummary.vue` shipping display

**File**: `components/shopElements/OrderSummary.vue`
**What**: Replace the `hasShippingAddress` computed (which only checks `billing.postcode`) with a reference to `isShippingAddressComplete` from `useCheckout()`. The shipping line item should show "Enter address for quote" when the address is incomplete, and show the shipping cost when complete. The total should exclude shipping when the address is incomplete (using the existing `totalWithoutShipping` computed).

Add a spinner (LoadingIcon) in the shipping line when `isUpdatingCart` is true AND `isShippingAddressComplete` is true (meaning the quote is actively being fetched).

**Spec coverage**: FR-001, FR-002, FR-006, FR-012

### Change 3: Gate shipping methods in `checkout.vue`

**File**: `pages/checkout.vue`
**What**: The shipping methods section (`<div v-if="cart.availableShippingMethods.length">`) must also require `isShippingAddressComplete` to be true. Change the condition to `cart.availableShippingMethods.length && isShippingAddressComplete`. Add a loading spinner in the shipping section area when `isUpdatingCart` is true and `isShippingAddressComplete` is true.

**Spec coverage**: FR-001, FR-007, FR-012

### Change 4: Gate `updateShippingLocation()` calls in `BillingDetails.vue`

**File**: `components/forms/BillingDetails.vue`
**What**: The current BillingDetails triggers `updateShippingLocation()` on blur/input/change for individual address fields (address1, city, state, country, postcode). These calls should be wrapped in a check: only call `updateShippingLocation()` when all 5 fields are populated. Import `isShippingAddressComplete` from `useCheckout()` and use it as a guard.

**Spec coverage**: FR-001, FR-005

### Change 5: Verify Cart.vue (no changes expected)

**File**: `components/shopElements/Cart.vue`
**What**: Verify that the cart drawer already meets spec requirements: product subtotal only, no shipping line items, no shipping methods. The current implementation already subtracts `shippingTotal` from `rawTotal` for the display total. No changes should be needed.

**Spec coverage**: FR-003, FR-006

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Address validation too strict (blocks valid checkouts) | Low | High | Only checks non-empty — no format validation. Same 5 fields that the form already marks as required. |
| `updateShippingLocation()` gate prevents saved-address users from getting quotes | Low | Medium | Logged-in users with saved addresses will have all 5 fields populated from their profile, passing the gate automatically. |
| Race condition: address passes validation momentarily during rapid field edits | Low | Low | Debounce already exists on input handlers (800-1000ms). Display is gated independently of API call. |
| Helcim payment breaks if shipping not in total | None | High | Helcim uses `rawTotal` from cart (which always includes shipping from backend). Display suppression doesn't affect payment amount. |
| `shipToDifferentAddress` toggle creates edge case | Low | Medium | Address validation follows the toggle — checks the same address that `updateShippingLocation()` sends to the backend. |

## Complexity Tracking

No constitution violations to justify. Feature is a focused bug fix with no new components, no new API endpoints, and no architectural changes.
