# Implementation Plan: Conditional Upsell Coupons

**Branch**: `feature/conditional-upsell-coupons` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-conditional-upsell-coupons/spec.md`

## Summary

Build one WordPress plugin (`psp-upsell-coupons`) on the shared WooCommerce 11 backend that stores merchant-authored "trigger → target" rules, evaluates every cart on change, generates session-bound native `UPSELL-*` coupons that discount only target line items, and exposes the evaluation state three ways: classic PHP hooks/notices for proskatersplace.com, WPGraphQL fields (`Cart.upsell`, `Product.upsell`, `upsellRules`) plus `psp/v1/upsell/*` REST for the headless proskatersplace.ca. On the .ca, add an Admin tab in `/my-account` to manage rules, and storefront components for the product banner, cart-drawer notices, line-item marker and checkout breakdown. Everything is additive; with zero rules the plugin is inert.

## Technical Context

**Language/Version**: PHP 7.4+ (8.x-clean) for the plugin; TypeScript / Vue 3 / Nuxt 3.16 for the .ca
**Primary Dependencies**: WooCommerce 11.0.1 (HPOS), WPGraphQL 2.9.1 + WooGraphQL 0.21.1 (schema instability known), nuxt-graphql-client, Tailwind, `@nuxt/icon`, `@nuxtjs/i18n`
**Storage**: WP CPT `psp_upsell_rule` + autoloaded option `psp_upsell_rules_compiled`; WC session key `psp_upsell`; `shop_coupon` posts; order/item meta. On .ca: Cloudflare KV `cache` mount key `upsell-rules:ca` (300 s)
**Testing**: Node `node --test` for the pure matcher; WP-CLI (`wp eval`) smoke scripts; manual matrix in `quickstart.md`. No PHPUnit harness exists in this repo.
**Target Platform**: WordPress on Lightsail (manual plugin zip upload; test backend first), Cloudflare Pages/Workers for the .ca (`Gql*` helpers unusable in server routes — raw `$fetch`)
**Project Type**: Web — backend plugin + headless frontend + native storefront templates
**Performance Goals**: Hot path (`before_calculate_totals`) adds ≤ 1 `get_option` + in-memory matching per cart calc; .ca PDP adds one cached JSON fetch (≤ 5 KB) and no extra GraphQL round-trip; cart drawer adds one lightweight GraphQL query per cart change
**Constraints**: `woonuxt_base/` read-only (root overrides only); server code never imports root `utils/`; prices displayed via `formatPrice()` only; percent discounts only (currency-neutral); `wordpress/` is US-scope — cross-site impact review required; never edit base `.gql`
**Scale/Scope**: ~10 PHP files (~1.5k LOC), 3 templates, ~6 new Nuxt server routes, 5 new components, 1 composable, 1 matcher util + test, 4 root overrides, 4 locale files, 1 existing endpoint tweak

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unfilled template (no project gates). Project rules from `CLAUDE.md` are applied instead:

| Rule | Status |
|------|--------|
| 1. Never modify `woonuxt_base/` | PASS — all frontend changes are root overrides or new files |
| 3. Product pages load via `useCachedProduct` | PASS — PDP banner uses cached terms + separate rule fetch; product cache untouched |
| 8. `wordpress/` = US scope, cross-site review | PASS — see "Cross-site impact review" below |
| 10. Dual-site SEO safety | PASS — no URL/meta changes; banners are non-indexable UI |
| 11. Never rename a flat page to a directory index | PASS — `pages/my-account/` is already a directory; only its `index.vue` is edited |
| 12. No client-side currency layers | PASS — percent only; display through `formatPrice()` |

**Pre-Phase 0**: PASS  **Post-Phase 1**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/002-conditional-upsell-coupons/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0
├── data-model.md            # Phase 1
├── contracts/
│   ├── rest-api.md          # psp/v1/upsell/* + Nuxt routes
│   └── graphql-schema.md    # WPGraphQL SDL + .ca operations
├── quickstart.md            # deploy + test matrix
├── checklists/requirements.md
└── tasks.md                 # Phase 2
```

### Source Code

```text
wordpress/plugins/psp-upsell-coupons/            # NEW — deployed to the .com backend (test first)
├── psp-upsell-coupons.php                       # header, constants, autoload, activation/deactivation (cron, compile)
├── README.md                                    # install, verify curls, cross-site impact note, changelog
├── includes/
│   ├── class-psp-upsell-rules.php               # CPT, validation, compile(), term expansion, CTA derivation
│   ├── class-psp-upsell-engine.php              # evaluate(), sync(), selector matching, session state, dismissal
│   ├── class-psp-upsell-coupons.php             # generate/find/retire coupons; is_valid / is_valid_for_product / label filters
│   ├── class-psp-upsell-channel.php             # current_channel(), CTA path per channel
│   ├── class-psp-upsell-rest.php                # psp/v1/upsell/* (rules CRUD, active, evaluate, terms, health)
│   ├── class-psp-upsell-graphql.php             # guarded WPGraphQL registration + resolvers
│   ├── class-psp-upsell-frontend.php            # .com hooks: product banner, cart notices, checkout breakdown, asset enqueue
│   ├── class-psp-upsell-orders.php              # woocommerce_new_order / checkout_order_processed: consume, note, meta
│   └── class-psp-upsell-cron.php                # daily cleanup
├── templates/
│   ├── product-banner.php
│   ├── cart-notice.php
│   └── checkout-breakdown.php
└── assets/upsell.css

# .ca — root layer (proskatersplace.ca)
server/api/upsell/rules.get.ts                   # NEW public, KV-cached rule list
server/api/upsell/cart.post.ts                   # NEW session-bound Cart.upsell via raw GraphQL fetch (no codegen dependency)
server/api/admin/upsell-rules.get.ts             # NEW
server/api/admin/upsell-rules.post.ts            # NEW
server/api/admin/upsell-rules/[id].put.ts        # NEW
server/api/admin/upsell-rules/[id].patch.ts      # NEW
server/api/admin/upsell-rules/[id].delete.ts     # NEW
server/api/admin/upsell-rules/revalidate.post.ts # NEW
server/api/admin/upsell-rules/health.get.ts      # NEW
server/api/admin/upsell-terms.get.ts             # NEW — picker options (proxies psp/v1/upsell/terms)
server/utils/upsellWpClient.ts                   # NEW — WP REST call helper (emailSender.ts header shape), admin gate, cache purge
server/api/create-admin-order.post.ts            # EDIT — write _psp_upsell_coupons meta
shared/utils/upsellMatcher.mjs                   # NEW pure matcher + WP payload normaliser (#shared, usable by app and server)
shared/types/upsell.ts                           # NEW
tests/upsellMatcher.test.mjs                     # NEW (npm run test:upsell-matcher)
composables/useUpsellOffers.ts                   # NEW — rules fetch, PDP match, cart state via /api/upsell/cart
composables/useUpsellAdmin.ts                    # NEW — admin API client, error-code copy, defaults
composables/useCart.ts                           # EDIT — applyCoupon/removeCoupon error surfacing (FR-018)
components/upsell/UpsellProductBanner.vue        # NEW
components/upsell/UpsellCartNotice.vue           # NEW
components/upsell/UpsellCheckoutBreakdown.vue    # NEW
components/upsell/UpsellLineBadge.vue            # NEW
components/adminElements/UpsellRules.vue         # NEW — list + status toggles + health line
components/adminElements/UpsellRuleForm.vue      # NEW — editor (selectors, notices, schedule, advanced)
components/adminElements/UpsellTermPicker.vue    # NEW — searchable category/brand multi-select
components/shopElements/Cart.vue                 # NEW root override of the drawer (insert notice)
components/shopElements/OrderSummary.vue         # EDIT — breakdown replaces single Discount row
components/cartElements/CartCard.vue             # EDIT — per-line badge
pages/product/[slug].vue                         # EDIT — banner after add-to-cart form
pages/checkout/index.vue                         # EDIT — notice in existing notices block
pages/my-account/index.vue                       # EDIT — Admin tab link + panel
locales/en-CA.json, en-US.json, en.json, fr-CA.json  # EDIT — messages.upsell.*
```

**Structure Decision**: The plugin is a real versioned plugin directory (like `wordpress/plugins/psp-hreflang/`), not a Code Snippets paste — it registers a CPT, cron, REST and GraphQL. All .ca work is root-layer overrides/new files; no `woonuxt_base/` edits and no base `.gql` edits (new operations only).

## Implementation Approach

### Change 1 — Plugin foundation (rules + engine + coupons)

`psp-upsell-coupons.php` declares `PSP_UPSELL_VERSION`, `PSP_UPSELL_COUPON_TTL_HOURS` (48), `PSP_UPSELL_CLEANUP_GRACE_DAYS` (7), `PSP_UPSELL_CODE_PREFIX` (`UPSELL`), all `if (!defined())`-guarded (master-snippet convention), declares HPOS compatibility via `FeaturesUtil`, and boots the classes on `plugins_loaded` only when `WooCommerce` exists.

`class-psp-upsell-rules.php`: CPT registration; `validate(array $rule): WP_Error|array`; `compile()` (expands `include_children` with `get_term_children`, resolves labels, derives CTA per channel per research RQ-8, writes the option, bumps `version`); hooks `save_post_psp_upsell_rule`, `deleted_post`, `trashed_post`.

`class-psp-upsell-engine.php`: `evaluate(WC_Cart $cart, string $channel): array offers` (pure — no side effects); `sync()` on `woocommerce_before_calculate_totals` prio 5 behind a static guard, marks-dirty on the mutation hooks (research RQ-5), applies/removes coupons through `PSP_Upsell_Coupons`, writes the session state, honours `dismissed`. Selector matching is the single function `product_matches_selector($product_id, $selector)` reused by all resolvers; its algorithm is mirrored 1:1 in `utils/upsellMatcher.mjs`.

`class-psp-upsell-coupons.php`: `find_or_generate($rule, $session_id, $channel)`, `retire($code)`, `is_generated($code)`, filters `woocommerce_coupon_is_valid`, `woocommerce_coupon_is_valid_for_product`, `woocommerce_cart_totals_coupon_label`, `woocommerce_coupon_error` (neutral copy), plus `woocommerce_coupon_get_discount_amount` guard so a rule's `max_qty_per_order` caps discounted quantity.

**Spec coverage**: FR-002–FR-010, FR-019, FR-020

### Change 2 — API surface

`class-psp-upsell-rest.php` implements `contracts/rest-api.md` §A with `current_user_can('manage_woocommerce')` permission callbacks (as `psp-contact-relay-snippet.php:51-107`). `class-psp-upsell-graphql.php` implements `contracts/graphql-schema.md` guarded per research RQ-14; `Cart.upsell` resolver calls `sync()` before reading session state; `lineItemDiscounts` computed with `WC_Discounts` (research RQ-11).

**Spec coverage**: FR-001, FR-013, FR-014

### Change 3 — .com native storefront

`class-psp-upsell-frontend.php`: `woocommerce_after_add_to_cart_button` → `templates/product-banner.php` (trigger/target side by product terms); `woocommerce_before_cart` → `wc_print_notice()` per pending/applied offer using `templates/cart-notice.php` markup with CTA button; `woocommerce_review_order_before_cart_contents` → `templates/checkout-breakdown.php` rows from session state; enqueue `assets/upsell.css` only on product/cart/checkout. Elementor's WooCommerce widgets render the standard templates, so hooks fire — verify on test (quickstart).

**Spec coverage**: FR-011, FR-012

### Change 4 — .ca admin tab

`pages/my-account/index.vue`: add `<NuxtLink to="/my-account?tab=upsell-rules">` inside the existing `v-if="isAdmin"` block (lines 99-122) and `<UpsellRules v-else-if="activeTab === 'upsell-rules' && isAdmin" />` in `<main>` (lines 140-149). `components/adminElements/UpsellRules.vue` (list, status pills, activate/pause, delete with confirm, "New rule") and `UpsellRuleForm.vue` (selectors with searchable term pickers fed by `getProductCategories` with `first: 500` and `allPaManufacturer(first: 300)`; discount; channels; schedule; notices en/fr with live placeholder preview; CTA overrides). Styling copied from `CalculatorStats.vue`. Server routes per `contracts/rest-api.md` §B via `server/utils/upsellWpClient.ts`.

**Spec coverage**: FR-001, FR-004

### Change 5 — .ca storefront components

`composables/useUpsellOffers.ts` mirrors `useCartNotices.ts` (117 L): `useState` for rules + cart upsell state, fetch `/api/upsell/rules` once (client, lazy), `matchProduct(product)` via `utils/upsellMatcher.mjs`, watch `cart.contents.nodes` + `cart.appliedCoupons` → `GqlGetCartUpsell({locale})` (debounced, shares the `isRefreshPending` gate so it never races `finalizeSuccessfulCartMutation` in `utils/cartRefreshCoordinator.mjs`). Locale from `useI18n().locale` (`fr-CA` → `fr`).

- `pages/product/[slug].vue`: `<UpsellProductBanner :product="product" />` immediately after `</form>` (line 559).
- `components/shopElements/Cart.vue` (root override of the 43-line base): `<UpsellCartNotice />` between header (13) and `<ClientOnly>` (15).
- `components/cartElements/CartCard.vue`: `<UpsellLineBadge :cart-item-key="item.key" />` next to the existing notice badges (122-131).
- `pages/checkout/index.vue`: `<UpsellCartNotice compact />` inside the notices block (932-936).
- `components/shopElements/OrderSummary.vue`: `<UpsellCheckoutBreakdown />` between 98 and 100; existing Discount row gated on `appliedCoupons?.length`.
- `components/CartNotice.vue`: add `success` variant + default slot for CTA (backwards compatible).
- `composables/useCart.ts:231-242`: return `{success, message}` from `applyCoupon`, surface `error.gqlErrors` via `useToast().error()`.
- Locales: `messages.upsell.{shopNow, applied, pending, savings, bundleSavings}` in all four files (French mirror in `fr-CA.json`).

**Spec coverage**: FR-015, FR-016, FR-018

### Change 6 — Orders and cleanup

`class-psp-upsell-orders.php`: on `woocommerce_checkout_order_processed` (native) and `woocommerce_new_order` (headless/GraphQL) read applied `UPSELL-*` codes (from `coupon_lines` or `_psp_upsell_coupons`), retire coupons, add order note and `_psp_upsell_applied` meta; idempotent via that meta. `server/api/create-admin-order.post.ts`: add `{key: '_psp_upsell_coupons', value: JSON.stringify(upsellCodes)}` to `metaData` when any code starts with `UPSELL-`. `class-psp-upsell-cron.php`: `psp_upsell_cleanup_daily` batch-deletes expired unused generated coupons past the grace period; logs count.

**Spec coverage**: FR-017, FR-019

## Cross-site impact review (project rule 8)

| Area | US (.com) impact | CAD (.ca) impact | Shared-infra risk | Mitigation |
|------|------------------|------------------|-------------------|------------|
| New CPT + option | none until rules exist | none | one autoloaded option (< 20 KB) | compile only active rules |
| Cart hooks | runs on every cart calc | same (GraphQL/Store API) | recursion / totals corruption | static guard; no-op fast path when compiled set empty (FR-020); SC-005 regression check |
| Coupon validation filters | affects only `UPSELL-*` codes | same | mis-flagging customer coupons | filters early-return unless `_psp_upsell_rule_id` meta present |
| WPGraphQL fields | none | new fields; schema build dependency | schema flap | guarded registration; .ca degrades to no UI |
| REST namespace | additive routes under `psp/v1` | consumed by admin/public routes | WAF | same header shape as contact-relay |
| Native templates | new UI on product/cart/checkout | none | theme/Elementor hook coverage | verify on test; CSS scoped `.psp-upsell-*` |
| Order hooks | order notes/meta | same + `_psp_upsell_coupons` | double-consume | idempotency meta |
| Cron | daily deletes | none | deleting a live coupon | only expired + unused + past grace |
| SEO | no URL/meta/schema changes | none | none | — |

## Rollout order

1. Deploy plugin to **test backend** (`test.proskatersplace.com`) with no rules → run `psp/v1/upsell/health`; confirm SC-005 (no cart behaviour change).
2. Merge .ca admin tab + server routes (target `test` env); create one rule, paused.
3. Verify .com native surfaces on test with the rule active; run the matrix.
4. Merge .ca storefront components; verify on `test.proskatersplace.ca`; run the matrix (incl. Helcim order).
5. Deploy plugin to **production** (.com), rules empty; deploy .ca to production; create production rules paused; activate one; monitor orders/notes for 48 h; run cleanup once manually.
6. Rollback = pause all rules (instant, both stores) → deactivate plugin (coupons already in carts fail validation and drop).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WooGraphQL 0.21.1 schema flap hides `Cart`/`Product` at registration | Medium | Medium | Guarded registration; .ca treats missing `upsell` as "no offers"; REST `rules/active` unaffected |
| Recursion between `apply_coupon()` and `calculate_totals()` | Medium | High | Static guard + dirty flag; covered by smoke script `wp eval` adding trigger+target twice |
| Discount leaks to non-target lines | Low | High | Isolation enforced in `is_valid_for_product`; matrix SC-001 |
| Headless Helcim order drops coupon record | Medium | Medium | `_psp_upsell_coupons` meta + `woocommerce_new_order` consumer (research RQ-6) |
| Error sanitizer masks coupon failures on .ca | High | Low | State exposed as data, not errors; `applyCoupon` fix |
| Elementor widgets bypass classic hooks on .com | Low | Medium | Verify on test; fallback filter on `woocommerce_short_description` / `the_content` for the banner |
| `pa_manufacturer` vs `pwb-brand` mismatch confuses merchants | Medium | Low | Picker labelled "Brand (product attribute)"; audit task in tasks.md P3 |
| Rule edits leave stale coupons in carts | Low | Low | rule hash on coupon → invalid → regenerated |
| KV rule cache serves stale rules up to 5 min | Certain | Low | Admin saves purge KV immediately; SC-004 allows 5 min |
| Build-time codegen fails if plugin not on the build's `GQL_HOST` | High if ordering ignored | High | Rollout order step 1 before step 4; `scripts/patch-base-queries.js` precedent for CI guards |

## Complexity Tracking

No constitution violations. The only added abstraction is the compiled-rules option (justified by the cart hot path) and the shared matcher util (justified by keeping PHP and JS matching identical and testable).
