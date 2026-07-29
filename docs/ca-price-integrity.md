# .ca Price Integrity — displayed price ≠ charged price

**Status: diagnosed, NOT fixed. Needs a business decision before shipping.**
Investigated 2026-07-29. This is the root cause behind the merchant-feed price workaround in [merchant-feed-ca.md](merchant-feed-ca.md).

## The finding in one line

**The storefront advertises a price it does not charge.** On the FR FR1 80: the product page says **$582.99**, checkout charges **$577.99**. The customer pays $5.00 less than advertised.

## Scale

| | |
| --- | --- |
| Products where displayed ≠ Woo's CAD price | **924 of 1,705 (54%)** |
| Direction | page is **higher** on 923 of 924 |
| Average gap | **+$1.78** |
| Largest gap | **+$8.00** (`fr-sl-speed-165-mount-inline-boots`, 929.99 → 937.99) |
| Gaps ≥ $2 / ≥ $3 / ≥ $5 | 363 / 181 / 51 |

## Why it happens

1. The Cloudflare Worker's server-side fetch to WPGraphQL receives **USD** prices (`"US$409.97"`), while the same query from a Canadian IP returns **CAD** (`"$577.99 CAD"`). Mechanism is almost certainly WP-side multicurrency geolocating the Worker's egress IP — reproducing it from outside failed (spoofing `CF-IPCountry`, `X-Forwarded-For`, `CF-Connecting-IP` and four currency cookies all still returned CAD). `CLAUDE.md` rule 3 already documents this symptom.
2. Seeing a `US$` marker, the frontend converts: `utils/priceConverter.ts` → `floor(409.97 × 1.42) + 0.99 = 582.99`.
3. **The cart never converts.** `convertToCAD()` short-circuits on CAD-marked strings, and the browser's own GraphQL session gets CAD. So checkout uses Woo's real total, 577.99.

Two compounding errors in the conversion:

- **Wrong rate.** The app uses `1.42`; Woo's own USD→CAD ratio for this SKU is `577.99 / 409.97 = 1.4098`.
- **Forced `.99` rounding.** `priceConverter.ts:74-84` — note both branches of the `if` return the identical expression, so the condition is dead code and the rule is unconditionally `floor(x) + 0.99`. That adds up to a further **+$0.98**.

The rate is currently frozen: `/api/exchange-rate` returns `source: "build-time-fallback", stale: true, error: "[unstorage] [cloudflare] Invalid binding NUXT_CACHE: undefined"`. **The `NUXT_CACHE` KV binding is unbound in production**, so the live FX fetch never lands and the displayed price is pinned to whatever `NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE` was at build (1.42).

## Why this matters more than the $5

**The sign is not pinned.** Which way the gap points is decided purely by whether the frontend's rate (1.42) exceeds Woo's implied rate (1.4098). Today it does, so we over-advertise and the customer is pleasantly surprised. If Woo's multicurrency rate is raised past 1.42 — or the KV binding is fixed and the live rate refreshes *downward* — every affected product starts advertising **less than it charges**, with no code change. That is the genuinely damaging direction: bait-and-switch exposure and Merchant Center disapprovals. Nothing in the codebase compares the two rates or guards the sign.

Also note: **fixing the KV binding alone would make this worse, not better.** It would unfreeze the rate and could flip the sign. The display logic must be fixed first.

## Recommended fix

**Stop converting; use WooCommerce's CAD price.** This is also what `CLAUDE.md` rule 12 and the "Currency & Price Formatting (CRITICAL)" section already mandate — the current behaviour violates the project's own stated rule.

Preferred: make the Worker's fetch receive CAD, so `convertToCAD()`'s existing `isCAD` short-circuit passes it straight through and every downstream surface self-corrects. Options, in order of preference:

1. Force the store currency on the WPGraphQL request from `server/utils/serverGetProduct.ts` (currency query param / cookie the multicurrency plugin honours — needs one test from a non-CA IP to confirm which signal works, since from a Canadian IP the baseline is already CAD and the test is inconclusive).
2. Forward the real client IP on that fetch (`server/middleware/forward-client-ip.ts` already computes it; `serverGetProduct.ts` does not forward it).
3. If neither works, keep converting but use Woo's own ratio and drop the forced `.99`.

**Revenue impact of fixing: none.** Checkout already charges the lower number, so correcting the display doesn't change a single transaction — it only makes the advertised price honest.

### Deploy ordering (important)

Any fix moves **every price on the site at once**, which immediately invalidates `data/merchant-feed-ca.json`. The feed must be rebuilt **in the same deploy**, or Merchant Center sees a feed-vs-landing-page mismatch across ~1,700 items. `npm run build-merchant-feed` is already wired into `npm run build`, so a normal deploy handles this — just don't push a price fix with a stale feed.

## Verified NOT broken (claims checked and rejected)

- `/sitemap.xml` → 301 to `/api/sitemap.xml`; `/api/sitemap.xml` → 200 `application/xml`; `/robots.txt` → 200 `text/plain`. Server routes are **not** shadowed in production. (`/merchant-feed.xml` 404s only because it is not deployed to prod yet.)
- Product JSON-LD price **matches** the visible price (both 582.99) — there is no schema-vs-visible mismatch penalty. The number is wrong, but it is consistently wrong.
- `data/merchant-feed-ca.json`: **1,699 / 1,699** items match the live page price exactly. The feed is correct today.

## Lower-priority items found alongside

- **`data/product-seo-meta.json` prices are 54% wrong** but **inert** — grep shows zero consumers of `seo.price`; only `title`, `description` and `image` are read. It ships in `__NUXT_DATA__` and is rendered nowhere. Drop the field or rebuild it from page prices.
- **Fallback precedence split:** `useProductRichSnippets.ts:50` uses `salePrice || price || regularPrice` while `ProductPrice.vue` and the PDP use `salePrice || regularPrice || price`. On a product with `price` but no `regularPrice`, schema and visible price take different fields.
- **`offers.price: "0.00"`** — `useProductRichSnippets.ts:51` does `parseFloat(... || '0')`, emitting a zero-price offer instead of omitting it. Guaranteed rich-result error rather than a silent skip.
- **`CartCard.vue:33` omits `roundTo99`** while `OrderSummary.vue:28` passes `true` — the same item can round differently in the cart line vs the order total.
- **`public/products-list.json`** is a 10-item demo file (classic-t-shirt $24.99…) publicly served at `/products-list.json`.
- **The cart total was inferred from code, not observed.** Confirming it requires a real add-to-cart against production, which was not run. Do that before acting.
