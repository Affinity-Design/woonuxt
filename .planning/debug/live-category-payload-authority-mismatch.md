---
status: diagnosed
trigger: 'Investigate the live test-site category payload mismatch for authoritative pricing and determine the most likely root cause. Local build output for /product-category/inline-skates contains corrected pricing, but live test deployment still serves a different _payload.json even after successful deploy and KV refresh.'
created: 2026-04-10T21:55:19.4885654-04:00
updated: 2026-04-10T22:01:31.7650919-04:00
---

## Current Focus

hypothesis: The strongest explanation is now that the live authority-pricing source itself is returning the stale price for this SKU, while product detail/local data are using a different cached product source with corrected pricing. The category payload is therefore reflecting a bad upstream authority response, not merely a stale prerender file.
test: Correlate the live /api/authoritative-product-prices response with the category page overlay path and the product page cached-product path.
expecting: If correct, the live authority API will be enabled and return the same stale price seen in the category payload, while local/generated cached product data show the corrected price.
next_action: Return ranked diagnosis with focus on source-of-truth divergence and suggest verifying which source local build used for the corrected artifact.

## Symptoms

expected: test.proskatersplace.ca category pages should reflect production-authoritative pricing consistently across product, category, and cart, matching the fixed local build output.
actual: live test deployment still serves an inline-skates \_payload.json with wrong/stale pricing data while product detail appears correct; Cloudflare test cache namespace is empty and script-data namespace contains fresh data.
errors: Build log summary reports only 8 non-fatal category overlay failures for three missing slugs unrelated to inline-skates. Cloudflare API access from local .env failed with auth error, so dashboard/build-log evidence is the available source of truth.
reproduction: Fetch https://test.proskatersplace.ca/product-category/inline-skates/_payload.json?verify=payload and inspect the product slug fr-ufr-street-diako-diaby-skates; compare with local dist/product-category/inline-skates/\_payload.json.
started: Began after pricing overlay changes were deployed to test on 2026-04-10. Local fixes validated, latest commit is e2cd254c on branch test.

## Eliminated

## Evidence

- timestamp: 2026-04-10T21:56:09.2993519-04:00
  checked: .planning/debug/knowledge-base.md
  found: No debug knowledge base file exists in this repository.
  implication: There is no prior resolved pattern to reuse; investigation proceeds from source and deployment evidence.

- timestamp: 2026-04-10T21:56:09.2993519-04:00
  checked: server/api/authoritative-product-prices.post.ts
  found: getAuthorityHost returns config.public.priceAuthorityHost if set, otherwise only falls back to https://proskatersplace.com/graphql when the configured source GraphQL host string includes 'test.'. If authorityHost is empty or normalizes to the same host as sourceHost, the API returns enabled:false with an empty products map.
  implication: A deployed environment with a non-test GQL host, missing public priceAuthorityHost, or matching authority/source host will silently disable authoritative pricing overlay.

- timestamp: 2026-04-10T21:56:09.2993519-04:00
  checked: pages/product-category/[slug].vue
  found: overlayAuthoritativeCategoryPrices posts slugs to /api/authoritative-product-prices and immediately returns the original products when authorityResponse.enabled is falsy or products are absent.
  implication: Category pages can render and prerender with stale source pricing without any hard failure or visible signal.

- timestamp: 2026-04-10T21:56:09.2993519-04:00
  checked: nuxt.config.ts
  found: /product-category/\*\* is configured with prerender:true and cache:{base:'cache'}, while Nitro prerender.routes includes categoryRoutesToPrerender.
  implication: Category pages produce static/prerender artifacts, so a mismatch between local dist output and live payload can come from build/deploy artifact selection even if Cloudflare KV route cache is empty.

- timestamp: 2026-04-10T21:56:09.2993519-04:00
  checked: pages/product/[slug].vue and composables/useCart.ts
  found: Product and cart pricing also call /api/authoritative-product-prices, but the product page starts from useCachedProduct/KV-backed product data while cart refreshes GraphQL cart state then overlays pricing.
  implication: Product detail and cart can diverge from category payload behavior because they are not sourced from the same prerendered category \_payload.json artifact.

- timestamp: 2026-04-10T21:59:00.0197902-04:00
  checked: https://test.proskatersplace.ca/product-category/inline-skates/_payload.json?verify=payload and data/category-routes.json
  found: The live response headers are 200 with Content-Type application/json, Cache-Control public,max-age=0,must-revalidate, cf-cache-status DYNAMIC, and the body includes prerenderedAt plus stale US pricing for fr-ufr-street-diako-diaby-skates. The route /product-category/inline-skates is explicitly present in data/category-routes.json.
  implication: The live endpoint is serving a prerendered category payload for inline-skates; the mismatch is in the published artifact or the build that produced it, not in the now-empty NUXT_CACHE namespace.

- timestamp: 2026-04-10T21:59:00.0197902-04:00
  checked: cloudflare-pages.toml, scripts/setup-script.js, scripts/build-categories-cache.js, scripts/build-sitemap.js, scripts/prebuild-cache-purge.js
  found: Cloudflare Pages publishes dist via npm run build. setup-script.js only regenerates routes and populates script-data keys. build-categories-cache.js writes categories-list into NUXT_SCRIPT_DATA, and build-sitemap.js uploads sitemap/product SEO metadata, not prerendered category payload JSON. prebuild-cache-purge.js clears SCRIPT_DATA and TEST_CACHE separately.
  implication: Fresh script-data KV and an empty test cache do not guarantee that the currently published category \_payload.json matches the local dist artifact; published prerender assets are a separate output path.

- timestamp: 2026-04-10T22:01:31.7650919-04:00
  checked: live POST https://test.proskatersplace.ca/api/authoritative-product-prices for fr-ufr-street-diako-diaby-skates
  found: The live endpoint returns enabled:true, authorityHost:https://proskatersplace.com/graphql, and the same stale US$359.97 pricing and rawPrice 359.97 values that appear in the live category payload.
  implication: This incident is not an enabled:false fallback on test. The category payload is reflecting the current live authority-pricing response, so the real mismatch is between the authority API source and the corrected pricing seen locally.

- timestamp: 2026-04-10T22:01:31.7650919-04:00
  checked: .env, pages/product/[slug].vue, data/products-list.json
  found: Local GQL_HOST is https://test.proskatersplace.com/graphql, the product page starts from useCachedProduct(), and data/products-list.json currently contains fr-ufr-street-diako-diaby-skates with corrected-looking CAD pricing 353.99/408.99.
  implication: Product detail can appear correct because it is seeded from cached product data, while category/cart overlays use the live authority API which currently resolves this SKU to stale production pricing.

- timestamp: 2026-04-10T22:07:15.0000000-04:00
  checked: composables/useCachedProduct.ts, server/api/cached-product.ts, server/api/cache-products.ts, scripts/build-products-cache.js, scripts/setup-script.js
  found: The PDP path reads /api/cached-product, which pulls from storage key cached-products. That key is written by server/api/cache-products.ts, while the build/setup path inspected here runs scripts/build-products-cache.js, which uploads products-list into script-data KV and does not write cached-products directly.
  implication: The repository currently has multiple product-data mechanisms. It is unsafe to assume the build's products-list upload is the same store feeding PDP cache reads, which further supports a source-of-truth split rather than a single stale cache explanation.

## Resolution

root_cause:
Most likely there is a source-of-truth split: the live category overlay path is using /api/authoritative-product-prices, which is enabled on test and currently returns stale production pricing for fr-ufr-street-diako-diaby-skates, while product detail/local generated data are using cached product data that already contain corrected pricing. That explains why live category payloads stay wrong even after deploy and KV refresh, while product detail can look correct.
fix:
verification:
files_changed: []
