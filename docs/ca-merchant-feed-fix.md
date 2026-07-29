# CAD Merchant Center Feed — Broken, and Costing the .ca Its Shopping Channel

**Found:** 2026-07-23 · **Where:** WordPress (.com backend) → Product Feeds (Rex Feed) → feed `cad` (`feed-175966.xml`)
**Fix location:** WordPress admin, not this repo. No code change required.

## The problem in one line

**The CAD feed advertises Canadian prices but sends every shopper to the US website.** All 3,006 items link to `proskatersplace.com`, zero to `proskatersplace.ca`.

## Verified evidence (fetched and parsed the live feed, 4.4 MB)

| Field | Value found | Should be | Impact |
| --- | --- | --- | --- |
| `<g:link>` | `https://proskatersplace.com/shop/...` — **3,006/3,006 items, 0 pointing at .ca** | `https://proskatersplace.ca/product/<slug>` | **Critical.** Canadians click a CAD listing and land on the US store, then get bounced by the geo-redirect. Merchant Center penalises redirecting landing pages, and every Shopping click is credited to .com. Explains .ca showing 210 Organic Shopping sessions/28d vs .com's 864. |
| `<g:brand>` | **`Shop` on all 3,006 items** | `Powerslide`, `FR Skates`, `Undercover`… | **Critical.** Brand is a primary matching key in Shopping. Every product is mis-branded, killing brand-query eligibility. (Same root defect as the .ca site's Product JSON-LD, which also emits the retailer as brand.) |
| `<g:availability>` | **`in_stock` on all 3,006 items** | real per-item stock | **High.** A 3,006-product catalogue with zero out-of-stock items is not credible; Merchant Center disapproves items whose availability contradicts the landing page. Feed has not refreshed since **2026-07-01** (refresh interval: none). |
| `<g:image_link>` | `http://` (not https) on all items | `https://` | Medium — mixed-protocol assets can fail image fetch. |
| `<g:gtin>` | **absent entirely** (0 items) | GTIN where known | Medium — no GTIN + wrong brand means almost no product-entity matching. |
| `<g:price>` | `70.95 CAD` ✓ | — | Correct. Currency is the one thing right. |

## Fix, in priority order

1. **Repoint `<g:link>` to the .ca** — in the Rex Feed config for `cad`, map the link field to the Canadian storefront URL (`https://proskatersplace.ca/product/<slug>`; the product slug is shared between both stores, which is exactly the mapping already proven in `wordpress/redirect-cad-traffic.php` and in the hreflang plugin). Same fix for **CAD Local Ads** (`feed-167453.xml`).
2. **Fix the brand field** — currently mapped to something yielding the literal `Shop` (looks like a category/taxonomy field). Remap to the product brand attribute (`pwb-brand`, the taxonomy the .com's `/brand/` pages use).
3. **Set a refresh interval** — `cad` and `CAD Local Ads` are set to *no refresh* and are 3+ weeks stale. The `US` feed is on Weekly; match it (daily is better for a store with live stock).
4. **Fix availability mapping** — it should read real stock status, not a constant.
5. **Switch image links to https**, add GTIN where available.
6. **Investigate the `US` feed's 123 products** vs 3,006 in every other feed — either an intentional curated subset or a broken filter. Worth confirming, since the US Shopping channel converts at 3.47%.

## Why this matters more than most of the SEO backlog

Organic Shopping (free listings) is the **highest-converting channel on the .com at 3.47%, ~3.6× organic search**. The .ca has essentially never had a working version of it. Fixing the link field alone redirects an entire high-converting channel to the correct storefront — and unlike content or link building, it takes effect as soon as Google re-crawls the feed.

## Verify after fixing

```bash
curl -sL https://proskatersplace.com/wp-content/uploads/rex-feed/feed-175966.xml | grep -o 'proskatersplace\.\(ca\|com\)' | sort | uniq -c
```

Expect the `.ca` count to dominate. Then check Merchant Center → Diagnostics for disapprovals clearing, and watch the .ca GA4 property's Organic Shopping channel.
