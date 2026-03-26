# ProSkaters Place — Master SEO Plan

**Site:** proskatersplace.com  
**Last Updated:** February 28, 2026  
**Overall Audit Score:** 62/100 — Needs Work (Feb 25, 2026 baseline)  
**1,000 Keywords Tracked (US, Semrush)** — Median position: 7.0 | Top-3 rankings: 336 (34%)

> **Source documents merged here:** `seo-for-root.md` (audit), `BrandPageSEO.md` (brand pipeline), `automation plan.md` (script registry)

---

## Status Dashboard

| Area                          | Status                | Detail                                                         |
| ----------------------------- | --------------------- | -------------------------------------------------------------- |
| **Tier 1 quick fixes**        | ✅ Done on live       | All 4 scripts run against proskatersplace.com                  |
| **Brand page optimizer**      | ✅ 69/76 done on live | 3,052 → 76,509 words; 342 FAQs; Rank Math meta + schema        |
| **Brand mu-plugin**           | ✅ Deployed to live   | `psp-brand-content-field.php` — powers brand content output    |
| **7 failed brands**           | ⏳ Retry needed       | CITYBUG, HX, Powell Peralta, THERM-IC, ZETAZS, King Song, CARV |
| **$99 shipping threshold**    | ⚠️ Manual fix needed  | Source is a global Elementor template — script can't reach it  |
| **Product descriptions**      | ❌ Not built yet      | Highest remaining ROI — 500+ manufacturer copy pages           |
| **Category descriptions**     | ❌ Not built yet      | Roller skates at position #47 on 60,500/mo keyword             |
| **Roller skates hub page**    | ❌ Not built yet      | Direct fix for position #47 disaster                           |
| **Quick Answer boxes**        | ❌ Not built yet      | 238 keywords trigger AI Overviews; site not cited              |
| **Author profiles / E-E-A-T** | ❌ Not built yet      | Zero author attribution on any blog post                       |
| **Intent mismatch redirects** | ❌ Needs plugin       | "Roller blades" (22k/mo) → cost article (wrong intent)         |
| **Topical cluster**           | ❌ Not built yet      | "How to rollerblade" at pos 34 (14,800 vol)                    |

---

## Part 1 — SEO Audit Findings (Feb 25, 2026)

### Scores by Category

| Category             | Score | Status        | Key Signal                                    |
| -------------------- | ----- | ------------- | --------------------------------------------- |
| Domain / History     | 8/10  | ✅ Good       | Established domain since 2020, trust building |
| Technical SEO        | 9/15  | ⚠️ Needs Work | Broken links, schema gaps, inconsistencies    |
| Content Quality      | 16/25 | ⚠️ Needs Work | Good blog volume, thin category/brand pages   |
| Keyword Optimization | 6/10  | ⚠️ Needs Work | Intent mismatches, position-47 disaster       |
| E-E-A-T Signals      | 12/20 | ⚠️ Needs Work | Reviews present, no author attribution        |
| AI / GEO Readiness   | 5/10  | ❌ Critical   | 23% AI Overview exposure, poor extractability |
| User Behaviour       | 6/10  | ⚠️ Needs Work | Shipping CTA inconsistency hurts conversion   |

**Total: 62/100**

### Top 5 Issues (Priority Order)

1. **"Roller skates" at position #47** — 60,500 monthly searches. The site's single most valuable commercial keyword. Root cause: no dedicated hub page with sufficient depth. Fix: `build-roller-skates-hub.js` + `update-category-descriptions.js`.

2. **Commercial keywords routing to informational pages** — "roller blades" (22,200/mo, pos 4) and "roller skate" (12,100/mo, pos 5) both rank for the cost article `/how-much-does-roller-skating-cost/`. High bounce guaranteed → NavBoost suppression over time. Fix: `create-redirects.js` (needs Redirection plugin).

4. **23% of keywords trigger AI Overviews — site not cited** — 238 queries Google answers directly. Fix: `add-quick-answer-boxes.js` + FAQPage schema + rewrite article openings to inverted-pyramid format.

5. **Broken footer link** — `skaterboards-and-longboards` typo (note: "skater**boards**"). ✅ **Fixed on live Feb 28, 2026.**

### Additional Audit Findings

**Technical:**

- Homepage H1 is "ProSkaters Place" — brand-only, no keyword signal in the strongest on-page slot
- Homepage title tag leads with "Best" — front-loads sentiment over keyword; low priority fix
- No Product, ReviewAggregate, or Organization schema detected on homepage or category pages

**Keyword portfolio:**
| Metric | Value |
| ---------------------- | --------- |
| Total keywords tracked | 1,000 |
| Median position | 7.0 |
| Average position | 19.1 |
| Positions 1–3 | 336 (34%) |
| Positions 4–10 | 257 (26%) |
| Positions 11–20 | 99 (10%) |
| Positions 21+ | 308 (31%) |

**Critical intent mismatches:**
| Keyword | Volume | Position | URL Ranking | Problem |
| ------------- | ------ | -------- | ----------------------------------- | ------------------------------------- |
| roller blades | 22,200 | 4 | /how-much-does-roller-skating-cost/ | Commercial query → informational page |
| roller skate | 12,100 | 5 | /how-much-does-roller-skating-cost/ | Commercial query → informational page |
| rollerblade | 9,900 | 23 | Mixed | Brand-name query under-served |
| penny board | 18,100 | 30 | Unknown | High-volume term far off page 1 |

**Low-hanging fruit (positions 4–20):**
| Keyword | Position | Volume | Priority |
| --------------------- | -------- | ------ | ------------------------ |
| roller blades | 4 | 22,200 | 🔥 Fix intent routing |
| inline skates | 14 | 14,800 | High |
| roller skate | 5 | 12,100 | 🔥 Fix intent routing |
| quad skates | 5 | 4,400 | High |
| speed skates | 5 | 4,400 | Medium |
| womens roller skates | 5 | 2,400 | Medium |
| inline skating | 12 | 2,900 | Medium |
| how to rollerblade | 34 | 14,800 | Build topical cluster |

**E-E-A-T gaps:**

- Zero author attribution on any blog post — no names, no bios, no skating credentials linked
- "450+ five-star reviews" only on About page — not surfaced on product/category pages
- No "Authorized Retailer" language on product pages despite being official dealer
- No first-person expert voice in any content

**AI visibility (23% keyword exposure):**

- No FAQPage or HowTo schema on blog content
- Article openings use curiosity hooks instead of inverted-pyramid direct answers
- No cited statistics, no comparison tables, no TL;DR boxes

---

## Part 2 — What's Been Done

### Tier 1 Quick Fixes — All Applied to Live (Feb 28, 2026)

| Script                      | Issue Fixed                        | Result on Live                                                        |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| `fix-footer-menu.js`        | `skaterboards` typo in footer/body | ✅ Fixed: homepage body, blog post 167168, Elementor meta             |
| `fix-media-alt-text.js`     | Brand logo alt text "Home 1/2/..." | ✅ Clean: 10,788 media items scanned, 0 "Home N" found                |
| `dedup-homepage-faq.js`     | Duplicate FAQ entry on homepage    | ✅ Clean: 90,502 chars scanned, 0 duplicates found                    |
| `fix-shipping-threshold.js` | $99 vs $150 inconsistency          | ⚠️ Partial: $99 is in global Elementor template — manual fix required |

### Brand Page Optimizer — 69/76 Brands Complete on Live (Feb 28, 2026)

Full pipeline: DataForSEO keywords → Gemini content generation → WordPress REST writes.

**Results:**

- **69 brands** fully optimized on proskatersplace.com
- **3,052 → 76,509 words** total across all brand pages (2,406% increase)
- **342 FAQ Q&As** generated with FAQPage JSON-LD schema
- All 69 brands: `metaUpdated: true`, `schemaUpdated: true`, Rank Math title/description set
- Average per brand: ~1,100 words of original content, 5 FAQs, authorized retailer badge

**Per brand what was written:**
| Field | Where |
| -------------------------------------- | ---------------------------------- |
| Short description (2-3 sentences) | `description` on taxonomy term |
| Full body content (~1,000 words HTML) | `psp_brand_content` term meta |
| FAQPage JSON-LD string | `psp_brand_schema` term meta |
| Rank Math title (50-60 chars) | `rank_math_title` term meta |
| Rank Math description (150-160 chars) | `rank_math_description` term meta |

**7 Failed brands** (all had `products: undefined` — likely inactive/empty taxonomy terms):
`CITYBUG` · `HX` · `Powell Peralta` · `THERM-IC` · `ZETAZS` · `King Song` · `CARV`

**Retry commands:**

```bash
node wordpress/scripts/optimize-brand-page.js --brand=citybug --force
node wordpress/scripts/optimize-brand-page.js --brand=hx --force
node wordpress/scripts/optimize-brand-page.js --brand=powell-peralta --force
node wordpress/scripts/optimize-brand-page.js --brand=therm-ic --force
node wordpress/scripts/optimize-brand-page.js --brand=zetazs --force
node wordpress/scripts/optimize-brand-page.js --brand=king-song --force
node wordpress/scripts/optimize-brand-page.js --brand=carv-ski --force
```

### Infrastructure Deployed

**`wordpress/mu-plugins/psp-brand-content-field.php`** — deployed to live WordPress:

- Registers `psp_brand_content`, `psp_brand_schema`, `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword` as term meta with `show_in_rest: true`
- Renders `psp_brand_content` below product grid via `woocommerce_after_shop_loop` (priority 20)
- Outputs FAQPage JSON-LD from `psp_brand_schema` in `<head>` via `wp_head`
- CSS suppresses old Elementor `.elementor-widget-text-editor` when `psp_brand_content` exists (prevents duplicate content)
- REST diagnostic endpoints: `GET/DELETE /psp/v1/brand-meta/{id}/{key}`, `POST /psp/v1/brand-clear-old/{id}`

---

## Part 3 — What's Been Built (Script Registry)

All scripts: `wordpress/scripts/` | Shared libs: `wordpress/scripts/lib/`

### Phase 1 — Research Scripts (All Complete)

| Script                         | Purpose                                        | Output                           | Status         |
| ------------------------------ | ---------------------------------------------- | -------------------------------- | -------------- |
| `discover-brand-taxonomy.js`   | Dump all 76 brand terms + live DataForSEO data | `data/brand-pages-raw.json`      | ✅ Built & run |
| `audit-brand-template.js`      | Analyse shared brand page template             | `data/brand-template-audit.json` | ✅ Built & run |
| `build-brand-priority-list.js` | Priority-ranked master list with scores        | `data/brand-master-list.json`    | ✅ Built & run |

### Phase 2 — Brand Optimizer (Complete)

| Script                   | Purpose                                             | Status                |
| ------------------------ | --------------------------------------------------- | --------------------- |
| `optimize-brand-page.js` | Full pipeline: DataForSEO + Gemini + WP writes      | ✅ Built — 69/76 done |
| `lib/gemini.js`          | Shared Gemini client (10 RPM, retry on 429/500/503) | ✅ Built              |
| `lib/dataforseo.js`      | Shared DataForSEO client (30 RPM, Basic auth)       | ✅ Built              |
| `lib/brand-prompts.js`   | Prompt templates for brand content generation       | ✅ Built              |

### Tier 1 — Quick Fixes (All Complete)

| Script                      | SEO Issue                     | Status                                                     |
| --------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `fix-footer-menu.js`        | `skaterboards` typo, 3 layers | ✅ Built — applied to live                                 |
| `fix-shipping-threshold.js` | $99 vs $150 across pages      | ✅ Built — partial (global Elementor template unreachable) |
| `fix-media-alt-text.js`     | Brand logo alt text "Home N"  | ✅ Built — confirmed clean on live                         |
| `dedup-homepage-faq.js`     | Duplicate FAQ on homepage     | ✅ Built — confirmed clean on live                         |

### Tier 2 — Content at Scale (Not Yet Built)

| Script                            | SEO Issue                                         | Est. Build | Priority                             |
| --------------------------------- | ------------------------------------------------- | ---------- | ------------------------------------ |
| `rewrite-product-descriptions.js` | 500+ products with manufacturer copy              | 5-6 hrs    | 🔴 Highest ROI                       |
| `update-category-descriptions.js` | Shallow category pages (roller skates at pos #47) | 3-4 hrs    | 🔴 High                              |
| `build-roller-skates-hub.js`      | No hub page for "roller skates" (60,500/mo)       | 4-5 hrs    | 🔴 High                              |
| `add-quick-answer-boxes.js`       | 238 AI Overview keywords not citing site          | 4-5 hrs    | 🟡 Medium                            |
| `create-author-profiles.js`       | Zero author attribution on blog posts             | 2-3 hrs    | 🟡 Medium                            |
| `add-authorized-retailer-tag.js`  | No authorized retailer signal on products         | 2 hrs      | 🟡 Medium                            |
| `inject-faq-schema.js`            | FAQPage schema absent from blog posts             | 4 hrs      | 🟡 Medium                            |
| `create-topical-cluster.js`       | "How to rollerblade" (14,800/mo) at pos 34        | 6-8 hrs    | 🟢 Quarter                           |
| `create-redirects.js`             | Intent mismatch: commercial → informational pages | 2 hrs      | 🟡 Medium (needs Redirection plugin) |

**Total remaining build estimate: ~35–40 hours**

---

## Part 4 — What Needs to Happen Next

### Immediate (This Week)

- [ ] **Push git to remote** — `git push origin test` (only committed locally at `68ac398`).
- [ ] **Visual spot-check brand pages** — Visit 3-4 live brand pages to confirm: content renders below products, FAQPage schema in `<head>`, no duplicate Elementor content.
- [ ] **Submit to Google Search Console** — Resubmit updated brand page URLs for the 69 optimized brands.

### Next Build Sprint (Highest ROI First)

1. **`rewrite-product-descriptions.js`** — Highest domain-wide ROI. Fixes `OriginalContentScore` drag across 500+ product pages. Every page gets unique copy. ~6h to build, run overnight.
2. **`update-category-descriptions.js`** — Directly addresses position #47 for "roller skates" (60,500/mo). Generates 400-word buying guides for shallow categories. ~3-4h.
3. **`build-roller-skates-hub.js`** — Dedicated hub page. Must follow category update. ~4-5h.
4. Install **Redirection plugin** in WP Admin (free, 5 min) → then build `create-redirects.js` to fix the intent mismatch routing for "roller blades" and "roller skate".
5. **`add-quick-answer-boxes.js`** — Prepends AI-extractable direct answer box to all blog posts. Targets 238 AI Overview keywords. ~4-5h.
6. **`create-author-profiles.js`** — Biggest E-E-A-T gain per hour. Adds named author attribution to all blog posts. ~2-3h.

### Manual Tasks (Cannot Be Scripted)

| Task                                  | Where                                   | Time    |
| ------------------------------------- | --------------------------------------- | ------- |
| Fix $99 → $150 in global Elementor    | WP Admin → Elementor → global templates | 15 min  |
| Install Redirection plugin            | WP Admin → Plugins → Add New            | 5 min   |
| Update homepage H1 to include keyword | WP Admin → Elementor (homepage)         | 10 min  |
| "Authorized Retailer" on About page   | WP Admin → Pages → About                | 15 min  |
| YouTube channel (long-term)           | External — human decision               | Ongoing |

---

## Part 5 — Technical Reference

### API Connections

| Connection           | Env Vars                                      | Endpoint                                         |
| -------------------- | --------------------------------------------- | ------------------------------------------------ |
| WordPress REST API   | `WP_ADMIN_USERNAME` + `WP_ADMIN_APP_PASSWORD` | `/wp-json/wp/v2/`                                |
| WooCommerce REST API | `WC_CONSUMER_KEY` + `WC_CONSUMER_SECRET`      | `/wp-json/wc/v3/`                                |
| Gemini API           | `GEMINI_API_KEY` (= `GOOGLE_AI_API_KEY`)      | Google GenAI SDK via `lib/gemini.js`             |
| DataForSEO API       | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`    | `api.dataforseo.com/v3/` via `lib/dataforseo.js` |

**Live site confirmed:** `BASE_URL=https://proskatersplace.com` | WP 6.9 | Auth: Paul Giovanatto

### Standard Script Pattern

```bash
# Always:
node wordpress/scripts/<script>.js --dry-run   # preview — no writes
node wordpress/scripts/<script>.js             # apply to current BASE_URL
node wordpress/scripts/<script>.js --force     # re-process already-done items
```

### Brand Taxonomy

- Plugin: Perfect WooCommerce Brands
- REST endpoint: `/wp-json/wp/v2/pwb-brand`
- 76 total brands | 69 optimized | 7 failed

### Key Data Files

| File                               | Contents                                              |
| ---------------------------------- | ----------------------------------------------------- |
| `data/brand-pages-raw.json`        | All 76 brands with WP term data + DataForSEO rankings |
| `data/brand-master-list.json`      | Priority-ranked list with opportunity scores          |
| `data/brand-optimization-log.json` | Per-run log for all 69 optimized brands               |
| `data/brand-template-audit.json`   | Template-level audit findings                         |
| `data/sitemap-data.json`           | All site URLs for internal linking                    |

### Cron / Ongoing Runs

Replace any Make/n8n triggers with direct OS cron:

```bash
# Nightly product description updates (new products only):
0 2 * * * node /path/wordpress/scripts/rewrite-product-descriptions.js --new-only

# Weekly brand re-check (after new brands added):
0 3 * * 1 node /path/wordpress/scripts/optimize-brand-page.js --all
```

---

## Part 6 — Complete Run Order

When building remaining scripts, run in this dependency order:

```
Already done:
  ✅ 1.  fix-media-alt-text.js
  ✅ 2.  fix-footer-menu.js
  ✅ 3.  dedup-homepage-faq.js
  ✅ 4.  fix-shipping-threshold.js         ← ⚠️ still needs manual Elementor fix
  ✅ 5.  optimize-brand-page.js            ← 69/76 done; 7 need retry

Still to build and run:
  ❌ 6.  add-authorized-retailer-tag.js    (no dependencies)
  ❌ 7.  create-author-profiles.js         (before content scripts — posts need author IDs)
  ❌ 8.  update-category-descriptions.js   (roller skates category — feeds hub page)
  ❌ 9.  build-roller-skates-hub.js        (after category content updated)
  ❌ 10. rewrite-product-descriptions.js   (longest run — execute overnight)
  ❌ 11. add-quick-answer-boxes.js         (all blog posts)
  ❌ 12. inject-faq-schema.js              (after quick answers in place)
  ❌ 13. create-redirects.js               (needs Redirection plugin installed first)
  ❌ 14. create-topical-cluster.js         (final — creates new posts)
```
