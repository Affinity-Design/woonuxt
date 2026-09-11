# Feature Specification: Conditional Upsell Coupons

**Feature Branch**: `feature/conditional-upsell-coupons` (spec id `002-conditional-upsell-coupons`)
**Created**: 2026-09-10
**Status**: Draft — awaiting sign-off on the "Decisions needing sign-off" section
**Input**: User description: "Backend rules like 'If cart contains ANY product from Category/Brand A (e.g. Endless Frames), trigger discount on Category/Brand B (e.g. Wheels)'. Discounts apply strictly to target line items. Native WooCommerce 11 coupons generated on the fly (UPSELL-XXXXXX), bound to the cart session, auto-destruct when the trigger leaves the cart. Native PHP hooks/notices for the .com storefront; the same engine exposed over WPGraphQL + REST for the headless .ca storefront. A nice admin UI on psp.ca (my-account → Admin) to manage the rules. Must be compatible with both .ca and .com from day one."

## Scope in one paragraph

One WordPress plugin on the shared WooCommerce backend (proskatersplace.com) owns the rules, the evaluation engine, the coupon lifecycle, the native storefront notices, and the API. Both storefronts consume it: the `.com` classic WooCommerce storefront through PHP hooks, the `.ca` headless Nuxt storefront through WPGraphQL/REST. Rules are managed from a new Admin tab inside `/my-account` on proskatersplace.ca. Everything is additive: with zero rules configured the plugin is inert and no storefront behaviour changes.

## Decisions needing sign-off

Defaults were chosen so work can start; each can be flipped before Phase 2 without rework of the spec. See `research.md` for the reasoning.

| # | Decision | Default chosen | Alternative |
|---|----------|----------------|-------------|
| D1 | Which "brand" a rule matches on | `pa_manufacturer` (the global "Brand" attribute — the only brand model the .ca storefront can see and link to; also present on every .com product) | `pwb-brand` taxonomy (.com brand pages). Engine supports both; only the admin picker exposure changes. |
| D2 | Coupon code lifecycle | One generated coupon per **cart session per rule** (`UPSELL-XXXXXX`), expires 48h after generation, retired on order, purged by daily cron | One persistent coupon per rule, validated per session (no DB churn, weaker order-level traceability) |
| D3 | Discount types in v1 | **Percent only** | Add fixed-per-item later with per-currency amounts (backend is USD, .ca displays CAD) |
| D4 | Rule scope | Rules carry a `channels` field (`ca`, `com`) so a promotion can run on one or both stores | Global-only rules |
| D5 | REST namespace | `psp/v1/upsell/*` (matches the existing `psp/v1` convention on the backend) | `custom-upsells/v1/*` as originally described |
| D6 | Where rules are edited | psp.ca `/my-account?tab=upsell-rules` (headless admin UI, primary) — no wp-admin editor in v1 | Also a wp-admin list/editor (P3) |
| D7 | Stacking | One upsell discount per line item (highest wins if several rules target the same line). Upsell coupons may coexist with a customer-entered coupon unless that coupon is "individual use". | No coexistence with any other coupon |
| D8 | POS / staff orders | Rules apply to every cart; staff can remove the auto-coupon manually | Skip carts that use the POS shipping method |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant creates a conditional rule from psp.ca admin (Priority: P1)

As a shop manager logged into proskatersplace.ca with an administrator/shop_manager account, I open My Account → Admin → Upsell Rules and create a rule: "When the cart contains any product from **Endless Frames** (category), give **20% off** every line item from the **Endless** brand in the **Wheels** category. Run on .ca and .com. Pause/activate at will. Optional start/end dates. Custom notice wording in English (French optional)." I can see all rules in a list with status, edit them, pause them, and delete them.

**Why this priority**: Nothing else in the feature exists without rules. The admin UI is the control plane and is required before any storefront behaviour can be tested.

**Independent Test**: With the plugin installed and no storefront components deployed, an admin can create, edit, pause and delete a rule, and the rule survives a page reload (it is persisted on the WordPress backend). A non-admin customer sees no Admin tab and gets a 401 from the admin endpoints.

**Acceptance Scenarios**:

1. **Given** I am logged in on psp.ca with a `shop_manager` account, **When** I open `/my-account?tab=upsell-rules`, **Then** I see the rule list (empty state on first use) and a "New rule" action.
2. **Given** the rule editor is open, **When** I pick a trigger (category and/or brand), a target (category and/or brand), a percent discount, channels, and save, **Then** the rule appears in the list as **Paused** by default and the backend stores it.
3. **Given** a saved rule, **When** I toggle it to **Active**, **Then** it becomes eligible for evaluation on the selected channels within 5 minutes on .ca and immediately on .com.
4. **Given** I try to save a rule whose target equals its trigger with no exclusions, or a discount outside 1–100%, **Then** the form blocks the save with a specific message.
5. **Given** I am logged in as a regular customer, **When** I request `/my-account?tab=upsell-rules` or call the admin endpoints, **Then** the tab is absent and the endpoints deny the request.

---

### User Story 2 - Shopper on psp.ca gets the discount automatically on target items only (Priority: P1)

As a shopper on proskatersplace.ca, when I add an Endless frame to my cart and then add Endless wheels, a coupon is applied automatically and only the wheel line items are discounted. Everything else in the cart (the frame, unrelated products) stays at full price. If I remove the frame, the coupon disappears and the wheels return to full price. The cart drawer and checkout totals reflect this immediately.

**Why this priority**: This is the revenue-generating behaviour and the correctness-critical one (isolation). It must work on the headless store, which is the primary channel for this repo.

**Independent Test**: Using only the plugin plus the existing .ca storefront (no new UI components), a cart with trigger + target items shows an `UPSELL-…` code in the cart's applied coupons and a discount equal to X% of the target lines' subtotal only. Removing the trigger removes the coupon on the next cart refresh.

**Acceptance Scenarios**:

1. **Given** an active rule (Endless Frames → 20% off Endless wheels) and an empty cart, **When** I add Endless wheels only, **Then** no coupon is applied and no discount appears.
2. **Given** wheels are in the cart, **When** I add an Endless frame, **Then** the cart shows one `UPSELL-…` coupon and the discount equals 20% of the wheel lines' subtotal (frame untouched).
3. **Given** the coupon is applied, **When** I add an unrelated product (e.g. a helmet), **Then** the discount amount does not change.
4. **Given** the coupon is applied, **When** I remove the frame, **Then** the coupon is removed on the next cart refresh and totals return to full price.
5. **Given** the coupon is applied, **When** I complete checkout (Helcim), **Then** the charged amount equals the discounted cart total, the order records the upsell coupon, and the coupon cannot be reused.
6. **Given** the coupon is applied, **When** the rule is paused by an admin, **Then** the coupon is removed from the cart at the next evaluation and no error is shown to the shopper.

---

### User Story 3 - Shopper on proskatersplace.com (native storefront) gets the same behaviour (Priority: P1)

As a shopper on the classic WooCommerce storefront, the identical rule engine applies and removes the coupon, and WooCommerce's native cart/checkout totals show the coupon line labelled in plain language (e.g. "Bundle savings: 20% off Endless wheels") rather than a raw code.

**Why this priority**: The plugin must be dual-store from day one (project rule 10 — never improve one market while degrading the other). The engine is shared; only the presentation differs.

**Independent Test**: Same matrix as US2 executed on the .com storefront with the classic cart page (`/cart/`) and checkout.

**Acceptance Scenarios**:

1. **Given** an active rule with channel `com`, **When** a .com shopper adds trigger + target items, **Then** the coupon is auto-applied and only target lines are discounted.
2. **Given** an active rule with channel `ca` only, **When** a .com shopper adds trigger + target items, **Then** nothing happens on .com.
3. **Given** the coupon is applied on .com, **When** the shopper manually removes it from the cart totals box, **Then** it is not re-applied for the rest of that session unless the trigger/target set changes (respect the shopper's choice).

---

### User Story 4 - Upsell banner on product pages (Priority: P2)

As a shopper viewing a **trigger** product (an Endless frame), I see a subtle banner: "Pair this with any Endless wheels and get 20% off" with a link to the wheels category. As a shopper viewing a **target** product (Endless wheels), I see "Add any Endless frame to get 20% off these wheels" with a link to the frames category. Works on both .ca and .com.

**Why this priority**: Drives discovery of the promotion; depends on the engine (US2/US3) already working.

**Independent Test**: Open a trigger product page and a target product page on each store; the correct banner text and CTA link render; an unrelated product shows no banner; a paused rule shows no banner.

**Acceptance Scenarios**:

1. **Given** an active rule, **When** I open a trigger product page on .ca, **Then** the banner shows the rule's product-page text with `{discount}`/`{target}` substituted and a CTA linking to the target listing.
2. **Given** the same rule, **When** I open a target product page, **Then** the banner shows the target-side text and links to the trigger listing.
3. **Given** the rule's end date has passed, **When** I open either page, **Then** no banner renders.
4. **Given** the .ca product page is served from the 24h product cache, **When** the admin pauses the rule, **Then** the banner disappears within 5 minutes without purging the product cache.

---

### User Story 5 - Cart notices: pending and applied (Priority: P2)

As a shopper who has added a trigger product but no target yet, the cart (drawer on .ca; cart page on .com) shows: "You added Endless Frames! Add Endless wheels to your cart to save 20%" with a button to the target listing. Once the target is in the cart, the notice changes to a confirmation: "20% off Endless wheels applied."

**Why this priority**: The "missing qualifier" nudge is the conversion lever; it relies on the engine's evaluation state, not just on WooCommerce's coupon list.

**Independent Test**: Add a trigger item → pending notice with CTA. Add target → applied notice. Remove trigger → notice gone.

**Acceptance Scenarios**:

1. **Given** trigger in cart, no target, **When** I open the cart drawer on .ca, **Then** I see the pending notice with a working CTA button.
2. **Given** trigger + target in cart, **When** I open the cart, **Then** I see the applied confirmation and the target lines are visibly marked as discounted.
3. **Given** the same state on .com, **When** I view `/cart/`, **Then** an equivalent WooCommerce notice renders above the cart form.
4. **Given** two rules are pending at once, **When** I view the cart, **Then** I see one notice per rule, most valuable first.

---

### User Story 6 - Checkout line-item breakdown (Priority: P2)

At checkout on both stores, the order summary confirms exactly which line items received the upsell discount and how much, so it is obvious that full-price items were untouched.

**Why this priority**: Trust/clarity at the moment of payment; also gives support staff a precise record.

**Independent Test**: Reach checkout with trigger + target + unrelated item; the summary lists per-item discounts for the target lines only and the aggregate discount equals their sum.

**Acceptance Scenarios**:

1. **Given** the coupon is applied, **When** I view checkout on .ca, **Then** each discounted line shows its discount amount and the rule label, and the total discount row equals the sum.
2. **Given** the same cart on .com, **When** I view the checkout review table, **Then** a breakdown row per discounted item appears before the cart contents.
3. **Given** a customer coupon is also applied, **When** I view checkout, **Then** the upsell breakdown only counts the upsell coupon's portion.

---

### User Story 7 - Orders, cleanup and reporting (Priority: P3)

Completed orders carry the coupon record and per-line discount metadata so reporting works; stale generated coupons are purged automatically so the coupon list in wp-admin does not grow unbounded.

**Why this priority**: Operational hygiene; not user-visible but required before wide rollout.

**Independent Test**: After a test purchase the order shows the coupon and a note naming the rule; 8 days after expiry the generated coupon is gone; an active session's coupon is never purged.

**Acceptance Scenarios**:

1. **Given** a completed .com order, **When** I open it in wp-admin, **Then** it lists the `UPSELL-…` coupon line and an order note "Upsell rule «name» applied — discount X on N items".
2. **Given** a completed .ca (Helcim, admin-API-created) order, **When** I open it, **Then** it carries the same note and metadata and the coupon's usage count is incremented.
3. **Given** generated coupons older than expiry + 7 days with no usage, **When** the daily cleanup runs, **Then** they are deleted and a count is logged.

---

### Edge Cases

- **Same product is both trigger and target** (overlapping selectors): the trigger item never discounts itself; target matching excludes lines that satisfied the trigger (`exclude_trigger_items`, default on).
- **Multiple rules match the same line**: only the single best discount applies to that line; two upsell coupons never both discount one line.
- **Quantity thresholds**: rule may require a minimum trigger quantity (default 1) and cap discounted target quantity per order (default unlimited).
- **Variable products**: matching uses the parent product's categories/brand terms; the discount applies to the variation line.
- **Sale items**: per-rule "exclude sale items" toggle (maps to WooCommerce's native coupon flag).
- **Customer-entered coupon marked "individual use"**: WooCommerce removes the upsell coupon; the cart notice reverts to pending with an explanation-free state (no error shown).
- **Trigger removed after reaching checkout**: the next totals calculation removes the coupon before payment; the .ca Helcim charge uses the recalculated cart total, never a stale one.
- **Coupon expires mid-session** (48h TTL): engine regenerates a fresh coupon on the next evaluation if the rule still matches.
- **Session expiry / cart cleared / guest → logs in**: coupons are bound to the WooCommerce session id; a merged cart re-evaluates and gets a new coupon.
- **Rule edited while coupons exist**: the coupon stores a hash of the rule; on mismatch the coupon is invalidated and regenerated.
- **Backend returns USD to a server-side fetch** (known test-env quirk): percent-only discounts make the amount currency-neutral; display goes through `formatPrice()` only.
- **WPGraphQL schema flap** (WooGraphQL 0.21.1 intermittently loses types): the GraphQL extension registers defensively; if `Cart`/`Product` types are missing the plugin skips registration rather than fatal-ing, and the .ca falls back to "no upsell UI" (never a broken cart).
- **Headless order creation** (`create-admin-order` skips coupon re-application by design): the discounted line totals are already correct; the plugin records the coupon on the order from metadata instead of re-applying it.
- **POS / staff carts**: rules apply; staff can remove the coupon manually (D8).

## Requirements *(mandatory)*

### Functional Requirements

**Rule management**
- **FR-001**: Admins (WordPress `administrator` or `shop_manager`) MUST be able to create, read, update, pause/activate, and delete upsell rules from the psp.ca Admin area; all requests MUST be authorised server-side (never by hiding UI alone).
- **FR-002**: A rule MUST define: a trigger (one or more category/brand selectors, match ANY), a target (one or more category/brand selectors), a percent discount (1–100), channels (`ca`, `com`, or both), status (`active`/`paused`), optional start/end dates in America/Toronto, notice texts (English required, French optional), optional CTA overrides per channel, and a priority.
- **FR-003**: Rules MUST be stored on the WordPress backend as the single source of truth for both storefronts.
- **FR-004**: The system MUST validate rules on save: non-empty trigger and target, discount range, date order, and MUST warn when trigger and target overlap.

**Rule engine**
- **FR-005**: The engine MUST evaluate the cart on every cart change (add, remove, quantity change, coupon change, session load) on both storefronts and MUST produce, per active rule for the current channel: `eligible` (trigger satisfied), `pending` (trigger satisfied, no target lines), `applied` (coupon in cart), or `inactive`.
- **FR-006**: When a rule is satisfied and target lines exist, the engine MUST ensure exactly one generated coupon for that rule is applied to the cart; when the rule stops being satisfied (or is paused, expired, or edited), the engine MUST remove that coupon.
- **FR-007**: The discount MUST apply only to line items that match the target selectors, MUST NOT apply to trigger lines, and MUST NOT affect unrelated lines, shipping, or fees.
- **FR-008**: Only one upsell discount MAY apply to a given line; if several rules target it, the highest discount wins.
- **FR-009**: Generated coupons MUST be native WooCommerce coupons (`shop_coupon`, code prefix `UPSELL-`), bound to the cart session, single-use, with an expiry, and MUST fail validation when used from a different session.
- **FR-010**: A shopper who manually removes an auto-applied coupon MUST NOT have it re-applied until the trigger/target set changes.

**Storefront: .com (native)**
- **FR-011**: On the classic storefront the plugin MUST render: a product-page banner on trigger and target products, a cart-page notice (pending and applied states) with a CTA, a checkout review-table breakdown of discounted line items, and a plain-language label for the coupon line in cart/checkout totals.
- **FR-012**: Native output MUST use WooCommerce notice/template conventions and MUST NOT render on pages where WooCommerce is not loaded.

**Storefront: .ca (headless)**
- **FR-013**: The backend MUST expose the evaluation state over WPGraphQL: cart-level (`eligibleOffers`, `appliedAutoCoupons`, `cartNotices`, `missingQualifiers`, `lineItemDiscounts`) and product-level (`hasUpsellTrigger`, `isUpsellTarget`, offers with notice text and CTA path).
- **FR-014**: The backend MUST expose the list of active rules for a channel over public REST (resolved term ids, slugs and names) so the .ca can evaluate product pages client-side without invalidating its 24h product cache.
- **FR-015**: The .ca storefront MUST render the product banner, cart-drawer notices, per-line discount marker, and checkout breakdown using the existing notice/banner conventions and i18n (`en-CA`, `fr-CA`).
- **FR-016**: The .ca storefront MUST degrade gracefully: if the upsell API is unavailable, no upsell UI renders and cart/checkout continue to work.
- **FR-017**: The .ca Helcim order-creation path MUST record which upsell coupons were applied on the order (metadata + order note) and the backend MUST consume the coupon so it cannot be reused, without re-applying coupons to the order totals.
- **FR-018**: `useCart().applyCoupon` MUST surface coupon errors instead of silently returning success (pre-existing defect that would mask upsell coupon failures).

**Operations**
- **FR-019**: A scheduled cleanup MUST delete generated coupons that are expired and unused after a grace period, and MUST never delete a coupon bound to a live session.
- **FR-020**: With zero rules configured, the plugin MUST have no observable effect on either storefront.
- **FR-021**: All plugin behaviour MUST be additive on the shared backend (no changes to existing snippets' behaviour), and the change MUST be documented with a cross-site impact review per project rule 8.

### Key Entities

- **Rule**: The merchant-authored promotion. Trigger selectors, target selectors, discount, channels, status, schedule, notices, CTA overrides, priority.
- **Selector**: A taxonomy + set of term ids (category or brand) with an "include child terms" flag. Rules combine selectors; a product matches a selector if any of its terms in that taxonomy are in the set.
- **Offer (session state)**: The evaluation result of one rule for one cart: state (`inactive`/`pending`/`applied`/`dismissed`), matched trigger lines, matched target lines, the generated coupon code, per-line discounts, notices, CTA.
- **Generated Coupon**: A native WooCommerce coupon created by the engine for one session and one rule; carries the rule id, rule hash, session id, channel, expiry.
- **Notice**: Text shown to the shopper for a given surface (product trigger/target, cart pending/applied, checkout) in a given locale, with placeholders `{discount}`, `{trigger}`, `{target}`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the full test matrix (see `quickstart.md`), 100% of discounted amounts equal the rule percentage applied to target line subtotals only; 0 cases where a non-target line, shipping, or fee is discounted.
- **SC-002**: Removing the trigger removes the coupon within one cart refresh on .ca and one page load on .com, 100% of the time.
- **SC-003**: Admin can create and activate a rule in under 2 minutes without touching wp-admin.
- **SC-004**: A rule status change is reflected on .ca product pages within 5 minutes and on .com immediately.
- **SC-005**: For carts with no matching rule, checkout totals and order creation are byte-for-byte identical to pre-feature behaviour (regression guard).
- **SC-006**: 100% of orders that paid with an upsell discount (both stores) carry the coupon record and order note.
- **SC-007**: The generated-coupon table stays bounded: no unused generated coupon older than expiry + 7 days exists after cleanup runs.
- **SC-008**: No new client-side errors on .ca product, cart, or checkout when the upsell API is unreachable (graceful degradation).

## Assumptions

- Both storefronts share one WooCommerce database and one WPGraphQL endpoint; the plugin runs on that backend and is deployed manually (plugin zip upload) to test first, then production.
- `product_cat` is shared by both stores. Brands are modelled twice on the backend (`pa_manufacturer` attribute, `pwb-brand` taxonomy); per D1 the rule picker uses `pa_manufacturer`, and the engine is taxonomy-agnostic so `pwb-brand` can be enabled later.
- The .com storefront uses the classic shortcode cart/checkout (verified 2026-09-10), so classic WooCommerce hooks fire. The theme is Elementor-based; WooCommerce widget hooks are expected to fire but must be verified on test.
- Percent discounts are currency-neutral, which is why v1 excludes fixed amounts (backend prices are USD-origin; .ca displays CAD).
- Existing patterns are reused rather than reinvented: `useCartNotices` + `cart-item-categories` (cart category lookup), `CartNotice.vue` (banner), `usePromoSchedule` (Toronto date gating), `verifyAdminSession` (admin gate), `psp/v1` REST + app-password auth (Nuxt→WP calls), `CalculatorStats.vue` (admin panel styling).
- Automated tests exist only as Node `node --test` files for pure logic; PHP is verified via WP-CLI smoke scripts and the manual matrix in `quickstart.md`.
- The "custom modal/pop-up" variant of the product banner is out of scope for v1 (inline banner only).
