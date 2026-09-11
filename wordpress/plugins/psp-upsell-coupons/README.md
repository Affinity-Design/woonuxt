# PSP Conditional Upsell Coupons — v1.0.0 (2026-09-11)

Merchant-defined "trigger → target" promotions on the shared WooCommerce backend, consumed by both storefronts:

- **proskatersplace.com** (classic WooCommerce): banners/notices via native hooks, coupon label in cart/checkout totals.
- **proskatersplace.ca** (headless WooNuxt): `Cart.upsell` / `Product.upsell` / `upsellRules` in WPGraphQL plus `psp/v1/upsell/*` REST; rules are managed from psp.ca → My Account → Admin → Upsell Rules.

Spec, decisions and test matrix: `specs/002-conditional-upsell-coupons/` in the WooNuxt repo.

## How it works

1. Rules live in a private CPT (`psp_upsell_rule`) and are compiled into one autoloaded option (`psp_upsell_rules_compiled`) on every save — the cart hot path reads only that option.
2. On any cart change the engine evaluates the active rules for the request's channel (`ca` = GraphQL / Store API / `X-Frontend-Type: woonuxt`; `com` = everything else on the public site).
3. When a rule's trigger is in the cart and target lines exist, a native coupon `UPSELL-XXXXXX` is generated for **this session × this rule** (percent, single use, 48 h expiry) and applied. `woocommerce_coupon_is_valid_for_product` restricts it to the rule's target lines (never trigger lines); `woocommerce_coupon_is_valid` binds it to the session/rule hash/channel/schedule.
4. When the trigger leaves the cart (or the rule is paused/edited/expired) the coupon is removed. A shopper who removes the coupon manually is not nagged again until the cart's trigger/target line set changes.
5. Orders: native checkout records the coupon itself; headless orders pass `_psp_upsell_coupons` meta and the plugin consumes it on `woocommerce_new_order`/status hooks (usage count, order note, `_psp_upsell_applied`). A daily cron deletes expired unused coupons (7-day grace) and retired ones (30 days).

With zero rules the plugin is inert on both stores.

## Install

**Test first (`test.proskatersplace.com`), then production.**

```bash
cd wordpress/plugins && zip -r psp-upsell-coupons-1.0.0.zip psp-upsell-coupons -x "*.DS_Store"
```

wp-admin → Plugins → Add New → Upload → activate. Or over SSH (see `wordpress/production-wordpress-ssh-access.md`):

```bash
wp plugin activate psp-upsell-coupons
wp cron event list --fields=hook,next_run_relative | grep psp_upsell
```

### Verify

```bash
# health (app-password basic auth)
curl -s -u "$WP_ADMIN_USERNAME:$WP_ADMIN_APP_PASSWORD" https://test.proskatersplace.com/wp-json/psp/v1/upsell/health | jq
# public rule list per channel (what the .ca caches for 5 minutes)
curl -s "https://test.proskatersplace.com/wp-json/psp/v1/upsell/rules/active?channel=ca" | jq
# GraphQL fields present?
curl -s https://test.proskatersplace.com/graphql -H 'Content-Type: application/json' -H 'X-Frontend-Type: woonuxt' \
  -d '{"query":"{ upsellRules(channel: CA) { databaseId name discount { display } } }"}' | jq
# engine smoke test (needs an ACTIVE rule matching the two product ids)
wp eval-file wp-content/plugins/psp-upsell-coupons/tools/smoke.php <trigger_id> <target_id> <unrelated_id> com
```

## REST (`psp/v1/upsell`)

| Method | Route | Auth |
|--------|-------|------|
| GET/POST | `/rules` | `manage_woocommerce` |
| GET/PUT/PATCH/DELETE | `/rules/{id}` | `manage_woocommerce` (PATCH = `{status}` only) |
| GET | `/rules/active?channel=ca\|com` | public, `Cache-Control: public, max-age=60`, ETag |
| GET | `/terms?taxonomy=product_cat\|pa_manufacturer&search=` | `manage_woocommerce` |
| POST | `/evaluate` | public, cookie session (`{channel, locale}`) |
| GET | `/health` | `manage_woocommerce` |

Rule JSON schema: `specs/002-conditional-upsell-coupons/data-model.md`; example: `specs/002-conditional-upsell-coupons/examples/rule-endless.json`.

## Constants (override in wp-config.php or a Code Snippets config block)

| Constant | Default | Purpose |
|----------|---------|---------|
| `PSP_UPSELL_COUPON_TTL_HOURS` | 48 | Generated coupon lifetime |
| `PSP_UPSELL_CLEANUP_GRACE_DAYS` | 7 | Delete expired unused coupons after this |
| `PSP_UPSELL_RETIRED_RETENTION_DAYS` | 30 | Delete consumed coupons after this |
| `PSP_UPSELL_CODE_PREFIX` | `UPSELL` | Coupon code prefix |

Filters: `psp_upsell_channel`, `psp_upsell_taxonomies`, `psp_upsell_locale`, `psp_upsell_ca_base_url`, `psp_upsell_max_product_banners`, `psp_upsell_code_prefixes`. Actions: `psp_upsell_rules_compiled`, `psp_upsell_coupon_generated`, `psp_upsell_order_consumed`.

Theme overrides: copy `templates/*.php` to `<theme>/psp-upsell/`.

## Brand model

"Brand" selectors use the global product attribute **`pa_manufacturer`** (visible to both stores; the .ca links to `/product-category/<cat>?filter=pa_manufacturer[<slug>]`, the .com to `?filter_manufacturer=<slug>`). The `pwb-brand` taxonomy is accepted by the engine but hidden from the .ca picker until the two term sets are reconciled.

## Rollback

1. Pause all rules (psp.ca admin tab or `PATCH /rules/{id}` `{"status":"paused"}`) — coupons in carts drop on the next cart change on both stores.
2. Deactivate the plugin. Generated coupons that remain are ordinary single-use expired coupons; run the cleanup once if desired: `wp cron event run psp_upsell_cleanup_daily`.

## Cross-site impact (repo rule #8)

Additive only: new CPT/option, new REST routes under the existing `psp/v1` namespace, guarded WPGraphQL fields, coupon filters that early-return for non-generated codes, storefront output only when a rule is active for that channel. No SEO surface, URL, or pricing change unless a rule is active.

## Changelog

- 1.0.0 (2026-09-11) — initial release.
