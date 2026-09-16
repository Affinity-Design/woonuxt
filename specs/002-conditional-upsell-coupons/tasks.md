# Tasks: Conditional Upsell Coupons

**Input**: Design documents from `/specs/002-conditional-upsell-coupons/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md, contracts/graphql-schema.md, quickstart.md

**Tests**: Node tests for the pure matcher (`tests/upsellMatcher.test.mjs`) and a WP-CLI smoke script; everything else is the manual matrix in quickstart.md.

**Organization**: Phases 1–2 build the plugin core every story depends on; stories then map to spec user stories US1–US7.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1 admin rules · US2 .ca auto-discount · US3 .com auto-discount · US4 product banners · US5 cart notices · US6 checkout breakdown · US7 orders/cleanup

---

## Phase 1: Setup (plugin scaffold)

- [x] T001 Create `wordpress/plugins/psp-upsell-coupons/psp-upsell-coupons.php` with plugin header (Author: Affinity Design, Requires PHP 7.4, WC tested up to 11.0), guarded constants (`PSP_UPSELL_VERSION`, `PSP_UPSELL_COUPON_TTL_HOURS`=48, `PSP_UPSELL_CLEANUP_GRACE_DAYS`=7, `PSP_UPSELL_CODE_PREFIX`), HPOS `FeaturesUtil` declaration, class autoload from `includes/`, boot on `plugins_loaded` only if WooCommerce is active, activation (schedule cron, compile) / deactivation (unschedule) hooks
- [x] T002 [P] Create `wordpress/plugins/psp-upsell-coupons/README.md`: purpose, install (zip + SSH), verify `curl`s (health, rules/active), cross-site impact note (rule 8), rollback (pause rules → deactivate), changelog 1.0.0
- [x] T003 [P] Create `wordpress/plugins/psp-upsell-coupons/assets/upsell.css` with scoped `.psp-upsell-*` classes (banner, notice, cta button, breakdown row)

---

## Phase 2: Foundational (rules, engine, coupons, API) — BLOCKS all stories

- [x] T004 Implement `includes/class-psp-upsell-rules.php`: register CPT `psp_upsell_rule` (private, no UI, revisions), `validate()` per data-model §1 (error codes from contracts/rest-api.md), `compile()` per data-model §2 (expand `include_children`, resolve term slugs/names, derive CTA per channel per research RQ-8, sha1 `hash`/`version`, write option), hook `save_post_psp_upsell_rule` / `trashed_post` / `deleted_post`, `get_active(string $channel): array`
- [x] T005 Implement `includes/class-psp-upsell-channel.php`: `current(): ?string` (`ca` on GRAPHQL_REQUEST / Store API URI / `X-Frontend-Type: woonuxt` / `WooNuxt` UA; `com` otherwise; `null` for admin/cron/CLI/non-cart REST), filter `psp_upsell_channel`; `cta_path(rule, side, channel)`
- [x] T006 Implement `includes/class-psp-upsell-engine.php`: `product_matches_selector()`, `evaluate(WC_Cart, channel)` (pure: offers keyed by rule id with trigger/target line keys, `min_qty`, `match all|any`, `exclude_trigger_items`, best-discount-per-line resolution), `sync()` on `woocommerce_before_calculate_totals` prio 5 with static guard + dirty flag set by `woocommerce_add_to_cart`, `woocommerce_cart_item_removed`, `woocommerce_cart_item_restored`, `woocommerce_after_cart_item_quantity_update`, `woocommerce_cart_emptied`, `woocommerce_applied_coupon`, `woocommerce_removed_coupon`, `woocommerce_cart_loaded_from_session`; session state per data-model §3 incl. `dismissed` marker on manual removal (FR-010); no-op fast path when no active rules (FR-020)
- [x] T007 Implement `includes/class-psp-upsell-coupons.php`: `find_or_generate()` (code alphabet without 0/O/1/I, fields + meta per data-model §4, `product_categories` when all target selectors are `product_cat`), `retire()`, `is_generated()`; filters `woocommerce_coupon_is_valid` (session/hash/channel/schedule/trigger/retired), `woocommerce_coupon_is_valid_for_product` (target match, exclude trigger lines, `exclude_sale_items`), `woocommerce_coupon_get_discount_amount` (`max_qty_per_order` cap), `woocommerce_cart_totals_coupon_label` (rule `coupon_label`), `woocommerce_coupon_error` (neutral copy) — all early-return for non-generated codes
- [x] T008 [P] Implement `includes/class-psp-upsell-rest.php` per contracts/rest-api.md §A: rules CRUD (`manage_woocommerce`), `rules/active?channel=` (public, `Cache-Control: public, max-age=60`, ETag), `evaluate` (session-bound, runs `sync()`), `terms`, `health`
- [x] T009 [P] Implement `includes/class-psp-upsell-graphql.php` per contracts/graphql-schema.md: guarded registration (research RQ-14), `Cart.upsell` (calls `sync()`, `lineItemDiscounts` via `WC_Discounts`), `Product.upsell` on the `Product` interface (parent id for variations), `RootQuery.upsellRules`, locale fallback en
- [x] T010 [P] Implement `includes/class-psp-upsell-cron.php`: `psp_upsell_cleanup_daily` deleting generated coupons with `date_expires < now − grace` and `usage_count = 0`, batches of 200, `error_log` count; expose `last_cleanup` for `health`
- [x] T011 [P] Create `wordpress/plugins/psp-upsell-coupons/tools/smoke.php` for `wp eval-file`: builds a cart with trigger+target+unrelated, calls `calculate_totals()` twice, asserts exactly one `UPSELL-*` coupon, asserts discount == percent × target subtotal, removes trigger, asserts coupon gone
- [ ] T012 Deploy 1.0.0 to `test.proskatersplace.com`, run `health` + `smoke.php`, confirm no cart behaviour change with zero rules (SC-005)

**Checkpoint**: Backend engine works headless (REST `evaluate`) and native; stories can proceed in parallel.

---

## Phase 3: User Story 1 — Admin rule management on psp.ca (Priority: P1) 🎯 MVP

**Goal**: Shop managers create/edit/pause/delete rules from `/my-account?tab=upsell-rules`.
**Independent Test**: Create a rule in the UI; `GET psp/v1/upsell/rules` shows it; customer account sees no tab and gets 401 on the admin routes.

- [x] T013 [P] [US1] Create `server/utils/upsellWpClient.ts`: `wpUpsellRequest(path, {method, body})` using the `server/utils/emailSender.ts:94-110` header shape (Basic app password, `User-Agent: WooNuxt-Upsell-Admin/1.0`, Origin/Referer, X-Requested-With), raw `$fetch`, typed errors
- [x] T014 [P] [US1] Create admin routes `server/api/admin/upsell-rules.get.ts`, `upsell-rules.post.ts`, `upsell-rules/[id].put.ts`, `[id].patch.ts`, `[id].delete.ts`, `upsell-rules/health.get.ts` — each `verifyAdminSession(event)` ⇒ 401, `Cache-Control: private, no-store`, purge KV `upsell-rules:ca` after writes
- [x] T015 [P] [US1] Create `server/api/admin/upsell-rules/revalidate.post.ts` with the dual gate (`x-internal-secret === REVALIDATION_SECRET` OR admin session) purging KV `upsell-rules:ca`
- [x] T016 [P] [US1] Create `shared/types/upsell.ts` per data-model §6 (under `shared/` so both app and server import it via `#shared`; server code must not import root `utils/`)
- [x] T017 [US1] Create `components/adminElements/UpsellRules.vue`: list (name, trigger → target summary, discount, channels pills, status pill, schedule), Activate/Pause toggle (PATCH), Delete with confirm, "New rule" / "Edit" opening the form; styling from `components/adminElements/CalculatorStats.vue` (panel, segmented control, buttons, pills)
- [x] T018 [US1] Create `components/adminElements/UpsellRuleForm.vue` + `UpsellTermPicker.vue` + `composables/useUpsellAdmin.ts`: selector rows (taxonomy select: Category / Brand (product attribute); searchable multi-term picker fed by `/api/admin/upsell-terms` → `psp/v1/upsell/terms` (WordPress `get_terms`, hidden terms included — no GraphQL enum-name dependency); `include_children` toggle), target `match` all/any, `exclude_trigger_items`, `exclude_sale_items`, `max_qty_per_order`, percent discount (1–100), channels checkboxes, schedule dates (Toronto), notices en/fr with placeholder preview (`{discount} {trigger} {target}`), CTA overrides, priority; client validation mirrors server error codes; overlap warning
- [x] T019 [US1] Edit `pages/my-account/index.vue`: add Upsell Rules link inside the `v-if="isAdmin"` block (lines 99-122, icon `ion:pricetags-outline`) and `<UpsellRules v-else-if="activeTab === 'upsell-rules' && isAdmin" />` in the `<main>` chain (lines 140-149)
- [x] T020 [US1] Admin copy is English-only (matches the other Admin tabs); shopper strings live under `messages.upsell.*` in `locales/en-CA.json`, `en-US.json`, `en.json`, `fr-CA.json` (T038)

**Checkpoint**: Rules can be authored end-to-end; pausing a rule stops it everywhere.

---

## Phase 4: User Story 2 — Auto-discount on psp.ca (Priority: P1)

**Goal**: Trigger + target on .ca ⇒ `UPSELL-*` applied to target lines only; removed with the trigger.
**Independent Test**: Matrix M1–M5, M7, M9, M14 on `test.proskatersplace.ca` using only existing cart UI (`appliedCoupons` row).

- [x] T021 [US2] Edit `composables/useCart.ts:231-254`: `applyCoupon` returns `{success, message}` and surfaces `error.gqlErrors?.[0]?.message` via `useToast().error()`; `removeCoupon` likewise (FR-018). Verify `components/cartElements/AddCoupon.vue` (or base) consumes the message
- [x] T022 [US2] Create `server/api/upsell/cart.post.ts` — raw-fetch `cart { upsell {…} }` with the shopper's forwarded `woocommerce-session` cookie (adminAuth.ts pattern) instead of a codegen `.gql` operation, so `nuxt build` never depends on the plugin being deployed on the build's `GQL_HOST`; returns `null` when the field is absent
- [x] T023 [US2] Create `composables/useUpsellOffers.ts` (pattern: `composables/useCartNotices.ts`): `useState('upsell-rules')`, `useState('upsell-cart')`, `loadRules()` via `$fetch('/api/upsell/rules')` (client, once, `[]` on error), `refreshCartUpsell()` via `GqlGetCartUpsell({locale})` debounced on `cart.contents.nodes` + `cart.appliedCoupons`, gated by `isRefreshPending` from `useCart()`; exposes `rules`, `cartUpsell`, `appliedAutoCoupons`, `cartNotices`, `missingQualifiers`, `lineItemDiscounts`, `discountForLine(key)`, `matchProduct(product)`
- [x] T024 [P] [US2] Create `server/api/upsell/rules.get.ts`: KV `cache` mount key `upsell-rules:ca` TTL 300 s; on miss fetch `psp/v1/upsell/rules/active?channel=ca` with browser-like headers (`server/utils/serverGetProduct.ts` shape); map to `UpsellRulePublic[]`; return `[]` + `no-store` on error (never throw)
- [ ] T025 [US2] Run matrix M1–M5, M7, M9, M14 on `test.proskatersplace.ca`; record results in quickstart.md

**Checkpoint**: Headless auto-discount correct and isolated.

---

## Phase 5: User Story 3 — Auto-discount on proskatersplace.com (Priority: P1)

**Goal**: Same behaviour on the classic storefront with a plain-language coupon label.
**Independent Test**: Matrix M1–M5, M7, M9 on `test.proskatersplace.com`.

- [ ] T026 [US3] Verify channel detection on classic pages, wc-ajax fragments, and Store API mini-cart requests (`includes/class-psp-upsell-channel.php`); adjust conjunction if Elementor/theme requests mis-classify
- [ ] T027 [US3] Verify `woocommerce_cart_totals_coupon_label` renders the rule label in cart totals and checkout review (`includes/class-psp-upsell-coupons.php`)
- [ ] T028 [US3] Run matrix M1–M5, M7, M9 on `test.proskatersplace.com`; record results

**Checkpoint**: Both stores discount identically from the same rule.

---

## Phase 6: User Story 4 — Product-page banners (Priority: P2)

**Goal**: Trigger and target product pages show the rule banner with a CTA on both stores.
**Independent Test**: Matrix M1 (target banner), trigger PDP banner, unrelated PDP no banner, paused rule no banner (M8).

- [x] T029 [P] [US4] Create `utils/upsellMatcher.mjs`: `matchProduct(productTerms, rules) → ProductUpsellMatch[]` (same algorithm as PHP `product_matches_selector` + trigger any / target all|any; placeholder substitution; side-aware CTA) and `tests/upsellMatcher.test.mjs` (children expansion, all vs any, exclude-trigger overlap, paused/expired skipped, fr fallback); add `"test:upsell-matcher": "node --test tests/upsellMatcher.test.mjs"` to `package.json`
- [x] T030 [P] [US4] Create `components/upsell/UpsellProductBanner.vue`: props `product`; uses `useUpsellOffers().matchProduct()` over `product.productCategories.nodes` (ids) + `product.terms.nodes` (`taxonomyName`/`slug`); renders `CartNotice`-style info banner with text + `<NuxtLink>` CTA; hidden when no match; client-only render to avoid hydration mismatch on cached pages
- [x] T031 [US4] Edit `pages/product/[slug].vue`: insert `<UpsellProductBanner :product="product" />` immediately after the add-to-cart `</form>` (line 559)
- [x] T032 [P] [US4] Implement `.com` banner in `includes/class-psp-upsell-frontend.php` + `templates/product-banner.php` on `woocommerce_after_add_to_cart_button` (trigger/target side from product terms; CTA per channel `com`); enqueue CSS on `is_product()`
- [ ] T033 [US4] Verify on test that Elementor's product widgets fire the hook; if not, add fallback hook `woocommerce_single_product_summary` prio 35 (documented in README)

**Checkpoint**: Discovery banners live on both stores.

---

## Phase 7: User Story 5 — Cart notices (Priority: P2)

**Goal**: Pending (with CTA) and applied notices in the .ca drawer and on the .com cart page.
**Independent Test**: Matrix M2, M5, M6.

- [x] T034 [P] [US5] Edit `components/CartNotice.vue`: add `success` variant to the style map (lines 17-21) and a default slot rendered after the message (CTA); keep existing props/behaviour
- [x] T035 [P] [US5] Create `components/upsell/UpsellCartNotice.vue`: props `compact?`; renders one `CartNotice` per `cartNotices` entry (`pending` → info + CTA `<NuxtLink>` "Shop {target}", `applied` → success), ordered by discount value
- [x] T036 [US5] Create root override `components/shopElements/Cart.vue` (copy of the 43-line base drawer) inserting `<UpsellCartNotice />` between the header (line 13) and `<ClientOnly>` (line 15)
- [x] T037 [P] [US5] Implement `.com` cart notices in `includes/class-psp-upsell-frontend.php` + `templates/cart-notice.php` on `woocommerce_before_cart` via `wc_print_notice()` (pending: notice + button; applied: success)
- [x] T038 [US5] Add `messages.upsell.*` shopper strings (`shopNow`, `applied`, `pending`, `bundleSavings`) to the four locale files; French mirror
- [ ] T039 [US5] Run matrix M2, M5, M6 on both stores

**Checkpoint**: Nudges and confirmations present on both stores.

---

## Phase 8: User Story 6 — Checkout breakdown (Priority: P2)

**Goal**: Per-line upsell discounts visible at checkout; aggregate equals the sum.
**Independent Test**: Matrix M2 → checkout, M9.

- [x] T040 [P] [US6] Create `components/upsell/UpsellLineBadge.vue` (prop `cartItemKey`; shows "−{amount} {label}" via `formatPrice()` when `discountForLine(key)`), and `components/upsell/UpsellCheckoutBreakdown.vue` (rows per `lineItemDiscounts`, total row)
- [x] T041 [US6] Edit `components/cartElements/CartCard.vue`: render `<UpsellLineBadge :cart-item-key="item.key" />` beside the existing notice badges (lines 122-131)
- [x] T042 [US6] Edit `components/shopElements/OrderSummary.vue`: insert `<UpsellCheckoutBreakdown />` between the Discount row (93-98) and Total (100); gate the existing Discount row on `cart.appliedCoupons?.length`
- [x] T043 [US6] Edit `pages/checkout/index.vue`: add `<UpsellCartNotice compact />` inside the notices block (lines 932-936) so `hasAnyNotices || cartNotices.length` shows the wrapper
- [x] T044 [P] [US6] Implement `.com` breakdown in `includes/class-psp-upsell-frontend.php` + `templates/checkout-breakdown.php` on `woocommerce_review_order_before_cart_contents`
- [ ] T045 [US6] Run matrix M2→checkout and M9 on both stores; confirm `formatPrice()` output and CAD display on .ca

**Checkpoint**: Checkout clarity delivered.

---

## Phase 9: User Story 7 — Orders, cleanup, reporting (Priority: P3)

**Goal**: Orders record the coupon (both paths); coupons retire; cleanup bounded.
**Independent Test**: Matrix M10, M15.

- [x] T046 [US7] Implement `includes/class-psp-upsell-orders.php`: on `woocommerce_checkout_order_processed` and `woocommerce_new_order`, collect `UPSELL-*` codes from `coupon_lines` or `_psp_upsell_coupons`, retire coupons (`usage_count`++, `_psp_upsell_retired`), write `_psp_upsell_applied` + order note; idempotent
- [x] T047 [US7] Edit `server/api/create-admin-order.post.ts`: derive `upsellCodes = coupons.filter(c => c.code?.startsWith('UPSELL-'))` and push `{key: '_psp_upsell_coupons', value: JSON.stringify(codes)}` into `metaData` (lines 550-587); leave the coupon-skip logic (713-716) intact
- [ ] T048 [P] [US7] (optional) Pass per-line `_psp_upsell_discount` / `_psp_upsell_rule` item meta from `useUpsellOffers().lineItemDiscounts` through `composables/useCheckout.ts` (near the existing `_backorder_items` metadata at 206-229) into `create-admin-order` line `metaData`
- [ ] T049 [US7] Run M10 (Helcim on .ca, native on .com) and M15; confirm order notes and coupon retirement

**Checkpoint**: Operationally complete.

---

## Phase 10: Polish & Cross-Cutting

- [ ] T050 [P] Add `docs/upsell-coupons.md` (pieces table → storage → contract → runbook), in the `docs/calculator-stats.md` format; link from `README`/`AGENTS.md` doc map
- [ ] T051 [P] Brand-mapping audit script `wordpress/scripts/audit-brand-taxonomies.js` comparing `pa_manufacturer` vs `pwb-brand` term names; report mismatches (input for enabling `pwb-brand` selectors later)
- [ ] T052 Production rollout per plan.md "Rollout order"; create production rules paused; activate one; monitor 48 h; run `psp_upsell_cleanup_daily` once manually
- [ ] T053 Update `CLAUDE.md` "Server API Routes" and the memory note on admin tabs to mention the upsell routes/tab; remove the stale "no test commands" line

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** sequential; T008/T009/T010/T011 parallel after T004–T007.
- **Phase 2 blocks everything**; T012 (test deploy) must precede T022 (codegen needs the schema).
- **US1 (Phase 3)** and **US2 (Phase 4)** can run in parallel after Phase 2; US2's T021/T024 are independent of US1.
- **US3 (Phase 5)** needs only Phase 2.
- **US4/US5/US6** need US2's `useUpsellOffers` (T023); their `.com` halves (T032, T037, T044) need only Phase 2.
- **US7** needs US2 for the .ca path; native path needs only Phase 2.
- **Polish** last.

### Parallel example (after Phase 2)

```
Dev A: T013 T014 T015 T016 → T017 T018 T019 T020      (US1 admin)
Dev B: T021 T022 T023 T024 → T025                      (US2 headless)
Dev C: T026 T027 T028 · T032 T037 T044 (native halves) (US3 + .com UI)
```

## Implementation Strategy

**MVP** = Phase 1 + Phase 2 + US1 + US2 + US3 (rules manageable; discounts correct on both stores using existing coupon UI). Then US4/US5/US6 (presentation) and US7 (operations) before production activation of any rule.
