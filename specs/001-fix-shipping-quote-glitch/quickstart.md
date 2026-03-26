# Quickstart: Fix Shipping Quote Glitch

**Branch**: `001-fix-shipping-quote-glitch` | **Date**: 2026-03-26

## What This Feature Does

Fixes a resurfaced bug where shipping rates, methods, and charges appear in the cart and checkout before the shopper has entered a valid shipping address. After this fix:

- **Cart drawer**: Shows product subtotal only — no shipping rates, methods, or charges ever appear
- **Checkout page**: Shipping section hidden until ALL address fields are populated (street, city, province, country, postal code)
- **Order total**: Excludes shipping until a valid quote is obtained and a method is selected
- **Loading state**: Spinner shown (no text) while shipping quotes are being fetched

## Files Changed

| File | Change Type | Purpose |
|------|-------------|---------|
| `composables/useCheckout.ts` | Modified | Add `isShippingAddressComplete` computed ref; gate `updateShippingLocation()` on address completeness |
| `components/shopElements/OrderSummary.vue` | Modified | Use full address validation instead of postal-code-only check; add spinner during loading |
| `components/shopElements/Cart.vue` | Verified | Already correct — shows product subtotal only, no shipping display |
| `pages/checkout.vue` | Modified | Gate shipping methods section on `isShippingAddressComplete`; add spinner for loading state |
| `components/forms/BillingDetails.vue` | Modified | Gate `updateShippingLocation()` calls on address completeness |

## How to Test

### Local Development

```bash
npm run dev:ssl
```

### Manual Test Scenarios

1. **Cart drawer** — Add items, open cart drawer. Verify only product subtotal shown, no shipping.
2. **Checkout (no address)** — Navigate to checkout. Verify no shipping methods/rates shown, total excludes shipping.
3. **Checkout (partial address)** — Enter only postal code. Verify shipping still hidden.
4. **Checkout (full address)** — Fill all address fields including street. Verify shipping methods appear.
5. **Address cleared** — After getting a quote, clear postal code. Verify shipping reverts to hidden state.
6. **Ship to different address** — Toggle checkbox, enter full shipping address. Verify shipping rates appear using the shipping address, not billing.
7. **Payment** — Complete a full Helcim checkout. Verify shipping is included in the paid amount correctly.

## Key Design Decisions

1. **Frontend-only fix** — No WordPress/WooCommerce/GraphQL backend changes needed
2. **Full address required** — All 5 fields (street, city, province, country, postal code) must be populated before quotes are requested
3. **Defense in depth** — Both the API call (updateShippingLocation) and the display are gated on address completeness
4. **Cart defers to checkout** — Cart surfaces never show shipping; users enter address at checkout only
