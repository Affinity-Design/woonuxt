# SEO Work Status — July 2026

Running status for the audit work on both properties. **Done** = shipped and verified live. **Ready** = code is merged and works, but needs an action outside this repo. **Queued** = specced, not built.

Audits: [.com](../docs/) (July 23), [.ca](ca-seo-audit-2026-07.md) (July 23). Kill lists: [.ca CWV](ca-cwv-kill-list.md), [.ca price integrity](ca-price-integrity.md), [merchant feed](merchant-feed-ca.md).

---

## ✅ Done — live and verified

| Item | Evidence |
| --- | --- |
| **Cross-domain hreflang repaired, both sides** | .ca emits one `en-ca`/`en-us`/`x-default` set per page with real `.com` URLs (product permalinks + `data/us-category-paths.json`); `.com` returns the matching `en-ca` tags via the plugin. Verified live on home/category/product on both domains. |
| **`psp-hreflang` plugin built, packaged, installed** | `wordpress/plugins/psp-hreflang/` + installable zip. Rank Math compatible. Validated 8/8 in real PHP (php-wasm) — correct clusters, staging host normalised out, no output on paginated/unmapped pages. Installed on .com prod and confirmed emitting. |
| **Duplicate/conflicting head tags removed** | Static hreflang + canonical cluster deleted from `nuxt.config.ts`; duplicate canonical removed from `useCategorySEO`. |
| **`fr-ca` hreflang dropped** | i18n is `no_prefix` — no French URLs exist, so the tag was declaring English pages as their own French alternate. |
| **Blog pipeline rehydrated** | `data/blog-rehydration-2026-07.md` — 8-topic queue from fresh DataForSEO CA data, plus a 3-post refresh list. `scripts/blog-keyword-research.js` re-runs it. |
| **2 posts published** | `/blog/roller-rinks-indoor-skating-canada` (~8.6K sv near-me/rinks cluster) and `/blog/how-to-roller-skate` (~960 sv how-to cluster). Both logged in `data/blog-keywords-used.md`. |
| **Canadian Merchant Center feed** | Generated from the .ca: 1,699 items, 100% `.ca` links, 67 real brands, real stock split. **1,699/1,699 match the live page price.** Replaces the Rex feed whose links all pointed at `.com`. |
| **One shared product harvest** | `scripts/lib/product-harvest.js` — sitemap + feed now share one GraphQL pass and one price pass. `build-sitemap.js` drops to 2.7s on a warm cache. |
| **Feed builds automatically** | Wired into `npm run build`; skips if <12h old, never blocks a deploy, uploads to KV so it refreshes without a redeploy. |
| **FX drift guard** | Build-time warning if the locked exchange rate falls below Woo's implied rate (the direction that would advertise less than we charge). |
| **Variable-product "Out of Stock" SSR bug fixed** | Every variable product server-rendered a red "Out of Stock" while its own JSON-LD said InStock — `activeVariation` is null during SSR. Now falls back to real product-level availability. |
| **Dev/backup pages removed from production** | Deleted `/test-graphql` (exposed the GraphQL query surface), `/privacy_new`, `/terms_backup`, `pages/backup/`, and 4 stale `.bac`/`.client` files. `privacy_new`/`terms_backup` 301 to the real pages. |
| **App shells noindexed** | `X-Robots-Tag: noindex` route rules for `/cart`, `/checkout`, `/my-account`, `/search` — all were 200 with the homepage canonical and no robots directive. |
| **Staging noindex middleware** | `server/middleware/noindex-non-production.ts` + host-aware `server/routes/robots.txt.ts` (static `public/robots.txt` deleted so the route can win). Any host that isn't `proskatersplace.ca` gets `noindex`. |
| **Category meta descriptions sanitised** | They were emitting ~825 chars of raw `<h2 class="…">` markup into meta/og/twitter/schema. |
| **Paginated categories self-canonical** | `?page=N` pointed at page 1, so Google dropped pages 2+ — taking the only crawl path to ~126 products in a large category. |

---

## 🟡 Ready — merged, but needs an action outside this repo

| Item | What's needed | Why it matters |
| --- | --- | --- |
| **Merchant Center feed** | Point MC → Products → Feeds → Canada at `https://proskatersplace.ca/merchant-feed.xml`, daily fetch. Then **pause the old Rex `cad` + `CAD Local Ads` feeds** once approved. | Until then Canadian Shopping clicks still land on the US store. Don't run both — they'd fight over the same products with different links. |
| **Staging lockdown, full coverage** | Add Cloudflare Access to the `testdev` Pages project, then request removal of `test.proskatersplace.ca` in GSC. | The middleware only covers Worker-routed paths. Cloudflare Pages serves ~99 prerendered paths (homepage, all blog posts, static pages) straight from static assets, so those bypass it. **A blanket rule in `public/_headers` would be wrong** — `_headers` has no host matching and `prod`/`testdev` share the file via master↔test merges, so it would deindex production. |
| **`.com` staging** | Same treatment for `test.proskatersplace.com` — currently indexed and ranking on brand queries. Origin is down (522), so it also can't be fixed from the WP side yet. | Duplicate of the US site in the index. |
| **www DNS for .ca** | `www.proskatersplace.ca` is NXDOMAIN. Add the record + a 301 to the apex. | Any www backlink or typed URL dead-ends instead of passing equity. |
| **GA4 ecommerce events** | Configure purchase + key events on property `491078255`. | The .ca has grown organic 31× YoY and measures **$0 revenue**. Every prioritisation decision after this is guesswork until it's fixed. |
| **Merchant feed hero images** | Agency image generation is out of Intelligence Credits. | `/blog/how-to-roller-skate` reuses an existing image rather than a bespoke hero. Fund credits to generate proper heroes. |

---

## 🔴 Queued — specced, not built

Ranked by expected impact.

### .ca

1. **CWV / CLS emergency** — [ca-cwv-kill-list.md](ca-cwv-kill-list.md). All 143 URL groups fail CWV on mobile *and* desktop, sole metric CLS > 0.25, and 128/143 share one homepage-exemplified bucket. Good URLs died ~May 16–20. Lab can't reproduce it (0 CLS on load, scroll and SPA nav), so **step 1 is instrumentation**: ship `web-vitals` attribution to GA4 and let real users name the shifting element. Prime suspect is the May-20 authoritative-price commits.
2. **Price integrity** — [ca-price-integrity.md](ca-price-integrity.md). Advertised ≠ charged on 54% of the catalogue (page $582.99 vs checkout $577.99 on the FR1). **Decision taken: keep the locked conversion, updated by hand** — fetching Woo's CAD at build time isn't viable. The FX drift guard now warns if the gap flips to the damaging direction. Revisit only if that warning fires.
3. **Crawlable pagination anchors** — page controls are `<button>` with no `href`. Self-canonical is done; the anchors are not. Until then Googlebot still can't walk past page 1.
4. **Image pipeline** — the blog hub ships **31.6 MB** of PNGs (one card is 5.9 MB). Convert `/images/**` to WebP at real breakpoints, set `max-age=31536000, immutable` (currently 4h), add width/height to blog cards (feeds CLS).
5. **Product schema quality** — brand says "ProSkaters Place" instead of the real brand; no `mpn`/`gtin`; images 530px. Real brand + mpn + 1200px unlocks merchant-listing eligibility.
6. **Per-variation feed items** — feed is parent-level (1,699). Sized goods convert better with `item_group_id` + `size`.
7. **`product-seo-meta.json` prices are 54% wrong** — but **inert** (zero consumers read `seo.price`). Drop the field or rebuild from page prices.
8. **Trailing-slash 301s** — both variants 200 on every product/category; canonical mitigates, crawl budget still splits.
9. **Local SEO** — NAP cleanup (Yelp still lists the closed Concord location), LocalBusiness schema, dedicated Toronto landing page. Competitors rank with dedicated Toronto pages; we rank with the homepage.
10. **6 more blog topics** in the rehydration queue + 3 refreshes (notably `inline-skating-guide`, which doesn't rank top-100 for a 4,400-sv term it's named after).

### .com

1. **Brand-page link repair** — all 69 AI brand pages inject `/product-category/…` links, a URL base that doesn't exist on .com; they 301 into blog archives that then cannibalise the money categories.
2. **Rank Math hygiene (~30 min)** — un-exclude the Inline Skates term from the sitemap, remove the dead `Sitemap: /sitemap.xml` line, add `Disallow: /*?add-to-cart=*`, drop `/uncategorized/` + `/sking/`, flush the 14-week-stale sitemap cache.
3. **34K Googlebot 403s** — find the WAF/bot rule blocking them.
4. **Translation footprint** — 73K crawled-not-indexed, dominated by `/es/` machine translations. Noindex properly (robots `Disallow` ≠ deindex).
5. **Reviews + merchant schema** — 673K impressions at 0.33% CTR on the main category; zero product reviews and review submission requires login.
6. **Mobile CLS** — 258 poor URLs, regressed mid-June, desktop clean.

---

## Known environment issues (not code)

- **`NUXT_CACHE` KV binding is unbound in production** — `/api/exchange-rate` returns `"error": "[unstorage] [cloudflare] Invalid binding NUXT_CACHE: undefined"`. Harmless while the FX rate is intentionally locked, but it also means the product cache isn't working. **Fixing it would unfreeze the rate and could flip the price gap to the damaging direction — read [ca-price-integrity.md](ca-price-integrity.md) first.**
- **`test.proskatersplace.com` origin is down (522)** — blocks every `testdev` Pages build (the July 18 deploy failed identically) and blocks staging the WP plugin.
- **Two .ca product pages return HTTP 500** — `micro-adult-shock-3-pack-protections-set`, `powerslide-one-basic-3-pack-protection-set`. Excluded from the feed.
- **`GOOGLE_AI_API_KEY` is invalid** in both `.env` files — `scripts/generate-blog-image.js` can't run.
- **Agency Intelligence Credits exhausted** — blocks image generation via MCP.
- **DataForSEO balance** ~$15.55 after the July research run.
