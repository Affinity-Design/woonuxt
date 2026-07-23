# .ca Core Web Vitals Kill List — CLS Emergency (July 2026)

**Status:** Every indexed .ca page fails CWV. GSC (2026-07-23): **143 URL groups Poor, 0 Good, 0 Needs-Improvement — on BOTH mobile and desktop.** Sole failing metric: **CLS > 0.25**. A fully-prerendered headless storefront should be near-100% green; this is the single biggest .ca SEO liability and it's page-experience ranking weight we're handing to competitors.

## The facts (don't re-litigate these)

1. GSC → Core Web Vitals → Mobile → "CLS issue: more than 0.25": 143 URLs. Desktop: identical. LCP/INP/FID: no reported issues.
2. **128 of 143 groups are one bucket exemplified by the homepage** → one sitewide layout-shift source, not per-template bugs.
3. **Timeline: URLs were Good until ~May 16–20, 2026, then everything flipped to Poor** and never recovered. Something that shipped in that window caused this.
4. Lab CANNOT reproduce on fast desktop (2026-07-23, Chrome, buffered `layout-shift` observer): homepage load = **0 CLS**, full scroll-through = 0, SPA route change (`router.push` home → category) = 0 entries. The shift only happens under real-user conditions (slow network/device, late-arriving data) — which is why nobody noticed.

## Prime suspect (investigate first)

**The May 20 "authoritative price" pipeline.** Commits at the exact inflection:

- `d4392a93` (05-20) "fix: render authoritative woo prices"
- `6541c869` (05-20) "fix: prefer authoritative price on cards"
- `bd0a34c9` / `04cf10a8` (05-20) Canadian GraphQL pricing context fixes

Mechanism to confirm: SSR/prerendered HTML renders one price; the client then fetches/derives the "authoritative" price and re-renders card price lines after hydration. If the swapped element changes box size — empty→value, regular→sale (second line / strikethrough), "US$…"→"$… CAD" width change — **every product card on every page shifts**, sitewide, both devices, worse on slow connections. Exactly matches the field/lab divergence and the date.

Check: `useExchangeRate` / price-formatting composables + product card components — diff SSR HTML price markup vs post-hydration DOM on a throttled load.

## Kill list (in order)

### 1. Instrument real-user CLS attribution — do this FIRST (half-day)
Lab can't repro, so stop guessing: add the [`web-vitals`](https://github.com/GoogleChrome/web-vitals) library (attribution build, ~2KB) as a Nuxt client plugin and send `CLS.attribution.largestShiftTarget` + value + page path to GA4 as events. Within days of deploy, real users name the exact shifting selector. This converts the whole investigation into a lookup.

### 2. Audit + fix the price re-render (the May-20 suspect)
Rule: **the SSR-rendered price box must be byte-identical or size-identical to the final client state.** Either render the authoritative price server-side (it's the same backend), or reserve the exact box (fixed line-height/min-width, sale-price line always present, `font-variant-numeric: tabular-nums`). No post-hydration price swaps that change geometry.

### 3. Reserve space for every async/below-fold section
Observed during scroll-through: whole viewports render blank, then fill (homepage sections, "Clearance Products" grid). Every lazily-mounted section needs a `min-height` skeleton matching final layout; product-card images need `aspect-ratio` boxes (the gray category-card placeholders are good — verify product grids match). Anything that mounts above the footer moves the footer = CLS for every user who scrolls.

### 4. Fonts
Verify webfonts use `font-display: swap` WITH `size-adjust`-matched fallbacks (or `optional`) so text doesn't reflow on slow connections. Cheap to check in devtools font panel; only matters if #1 fingers text nodes.

### 5. Re-validate with throttled lab + PSI
PSI API was quota-blocked today (unkeyed). Once available (or via Lighthouse in Chrome, Mobile + Slow 4G + 4x CPU): homepage, `/product-category/inline-skates`, one PDP, one blog post. Target CLS < 0.1 in throttled lab before trusting the fix.

### 6. Ship fix → GSC "Validate Fix" → watch the 28-day CrUX window
Field data trails by up to 28 days. Success = the mobile/desktop "Poor" line falling toward 0 and the Good line returning (it's been flatlined at 0 since May).

## Secondary CWV risks (not the current failure, but on the list)

- **Cold-page TTFB/LCP:** uncached long-tail pages render slow (observed today: `/product-category/roller-skates` timed out at 45s cold, then 200 on retry). The cache-warmer processes 0 products because the KV `products-list`/`categories-list` script-storage entries are empty — fix the setup-cache step so post-deploy warming actually walks the catalog. If CLS gets fixed but LCP degrades, this is why.
- **prod Pages project builds** pull GraphQL from the backend at build time; keep GQL_HOST pointed at the live backend (test origin is down and fails builds — testdev has been red since Jul 18).

## Context for whoever picks this up

- The .com has its own separate CLS problem (258 poor mobile URLs, regressed mid-June) — different stack (WP/Elementor), different fix, tracked in the July 2026 audit.
- Audit artifacts: GSC screenshots + this session's live measurements, 2026-07-23. Lab methodology: buffered `PerformanceObserver({type:'layout-shift'})` in-page; SPA nav via `$router.push`.
