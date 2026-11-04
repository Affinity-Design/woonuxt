# GraphQL Plugin Migration To-Do

Status: drafted 2026-10-30. Nothing on WordPress has changed yet. The build-time query patch was removed in the same commit as this doc (see [Done](#done)).

Reader: whoever upgrades the GraphQL plugins on the shared proskatersplace.com backend, which also serves proskatersplace.ca.

Post-read action: settle the [order decision](#decision-needed-order-vs-the-php-84-migration), then work through the checklist and remove the temporary patches.

## Why

On 2026-08-13 WooCommerce went from 10.7 to 11.0.1 on the .com backend. The GraphQL plugin, WooGraphQL 0.21.1, then started intermittently skipping its whole schema registration when the `WooCommerce` class wasn't loaded at the moment `graphql_init` fired. Products, cart and `registerCustomer` disappeared from the schema on some PHP workers, so .ca cart and checkout calls failed and every Pages build failed codegen.

WooGraphQL isn't on wordpress.org. It's installed from a GitHub release zip and has no update checker, so wp-admin never offers an update. The site has run on temporary patches since then.

## What's still holding the site together

| Patch | Where | State on 2026-10-30 |
|---|---|---|
| Snippet 87 "PSP TEMP HOTFIX - GraphQL stability patches" | WP Code Snippets | Active. v2 (since 2026-08-14 ~17:24 ET) only re-runs WooGraphQL's setup late when it was skipped. **Its code isn't in git or in local session transcripts: export it before touching anything.** |
| WPGraphQL Smart Cache deactivated | WP plugins | Off. It was replaying a bad cached copy of the schema to builds. |
| Snippet 88 "PSP one-shot OPcache reset" | WP Code Snippets | Used up and self-deactivated; never deleted. |
| Error beacon | `plugins/error-beacon.client.ts`, `server/api/client-errors.*`, `server/utils/clientErrorReport.ts` | Live. `tests/publicErrorMessages.test.mjs` (L191-204) reads these files. |
| Defensive registration in psp-upsell-coupons | `wordpress/plugins/psp-upsell-coupons/includes/class-psp-upsell-graphql.php` | Guards against the schema flap. |
| ~~`scripts/patch-base-queries.js` + `preinstall` hook~~ | Repo | Removed 2026-10-30, see [Done](#done). |

Snippet 87 v1 included session code copied from the new plugin. On 0.21.1 it dropped the customer address, so .ca quoted Toronto the international zone (51) in USD from ~22:40 ET Aug 13 to ~17:24 ET Aug 14. **Never put that code back.**

## Evidence

- [docs/incident-2026-08-13-graphql-schema-flap.md](../incident-2026-08-13-graphql-schema-flap.md): root cause, temporary fixes and planned migration (on master).
- `docs/agent-handoff-2026-08-14.md`: the fullest account, covering snippet versions, the shipping incident, backend access paths and the outstanding-work list. It's only on the unmerged branch `origin/claude/product-page-loading-error-7y81v8` (commit `7bd7fea4`). Read it with `git show origin/claude/product-page-loading-error-7y81v8:docs/agent-handoff-2026-08-14.md`.
- `wordpress/docs/prod-02-php-upgrade-runbook.md` on the **local-only** branch `claude/php84-migration` (not on GitHub). Decision D1 pauses the PHP move for this GraphQL work. Its Phase 3 says never to move WooCommerce or the GraphQL plugins during the PHP window.
- Commits: `4f193462` build-time patch, `548f2507` incident doc, `0c4ef687` Smart Cache finding, `9df70545` error beacon, `81e4c915` signup moved to `registerCustomerWithAuth`.
- Upstream WooNuxt (`upstream/master`, scottyzen/woonuxt) is tested on WooGraphQL 1.0.3, WPGraphQL 2.23.1, Headless Login 0.4.4 and PHP 8.4, so its queries are a known-good reference. Our `woonuxt_base` branched from it in Feb 2025 (merge-base `70230962`).

## Target versions

| Component | Now | Target | Notes |
|---|---|---|---|
| WooGraphQL, now "GraphQL for eCommerce" | 0.21.1 | **1.0.3** (latest; nothing newer as of 2026-10-30) | GitHub zip only: `https://github.com/wp-graphql/wp-graphql-woocommerce/releases/download/v1.0.3/wp-graphql-woocommerce.zip`. **Requires PHP 8.1**, WooCommerce 9.0+, WordPress 6.3+, WPGraphQL 2.0+. Tested up to WooCommerce 10.4.3 (we run 11.0.1). CI covers PHP 8.1 and 8.3, not 8.4. Same folder and main file (`wp-graphql-woocommerce/wp-graphql-woocommerce.php`), so an in-place swap keeps it in `active_plugins`. |
| WPGraphQL | 2.9.1 | **2.26.0** (wordpress.org, 2026-10-29) | No major-version breaks since 2.9.1. 2.15.0 broke older Headless Login, so move both together. |
| Headless Login for WPGraphQL | 0.4.1 | 0.4.4 or newer | Confirm which release fixes the WPGraphQL 2.15+ problem before upgrading WPGraphQL past 2.14. |
| WPGraphQL Smart Cache | off | latest, on | Turn it back on last, after everything else passes. |
| PHP on PROD-02 | 8.0.17 (per the Aug 14 handoff; unconfirmed since) | 8.4 | Via the PHP 8.4 runbook. |

## Decision needed: order vs the PHP 8.4 migration

The runbook's D1 does the GraphQL work on PROD-02 first, then snapshots and moves to PHP 8.4. **If PROD-02 is still on PHP 8.0, WordPress refuses to activate 1.0.3**, because of its `Requires PHP: 8.1` header.

- **Option A (recommended):** move to PHP 8.4 with the current plugins and snippet 87 unchanged, as the runbook's Phase 3 already requires. Then upgrade the plugins on PROD-03 while the store is still closed, before Phase 6 reopens orders. That changes one thing at a time, and the closed store covers the downtime. It needs D1 reworded.
- **Option B:** if `php -v` on PROD-02 shows 8.1 or newer, the runbook's current order works.

Either way: test.proskatersplace.com is still down (522), so there's no staging. PROD-03 on its temporary IP is the only rehearsal box.

## Known breaking changes that touch us

From the v0.21.1 → v1.0.3 releases, PRs and code; PR numbers refer to `wp-graphql/wp-graphql-woocommerce`. Items marked *inferred* weren't tested.

**Sessions (highest risk)**
- **Session signing key changes (#1012).** 0.21.1 signs `woocommerce-session` tokens with `GRAPHQL_WOOCOMMERCE_SECRET_KEY`, falling back to `graphql-woo-cart-session`. Production uses that fallback: a guest token issued on 2026-10-30 validated against it. 1.0.3 falls back to `wp_salt()` and rejects keys shorter than 32 bytes. **Every shopper's stored session token fails with `invalid_token` after the swap.** Guest carts are lost, and the frontend must drop the stale token and start a new session or the shopper stays stuck.
- Keep the new `set_session_token_type` setting on **legacy** (the default). `store-api` removes the `woocommerce-session` header and the `sessionToken`/`wooSessionToken` fields this frontend uses.
- New `session_transfer_behavior` setting (#993). The default, `keep_new_fallback_old`, matches today's behaviour.
- GraphQL requests are now flagged `woocommerce_is_rest_api_request=true`, and customer, cart and session are rebuilt at `init_graphql_request`. This is the same mechanism whose backport broke shipping on Aug 13-14. Here it ships with the matching plugin, but retest shipping and gateways (below).
- Leave "Disable QL Session Handler" off: open bug #1024 breaks every cart mutation when it's on.

**Schema and response changes**
- `ShippingRate.cost` now returns a formatted price with the currency symbol by default (it was a raw string, or null for free). It takes a new `format` argument; use `RAW` for the old value.
- Order `LineItem.subtotal`, `subtotalTax`, `total` and `totalTax` are now formatted by default, with the same `format` argument. `woonuxt_base` `checkout.gql` and the order fragment select these.
- `VariationAttribute.label` now returns the attribute label (e.g. `Size`) instead of the slug (`size`).
- `ProductVariation` and several product interfaces no longer implement `Product`, so `... on Product` fragments no longer match variation nodes (#934).
- `product(idType: SLUG)` now finds published products only. Drafts, pending and private products resolve to null.
- `products` changes connection type (`RootQueryToProductConnection`, `Product` interface nodes). Variations move to the new `productsWithVariations`, and `ProductTypesEnum.VARIATION` moves to `ProductTypesWithVariationsEnum` (#994). The frontend only uses SIMPLE, VARIABLE and EXTERNAL.
- `checkout` failures now return WooCommerce's own error notices as the message, plus a new `notices` field. `useCheckout.ts` matches error text, so check its patterns.
- `Cart.feeTotal`, `feeTax` and `fees` are deprecated ("Always null").
- `registerCustomer` no longer logs the new user in unless `authenticate: true` (#973). `authToken`/`refreshToken` still come back through Headless Login, which is what `registerCustomerWithAuth.gql` uses.
- Checkout account creation only logs in with `account.authenticate: true` (#1003). *Inferred:* without it, orders may save with customer ID 0.

**Orders**
- `createOrder` now defaults `created_via` to `graphql-api` and writes `_wc_order_attribution_source_type`, overwriting the `utm` source .ca sends. The admin Origin column would read "GraphQL" instead of "Source: proskatersplace.ca". Pass the new `createdVia` input in `server/api/create-admin-order.post.ts` and check the "Origin List & Analytics Filters" plugin.
- `createOrder`/`updateOrder` now save once to fix HPOS data loss (#1003). Check whether HPOS is on in production.
- `checkout` now fires `woocommerce_after_checkout_validation` with the real error object. The PO-box rule in `wordpress/woocommerce-checkout-rules.php` will start blocking the GqlCheckout fallback path; the Helcim `createOrder` path isn't affected.

**WPGraphQL 2.9.1 → 2.26.0**
- `writeReview` goes through WPGraphQL's comment mutation, which now honours "close comments after N days" (2.24.x). Reviews on old products may be refused.
- Search cursors changed in 2.17.0. *Unknown:* whether cursors cached in KV still work.

**Our custom PHP**
- Snippet 87 calls 0.21.1 internals that 1.0.0 removed or renamed. **Turn it off before activating 1.0.3**, or it can double-register or fatal.
- `wordpress/psp-master-payment-shipping-code-snippets.php` shows Helcim and the Canada zone 17 rates only when `WC()->customer` has country CA inside a GraphQL request. The new session rebuild changes when that object exists, so retest.
- `psp-upsell-coupons` binds `UPSELL-*` coupons to the session's customer ID. Check for double-applied or orphaned coupons when a guest cart merges into a user cart. *Unknown:* which `Product.upsell` field wins, ours or WooGraphQL's.
- CORS: live `Access-Control-Allow-Headers` and `Expose-Headers` include `woocommerce-session`. 1.0.3 keeps the same filters; confirm after the swap.

## Checklist

### Before (server, read-only)
- [ ] `php -v` on PROD-02. This decides Option A or B.
- [ ] Export all Code Snippets (runbook Phase 1 has the commands). **Commit snippet 87's code to `wordpress/snippets/`** so it exists outside WordPress.
- [ ] `wp plugin list --fields=name,status,version` for the before state, including WooCommerce's exact version.
- [ ] Is HPOS on? (WooCommerce → Settings → Advanced → Features.)
- [ ] Is `GRAPHQL_WOOCOMMERCE_SECRET_KEY` defined in `wp-config.php`, and how long is it? Decide whether to set one of at least 32 bytes; existing tokens break either way.
- [ ] Download the v1.0.3 zip and confirm it unpacks into a `wp-graphql-woocommerce/` folder. If it's a different folder, WordPress treats it as a second plugin, and activating it next to 0.21.1 should fatal on redeclared functions.
- [ ] Keep the 0.21.1 zip for rollback.
- [ ] Snapshot (runbook D1 baseline, or a dedicated one under Option A).

### Frontend prep (repo, before the swap)
- [ ] On `invalid_token`, drop the stale `woocommerce-session` and start a new session. Check `server/utils/woocommerceSession.mjs`, `server/api/add-to-cart.post.ts`, `server/api/update-cart-quantity.post.ts`, `server/api/upsell/cart.post.ts` and `composables/useAuth.ts`.
- [ ] Find every use of `ShippingRate.cost`, order line-item money fields and `VariationAttribute.label`. Add `format: RAW` where code parses numbers, and keep display going through `formatWooPriceForDisplay()`.
- [ ] Find `... on Product` fragments that expect to match variations.
- [ ] Check `useCheckout.ts` error matching against the new notice-based messages.
- [ ] Pass `createdVia` in `create-admin-order.post.ts`'s `createOrder`.
- [ ] Compare our `.gql` files with `upstream/master` `woonuxt_base/app/queries`.
- [ ] After the swap, regenerate `data/local-schema.graphql` (used by the `:local` builds).

### Swap (store closed)
- [ ] Turn snippet 87 **off** (don't delete it).
- [ ] Deactivate WooGraphQL 0.21.1, replace it in place with 1.0.3, activate.
- [ ] WooGraphQL settings: session token type `legacy`, transfer behaviour left at default, "Disable QL Session Handler" off.
- [ ] Upgrade WPGraphQL and Headless Login together.
- [ ] Purge `.ca` `NUXT_CACHE` and re-warm (`gh workflow run warm-cache-on-deploy.yml`).
- [ ] Smart Cache: update and turn on last, then rerun the schema checks.

### Test (snippet 87 still off)
- [ ] Schema stability: 20 runs of the full introspection query, plus codegen validation of every `.gql` (the method in [Done](#done)) and a full `npm run build`.
- [ ] Toronto (`M9W 4Y6`) shipping: Canada zone 17 in CAD (Pickup $0, Ground $12, Next-Day $14), never the international zone or USD. Free over $135.
- [ ] Checkout lists "Helcim Payment".
- [ ] Helcim `createOrder` with the production app password: order number, line-item meta, attribution origin, POS auto-completion snippet unaffected.
- [ ] Sign-up returns `authToken`; login; guest cart merges into the user cart.
- [ ] A shopper with an old session cookie recovers without clearing cookies.
- [ ] Upsell coupons apply once and survive login.
- [ ] Product pages: variant selection, stock status, reviews.
- [ ] Prices on product cards, PDP, cart and checkout match the pre-swap values.
- [ ] .com storefront and FunnelKit checkout still work.

### Cleanup (after about a week clean in production)
- [ ] Delete snippets 87 and 88.
- [ ] Remove the error beacon and update the "registration and diagnostics use strict allowlists" test.
- [ ] Remove the vestigial flap guards in `psp-upsell-coupons` and update `specs/002-conditional-upsell-coupons`.
- [ ] Update the incident doc and the PHP runbook (D1 and the Phase 3 plugin line).
- [ ] Copy the Aug 14 handoff doc into `docs/` (or confirm this doc covers it), then delete `origin/claude/product-page-loading-error-7y81v8`.

### Loose ends from August
- [ ] Confirm the Affinity Design admin account's application password embedded in Make scenario 4871835 was revoked. The Aug 14 handoff scheduled it; nobody has confirmed it.
- [ ] Delete the Make temporary objects: scenario 4871835, webhook 2796759, data stores 90721/90722, data structure 288867.
- [ ] Fix the authorized-origin typo `test.proskaterplace.ca` (missing "s") in WPGraphQL access control.

## Rollback

Turn off 1.0.3, put the 0.21.1 folder back and reactivate it, then turn snippet 87 back on. Purge and re-warm `NUXT_CACHE`. Session tokens issued by 1.0.3 won't validate on 0.21.1, so shoppers get new sessions again. If the database was changed in ways that don't reverse, restore the snapshot.

## Done

- **2026-10-30: removed `scripts/patch-base-queries.js` and its `preinstall` hook.** The hook is back to `npx only-allow npm`, its value before `4f193462`. The patch rewrote the base `registerCustomer.gql` in CI to call `updateCustomer`, but nothing reachable calls `GqlRegisterCustomer` any more: signup uses the root `registerCustomerWithAuth.gql` (since `81e4c915`), which the patch never covered. Validated before removal: five downloads of the full live schema, each validating the unpatched `woonuxt_base/app/queries/registerCustomer.gql`, `queries/registerCustomerWithAuth.gql` and `CustomerFragment.gql` with graphql-js, all with zero errors.

## Frontend prep (implemented 2026-11-04)

Works on **both** plugin versions, so it ships to production before the static-IP move and needs no revert on a backend rollback. The three fields 0.21.1 rejects (`RegisterCustomerInput.authenticate`, `CreateAccountInput.authenticate`, `CreateOrderInput.createdVia`) are sent only when the live schema has them: `composables/useWooSchemaCapabilities.ts` (client, one `__type` probe per page load, assumes 1.0+ if the probe fails) and `orderInputSupportsCreatedVia()` in `server/api/create-admin-order.post.ts` (server, cached 5 minutes per isolate, leaves the field out if the probe fails). `nuxt prepare` passes against live PROD-02 (0.21.1) and PROD-03 (1.0.3). Checked against the v1.0.3 source (`QL_Session_Handler`, `Root_Query::cart`, `Cart_Mutation::check_session_token`, `Order_Create`, `Customer_Register`, Headless Login 0.4.4 `TokenManager`) and upstream WooNuxt's v1.0.3 SDK.

Correction to "Known breaking changes": a rejected session token does surface. The `cart` root field and every cart mutation throw `invalid_token: <reason>` (HTTP 200), and the same response carries a new `woocommerce-session` header. In production the mu-plugin sanitizer rewrites that text, so the frontend matches the sanitizer's fixed copy.

| # | Change | Files | Live 1.0.3 check needed |
|---|---|---|---|
| 1 | Recognise a rejected session token: raw `invalid_token: …`, the bare 0.21.x reasons, and the sanitizer's fixed copy. | `shared/utils/wooSession.mjs` (new) | Yes: the old-token POST in the PROD-03 test below. |
| 2 | Sanitizer v1.2.0. `invalid_token` and bare reasons now return `Your cart session expired. Refresh the page to start a new one.` (it used to be generic or "item not found"). Actionable copy added for PO box, shipping and stock checkout notices. Cross-site review: only GraphQL error text changes. `.com` classic and FunnelKit checkout don't use GraphQL. No US or CAD SEO impact. | `wordpress/mu-plugins/psp-graphql-error-sanitizer.php` | Deploy to PROD-03 **before** activating 1.0.3 (`php -l` + sha256sum). Works on 0.21.1 too. |
| 3 | One installer for the session token (GraphQL header + host-only cookie). Dropping a session also expires the `Domain=` copy that `useCheckout` used to write. | `composables/useWooSession.ts` (new), `useCart`, `useAuth`, `useCheckout` | No |
| 4 | `refreshCart` heals itself: on a rejected token it drops the token and fetches once more on the new session (never loops). Falls back to `viewer.wooSessionToken` (upstream `01e1a38e`). Base `init.ts` no longer reaches its logout + `push('/')` path for stale sessions. | `utils/cartRefreshCoordinator.mjs`, `composables/useCart.ts` | No |
| 5 | Browser cart mutations (coupon apply/remove, empty cart, shipping method) restart a dead session with a clear message instead of a generic error. | `composables/useCart.ts` | No |
| 6 | `/api/add-to-cart` repeats the add once on the session WooGraphQL just issued, and expires stale cookie copies. Dropped `feeTax`/`feeTotal` (always null on 1.0). | `server/api/add-to-cart.post.ts`, `server/utils/woocommerceSession.mjs`, `server/utils/wooSessionCookies.ts` (new) | No |
| 7 | `/api/update-cart-quantity` returns a 200 `{code: 'session_expired'}` (no retry: the item key belongs to the dead cart). The client restarts the session. | `server/api/update-cart-quantity.post.ts`, `composables/useCart.ts` | No |
| 8 | `useAuth`: login installs `login.sessionToken` before refreshing. Logout clears the Bearer token and the Woo session (the old session is keyed to the account), clearing cookies before the guest refresh. `updateCustomer` uses the shared installer. | `composables/useAuth.ts` | Confirm `LoginPayload.sessionToken`, `Customer.sessionToken`, `User.wooSessionToken` still exist (token type `legacy`). |
| 9 | **1.0 field, sent only when the schema has it.** `registerUser` sends `authenticate: true` when `RegisterCustomerInput` has it. Without it, Headless Login refuses `authToken` for a non-current user (HTTP 400), so sign-up "fails" after creating the account. | `composables/useAuth.ts`, `tests/publicErrorMessages.test.mjs` | Yes: `RegisterCustomerInput.authenticate` (in the upstream SDK). Sign-up returns `authToken` and keeps the guest cart. |
| 10 | GqlCheckout fallback only (the Helcim `createOrder` path is untouched): the session comes from `refreshCart` + the shared installer (no `Domain=` cookie), plus an empty-cart guard. Every failure after payment now goes to the paid-recovery hand-off, never a retry prompt. A rejected session never retries onto the new, empty session. Errors are classified with `classifyCheckoutError`. The dead `checkout.messages` parsing was removed. **1.0-only (latent, checkbox disabled):** `account` is `{username, password, authenticate: true}` (`turnstileToken` was never a field). | `composables/useCheckout.ts`, `shared/utils/publicErrorMessages.mjs` | Yes: `CreateAccountInput.authenticate`. PO-box fallback test. |
| 11 | Shipping rate cards no longer prepend `$`. Formatted 1.0 cost goes through `formatWooPriceForDisplay()`; a bare 0.21.1 number goes through `formatPrice()`. Fixes `$$12.00` and the lone `$` on free rates. | `components/shopElements/ShippingOptions.vue` | Yes: Toronto `M9W 4Y6` cards match the OrderSummary shipping line. |
| 12 | Base `ProductPricingFragment.gql` (invalid on 1.0: `ProductWithPricing.onSale`) is excluded through root `.nuxtignore`. No replacement: no document spreads `...ProductPricing` or `...ProductStock`, and a same-named replacement would break codegen on both schemas if the ignore ever stopped matching. | `.nuxtignore` (new) | Done 2026-11-04: `nuxt prepare` passes against live PROD-02 (0.21.1) and PROD-03 (1.0.3). |
| 13 | **1.0 field, sent only when the schema has it.** `createOrder` sends `createdVia: 'utm'`, so 1.0 doesn't overwrite the attribution source with `graphql-api` (Origin would read "GraphQL"). It is not passed to `checkout`: there metaData is applied after createdVia, so `utm` survives. | `server/api/create-admin-order.post.ts` | Yes: `wp eval` on a test order prints `utm`, `utm`, `proskatersplace.ca`, and the order is not auto-completed as POS. |
| 14 | Removed the CI-only `scripts/patch-base-queries.js` and its `preinstall` hook (matches [Done](#done)). | `package.json`, `scripts/patch-base-queries.js` (deleted) | No |
| 15 | Tests: `npm run test:woo-session` (new; also checks that the sanitizer copy and rule stay in sync). 5 new recovery tests in `test:cart-session`. Checkout classification test in `test:error-messages`. | `tests/wooSession.test.mjs` (new), `tests/cartSessionRace.test.mjs`, `tests/publicErrorMessages.test.mjs` | No |

Not implemented, on purpose:
- `cart(recalculateTotals: true)` (upstream `57a45e13`) needs a new root `getCartRecalculated.gql`. The argument is 1.0-only and codegen-checked, so `nuxt prepare` and `npm install` against today's backend would fail. It also runs `calculate_totals()` on every cart read. Add it at cutover only if the Toronto shipping test shows stale rates.
- A root `checkoutWithAttribution.gql` (createdVia/notices): 1.0-only codegen, and createdVia must not go to `checkout` (see 13).
- `found`, `MENU_ORDER`, `ProductVariation.sku`/`manageStock`: all still present in the v1.0.3 SDK, so no change. All root `.gql` files and root inline queries without `${}` validate against the SDK. The only exceptions are our own `validateCheckoutData` (snippet #40), `Cart.upsell` and `allPaManufacturer`.
- Expired Headless Login Bearer token (403 on every call) and `refreshToken` storage: the bug exists today and 0.4.4 doesn't change it. Follow-up after confirming `graphql_login_token_validity` in production.
- PO-box check before payment, and the snippet #23 `'box#'` → `'box'` false positive: owner decision, and the fix is in US scope.
- Draft/private products 404 after the swap (`product(idType: SLUG)` is now publish-only): pre-swap SEO audit (301 or 410 per slug). No code change.

Backend prerequisites the recovery depends on (PROD-03, before activating 1.0.3):
- `define('GRAPHQL_WOOCOMMERCE_SECRET_KEY', '<64+ random chars>')`, kept identical for rehearsal and cutover. php-jwt 7.1 rejects keys under 32 bytes when issuing tokens, which breaks every request, and the frontend can't recover from that.
- Session token type `legacy`, "Disable QL Session Handler" off, transfer behaviour default. Sanitizer v1.2.0 deployed (item 2).
- Test: POST `{ cart { isEmpty } customer { sessionToken } }` with a token captured from production before the swap. Expect HTTP 200, `errors[0].message` = the item 2 copy, and a new `woocommerce-session` response header. Then the "old session cookie recovers" checklist item in a browser.
