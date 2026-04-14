---
status: awaiting_human_verify
trigger: 'idk what but on the test site im getting wildless differnt heclim payment price then the checkout price, also double shipping rates.'
created: 2026-04-09T17:40:40.7840379-04:00
updated: 2026-04-09T17:40:40.7840379-04:00
---

## Current Focus

hypothesis: confirmed. order summary rounding and blank shipping-cost rendering were the remaining frontend causes after the earlier Helcim amount alignment work.
test: verify on the test site that checkout subtotal/tax/total now align with the payment amount and that free or blank shipping cards show $0.
expecting: order summary values match the actual checkout/payment flow, and shipping boxes no longer show blank prices.
next_action: have the user verify the updated checkout on the test site and report any remaining mismatch.

## Symptoms

expected: Helcim payment amount should match the checkout total, and each shipping rate should appear only once.
actual: On the test site, the Helcim payment amount differs significantly from the checkout amount, and shipping rates are duplicated.
errors: none reported
reproduction: Open checkout on the test site with shippable items and observe the order summary, shipping options, and Helcim payment amount.
started: unknown

## Eliminated

## Evidence

- timestamp: 2026-04-09T17:40:40.7840379-04:00
  checked: pages/checkout.vue helcimAmount, helcim line item, and shipping method computations
  found: helcimAmount prefers cart.rawTotal as-is, while helcim line items, shipping, tax, and discount are converted through convertToCAD().
  implication: the payment amount can diverge from the displayed checkout total when WooCommerce raw totals are not already in CAD.

- timestamp: 2026-04-09T17:40:40.7840379-04:00
  checked: components/shopElements/OrderSummary.vue and utils/priceConverter.ts
  found: the order summary displays totals via formatPrice(cart.total), which converts unmarked WooCommerce amounts to CAD using exchangeRate and preserves explicitly marked CAD values.
  implication: the order summary and Helcim amount currently use different currency logic, which explains the mismatch seen on the test site.

- timestamp: 2026-04-09T17:40:40.7840379-04:00
  checked: pages/checkout.vue and components/shopElements/ShippingOptions.vue shipping option rendering
  found: checkout passes cart.availableShippingMethods[0].rates directly into ShippingOptions, and ShippingOptions renders every option with no normalization or deduplication.
  implication: any duplicate or duplicate-labeled rates returned by WooCommerce surface directly in the UI.

- timestamp: 2026-04-09T17:40:40.7840379-04:00
  checked: wordpress/php/snippets/psp-master-payment-shipping-code-snippets.php
  found: WordPress shipping snippet code can expose all rates for staff and even inject a POS shipping method for staff sessions.
  implication: backend shipping configuration may also contribute duplicate-looking rates, so frontend normalization is a safe immediate fix while backend rules may still need follow-up.

- timestamp: 2026-04-09T17:40:40.7840379-04:00
  checked: components/shopElements/OrderSummary.vue and components/shopElements/Cart.vue against the latest checkout screenshots
  found: OrderSummary formats subtotal, shipping, tax, and total with convertToCAD(..., true), which rounds to .99 for product-display aesthetics, while Cart.vue uses exact conversion logic for its checkout CTA amount.
  implication: checkout summary values can be inflated relative to the cart drawer and Helcim/payment totals even after the Helcim amount fix.

- timestamp: 2026-04-09T17:40:40.7840379-04:00
  checked: components/shopElements/ShippingOptions.vue
  found: shipping cost cards render option.cost directly after a dollar sign, so null or empty values appear blank instead of a zero-dollar fallback.
  implication: free or unset shipping rates display as an empty price, which matches the current frontend bug report.

## Resolution

root_cause:
checkout used different total logic for payment and display, and the order summary also applied .99-style display rounding intended for product prices. in parallel, shipping option cards rendered raw rate.cost values directly, so blank backend costs displayed as an empty amount.
fix:
updated checkout to calculate Helcim from the same CAD-aligned total path used by the UI, normalized duplicate shipping labels before rendering, switched OrderSummary pricing to exact checkout conversion instead of .99 display rounding, and added a $0 fallback for blank shipping-card costs.
verification:
pages/checkout.vue, components/shopElements/OrderSummary.vue, and components/shopElements/ShippingOptions.vue validate with no editor errors. browser verification on the test site is still required.
files_changed: [pages/checkout.vue, components/shopElements/OrderSummary.vue, components/shopElements/ShippingOptions.vue]
