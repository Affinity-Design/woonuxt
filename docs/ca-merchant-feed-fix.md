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

## How to fix it in Rex Feed (feed `cad`, post ID 175966)

Edit screen: `wp-admin/post.php?post=175966&action=edit`. It is a very heavy page (133 form controls + 3,006 products) — it repeatedly crashed the automation browser, so the steps below are written for a human driving the UI. Confirmed from the page before it died: the refresh control is the `rex_feed_google_schedule` select. Confirmed from the WP REST API: the brand taxonomy is **`pwb-brand`** (label "Brands", attached to `product`).

Each row in Rex Feed's attribute table is: **Google attribute** | **Prefix** | **Type** (Attribute / Static / Pattern) | **Value** | **Suffix**.

### 1. `link` → send shoppers to the .ca (the big one)

A plain domain find-replace will NOT work: the two stores use different path shapes
(`.com/shop/<cat>/<subcat>/<slug>/` vs `.ca/product/<slug>`). Rebuild the URL from the slug instead — the slug is shared between both stores (verified: 8/8 sampled `.com` product slugs resolve 200 on `.ca`).

On the `link` row set:
- **Prefix:** `https://proskatersplace.ca/product/`
- **Type:** Attribute
- **Value:** the product **slug** (may be listed as `Slug`, `post_name`, or `Product Slug`)
- **Suffix:** *(leave empty — the .ca canonical form has no trailing slash)*

If no slug attribute is offered, use Type = **Pattern** and compose `https://proskatersplace.ca/product/{slug}`.

Repeat for the **CAD Local Ads** feed (post 167453).

### 2. `brand` → `pwb-brand`

Currently emitting the literal string `Shop` on every item, which means it is mapped to a static value (or a field returning a constant). Change Type to **Attribute** and pick **Brands / `pwb-brand`** from the taxonomy group.

### 3. `availability` → real stock status

Emitting `in_stock` for all 3,006 items. Map it to the dynamic stock-status attribute rather than a static value.

### 4. Refresh interval

`rex_feed_google_schedule` is set to **No** on `cad`, `CAD Local Ads`, `EUROPE`, `MX`, `UK`. Set `cad` (and CAD Local Ads) to **Daily** — the `US` feed is already on Weekly, which is the pattern to beat, not match, for a store with live stock.

### 5. `image_link` → https

All image URLs are `http://`. If Rex Feed has no protocol setting, add a find-replace rule on that field (`http://proskatersplace.com` → `https://proskatersplace.com`).

---

## Worth considering: generate the feed from the .ca instead

The durable alternative is to stop depending on Rex Feed's mapping for the Canadian catalogue and emit the feed from the Nuxt app as a server route (the pattern already exists — `server/routes/sitemap.xml.ts`). That gives exact control over URLs, brand, availability and price, always matches what the .ca actually renders, and cannot drift from the storefront. Bigger build than the config fix; recommended once the config fix has proven the channel out.

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
