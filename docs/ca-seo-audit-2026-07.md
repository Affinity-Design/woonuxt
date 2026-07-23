# proskatersplace.ca — Full SEO Audit (July 23, 2026)

Same methodology as the .com audit run earlier today: GSC (16-month + drilldowns), GA4 (dedicated .ca property 491078255), 8-agent technical crawl of live pages, Canadian SERP spot-checks, and repo cross-references. Companion doc: [ca-cwv-kill-list.md](ca-cwv-kill-list.md) (the CLS emergency, tracked separately as task #9).

## Verdict

**The .ca is winning on content and momentum — organic is up 31× YoY — but it's flying blind (zero revenue tracking), throttled by a mid-May CWV collapse, structurally leaking crawl equity, and sitting on two flat-out embarrassing production leaks.** Fixing the P0 list below is mostly config-level work and directly compounds the growth that's already happening.

## The numbers

| Metric | Value | Read |
| --- | --- | --- |
| GSC 16-mo | 12.9K clicks / 480K impr / 2.7% CTR / pos 12.1 | Growth from ~0 (Nov 2025) to ~100 clicks/day |
| Growth curve | **Plateaued since mid-May** | Same window CWV flipped all-poor — likely connected |
| GA4 organic | 124 (Jun 2025) → 3,915 (Jun 2026) monthly sessions | 31× YoY, 69% engagement — genuinely strong |
| **GA4 revenue/key events** | **$0 / 0 — not configured** | The .ca measures nothing. All growth is unattributable |
| Organic Shopping | 210 sessions/28d (vs .com's 864 at 3.47% CR) | .ca Merchant Center feed underfed or absent |
| Indexing | 992 indexed vs 1.6K not (834 crawled-not-indexed, 179 soft-404, 318 discovered) | Half the catalog unindexed — duplicate-catalog effect the hreflang fix targets |
| Backlinks | 399 total; **394 from proskatersplace.com** | ~5 genuine external links. Rankings are pure content merit |
| Internal links | #1 most-linked page: **/my-account (2,597)** | Sitewide equity pointed at an account shell |
| CWV | 143/143 URL groups Poor (CLS) both devices | See kill list; prime suspect = May-20 price re-render |
| Brand CTR terms | "inline skates canada" 7.2%, "inline skates toronto" 10.1% | CA-modified content converts extremely well |
| SERP (US-indexed checks) | #2 "buy rollerblades canada", #3 "inline skates canada", #1 "best skate shop canada" (blog) | Page-1 presence on money terms with zero authority — ceiling is position 2-6 |

Manual actions / security: clean. Sitemap `/api/sitemap.xml`: healthy, 1,784 URLs, includes today's post (delete the dead 2015 `www` sitemap submission in GSC).

## P0 — fix this week (config-level, high leverage)

1. **Kill the staging duplicate (CRITICAL).** `test.proskatersplace.ca` is live, crawlable, indexed, robots-allow-all — a full duplicate of production. Fix once for all environments: server middleware emitting `X-Robots-Tag: noindex` whenever `host !== 'proskatersplace.ca'`, then GSC removal request. (The .com has the same problem with `test.proskatersplace.com` — task #8.)
2. **Remove dev/backup pages from production (CRITICAL).** `/test-graphql` (renders "GraphQL Testing Page" — exposes query surface), `/privacy_new`, `/terms_backup`, `/backup/checkout old` all 200 in prod. Delete `pages/test-graphql.vue`, `pages/privacy_new.vue`, `pages/terms_backup.vue`, `pages/backup/` (or guard with `import.meta.dev`), add 410/redirect routeRules.
3. **Fix the "Out of Stock" SSR bug on variable products (HIGH — revenue-facing).** 2/2 variable products SSR-render "Availability: Out of Stock" in red while every variation is IN_STOCK (JSON-LD correctly says InStock). Every crawler and first-paint user sees "Out of Stock" on most of the catalog. Likely the availability display reads the null selected-variation during SSR.
4. **Fix the backslash routeRules + calculator regression (HIGH).** `nuxt.config.ts` ~276-282 uses `'\contact'`, `'\terms'`, `'\privacy'`, `'\roller-skates-size-calculator'` — `\t` is a TAB escape; these rules never match. Live result: **the size calculator — the last high-impact SEO build — serves the homepage title + canonical → `/` and cannot rank**, and `/inline-skates-size-calculator` renders an empty shell instead of its configured 301.
5. **Strip HTML from category descriptions.** Category meta description/og/twitter/schema all carry ~825 chars of raw `<h2 class=...>` markup. Sanitize + truncate ~155 chars at the emit point.
6. **Make pagination crawlable.** Page controls are `<button>`s — no hrefs. ~126 of 150 inline-skates products have no crawl path from their category (sitemap-only discovery, no category link equity). Render real `<a href="?page=N">` anchors, make `?page=N` self-canonical with "– Page N" titles.
7. **Noindex the app shells.** `/cart`, `/checkout`, `/my-account`, `/search`, bare `/products` all 200 as homepage-canonical empty shells with no noindex; robots.txt's `Disallow: /checkout/` misses bare `/checkout`. Add `X-Robots-Tag: noindex` routeRules + fix robots patterns. Also stop the header/footer from making /my-account the most-linked page on the site (nofollow or de-link where possible).
8. **DNS + URL hygiene.** `www.proskatersplace.ca` is NXDOMAIN (add record + 301); trailing-slash variants of all 1,691 products return 200 with echo canonicals (site-wide 301 to no-slash); `/english/*` legacy URLs 404 while still indexed (301 map); legacy domain `skatingplace.ca` still indexed with brand content (redirect or remove).
9. **Turn on measurement (HIGH — strategic).** Configure GA4 ecommerce purchase events + key events on the .ca property. A store doing this much organic growth with $0 measured revenue can't prioritize anything rationally.
10. **Homepage schema + social cards.** Two conflicting Organization blocks (different names/logos/addresses) → keep one, upgrade to `SportingGoodsStore` with hours/geo; the canonical logo (`icon.png`) 404s; `og:image`/`twitter:image` are **relative URLs** sitewide (broken share previews on Facebook/iMessage/Slack) — absolute them in one composable.
11. **Title template fix** (chip already spawned): kills the double "| ProSkaters Place Canada - ProSkaters Place" on 100% of blog titles (109-char titles) and the stale "- WooNuxt" suffixes still showing in Google.

## P1 — this month

- **Image pipeline:** blog hub transfers **31.6MB** of PNGs (one card = 5.9MB); convert `/images/**` to WebP at real breakpoints, `max-age=31536000, immutable` (currently 4h), fix HEAD→404 on static assets, add width/height to blog cards (feeds CLS).
- **Product schema quality:** brand/manufacturer say "ProSkaters Place" instead of FR/Powerslide; no mpn/gtin; images 530px and hosted on .com. Real brand + mpn + 1200px images = merchant-listing eligibility.
- **Price integrity:** payload leaks `US$` base prices; displayed CAD is exchange-rate-derived with rounding drift between pages. Verify JSON-LD price === checkout price; source both from the same value. (Also the prime CLS suspect — overlaps task #9.)
- **Local SEO package:** NAP cleanup (Yelp still lists the CLOSED Concord location; Galaxy Blvd vs "Dufferin & Steeles" narratives), LocalBusiness/SportingGoodsStore schema, GBP link, and a dedicated Toronto landing page — competitors rank with dedicated Toronto pages while .ca ranks with its homepage.
- **Merchant Center for .ca:** the .com's free-listings channel converts at 3.47%; the .ca's is nearly empty (210 sessions). Feed the CAD catalog.
- **Reviews:** 3 Trustpilot reviews vs SkatePro's 700–1,400; scam-checkers own the reviews SERP. Post-purchase review flow referencing the .ca.
- **Edge caching:** product/category HTML is `cf-cache-status: DYNAMIC` every request (~1.4s TTFB for every Googlebot fetch of 1,691 products); fix the KV route-cache hit path or add a Cloudflare cache rule honoring the existing swr rules; fix the empty KV warmer lists; drop the 7-day *browser* cache on price-bearing category HTML (make it s-maxage).
- **Brand landing pages:** zero visibility on "powerslide skates canada" (skatepro.ca takes two slots) — PSP is an authorized dealer. Build .ca brand pages mirroring the .com's `/brand/` pattern that already ranks.
- **Sitemap lastmod:** 93 non-product URLs stamp today's date on every generation — emit real dates or Google discounts the (good) product timestamps.

## P2 — quarter

Authority from ~zero (5 real backlinks): Canadian listicle placements (torontoblogs.ca, superprof.ca, Yelp top-10), digital PR, GBP reviews. Blog cadence from the rehydration queue + subcategory interlinks + visible breadcrumbs. dateModified freshness pass on 2025 posts. fr-CA decision (og:locale claims French; nothing serves it — ship or strip). HSTS. Blog hreflang self-tags. Author E-E-A-T (named authors; drop the fake "professional skating instructor" credential on the team pseudonym — that's a trust liability).

## What's genuinely good (don't break it)

Complete SSR with real content and prices in raw HTML; correct self-canonicals; the hreflang cluster shipped today verified reciprocal on both sides; healthy sitemap; clean robots; #1–#6 rankings on Canadian money queries with almost no links; the blog earning page-1 slots ("best skate shop canada" #1); no penalties; strong homepage title/H1 targeting; fast homepage TTFB (0.16–0.46s).
