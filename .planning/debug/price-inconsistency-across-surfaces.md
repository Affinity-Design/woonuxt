---
status: open
trigger: 'USD Aeon 80 Salvia shows $471.99 on category card, $258.99 on PDP, $639.99 in cart — three completely different prices for the same product'
created: 2026-04-13
updated: 2026-04-14
---

## Symptoms

expected: Same CAD price across category card, PDP, and cart for USD Aeon 80 Salvia Aggressive Inline Skates (slug: usd-aeon-80-salvia-aggressive-inline-skates, databaseId: 169786)
actual: Category card $471.99 CAD | PDP $258.99 CAD | Cart $639.99 CAD
errors: Authority API returns 502 for this product
reproduction: Visit /product-category/inline-skates, /product/usd-aeon-80-salvia-aggressive-inline-skates, and add to cart

## Evidence

- timestamp: 2026-04-13
  checked: Production GraphQL by SLUG
  found: `{"errors":[{"message":"No product ID was found corresponding to the slug: usd-aeon-80-salvia-aggressive-inline-skates"}],"data":{"product":null}}`
  implication: Product does not exist on production — it's test-only.

- timestamp: 2026-04-13
  checked: Production GraphQL by DATABASE_ID (169786)
  found: `{"errors":[{"message":"No product exists with the database_id: 169786"}],"data":{"product":null}}`
  implication: Neither slug nor databaseId exists on production. DATABASE_ID error has **different wording** than SLUG error.

- timestamp: 2026-04-13
  checked: server/api/authoritative-product-prices.post.ts isIgnorableAuthorityError regex
  found: Pattern is `/^No product ID was found corresponding to the /i` — matches SLUG error but NOT DATABASE_ID error ("No product exists with the database_id:")
  implication: SLUG lookups are silently ignored, but DATABASE_ID lookups cause a fatal 502.

- timestamp: 2026-04-13
  checked: Authority route chunking + Promise.all behavior
  found: When a chunk includes both SLUG and DATABASE_ID lookups for the same product, the DATABASE_ID fatal error causes `throw createError({statusCode: 502})`, which rejects the whole Promise.all, causing the entire authority API to 502.
  implication: ALL products in the same chunk lose their authority pricing when even one DATABASE_ID lookup fails.

- timestamp: 2026-04-13
  checked: Category page fallback (pages/product-category/[slug].vue)
  found: Catch block returns original products. ProductPrice component uses `convertToCAD(raw, rate, true)` with roundTo99=true.
  result: $339.97 USD → ~$471.99 CAD (product-level price, converted+rounded)

- timestamp: 2026-04-13
  checked: PDP fallback (pages/product/[slug].vue)
  found: Catch block returns original product. getFormattedPriceDisplay uses `convertToCAD(raw, rate)` WITHOUT roundTo99.
  result: Shows variation-specific price (35-39-40EU variation has different price), exact conversion → $258.99

- timestamp: 2026-04-13
  checked: Cart fallback (composables/useCart.ts → CartCard.vue)
  found: Catch block returns original cart. CartCard uses `formatAdvertisedCadPrice(raw, rate)` with roundTo99=true.
  result: Uses variation node prices, roundTo99 → $639.99

- timestamp: 2026-04-13
  checked: data/product-seo-meta.json local vs deployed
  found: LOCAL has price 460.99 CAD; DEPLOYED has 258.99 CAD (older build data)
  implication: SEO fallback would use wrong value until updated data is pushed

## Root Cause

The authority API's `isIgnorableAuthorityError` regex doesn't match DATABASE_ID error format from production GraphQL. This causes 502 for any product absent from production, triggering three DIFFERENT fallback conversion paths across category, PDP, and cart surfaces. Each surface uses different raw values (product-level vs variation-level) and different conversion options (roundTo99 vs exact).

## Fix Plan

1. **Widen `isIgnorableAuthorityError`** — Match both error formats: "No product ID was found corresponding to the X" AND "No product exists with the database_id: X"
2. **Push updated `product-seo-meta.json`** — Deploy correct $460.99 CAD value
3. **Verify all surfaces** — After fix, authority returns SEO fallback → already-CAD price → no conversion needed → consistent everywhere

## Files Changed

- server/api/authoritative-product-prices.post.ts (error pattern fix)
- data/product-seo-meta.json (updated CAD prices from latest build)

## Verification

- timestamp: 2026-04-13
  tool: scripts/test-pricing-consistency.js
  results: |
  3/3 products passed:
  ✓ usd-aeon-80-salvia-aggressive-inline-skates (SEO fallback) — Authority=315.99 CAD, PDP payload=315.99 CAD, PDP HTML=315.99, all 4 variation nodes=315.99 CAD
  ✓ powerslide-swell-bolt-3d-adapt-inline-boots (sale product) — Authority=124.99 CAD (client-rendered page, SSR checks skipped)
  ✓ powerslide-ubc-large-wheel-cover (regular product) — Authority=35.99 CAD (client-rendered page, SSR checks skipped)
  note: Production products render client-side only (no SSR product data in payload). Authority API is the single source of truth for these; the client fetches and overlays during hydration.

## Remaining Risk

1. **Stale KV cache** — Cloudflare KV caches product pages with 72h TTL. After deploy, previously-cached pages serve old prices until TTL expires or cache is warmed. Run `npm run warm-cache` after every deploy.
2. **Client-rendered products** — Most product pages don't SSR product data (only KV-cached products do). Client-rendered pages rely on the authority overlay running during `onMounted`. If the authority API is down, raw USD prices may slip through.
3. **Dead code in [slug].vue** — The `displayPrice` computed (line ~201) is never used in the template. The template uses `<ProductPrice>` component directly. This dead code is confusing but harmless.
4. **Dead file: [slug].vue.client** — `pages/product/[slug].vue.client` exists but is NOT loaded by Nuxt (wrong extension). It has NO authority overlay, so if it WERE loaded, it would show raw USD prices. Should be deleted.

## Regression Prevention

Automated test: `node scripts/test-pricing-consistency.js`

- Tests 4 products across source backend, authority API, PDP SSR payload, rendered HTML, and category payload
- NEW: Cross-backend comparison detects when test and production USD base prices diverge
- NEW: Category prerender staleness detection
- Handles both SSR and client-rendered pages
- Exits with code 1 on any pricing mismatch
- Can be added to post-deploy CI or run manually: `npm run test:pricing`

## 2026-04-14 — Backend Price Divergence (FR UFR Street Diako Diaby Skates)

### New Symptoms

- Category page: $497.99 CAD (stale prerender)
- Product page: $496.99 CAD (live authority)
- Checkout: $496.99 CAD
- Expected: $427.99 CAD (from test backend USD $309.97 × 1.3803)

### Root Cause: Source-of-Truth Split

Both WooCommerce backends have geo-conversion plugins that auto-convert USD→CAD in GraphQL responses.

| Backend    | Host                     | USD Base | CAD Output  |
| ---------- | ------------------------ | -------- | ----------- |
| Test       | test.proskatersplace.com | $309.97  | $427.99 CAD |
| Production | proskatersplace.com      | ~$359.97 | $496.99 CAD |

The authority API queries production (by design) and gets $496.99 CAD. This overwrites the correct $427.99
from the test backend. The $50 USD base price discrepancy causes a $69 CAD delta.

Category shows $497.99 (not $496.99) because the page was prerendered at build time with a stale exchange rate.

### Additional Finding: Aeon 80 SEO Fallback Stale

The SEO fallback for usd-aeon-80-salvia-aggressive-inline-skates returns $315.99 but the test backend
now returns $468.99 CAD. The SEO meta data needs rebuilding.

### Options to Fix

1. **Sync backend prices**: Update production to $309.97 USD (or test to $359.97) — eliminates divergence at source
2. **Skip authority when source already returns CAD**: Both backends geo-convert, so the authority overlay replaces one valid CAD price with another from a different base. If the source response is already CAD-tagged, the overlay is redundant for that product.
3. **Add priceAuthorityHost config**: Set `NUXT_PUBLIC_PRICE_AUTHORITY_HOST` to test.proskatersplace.com/graphql in the test environment so authority matches the source
4. **Rebuild SEO meta**: Run `npm run build-product-cache` to refresh product-seo-meta.json with current prices

### Test Evidence

```
node scripts/test-pricing-consistency.js (2026-04-14)
  FR UFR: FAIL — source=427.99, authority=496.99, category=497.99 (stale), PDP=496.99
  Aeon 80: FAIL — source=468.99, authority(SEO fallback)=315.99
  Swell Bolt: PASS — authority=123.99
  UBC Cover: PASS — authority=35.99
```
