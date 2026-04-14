# Pricing Authority System

## Error Handling

- Production GraphQL returns TWO different error formats for missing products:
  - By SLUG: `"No product ID was found corresponding to the slug: xxx"`
  - By DATABASE_ID: `"No product exists with the database_id: xxx"`
- Both must be caught by `isIgnorableAuthorityError` — missing either causes 502 for the entire chunk
- Regex: `/^No product (ID was found corresponding to the|exists with the) /i`

## Fallback Chain

- Authority API → SEO fallback (product-seo-meta.json) → raw WooCommerce conversion
- SEO fallback produces CAD-tagged prices that pass through conversion untouched
- When authority 502s, each surface converts raw prices differently (roundTo99 vs exact, product-level vs variation-level)

## Price Conversion Paths (when authority overlay fails)

- **Category card (ProductPrice)**: `convertToCAD(raw, rate, true)` — roundTo99
- **PDP (getFormattedPriceDisplay)**: `convertToCAD(raw, rate)` — exact (no roundTo99)
- **Cart (CartCard)**: `formatAdvertisedCadPrice(raw, rate)` — roundTo99
- These diverge on the SAME raw price. Authority overlay must succeed to guarantee consistency.

## Test-Only Products

- Products that exist on test.proskatersplace.com but NOT on proskatersplace.com need SEO fallback
- Keep `data/product-seo-meta.json` in sync with latest build to ensure correct CAD values
- When pushing authority route fixes, also push updated SEO data if available

## Key Files

- `server/api/authoritative-product-prices.post.ts` — central authority lookup + SEO fallback
- `utils/authoritativePricing.ts` — overlay application logic
- `utils/priceConverter.ts` — raw USD→CAD conversion
- `utils/lifecyclePricing.ts` — cart/checkout price formatting
- `data/product-seo-meta.json` — build-generated CAD price fallback data
