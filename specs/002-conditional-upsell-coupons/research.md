# Research: Conditional Upsell Coupons

**Branch**: `feature/conditional-upsell-coupons` | **Date**: 2026-09-10

Findings come from three codebase surveys (WordPress layer, .ca storefront, admin/server patterns) plus live probes of the .com backend (REST index, taxonomies, attributes, cart page markup).

## Environment facts (verified 2026-09-10)

| Fact | Evidence |
|------|----------|
| WooCommerce **11.0.1**, WPGraphQL **2.9.1**, WooGraphQL **0.21.1** (planned move to WooGraphQL 1.0.3 / WPGraphQL 2.17 — breaking) | `docs/incident-2026-08-13-graphql-schema-flap.md:5,33-37`, `docs/important/php8supportlist.md:20` |
| HPOS enabled; PHP 8.x audit in progress; plugin headers declare PHP 7.4+ | `wordpress/hpos-ordernumber-fix.php`, `docs/important/php8supportlist.md` |
| .com storefront = **classic shortcode cart** (not Cart Blocks), Elementor + The Plus addon, classic (non-FSE) theme | live probe of `https://proskatersplace.com/cart/` and `/` |
| Backend REST namespaces include `psp/v1` (brand-meta, category-meta, category-seo, contact-relay), `wc-pimwick/v1` = **PW Gift Cards** (not BOGO — no overlap), `wc/pos/v1`, `code-snippets/v1`, `wp-graphql-login/v1` | live probe of `/wp-json/` and `/wp-json/psp/v1` |
| Product taxonomies: `product_cat`, `product_tag`, **`pwb-brand`** (Perfect WooCommerce Brands, hierarchical, 76 terms). No WooCommerce-core `product_brand`. | live probe of `/wp-json/wp/v2/taxonomies` |
| Global attributes: **`pa_manufacturer` = "Brand"** (id 2, has archives), `pa_wheelsize`, `pa_style`, `pa_skiing_style`, … 58 total | live probe of `/wp-json/wc/store/v1/products/attributes` |
| .ca brand filtering is `pa_manufacturer` (`GLOBAL_PRODUCT_ATTRIBUTES[0]`), deep-link `?filter=pa_manufacturer[slug]` | `nuxt.config.ts:144-153`, `woonuxt_base/app/composables/useFiltering.ts:4` |
| `pwb-brand` is **not exposed to WPGraphQL** | `docs/merchant-feed-ca.md:47`, `scripts/build-merchant-feed.js:121-123` |
| No `register_graphql_*` code exists anywhere in the repo; no coupon-related WP code beyond a hard-coded check in `wordpress/woocommerce-checkout-rules.php:27-47` | grep survey |
| WPGraphQL CORS allows only `https://proskatersplace.ca` (set in wp-admin, not in repo); `.ca` server-side calls are unaffected | `docs/done/size-calculator-2-dev-plan.md:657`, `docs/wordfence-2fa-headless-passthrough.md:67` |
| `wordpress/mu-plugins/psp-graphql-error-sanitizer.php:64-65` rewrites **any** GraphQL error containing the word "coupon" into a generic message | file read |

## Research Questions

### RQ-1: Which "brand" should rules match on?

**Decision**: Selectors are taxonomy-agnostic (`{taxonomy, term_ids, include_children}`) and the engine resolves a product's terms with `wp_get_object_terms()` on the parent product. The v1 admin picker exposes `product_cat` ("Category") and `pa_manufacturer` ("Brand"). `pwb-brand` is a valid selector taxonomy in the data model but hidden from the picker until an audit reconciles the two term sets.

**Rationale**: `pa_manufacturer` is present on every product in the shared database, is queryable by the .ca (`allPaManufacturer`, used by `scripts/build-calculator-carried.js:81`, and `PA_MANUFACTURER` taxonomy filter in `server/api/calculator-products.post.ts:30`), and is what the .ca links to. `pwb-brand` exists only for .com brand pages and is invisible to WPGraphQL. Because both stores read the same product rows, matching on `pa_manufacturer` works on .com too — the difference is only the CTA URL (see RQ-8).

**Alternatives considered**: `pwb-brand` only — rejected (invisible to .ca). Registering `pwb-brand` into WPGraphQL — deferred; adds schema risk during the WooGraphQL 0.21.1 instability and isn't needed for matching.

### RQ-2: Where do rules live?

**Decision**: A private custom post type `psp_upsell_rule` (one post per rule, rule JSON in `_psp_upsell_rule` meta, WP revisions on) plus a **compiled** autoloaded option `psp_upsell_rules_compiled` rebuilt on every save/delete. The engine reads only the compiled option on the cart hot path.

**Rationale**: CPT gives ids, timestamps, author, revisions and a free REST id space; the compiled option keeps `woocommerce_before_calculate_totals` to a single `get_option()` with pre-resolved term ids/slugs/names (including child terms). No wp-admin editor in v1 (`show_ui => false`), per D6.

**Alternatives considered**: single option array — rejected (no history/author, awkward concurrent edits). WooCommerce coupon posts as the rule store — rejected (conflates rule with generated coupon).

### RQ-3: Coupon lifecycle — per session or per rule?

**Decision (D2)**: Per **session × rule** generated `shop_coupon` posts, code `UPSELL-` + 6 uppercase base32 chars, `discount_type=percent`, `individual_use=false`, `usage_limit=1`, `date_expires=now+48h` (constant `PSP_UPSELL_COUPON_TTL_HOURS`), `exclude_sale_items` from the rule, `product_categories` set when all target selectors are `product_cat` (belt-and-braces; isolation is enforced by filter regardless). Meta: `_psp_upsell_rule_id`, `_psp_upsell_rule_hash`, `_psp_upsell_session`, `_psp_upsell_channel`, `_psp_upsell_generated_at`. Retired (`usage_limit` reached) on order; hard-deleted by daily cron after expiry + 7 days if unused.

**Rationale**: Matches the stated requirement (on-the-fly, session-bound, auto-destruct) and gives order-level traceability. Churn is bounded: at most one coupon per active rule per session, reused for the session's lifetime, and cleaned daily.

**Alternative kept in reserve**: one persistent coupon per rule (`UPSELL-R<id>`) validated per session via `woocommerce_coupon_is_valid`. Switch to it if coupon-post growth or `wp_posts` write load becomes a problem; the engine's public interface is unchanged.

### RQ-4: How is target isolation enforced?

**Decision**: `woocommerce_coupon_is_valid_for_product` returns true only when the product (or its parent) matches the rule's target selectors and the line is not a trigger line (when `exclude_trigger_items`). `woocommerce_coupon_is_valid` additionally checks session binding, rule hash, channel, schedule, and that the trigger is still satisfied. `fixed_cart` is never used (it can't isolate); `percent` (v1) and `fixed_product` (future) are per-line by construction.

**Rationale**: These are the native WooCommerce validation points; they run identically for classic checkout, Store API, and WooGraphQL, so isolation is enforced once for both stores.

### RQ-5: Where does auto-apply/remove hook in without recursion?

**Decision**: Cart mutation hooks (`woocommerce_add_to_cart`, `woocommerce_cart_item_removed`, `woocommerce_cart_item_restored`, `woocommerce_after_cart_item_quantity_update`, `woocommerce_cart_emptied`, `woocommerce_applied_coupon`, `woocommerce_removed_coupon`, `woocommerce_cart_loaded_from_session`) mark the cart dirty; `woocommerce_before_calculate_totals` (priority 5) runs `sync()` once per request behind a static re-entrancy guard. `sync()` evaluates rules, applies missing coupons via `WC()->cart->apply_coupon()` and removes stale ones via `remove_coupon()`. Manual removal by the shopper writes a `dismissed` marker keyed on the trigger/target line-key set into the WC session (FR-010).

**Rationale**: `apply_coupon()` triggers `calculate_totals()`; the guard prevents recursion. WooGraphQL and the Store API both load the cart and call `calculate_totals()` per request, so the same path runs headless.

### RQ-6: How does the .ca Helcim order path interact with coupons?

**Decision**: Do **not** re-apply coupons on the order (the existing code skips this on purpose: `server/api/create-admin-order.post.ts:713-716`, because line totals already carry the discount). Instead:
1. The .ca passes `coupons` already (request field, line 58) — filter to `UPSELL-*` codes and add order meta `_psp_upsell_coupons` (JSON) via the existing `metaData` array (line 550-587).
2. Per-line: add `_psp_upsell_discount` and `_psp_upsell_rule` item meta from `cart.upsell.lineItemDiscounts` (P3).
3. The plugin hooks `woocommerce_new_order` (fires for the GraphQL `createOrder` path) and, for any `_psp_upsell_coupons`, increments usage, adds the order note, sets `_psp_upsell_applied`, and retires the coupon. Native .com checkout needs nothing extra (WooCommerce records `coupon_lines` itself); the same hook is idempotent there.

**Rationale**: Preserves the double-discount fix; keeps the order honest for reporting (SC-006).

### RQ-7: How does the .ca decide whether to show a product-page banner?

**Decision**: Client-side, from data the page already has. The cached product JSON contains `productCategories.nodes.databaseId` and `terms.nodes { taxonomyName slug }` (`server/utils/serverGetProduct.ts`, lines 92-110). A new public route `server/api/upsell/rules.get.ts` returns the compiled active rules for channel `ca` (proxying `GET /wp-json/psp/v1/upsell/rules/active?channel=ca`, KV-cached under `upsell-rules:ca` for 300s, `[]` on error). A pure matcher in `utils/upsellMatcher.mjs` (Node-tested) computes trigger/target matches from product terms + rules. The `Product.upsell` GraphQL field is still provided (parity for other consumers) but the .ca doesn't depend on it.

**Rationale**: Product pages are KV-cached for 24h (`product-data:<slug>`) and ISR-cached; baking rule state into that cache would make rule changes invisible for a day. Rules are tiny and change rarely; a 5-minute cache satisfies SC-004 without a cross-site webhook.

**Alternatives considered**: `Product.upsell` via GraphQL on every product view — rejected (extra request per PDP, and `Gql*` helpers can't be used server-side on Workers). Webhook purge from WP → `.ca` — deferred (needs the `.ca` revalidation secret configured on WP; admin saves from the .ca UI can purge the Nuxt KV key directly instead).

### RQ-8: How is the CTA link built per channel?

**Decision**: The backend computes `ctaPath` per channel from the rule's *other side* (trigger banner → target listing, target banner → trigger listing):
- `ca`: `/product-category/<category-slug>` plus `?filter=pa_manufacturer[<brand-slug>]` when a brand selector exists (format from `useFiltering.ts:4`; example links in `data/navigation.ts:94-98`). If only a brand selector exists, use the rule's `cta.ca_path` override, else `/product-category/<first-category-of-the-brand>` resolved at compile time, else `/products?filter=pa_manufacturer[...]`.
- `com`: `/product-category/<slug>/` plus WooCommerce layered-nav `?filter_manufacturer=<brand-slug>`; override via `cta.com_path`.

**Rationale**: Deterministic and needs no `pa_manufacturer` ↔ `pwb-brand` mapping.

### RQ-9: How does the engine know which channel a request is?

**Decision**: `psp_upsell_current_channel()` returns `ca` when `defined('GRAPHQL_REQUEST')`, or the request targets `/wp-json/wc/store/`, or the `X-Frontend-Type: woonuxt` header / `WooNuxt` UA is present (the same conjunction as `psp_master_gateway_logic()` in `wordpress/psp-master-payment-shipping-code-snippets.php:461-469`); otherwise `com`. Filterable via `psp_upsell_channel`. Admin/REST/cron contexts return `null` (no evaluation).

**Rationale**: Consistent with the existing detector; the flavorcloud research (`wordpress/docs/flavorcloud-woocommerce-plugin-research.md:230-250`) warns client headers are spoofable — accepted here because the worst case is a .com shopper opting into a .ca-only promotion, not a security boundary.

### RQ-10: Cart notices on .ca — where do they render?

**Decision**: There is **no cart page** on .ca; only the drawer `woonuxt_base/app/components/shopElements/Cart.vue` (43 lines) rendered by `app.vue:33`. Create a root override `components/shopElements/Cart.vue` (copy + insert `<UpsellCartNotice />` between the header and the item list) and reuse `components/CartNotice.vue` styling with a new `success` variant and a CTA slot. Toasts are not suitable (`useToast.ts:25` strips links).

### RQ-11: Per-line discount data for the checkout breakdown

**Decision**: `CartFragment` has no per-line coupon data. The plugin computes `lineItemDiscounts` server-side with `WC_Discounts` (`$d = new WC_Discounts(WC()->cart); foreach coupons apply; $d->get_discounts()` → `[code => [item_key => amount]]`) restricted to `UPSELL-*` codes, and exposes it on `Cart.upsell`. The .ca reads it through `server/api/upsell/cart.post.ts` — a raw fetch to WPGraphQL with the shopper's forwarded `woocommerce-session` cookie (the `adminAuth.ts` pattern) — triggered by the same cart watcher pattern as `composables/useCartNotices.ts`. **Implementation note (2026-09-11):** a codegen `.gql` operation was deliberately not added: the schema is introspected at build time, so a `.gql` referencing `Cart.upsell` would break every build until the plugin is deployed on that backend and would be fragile under the WooGraphQL schema flap; the proxy returns `null` instead. Displayed per-line amounts are derived on the client from the cart line's own `subtotal − total` (same currency pipeline as the summary) rather than the server's raw amount, because the server-side fetch has returned USD-marked prices on test. Base `getCart.gql`/`CartFragment.gql` are untouched.

### RQ-12: Admin UI transport

**Decision**: Nuxt server routes under `server/api/admin/upsell-rules*` gate with `verifyAdminSession(event)` (`server/utils/adminAuth.ts`) and call `psp/v1/upsell/rules` with the WordPress application password using the exact header shape from `server/utils/emailSender.ts:94-110` (Basic auth, `User-Agent: WooNuxt-Upsell-Admin/1.0`, `Origin`/`Referer: wpBaseUrl`, `X-Requested-With`). Pickers load categories via `getProductCategories` (raise `first`) and brands via `allPaManufacturer` from the browser (CORS allows the .ca origin). UI styling copies `components/adminElements/CalculatorStats.vue`.

### RQ-13: Currency

**Decision (D3)**: Percent only in v1. `fixed_product` is reserved in the schema with a `per_currency` map for later; not exposed in the picker. All amounts shown on .ca go through `formatPrice()`; the server never formats.

### RQ-14: WPGraphQL registration safety

**Decision**: Register on `graphql_register_types` (priority 20) only if `function_exists('register_graphql_object_type')` and `\WPGraphQL::get_type_registry()->get_type('Cart')`/`('Product')` resolve; wrap in `try/catch` and `error_log` once per request. Never rely on error text: state is exposed as data because the error sanitizer masks any "coupon" error on .ca.

### RQ-15: Deployment shape

**Decision**: A real plugin directory `wordpress/plugins/psp-upsell-coupons/` (header + README + versioned zip like `wordpress/plugins/psp-hreflang/`), **not** a Code Snippets paste — it needs a CPT, cron, REST, GraphQL and templates. Manual zip upload to test → prod; verification `curl`s in the README. Cross-site impact note in the plugin header (rule 8), mirroring `wordpress/psp-contact-relay-snippet.php:38-39`.

## Existing defects to fix as part of this feature

| Defect | Location | Why it matters here |
|--------|----------|---------------------|
| `applyCoupon` swallows errors, returns `{message: null}` | `composables/useCart.ts:231-242` | Any rejected coupon (upsell or customer) fails silently (FR-018) |
| Discount row renders when `appliedCoupons` is an empty array (truthy) | `components/shopElements/OrderSummary.vue:93-98` | The breakdown replaces this row; gate on `length` |
| `getProductCategories.gql` default `first: 99` | `woonuxt_base/app/queries/getProductCategories.gql` | Admin picker must pass a larger `$first` |

## Technology Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Rule storage | CPT `psp_upsell_rule` + compiled autoloaded option | History + hot-path speed |
| Brand model | `pa_manufacturer` (engine taxonomy-agnostic) | Visible to both stores |
| Coupon | Native `shop_coupon`, per session × rule, 48h TTL | Stated requirement, traceable |
| Isolation | `woocommerce_coupon_is_valid_for_product` + `is_valid` | Runs identically on all channels |
| Headless state | `Cart.upsell`, `Product.upsell`, `upsellRules` in WPGraphQL; public REST `rules/active` | GraphQL for cart (session-aware), REST for cacheable rule list |
| .ca PDP evaluation | Client-side matcher over cached product terms + 5-min KV rule cache | Respects 24h product cache |
| Admin UI | psp.ca my-account tab → Nuxt admin routes → `psp/v1/upsell/rules` | Existing gate + REST pattern |
| .com UI | Classic hooks + `wc_print_notice` + templates in plugin | Classic cart verified |
| Tests | Node tests for `utils/upsellMatcher.mjs`; WP-CLI smoke + manual matrix for PHP | Matches repo tooling |
