# TODO — deferred issues from the FAQ/SEO price fix (2026-07-17)

Context: the product-page FAQ showed a different price than the product ($1.36 vs $1.99).
Fixed in this branch:

1. **FAQ price** — stale USD prices (`"US$0.97"`) in the runtime `cached-products` KV were
   converted without the `.99` round-up. FAQ/SEO now use `formatWooPriceForDisplay()`
   (verbatim CAD; USD-marked → same rounded conversion as ProductPrice.vue).
2. **Product SEO never reached SSR HTML** — `setProductSEO` ran in a non-awaited watcher and
   called `useHead` after an internal `await`. Now: `applyProductSEO()` (sync) runs during
   setup with data from `useAsyncData`. Canonical title, og/product/twitter metas, and
   Product/Breadcrumb/FAQ JSON-LD are in the server-rendered HTML.
3. **All JSON-LD rendered as empty `<script>` tags** — unhead v2 (Nuxt ≥ 3.16) removed the
   `children` prop. Replaced with `innerHTML` in useProductRichSnippets, useProductSEO,
   useCategorySEO, GlobalSEOSchema.vue, and nuxt.config.ts (the global Organization schema —
   this was the "mystery" empty ld+json visible in production SSR).
4. **Doubled brand in title** ("… | ProSkaters Place - ProSkaters Place") — product titles are
   already branded, so product pages now set `titleTemplate: null`.

The items below were found during that work and are deferred.

## High priority

- [ ] **Delete (or rebuild) the orphaned `cached-products` KV key on the test site.**
  Weekly builds do NOT refresh this: `build-products-cache.js`/`setup-script.js` write the
  key `products-list` in the `NUXT_SCRIPT_DATA` namespace, while the product page's fallback
  (`server/api/cached-product.ts`) reads a different key, `cached-products`, which **no build
  or deploy script writes**. It was seeded once by `server/api/products-search.ts`'s lazy
  GraphQL dump back when the backend served USD (that path uses `Gql*` in a server route,
  which crashes on Workers, so it can never re-seed itself in production). Production has no
  `cached-products` key at all (verified — prod always falls back to live GraphQL), so only
  the test environment serves the stale `"US$0.97"` data. Simplest fix: delete the key from
  the test site's KV; the page then behaves like production. Longer term: either wire
  `/api/cache-products` (secret-protected, currently has zero callers) into the deploy
  pipeline with converted prices, or remove this orphaned cache layer entirely.

- [ ] **Verify SEO output on the test site after deploy.**
  `curl` the product page and confirm the raw HTML now contains: the canonical
  `<title>... | Buy Online in Canada | ProSkaters Place` (single brand suffix),
  `og:`/`twitter:`/`product:` metas, and four populated `application/ld+json` scripts
  (Organization, Product with `offers.price` matching the visible price, BreadcrumbList,
  FAQPage matching the visible FAQ text). Purge/let expire the ISR route cache first —
  cached renders predate the fix. Then spot-check prices on product cards, product page,
  cart, and checkout per CLAUDE.md rule 12.

## Medium priority

- [ ] **Refactor `components/productElements/ProductPrice.vue` to use the shared
  `formatWooPriceForDisplay()` / `normalizeWooPriceText()` from `utils/priceConverter.ts`.**
  The component still carries its own private copy of the same logic; drift between the two
  copies is exactly what caused the $1.36 vs $1.99 mismatch. Behavior must stay identical
  (verbatim CAD, USD-marked → `.99`-rounded conversion, range/From handling).
  *(A background-task chip for this was created in the Claude session.)*

- [ ] **Audit category pages for the same price/schema issues.**
  `useCategorySEO.ts` got the `children` → `innerHTML` fix (its schemas were rendering as
  empty tags), but it was not restructured: if it applies schemas from an async path like the
  product page did, they still miss SSR HTML — apply the same
  `useAsyncData` + synchronous-apply pattern. Also check `useCategoryFAQs.ts` /
  `CategoryContent.vue` for price strings parsed with `parseFloat` (NaN on `"$1.99 CAD"`) or
  unconverted USD-marked prices. Verified locally: category SSR now emits 4 populated schemas
  (Organization, CollectionPage, ItemList, BreadcrumbList), but the category `<title>` still
  has the doubled brand ("… | ProSkaters Place - ProSkaters Place") — apply the same
  `titleTemplate: null` treatment there.

## Low priority / cleanup

- [ ] **`getDefaultFAQs()` fallback price parse is currency-blind**
  (`composables/useProductRichSnippets.ts`). When no `displayPrice` is passed it strips all
  non-numerics, so `"US$0.97"` would render as `$0.97 CAD`. Both current callers now pass
  `displayPrice`, so this is latent — consider routing the fallback through
  `cleanAndExtractPriceInfo` or removing it.

- [ ] **Dead branch in `convertSinglePriceToCADNumericString()`** (`utils/priceConverter.ts`):
  the `roundTo99` cents check has identical if/else return values — simplify to a single
  statement (no behavior change).
