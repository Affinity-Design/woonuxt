# Contract: REST API

**Branch**: `feature/conditional-upsell-coupons` | **Date**: 2026-09-10

Two layers: the WordPress plugin's `psp/v1/upsell/*` namespace (authoritative), and thin Nuxt server routes on psp.ca that proxy it (admin gate + KV cache). All bodies are JSON. Error shape follows the existing `psp/v1` convention: `WP_Error` with `['status' => code]` → `{ "code": "...", "message": "...", "data": { "status": 400 } }`.

## A. WordPress — `psp/v1/upsell/*`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/wp-json/psp/v1/upsell/rules` | `manage_woocommerce` (Application Password / cookie+nonce) | List all rules (any status), full JSON |
| POST | `/wp-json/psp/v1/upsell/rules` | `manage_woocommerce` | Create rule; body = rule JSON (schema_version 1) |
| GET | `/wp-json/psp/v1/upsell/rules/{id}` | `manage_woocommerce` | Read one |
| PUT | `/wp-json/psp/v1/upsell/rules/{id}` | `manage_woocommerce` | Replace rule JSON (full document) |
| PATCH | `/wp-json/psp/v1/upsell/rules/{id}` | `manage_woocommerce` | Partial update — v1 supports `{ "status": "active"\|"paused" }` only |
| DELETE | `/wp-json/psp/v1/upsell/rules/{id}` | `manage_woocommerce` | Trash the rule; recompiles |
| GET | `/wp-json/psp/v1/upsell/rules/active?channel=ca\|com` | **public** | Compiled active rules for the channel (see data-model §2, `rules[]` with `notices`, `cta` resolved for that channel). `Cache-Control: public, max-age=60`. ETag = compiled `version`. |
| GET | `/wp-json/psp/v1/upsell/terms?taxonomy=product_cat\|pa_manufacturer&search=&per_page=` | `manage_woocommerce` | Term picker source (id, slug, name, parent, count). Optional — the .ca admin UI may use GraphQL instead. |
| POST | `/wp-json/psp/v1/upsell/evaluate` | public, session-bound (`woocommerce-session` header or cookie) | Returns the same payload as GraphQL `Cart.upsell` for non-GraphQL consumers. Runs `sync()` first. |
| GET | `/wp-json/psp/v1/upsell/health` | `manage_woocommerce` | `{ plugin_version, wc_version, graphql_registered: bool, compiled_version, rule_counts: {active, paused}, generated_coupons: {live, expired_unused}, last_cleanup }` |

**Rule write validation** (400 on failure, `code` values): `upsell_trigger_empty`, `upsell_target_empty`, `upsell_discount_range`, `upsell_schedule_order`, `upsell_channels_empty`, `upsell_taxonomy_invalid`, `upsell_term_not_found`. Overlap between trigger and target with `exclude_trigger_items=false` returns 200 with `warnings: ["upsell_overlap"]`.

**Rate/abuse**: `rules/active` is cacheable and cheap (one `get_option`). `evaluate` is bounded per session by WooCommerce's own session handling; add an hourly transient cap per IP like `psp-contact-relay-snippet.php:46-49` if abused.

**Headers expected from psp.ca** (same shape as `server/utils/emailSender.ts:94-110`):

```
Authorization: Basic base64(WP_ADMIN_USERNAME:WP_ADMIN_APP_PASSWORD)
User-Agent: WooNuxt-Upsell-Admin/1.0
Origin: https://proskatersplace.com      (wpBaseUrl)
Referer: https://proskatersplace.com/
X-Requested-With: XMLHttpRequest
Content-Type: application/json
```

## B. Nuxt (psp.ca) — server routes

| Method | Route | Gate | Behaviour |
|--------|-------|------|-----------|
| GET | `/api/upsell/rules` | public | Returns `UpsellRulePublic[]` for channel `ca`. Reads KV `upsell-rules:ca` (TTL 300 s); on miss fetches `psp/v1/upsell/rules/active?channel=ca` with browser-like headers; on any error returns `[]` with `Cache-Control: no-store` and logs once. Never throws. |
| POST | `/api/upsell/cart` | shopper session (`woocommerce-session` cookie forwarded) | Body `{locale}`. Raw-fetches `cart { upsell {…} }` from WPGraphQL with the shopper's session header (same pattern as `adminAuth.ts`) and returns `CartUpsellState`; `null` on any failure (no session, schema field missing, timeout). Reading it makes the backend apply/remove auto coupons for that cart. Used instead of a build-time `.gql` operation so codegen never depends on the plugin being deployed. |
| GET | `/api/admin/upsell-terms?taxonomy=product_cat\|pa_manufacturer&search=` | `verifyAdminSession` | Proxies `psp/v1/upsell/terms` (picker options, hidden/empty terms included) |
| GET | `/api/admin/upsell-rules` | `verifyAdminSession` ⇒ 401 | Proxies `GET psp/v1/upsell/rules` |
| POST | `/api/admin/upsell-rules` | `verifyAdminSession` | Body `{ rule }` → `POST psp/v1/upsell/rules`; then purges KV `upsell-rules:ca` |
| PUT | `/api/admin/upsell-rules/[id]` | `verifyAdminSession` | Body `{ rule }` → `PUT …/rules/{id}`; purge |
| PATCH | `/api/admin/upsell-rules/[id]` | `verifyAdminSession` | Body `{ status }` → `PATCH …/rules/{id}`; purge |
| DELETE | `/api/admin/upsell-rules/[id]` | `verifyAdminSession` | → `DELETE …/rules/{id}`; purge |
| POST | `/api/admin/upsell-rules/revalidate` | `verifyAdminSession` **or** `x-internal-secret === REVALIDATION_SECRET` | Purges KV `upsell-rules:ca` (dual gate like `server/api/checkout-failures.get.ts:13-20`) |
| GET | `/api/admin/upsell-rules/health` | `verifyAdminSession` | Proxies `psp/v1/upsell/health` |

All admin responses: `Cache-Control: private, no-store` (as `server/api/admin/me.get.ts`). Errors carry only a stable code (`data.code`), never upstream text — the client maps codes to copy in `composables/useUpsellAdmin.ts`. Server code must not import project-root `utils/` (Nitro externalises it — see `server/utils/adminAuth.ts` history); shared logic lives under `shared/` (`#shared/utils/upsellMatcher.mjs`, `#shared/types/upsell.ts`).

## C. Existing route change — `POST /api/create-admin-order`

No new fields. Behaviour change: the already-received `coupons` array is filtered to codes starting with `UPSELL-` and written as order meta `_psp_upsell_coupons` (JSON array of codes) inside the existing `metaData` block (`server/api/create-admin-order.post.ts:550-587`). Coupons are still **not** re-applied to the order (line 713-716 comment stands). P3: per-line `_psp_upsell_discount` / `_psp_upsell_rule` item meta from `cart.upsell.lineItemDiscounts`.
