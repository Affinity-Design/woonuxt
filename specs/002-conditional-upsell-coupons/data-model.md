# Data Model: Conditional Upsell Coupons

**Branch**: `feature/conditional-upsell-coupons` | **Date**: 2026-09-10

## 1. Rule (WordPress CPT `psp_upsell_rule`)

`register_post_type('psp_upsell_rule', ['public' => false, 'show_ui' => false, 'show_in_rest' => false, 'supports' => ['title','revisions','author'], 'capability_type' => 'shop_coupon'])`. The rule body is one JSON document in post meta `_psp_upsell_rule`; `post_title` mirrors `name`; `post_status` is always `publish` (rule status lives in the JSON so pausing keeps revisions).

```jsonc
{
  "schema_version": 1,
  "name": "Endless frames → 20% off Endless wheels",
  "status": "active",                         // "active" | "paused"
  "channels": ["ca", "com"],                  // subset of ["ca","com"]; empty = nowhere
  "priority": 10,                             // lower runs first; tie-break by id

  "trigger": {
    "selectors": [                            // product matches trigger if it matches ANY selector
      { "taxonomy": "product_cat", "term_ids": [312], "include_children": true }
    ],
    "trigger_label": "Endless Frames",        // used for {trigger}; default = first term name
    "min_qty": 1                              // summed quantity across trigger lines
  },

  "target": {
    "selectors": [
      { "taxonomy": "pa_manufacturer", "term_ids": [1187], "include_children": false },
      { "taxonomy": "product_cat",     "term_ids": [77],   "include_children": true }
    ],
    "match": "all",                           // "all" = product must match every selector (brand AND category)
                                              // "any" = product matches any selector
    "target_label": "Endless wheels",         // used for {target}
    "exclude_trigger_items": true,
    "exclude_sale_items": false,
    "max_qty_per_order": null                 // null = unlimited
  },

  "discount": { "type": "percent", "amount": 20 },   // v1: percent only (1..100)
                                                     // reserved: {"type":"fixed_product","amount":5,"per_currency":{"CAD":7}}

  "schedule": { "starts_at": null, "ends_at": null, "timezone": "America/Toronto" },  // inclusive YYYY-MM-DD

  "notices": {
    "en": {
      "product_trigger": "Pair this with any {target} and get {discount} off",
      "product_target":  "Add any {trigger} to get {discount} off these",
      "cart_pending":    "You added {trigger}! Add {target} to your cart to save {discount}.",
      "cart_applied":    "{discount} off {target} applied.",
      "checkout":        "Bundle savings: {discount} off {target}",
      "coupon_label":    "Bundle savings: {discount} off {target}"
    },
    "fr": { }                                   // optional; .ca falls back to en
  },

  "cta": { "ca_path": null, "com_path": null }, // optional overrides; default derived (research RQ-8)

  "coupon": { "ttl_hours": 48, "code_prefix": "UPSELL" }
}
```

**Selector semantics**

- `taxonomy` ∈ `product_cat` | `pa_manufacturer` | `pwb-brand` (last one valid but hidden from the v1 picker).
- A product matches a selector when `wp_get_object_terms(parent_id, taxonomy, ['fields' => 'ids'])` intersects `term_ids` (expanded with descendants at compile time when `include_children`).
- Trigger: product matches if it matches **any** selector. Target: `match` decides `all`/`any`.
- Validation on save: `trigger.selectors` and `target.selectors` non-empty; `1 ≤ amount ≤ 100`; `starts_at ≤ ends_at`; `channels` non-empty; warn (not block) when trigger and target selector sets intersect and `exclude_trigger_items` is false.

## 2. Compiled rules (option `psp_upsell_rules_compiled`, autoload)

Rebuilt by `PSP_Upsell_Rules::compile()` on `save_post_psp_upsell_rule`, `delete_post`, and plugin activation. Contains only rules with `status = active` and a schedule that is not yet ended, with terms pre-resolved so the hot path and the public REST endpoint need no term queries.

```jsonc
{
  "version": "a1b2c3d4",            // sha1 of the compiled payload; also the rule_hash source
  "compiled_at": "2026-09-10T14:00:00-04:00",
  "rules": [
    {
      "id": 4120, "name": "...", "status": "active", "channels": ["ca","com"], "priority": 10,
      "hash": "9f8e...",              // sha1 of the rule JSON — stored on generated coupons
      "trigger": { "selectors": [ { "taxonomy": "product_cat", "term_ids": [312, 313, 314],
                                    "terms": [ { "id": 312, "slug": "endless-frames", "name": "Endless Frames" } ] } ],
                   "label": "Endless Frames", "min_qty": 1 },
      "target":  { "selectors": [ ... ], "match": "all", "label": "Endless wheels",
                   "exclude_trigger_items": true, "exclude_sale_items": false, "max_qty_per_order": null },
      "discount": { "type": "percent", "amount": 20, "display": "20%" },
      "schedule": { "starts_at": null, "ends_at": null },
      "notices": { "en": { ... }, "fr": { ... } },
      "cta": { "ca": { "trigger_side": "/product-category/wheels?filter=pa_manufacturer[endless]",
                       "target_side":  "/product-category/endless-frames" },
               "com": { "trigger_side": "/product-category/wheels/?filter_manufacturer=endless",
                        "target_side":  "/product-category/endless-frames/" } }
    }
  ]
}
```

`terms` lists only the terms the admin picked (for labels/links); `term_ids` is the expanded match set.

## 3. Session state (WooCommerce session key `psp_upsell`)

Written by `PSP_Upsell_Engine::sync()`; read by GraphQL/REST resolvers and the native templates so evaluation happens once per request.

```jsonc
{
  "channel": "ca",
  "evaluated_at": 1757520000,
  "rules_version": "a1b2c3d4",
  "offers": {
    "4120": {
      "state": "applied",                       // inactive | pending | applied | dismissed
      "trigger_lines": ["3b1c…", "9a0f…"],      // cart item keys
      "target_lines":  ["c77d…"],
      "coupon_code": "UPSELL-7K3Q9M",
      "line_discounts": { "c77d…": "12.40" },   // raw strings, store currency
      "discount_total": "12.40"
    }
  },
  "dismissed": { "4120": "sha1(sorted trigger+target line keys)" }   // FR-010
}
```

### Offer state machine

```
            trigger absent                  trigger present, no target
 ┌──────────┐ ─────────────────────────▶ ┌──────────┐
 │ inactive │ ◀───────────────────────── │ pending  │ ◀──────────────┐
 └──────────┘   trigger removed          └────┬─────┘                │
      ▲                                       │ target added         │ target removed
      │ trigger removed / rule paused,        ▼                      │
      │ expired, edited (hash mismatch)  ┌──────────┐                │
      └───────────────────────────────── │ applied  │ ───────────────┘
                                         └────┬─────┘
                                              │ shopper removes coupon manually
                                              ▼
                                         ┌───────────┐  trigger/target line-key set changes
                                         │ dismissed │ ─────────────────────────────────────▶ pending/applied
                                         └───────────┘
```

Transitions run inside `sync()`; `applied` ⇒ exactly one `UPSELL-*` coupon for the rule is in `WC()->cart->get_applied_coupons()`.

## 4. Generated coupon (`shop_coupon` post)

| Field / meta | Value |
|--------------|-------|
| `post_title` (code) | `UPSELL-` + 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I) |
| `discount_type` | `percent` |
| `coupon_amount` | rule `discount.amount` |
| `individual_use` | `no` |
| `usage_limit` / `usage_limit_per_user` | `1` / `1` |
| `date_expires` | generated_at + `ttl_hours` |
| `exclude_sale_items` | from rule |
| `product_categories` | target `product_cat` term ids when every target selector is `product_cat` (else empty — filter enforces) |
| `_psp_upsell_rule_id` | rule post id |
| `_psp_upsell_rule_hash` | rule `hash` at generation |
| `_psp_upsell_session` | `WC()->session->get_customer_id()` |
| `_psp_upsell_channel` | `ca` / `com` |
| `_psp_upsell_generated_at` | unix timestamp |
| `_psp_upsell_retired` | `1` once consumed by an order |

Validation (`woocommerce_coupon_is_valid`): code has `_psp_upsell_rule_id` ⇒ session must match, rule must be in compiled set with the same hash, channel must be allowed, schedule current, trigger satisfied (`min_qty`), not retired. Failure ⇒ `WC_Coupon` error `psp_upsell_invalid` with a neutral message; WooCommerce removes it and the engine's next `sync()` decides whether to regenerate.

## 5. Order metadata

| Meta | Set by | Purpose |
|------|--------|---------|
| `_psp_upsell_coupons` (JSON `["UPSELL-7K3Q9M"]`) | `.ca` `create-admin-order` (from request `coupons`, filtered by prefix); native checkout sets nothing (WooCommerce `coupon_lines` suffice) | Lets the plugin consume the coupon on headless orders |
| `_psp_upsell_applied` (JSON `[{rule_id, code, discount_total, lines:{item_id: amount}}]`) | plugin `woocommerce_new_order` / `woocommerce_checkout_order_processed` | Reporting; idempotency guard |
| order note | plugin | "Upsell rule «name» applied — {discount} on N item(s), code UPSELL-…" |
| line item meta `_psp_upsell_discount`, `_psp_upsell_rule` | `.ca` `create-admin-order` (P3) / plugin native path | Per-line audit |

## 6. .ca (Nuxt) shapes

```ts
// utils/upsellTypes.ts
export type UpsellChannel = 'ca' | 'com';
export interface UpsellTerm { id: number; slug: string; name: string }
export interface UpsellSelector { taxonomy: 'product_cat' | 'pa_manufacturer' | 'pwb-brand'; termIds: number[]; terms: UpsellTerm[] }
export interface UpsellRulePublic {
  id: number; name: string; priority: number; hash: string;
  trigger: { selectors: UpsellSelector[]; label: string; minQty: number };
  target:  { selectors: UpsellSelector[]; match: 'all' | 'any'; label: string; excludeTriggerItems: boolean };
  discount: { type: 'percent'; amount: number; display: string };
  notices: Record<'en' | 'fr', Partial<Record<'product_trigger'|'product_target'|'cart_pending'|'cart_applied'|'checkout'|'coupon_label', string>>>;
  cta: { triggerSide: string; targetSide: string };   // already channel-resolved for 'ca'
}
export interface ProductUpsellMatch { rule: UpsellRulePublic; side: 'trigger' | 'target'; text: string; ctaPath: string }
export interface CartUpsellState {                      // from GraphQL Cart.upsell
  eligibleOffers: { ruleId: number; state: 'pending'|'applied'|'dismissed'; label: string }[];
  appliedAutoCoupons: string[];
  cartNotices: { ruleId: number; kind: 'pending'|'applied'; text: string; ctaPath: string | null }[];
  missingQualifiers: { ruleId: number; label: string; ctaPath: string }[];
  lineItemDiscounts: { cartItemKey: string; ruleId: number; couponCode: string; amount: string; label: string }[];
}
```

**KV keys (`cache` mount)**: `upsell-rules:ca` (TTL 300 s, value = `UpsellRulePublic[]`). Purged by `POST /api/admin/upsell-rules/revalidate` after any admin save; protected from nothing special (short TTL). The product-page matcher (`utils/upsellMatcher.mjs`) takes `(productTerms: {taxonomy, id?, slug}[], rules)` and is the same algorithm as the PHP engine's selector match — a Node test pins both edge cases (children, `all` vs `any`, exclude-trigger).

## 7. Relationships

```
Admin (psp.ca) ──POST /api/admin/upsell-rules──▶ Nuxt (verifyAdminSession) ──psp/v1/upsell/rules──▶ WP CPT psp_upsell_rule
                                                                                                        │ save_post
                                                                                                        ▼
                                                                                    option psp_upsell_rules_compiled
                                                                                        │                    │
                          GET /wp-json/psp/v1/upsell/rules/active?channel=ca ◀──────────┘                    │
                                   │                                                                         │
             Nuxt /api/upsell/rules (KV 300s) ──▶ utils/upsellMatcher (PDP banner)                            │
                                                                                                             ▼
   cart mutation (GraphQL / classic / Store API) ──▶ woocommerce_before_calculate_totals ──▶ PSP_Upsell_Engine::sync()
                                                                                                │
                                              ┌──────────────── session psp_upsell ◀────────────┤
                                              │                                                 ├─▶ apply/remove UPSELL-* coupons
                                              ▼                                                 ▼
                          GraphQL Cart.upsell / REST evaluate                        woocommerce_coupon_is_valid(_for_product)
                                   │                                                          (isolation + session binding)
                    .ca useUpsellOffers ──▶ drawer notice, line badge, checkout breakdown
                                                                                                │ order created
                                                                                                ▼
                                            woocommerce_new_order ──▶ consume coupon, order note, _psp_upsell_applied
                                                                                                │ daily
                                                                                                ▼
                                                                          psp_upsell_cleanup_daily (purge expired unused)
```
