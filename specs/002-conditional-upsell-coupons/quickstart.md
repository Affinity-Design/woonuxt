# Quickstart: Conditional Upsell Coupons

**Branch**: `feature/conditional-upsell-coupons` | **Date**: 2026-09-10

## What this feature does

A merchant defines rules like "cart has any **Endless Frames** → **20% off** every **Endless wheels** line". The backend plugin auto-applies a session-bound native coupon (`UPSELL-XXXXXX`) that discounts only target lines and removes it when the trigger leaves the cart. Shoppers see banners/notices on product pages, cart and checkout on both proskatersplace.com (native) and proskatersplace.ca (headless). Rules are managed from psp.ca → My Account → Admin → Upsell Rules.

## Files changed

| Area | Files | Change |
|------|-------|--------|
| Backend plugin | `wordpress/plugins/psp-upsell-coupons/**` | New plugin (zip in the same folder, versioned) |
| .ca server | `server/api/upsell/rules.get.ts`, `server/api/admin/upsell-rules*`, `server/utils/upsellWpClient.ts` | New routes |
| .ca server | `server/api/create-admin-order.post.ts` | Write `_psp_upsell_coupons` order meta |
| .ca data | `queries/getCartUpsell.gql`, `utils/upsellMatcher.mjs`, `utils/upsellTypes.ts`, `tests/upsellMatcher.test.mjs` | New |
| .ca UI | `components/upsell/*`, `components/adminElements/UpsellRules.vue`, `UpsellRuleForm.vue`, `composables/useUpsellOffers.ts` | New |
| .ca overrides | `components/shopElements/Cart.vue` (new root override), `OrderSummary.vue`, `components/cartElements/CartCard.vue`, `components/CartNotice.vue`, `pages/product/[slug].vue`, `pages/checkout/index.vue`, `pages/my-account/index.vue`, `composables/useCart.ts` | Edits |
| i18n | `locales/en-CA.json`, `en-US.json`, `en.json`, `fr-CA.json` | `messages.upsell.*` |

## 1. Deploy the plugin (test backend first)

```bash
# build the zip (from repo root)
cd wordpress/plugins && zip -r psp-upsell-coupons-1.0.0.zip psp-upsell-coupons -x "*.DS_Store"
```

Upload via wp-admin → Plugins → Add New → Upload on `test.proskatersplace.com`, activate. Or over SSH (see `wordpress/production-wordpress-ssh-access.md`) and:

```bash
wp plugin activate psp-upsell-coupons && wp cron event list --fields=hook | grep psp_upsell
```

Verify:

```bash
curl -s -u "$WP_ADMIN_USERNAME:$WP_ADMIN_APP_PASSWORD" https://test.proskatersplace.com/wp-json/psp/v1/upsell/health | jq
```

Expect `graphql_registered: true`, `rule_counts.active: 0`. With no rules the storefronts must behave exactly as before (SC-005).

## 2. Create a rule from psp.ca

1. Log into `test.proskatersplace.ca` with a `shop_manager`/`administrator` account (2FA users: see `docs/wordfence-2fa-headless-passthrough.md`).
2. My Account → Admin → **Upsell Rules** → New rule.
3. Trigger: Category = *Endless Frames*. Target: Brand = *Endless* AND Category = *Wheels*. Discount 20%. Channels: CA + COM. Save (paused) → Activate.

Or via REST:

```bash
curl -s -u "$WP_ADMIN_USERNAME:$WP_ADMIN_APP_PASSWORD" -H 'Content-Type: application/json' \
  -X POST https://test.proskatersplace.com/wp-json/psp/v1/upsell/rules \
  -d @specs/002-conditional-upsell-coupons/examples/rule-endless.json | jq
```

Public rule list (what the .ca caches):

```bash
curl -s "https://test.proskatersplace.com/wp-json/psp/v1/upsell/rules/active?channel=ca" | jq '.rules[].name'
curl -s https://test.proskatersplace.ca/api/upsell/rules | jq length
```

## 3. Run locally (.ca)

```bash
npm run dev:ssl        # needs a .env pointing GQL_HOST at a backend that has the plugin active
npm run test:upsell-matcher   # node --test tests/upsellMatcher.test.mjs
```

Client-side GraphQL from `localhost` is CORS-blocked by the backend's origin allowlist; SSR data and `/api/*` routes work. Use `test.proskatersplace.ca` for end-to-end checks.

## 4. Manual test matrix (run on BOTH stores)

| # | Steps | Expect |
|---|-------|--------|
| M1 | Empty cart → add target (wheels) only | no coupon, no discount, no cart notice; PDP shows target-side banner |
| M2 | Add trigger (frame) | coupon `UPSELL-*` applied; discount = 20% × wheels subtotal; frame full price; cart notice "applied" |
| M3 | Add unrelated item (helmet) | discount unchanged |
| M4 | Increase wheels qty | discount scales with wheels subtotal only |
| M5 | Remove frame | coupon removed; totals full price; notice gone |
| M6 | Trigger only in cart | "pending" notice with CTA to wheels listing; CTA link resolves (ca: `?filter=pa_manufacturer[...]`, com: `?filter_manufacturer=`) |
| M7 | Manually remove the coupon (cart totals / `removeCoupons`) | not re-applied until cart line set changes |
| M8 | Pause rule in admin | within 5 min (.ca) / next load (.com): coupon removed, banners gone |
| M9 | Apply a customer coupon too | both coexist unless customer coupon is individual-use; checkout breakdown counts only the upsell portion |
| M10 | Checkout (.ca Helcim; .com native) | paid amount = discounted total; order shows coupon + note "Upsell rule «…» applied"; coupon unusable afterwards |
| M11 | Variable product as target | variation line discounted; parent terms matched |
| M12 | Sale item with rule "exclude sale items" on | sale target not discounted |
| M13 | Kill the upsell API (`/api/upsell/rules` → 500) | .ca PDP/cart/checkout render without upsell UI and without console errors |
| M14 | Coupon TTL elapsed (set `PSP_UPSELL_COUPON_TTL_HOURS` to 0.01 on test) | next cart change regenerates a fresh code |
| M15 | Run cleanup: `wp cron event run psp_upsell_cleanup_daily` | expired unused coupons deleted; live ones untouched |

Smoke script (recursion + isolation) on the backend:

```bash
wp eval-file wordpress/plugins/psp-upsell-coupons/tools/smoke.php   # adds trigger+target twice, asserts one coupon, asserts only target lines discounted
```

## 5. Key design decisions

1. **Single engine on the backend**; both stores only present state (research RQ-4/RQ-5).
2. **Percent-only discounts** — currency-neutral for USD backend / CAD display (D3).
3. **Brand = `pa_manufacturer`**; engine taxonomy-agnostic (D1).
4. **Per session × rule generated coupons**, retired on order, purged daily (D2).
5. **.ca PDP banners evaluate client-side** from cached product terms + 5-minute rule cache so the 24h product cache never goes stale (RQ-7).
6. **Headless orders record the coupon via metadata**; coupons are never re-applied to the order (RQ-6).
