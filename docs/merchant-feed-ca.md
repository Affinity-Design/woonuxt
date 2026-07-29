# Canadian Merchant Center Feed (generated from .ca)

**Feed URL: `https://proskatersplace.ca/merchant-feed.xml`**

Point Merchant Center → Products → Feeds → *Canada / CAD* at that URL and set a **daily** scheduled fetch. It replaces the Rex Feed export (`cad`, post 175966) served from the .com WordPress backend.

## Why it was replaced

The Rex feed was broken in four ways that all suppressed Canadian Shopping performance:

| Defect | Evidence (2026-07-29) | Effect |
| --- | --- | --- |
| Every `<g:link>` pointed at **proskatersplace.com** | 9,774 `.com` URLs, zero `.ca` in the feed XML | Canadian Shopping clicks landed on the US store, then bounced through the geo-redirect. Merchant Center credited .com; the .ca measured only 210 Shopping sessions/28d vs the .com's 864 |
| `<g:brand>` was the literal string **"Shop"** on all 3,006 items | first item: `<g:brand><![CDATA[ Shop ]]></g:brand>` | No brand matching — invisible for "powerslide skates canada" and every other brand query |
| `<g:availability>` was `in_stock` for **every** item | 3,006/3,006 | Out-of-stock items kept being advertised → disapprovals and wasted clicks |
| No refresh interval | last updated 2026-07-01, audited 2026-07-29 | Four-week-old prices and stock |

## How the replacement works

```
scripts/build-merchant-feed.js   →  data/merchant-feed-ca.json  →  Cloudflare KV
                                                                        ↓
                                          server/routes/merchant-feed.xml.ts renders RSS 2.0
```

- **Catalogue metadata** (sku, brand, categories, images) comes from WPGraphQL.
- **Brand** comes from the **`pa_manufacturer`** product attribute — `pwb-brand`, the taxonomy that powers the .com's `/brand/` pages, is *not* exposed to WPGraphQL. Products with no `pa_manufacturer` fall back to `ProSkaters Place`.
- **Price and availability** are read from each **live .ca product page's Product JSON-LD**, not from GraphQL. This is deliberate — see below.
- The route reads KV first and falls back to the file bundled at build time, mirroring `server/api/sitemap.xml.ts`.

### Why price comes from the page, not GraphQL

Merchant Center disapproves items whose feed price differs from the landing page price. On this stack those two genuinely disagree for variable products:

| Product | WPGraphQL `price(format: RAW)` | Live page + JSON-LD |
| --- | --- | --- |
| Rollerblade Hydrogen Spectre wheels (simple) | 52.99 | **52.99** ✅ |
| FR FR1 80 Black (variable) | 577.99 | **582.99** ❌ |

The page renders a price converted from the USD base (409.97 × ~1.422), while WPGraphQL returns the native Woo CAD price. Sourcing from the page guarantees feed/landing-page parity by construction.

> **This mismatch is a real underlying bug worth fixing separately** — the storefront should render the native CAD price per the currency rules in `CLAUDE.md`. Until it is fixed, verify that what checkout charges matches the displayed price. The feed is correct either way, because it mirrors the page.

## Running it

```bash
GQL_HOST=https://proskatersplace.com/graphql npm run build-merchant-feed
```

Add `CF_ACCOUNT_ID`, `CF_API_TOKEN` and `CF_KV_NAMESPACE_ID_SCRIPT_DATA` to the environment and it also uploads to KV, which makes the new feed live **immediately without a redeploy**. Without those vars it just writes the file, which ships on the next deploy.

`--limit 25` runs a quick smoke test against a handful of products.

**Schedule it daily** (cron, CI, or the existing post-deploy script run) so price and stock stay fresh — that was the Rex feed's fatal flaw.

## Safety rails built in

- **Refuses to publish under 100 items.** A successful fetch with few/zero items tells Merchant Center the products are gone and delists the catalogue.
- **Aborts if pagination truncates.** WPGraphQL cursors terminate early without a stable `orderby` — an early run silently collected 351 of 1,707 products. The script now compares against the server's `found` count and fails if it collects under 95%.
- **Skips products whose page can't be read** rather than guessing a price. One missing item costs one listing; a mismatched price risks account-level disapproval.
- The route returns **503 rather than an empty feed** if data is missing, for the same reason.

## Known gaps / next steps

- **Parent-level items only** (~1,707). The Rex feed shipped variations as separate items (830 simple + 2,176 variations). For sized goods like skates, per-variation items with `item_group_id` + `size` convert better — worth adding once this feed is proven.
- **No GTINs** in the catalogue; items ship with `brand` + `mpn` and `identifier_exists: no` where either is missing.
- **Images are hosted on proskatersplace.com** (Woo uploads) and many are ~530px. Google prefers 1,200px+.
- Shipping is declared as a bare `CA / Standard` block; set real rates in Merchant Center account settings (free over $135 CAD).

## After you point Merchant Center at it

1. Fetch once manually and check the *Diagnostics* tab.
2. Expect some initial disapprovals for missing GTIN — normal for this catalogue, resolved by the `identifier_exists` signal.
3. **Delete or pause the old `cad` and `CAD Local Ads` Rex feeds** once this one is approved, so the two can't fight over the same products with different links.
