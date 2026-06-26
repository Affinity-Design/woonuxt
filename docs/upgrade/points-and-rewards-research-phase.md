# Points and Rewards Integration Research Phase

Status: Research phase drafted on 2026-06-26

Reader: engineering or implementation lead planning the ProSkaters Place rewards upgrade.

Post-read action: decide whether to start the live WordPress audit and backend contract phase before any Nuxt UI work.

## Executive Finding

The integration is feasible, but it should not be built as a frontend-only feature. The existing WooCommerce rewards plugin must stay the source of truth for point balances, point value, earned points, redemption limits, discount creation, order logging, and refunds or cancellations.

The safest architecture is a small WordPress-side GraphQL extension that wraps the existing rewards plugin, plus Nuxt components that read and mutate that contract. Nuxt should display points and request redemption, but WooCommerce must calculate the discount and return the updated cart.

The highest-risk area is checkout. The current Canadian storefront uses Helcim and a custom admin order creation path after payment. That path manually preserves discounted line totals and intentionally skips coupon reapplication to avoid total corruption. Since WooCommerce Points and Rewards redeems points through a generated discount/coupon-like adjustment, the implementation must prove that redemption is applied to the cart before Helcim payment and then correctly logged on the final WooCommerce order.

## Current Evidence

Local order metadata contains `_wc_points_logged_redemption`, which strongly suggests the WooCommerce Points and Rewards plugin or a compatible plugin has already affected orders in the ecosystem.

The current GraphQL schema snapshot does not appear to expose rewards fields or mutations. There is no visible Nuxt rewards composable yet.

The current Nuxt cart flow already supports coupons through GraphQL. The cart fragment includes totals, discount totals, and applied coupons. That means a rewards redemption that appears as a Woo discount can fit the existing frontend totals model if the backend exposes the operation cleanly.

The current checkout flow is special. Helcim payment is processed before the custom order completion call, then `create-admin-order` builds the WooCommerce order using cart line items, cart totals, metadata, and customer ID. It currently skips applying coupon lines after order creation because recalculation previously corrupted discounted totals.

The current account area is tab-based and can accept a Rewards tab without page restructuring. The product page has an obvious placement for a rewards earning widget below the description or near price/add-to-cart.

## WordPress MCP Access

The Affinity agency MCP can see the selected client as ProSkaters Place and can see the connected WordPress site:

- Site: `https://test.proskatersplace.com`
- MCP adapter status: available
- Ability count: 68 allowed abilities
- Useful read-only abilities include active plugin listing, environment, products, orders, users, post types, and terms.

The read-only `get-active-plugins` audit call requested confirmation before execution. It was not completed during this research doc creation. A live plugin audit is still required before implementation.

## External Research Notes

WooCommerce Points and Rewards supports rewarding customers for purchases and other actions, with points redeemable for discounts. WooCommerce's own documentation states that coupons must be enabled for point redemption, and it supports product, category, and global earning levels plus partial redemption.

WooCommerce's public feature request page still shows REST API support for Points and Rewards as an open request. That supports the conclusion that a headless storefront should expect to add its own WordPress API or GraphQL wrapper.

WPGraphQL supports registering custom fields and mutations, which is the correct extension surface for exposing rewards state and actions to WooNuxt.

WPGraphQL for WooCommerce supports customer sessions, cart/customer queries and mutations, checkout/order mutation paths, and WooCommerce cart session handling. Rewards mutations should follow that same session-aware pattern.

Sources:

- https://woocommerce.com/document/woocommerce-points-and-rewards/
- https://woocommerce.com/document/points-and-rewards-developer-documentation/
- https://woocommerce.com/feature-request/rest-api-for-points-and-rewards/
- https://www.wpgraphql.com/docs/wpgraphql-mutations
- https://github.com/wp-graphql/wp-graphql-woocommerce

## Recommended Backend Contract

Add a small WordPress plugin or mu-plugin with a project namespace such as `psp_rewards`. It should wrap the active rewards plugin instead of reimplementing point math.

Read-only fields:

- Customer rewards balance: current points, points label, money value, formatted money value.
- Rewards transaction history: date, type, point change, description, order ID when available.
- Product earning preview: points earned for buying the current product or selected variation.
- Cart earning preview: points expected from the current cart after discounts.
- Cart redemption preview: redeemable points, redeemable amount, formatted amount, active redemption code if present, and whether redemption is currently applied.
- Rewards settings summary: partial redemption enabled, minimum discount, maximum discount, tax treatment, earn ratio, redeem ratio, and whether coupons are enabled.

Mutations:

- Apply rewards redemption to current cart.
- Apply partial rewards redemption to current cart.
- Remove rewards redemption from current cart.
- Refresh rewards preview for current session.

Mutation outputs should return the updated cart where possible, matching existing WooGraphQL cart mutation behavior. If returning the full cart through WPGraphQL is awkward, return enough state for Nuxt to call `refreshCart()` immediately.

Security rules:

- Redemption requires an authenticated customer with a valid WooCommerce session.
- Earning previews may be public for product pages, but balance, logs, and redemption must be current-user only.
- Never trust a point amount sent from the frontend without recalculating server-side limits.

## Frontend Scope

Add a `useRewards()` composable with clear, human-readable function names:

- `refreshRewardsBalance`
- `refreshCartRewardsPreview`
- `applyRewardsRedemption`
- `removeRewardsRedemption`
- `refreshProductRewardsPreview`

Product page:

- Show a compact "Earn X points with this item" widget near price/add-to-cart or below description.
- For guests, show earning information and a login/account prompt.
- For excluded products or zero-point products, show nothing.

Checkout:

- Show points earned on this order.
- Show available balance and redeemable discount.
- Allow full redemption and partial redemption only if backend settings allow it.
- After applying/removing points, refresh cart before payment.
- Block redemption changes once Helcim payment begins.

My Account:

- Add a Rewards tab.
- Show balance, money value, recent point activity, and links back to shopping.
- Keep this separate from order history so support can debug point movement quickly.

Cart/order summary:

- Treat rewards redemption like a discount line.
- Label generated reward coupons as "Points redemption" instead of exposing internal generated coupon codes.

## Checkout And Helcim Risk

This is the main implementation risk.

The Woo plugin applies redemption as a discount before checkout. The Nuxt checkout currently sends discounted line totals to the server, then creates an admin order after the Helcim charge. Coupon reapplication is intentionally skipped in the admin order route to preserve manual totals.

The implementation must answer these questions in a test environment:

- Does points redemption appear in `cart.appliedCoupons` as a generated `wc_points_redemption_...` code?
- Does the GraphQL cart total match Helcim's charge amount after redemption?
- Does `create-admin-order` preserve the redemption amount on the created order?
- Does setting the order paid through REST trigger the points plugin's earning and redemption logs?
- If not, what explicit WordPress hook or order meta update is required?
- Does refund, cancellation, or failed order recovery restore points as expected?

Do not ship checkout rewards until these are proven with a real logged-in customer test account.

## Phase Path

### Phase 0: Live WordPress Audit

Goal: confirm the exact active rewards plugin and its runtime contract.

Tasks:

- Use MCP or WP admin/CLI to list active plugins on `test.proskatersplace.com`.
- Confirm whether the plugin is WooCommerce Points and Rewards or another rewards plugin.
- Record plugin version, WooCommerce version, WPGraphQL version, WPGraphQL WooCommerce version, HPOS status, and coupon setting status.
- Inspect current reward settings: earn ratio, redeem ratio, minimum redemption, maximum redemption, partial redemption, expiration, tax treatment, excluded products/categories.
- Create or identify a test customer with a known points balance.
- Confirm whether CA and US rewards should share the same backend balance or remain market-specific.

Exit criteria:

- Active plugin identity is confirmed.
- Existing plugin APIs/classes/hooks are confirmed on the live codebase.
- A written backend contract can be implemented without guessing.

### Phase 1: WordPress GraphQL Rewards Contract

Goal: expose read-only rewards state to WooNuxt.

Tasks:

- Add a small project-owned WordPress plugin or mu-plugin.
- Register rewards balance and rewards history fields for the current customer.
- Register product/cart earning preview fields.
- Register cart redemption preview fields.
- Add safe error responses for guests, missing plugin, disabled coupons, and zero available redemption.
- Avoid changing existing WooCommerce reward calculations.

Exit criteria:

- GraphQL queries return balance, product preview, cart preview, and history for a logged-in customer.
- Guest behavior is predictable and non-breaking.
- Schema works against local Nuxt codegen without duplicate fragment conflicts.

### Phase 2: Redemption Mutations

Goal: let WooCommerce apply/remove rewards redemption on the active cart session.

Tasks:

- Add apply full redemption mutation.
- Add apply partial redemption mutation if enabled.
- Add remove redemption mutation.
- Ensure each mutation recalculates server-side limits before applying.
- Return updated cart or a signal for Nuxt to refresh cart.
- Verify interaction with normal coupons.

Exit criteria:

- Applying points changes Woo cart totals.
- Removing points restores Woo cart totals.
- Coupon plus points combinations follow plugin settings.
- Generated internal redemption codes are hidden from customer-facing labels.

### Phase 3: Nuxt Rewards Data Layer And UI

Goal: add customer-facing rewards UI without touching payment logic yet.

Tasks:

- Add `useRewards()` composable.
- Add product rewards widget.
- Add checkout rewards panel above or near the order summary.
- Add My Account Rewards tab.
- Add translation keys for en-CA, en-US, and fr-CA if copy is customer-facing.
- Keep pricing display based on Woo cart totals, not client-side recalculation.

Exit criteria:

- Product, checkout, and account rewards UI render for logged-in users.
- Guest state is clear and does not expose private balance data.
- Cart refreshes after rewards apply/remove.

### Phase 4: Helcim Order Reconciliation

Goal: make rewards survive the custom Helcim admin order path.

Tasks:

- Capture rewards redemption metadata from cart before payment.
- Pass redemption metadata into the admin order payload.
- Preserve discounted line totals and cart totals.
- Add order metadata needed for the rewards plugin to recognize redemption.
- If plugin hooks do not fire on custom order creation, add a WordPress-side reconciliation hook for the admin-created order path.
- Ensure duplicate-charge recovery does not duplicate points redemption or earning.

Exit criteria:

- A Helcim test order with points redemption charges the correct amount.
- Woo order total, discount, tax, shipping, and line totals match the checkout screen.
- Customer points are deducted exactly once.
- Customer earned points are granted exactly once when order reaches the intended paid/processing state.

### Phase 5: Full QA And Rollout

Goal: prove no checkout, currency, SEO, or account regression.

Test matrix:

- Guest product page.
- Logged-in product page with zero points.
- Logged-in product page with points.
- Cart with no coupon and no points.
- Cart with coupon only.
- Cart with points only.
- Cart with coupon plus points.
- Partial redemption.
- Full redemption.
- Order total near zero.
- Shipping and tax changes after address entry.
- Failed Helcim payment.
- Successful Helcim payment.
- Duplicate-charge recovery flow.
- Refund/cancellation behavior.
- My Account rewards history after order.

Exit criteria:

- Product page, cart, checkout, order received, and account views are visually verified.
- Woo order records and rewards logs match customer-facing messages.
- No additional currency conversion or price formatting layer is introduced.
- Rollback plan is documented before production deploy.

## Open Questions

- Is the active plugin definitely WooCommerce Points and Rewards, or a different rewards plugin using compatible metadata?
- Should Canadian `.ca` customers share rewards with the US `.com` backend, or should rewards be presented as Canadian-only?
- Are points earned on discounted/clearance/backorder products?
- Should guests see product earning previews, or only logged-in customers?
- Should redemption require account creation during checkout?
- How should support manually adjust points from the backend if a headless order recovery happens?

## Recommendation

Proceed, but start with Phase 0 only. The implementation should be treated as a checkout-affecting platform upgrade, not a simple UI enhancement. The backend rewards contract and the Helcim order reconciliation proof are the gates that determine whether this is safe to ship.
