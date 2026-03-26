# Brand Pages SEO Automation Plan

**Target:** proskatersplace.com WordPress backend (76 brand pages)  
**Source:** Scripts run from this Nuxt codebase via existing API connections  
**Data:** DataForSEO Labs API (live) + `wordpress/docs/proskatersplace.com-us-2026-02-27-full.csv` (5,920 rows, historical baseline)  
**Created:** Feb 27, 2026  
**Revised:** Feb 28, 2026 — All scripts built and tested on test site

---

## Current Status (Feb 28, 2026)

| Item                                          | Status                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| PHP mu-plugin (`psp-brand-content-field.php`) | ✅ Deployed to test + live                                      |
| Taxonomy confirmed                            | ✅ `pwb-brand` (Perfect WooCommerce Brands)                     |
| Phase 1 research scripts                      | ✅ All built and run                                            |
| Phase 2 optimizer (`optimize-brand-page.js`)  | ✅ Built, tested, pipeline confirmed                            |
| Rank Math meta saving                         | ✅ Confirmed via `rankmath_rest_meta` strategy                  |
| Brands optimized on test site                 | ✅ 6/76 (Micro, Rio Roller, SEBA, Chaya, NN Skates, SFR Skates) |
| Ready to promote to live                      | ⏳ Pending — run `--all` on test first, then swap `BASE_URL`    |

### What the mu-plugin does

`wordpress/mu-plugins/psp-brand-content-field.php` — required for the pipeline to work:

1. Registers `psp_brand_content` and `psp_brand_schema` as term meta with `show_in_rest: true`
2. Registers `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword` as term meta with `show_in_rest: true`
3. Renders `psp_brand_content` below the product grid via `woocommerce_after_shop_loop` (priority 20)
4. Outputs FAQPage JSON-LD from `psp_brand_schema` in `<head>` via `wp_head`
5. Suppresses the old Elementor text widget (`.elementor-widget-text-editor`) via CSS when `psp_brand_content` is set — prevents duplicate content rendering
6. REST diagnostic endpoints: `GET /psp/v1/brand-meta/{id}`, `DELETE /psp/v1/brand-meta/{id}/{key}`, `POST /psp/v1/brand-clear-old/{id}`
7. Admin edit screen fields: WYSIWYG for `psp_brand_content`, textarea for `psp_brand_schema`

### What `optimize-brand-page.js` writes

Per brand, the script writes 5 distinct things:

| Field                                  | Where                              | How                                                                    |
| -------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| Short description (2-3 sentences)      | `description` on the taxonomy term | `PUT /wp-json/wp/v2/pwb-brand/{id}`                                    |
| Full body content (400-600 words HTML) | `psp_brand_content` term meta      | `PUT /wp-json/wp/v2/pwb-brand/{id}` with meta                          |
| FAQPage JSON-LD string                 | `psp_brand_schema` term meta       | `PUT /wp-json/wp/v2/pwb-brand/{id}` with meta                          |
| Rank Math title (50-60 chars)          | `rank_math_title` term meta        | `PUT /wp-json/wp/v2/pwb-brand/{id}` with meta via `rankmath_rest_meta` |
| Rank Math description (150-160 chars)  | `rank_math_description` term meta  | Same                                                                   |

Old meta key `brand_content` is automatically cleared before each write via `/psp/v1/brand-clear-old/{id}`.

### Confirmed title/description lengths across test brands

| Brand      | Title (chars) | Description (chars) |
| ---------- | ------------- | ------------------- |
| Micro      | 58            | 156                 |
| Rio Roller | 59            | 155                 |
| SEBA       | 60            | 158                 |
| Chaya      | 54            | 151                 |
| NN Skates  | 51            | 159                 |
| SFR Skates | 54            | 155                 |

---

## Problem Statement (manual)

Brand pages at `proskatersplace.com/brand/{slug}/` are tanking in SEO. Previously owned top spots for Chaya, Powerslide, and others — now losing ground. 33 brand URLs appear in the rankings CSV, but most have thin content, missing meta, no schema, and massive keyword gaps. The Rollerblade brand page alone has 30+ keywords landing on the homepage instead of `/brand/rollerblade/`.

---

## API Connections

| Connection           | Env Vars                                      | Endpoint                         | Library                 |
| -------------------- | --------------------------------------------- | -------------------------------- | ----------------------- |
| WordPress REST API   | `WP_ADMIN_USERNAME` + `WP_ADMIN_APP_PASSWORD` | `/wp-json/wp/v2/`                | `node-fetch`            |
| WooCommerce REST API | `WC_CONSUMER_KEY` + `WC_CONSUMER_SECRET`      | `/wp-json/wc/v3/`                | `node-fetch`            |
| Gemini API           | `GEMINI_API_KEY` (= `GOOGLE_AI_API_KEY`)      | Google GenAI SDK                 | `lib/gemini.js`         |
| **DataForSEO API**   | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`    | `https://api.dataforseo.com/v3/` | **`lib/dataforseo.js`** |

Brand taxonomy endpoint: **confirmed `pwb-brand`** (Perfect WooCommerce Brands plugin). Script probed `/wp-json/` root index on Feb 27 and confirmed the endpoint as `/wp-json/wp/v2/pwb-brand`.

All scripts follow established pattern: `dotenv` + `node-fetch` + `--dry-run` + paginated batches + exponential backoff.  
Gemini calls use shared `wordpress/scripts/lib/gemini.js` (10 RPM, retry on 429/500/503).  
DataForSEO calls use shared `wordpress/scripts/lib/dataforseo.js` (30 RPM default, retry on 429/500/503, Basic auth).  
All new scripts live in `wordpress/scripts/`.

### DataForSEO Endpoints Used

| Endpoint                                                | Purpose                                   | Used In      | ~Cost/call |
| ------------------------------------------------------- | ----------------------------------------- | ------------ | ---------- |
| `/dataforseo_labs/google/ranked_keywords/live`          | All keywords a brand URL ranks for (live) | Scripts 1, 3 | $0.05      |
| `/dataforseo_labs/google/historical_rank_overview/live` | Ranking trajectory over time              | Script 1     | $0.05      |
| `/dataforseo_labs/google/keywords_for_site/live`        | Keyword ideas relevant to domain          | Script 3     | $0.05      |
| `/dataforseo_labs/google/related_keywords/live`         | Related searches from seed keyword        | Scripts 3, 4 | $0.05      |
| `/dataforseo_labs/google/keyword_suggestions/live`      | Long-tail keyword expansion               | Script 4     | $0.05      |
| `/on_page/instant_pages`                                | Single-page instant on-page audit         | Script 2     | $0.02      |
| `/keywords_data/google_ads/search_volume/live`          | Exact search volumes for keyword batches  | Script 3     | $0.05      |
| `/appendix/user_data`                                   | Check account balance before batch runs   | All scripts  | Free       |

**Estimated total API cost for all 70+ brands:** ~$8-15 USD (depends on how many keywords per brand).

---

## Phase 1 — Research & Current State

### Script 1: `wordpress/scripts/discover-brand-taxonomy.js` ✅ Built & Run

**Purpose:** Auto-discover and dump every brand page with **live ranking data from DataForSEO**. Foundation for all other scripts.

**API flow:**

1. **Check DataForSEO balance** via `checkBalance()` — log remaining credits, abort if < $1
2. `GET ${BASE_URL}/wp-json/` — parse root index to find the brand taxonomy REST route. Probe in order:
   - `/wp-json/wp/v2/brand` (custom taxonomy `brand`)
   - `/wp-json/wp/v2/pwb-brand` (Perfect Brands for WooCommerce)
   - `/wp-json/wc/v3/products/brands` (YITH / official WC Brands)
   - Fall back to parsing `routes` object from root index for any key matching `/brand/`
3. Once endpoint found, paginate `GET ${endpoint}?per_page=100&page={n}` — collect every term:
   - `id`, `name`, `slug`, `description`, `count` (product count), `link`
   - Any exposed meta fields (Yoast: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`; Rank Math: `rank_math_*`)
4. For each brand, fetch rendered page HTML via `GET ${BASE_URL}/brand/${slug}/` — extract:
   - `<title>` tag
   - `<meta name="description">`
   - `<h1>` content
   - Word count of visible content (strip HTML tags)
   - Presence of `application/ld+json` schema blocks
   - Presence of FAQ sections
   - OG image
5. **🆕 DataForSEO: Live ranked keywords** — for each brand URL, call `rankedKeywords()` (from `lib/dataforseo.js`):
   ```js
   const {rankedKeywords} = require('./lib/dataforseo');
   const data = await rankedKeywords(`proskatersplace.com/brand/${slug}/`, {
     locationCode: 2840, // US market
     limit: 200,
   });
   ```
   - Captures: every keyword the brand page ranks for, with live position, search volume, keyword difficulty, traffic estimate, search intent, SERP features, and AI overview references
   - **Replaces CSV matching** — live data instead of a static snapshot
6. **🆕 DataForSEO: Historical rank overview** — for brands appearing in the CSV, call `historicalRankOverview()` to get monthly ranking trajectory:
   ```js
   const {historicalRankOverview} = require('./lib/dataforseo');
   const history = await historicalRankOverview(`proskatersplace.com/brand/${slug}/`);
   ```
   - Shows how rankings have changed over time — confirms which brands are "tanking" vs stable
7. **Output:** `wordpress/data/brand-pages-raw.json` — full dump of all brands with:
   - Taxonomy data (id, name, slug, description, product count)
   - Page audit snapshot (title, meta, H1, word count, schema)
   - **Live keyword rankings** (from DataForSEO)
   - **Historical rank trend** (from DataForSEO)
8. **Console:** Total brands found, endpoint used, brands with 0 products, brands with declining rankings

**Flags:** `--dry-run` (log only, don't write file), `--limit=N`, `--output=custom-path.json`, `--skip-dataforseo` (use only WP REST, no API spend)

**DataForSEO cost:** ~$0.10 per brand (ranked keywords + historical) × 70 brands = **~$7**

**Run:**

```bash
node wordpress/scripts/discover-brand-taxonomy.js --dry-run
node wordpress/scripts/discover-brand-taxonomy.js
node wordpress/scripts/discover-brand-taxonomy.js --skip-dataforseo  # WP data only, no API spend
```

---

### Script 2: `wordpress/scripts/audit-brand-template.js` ✅ Built & Run

**Purpose:** Analyze the shared template rendering all brand pages — identify structural improvements that apply globally (theme-level fixes). **Uses DataForSEO OnPage API for automated technical audit.**

**API flow:**

1. Select 3 representative brand pages with different product counts (high/medium/low)
2. **🆕 DataForSEO: Instant on-page audit** — for each sample brand, call `onPageInstant()`:
   ```js
   const {onPageInstant} = require('./lib/dataforseo');
   const audit = await onPageInstant('https://proskatersplace.com/brand/chaya-skates/');
   ```
   Returns a comprehensive page analysis:
   - Title (length, contains keyword?), meta description (length, contains keyword?)
   - H1/H2/H3 tags and their content
   - Word count, content-to-code ratio
   - Schema.org markup detected
   - Internal/external link counts
   - Canonical URL, hreflang tags, noindex directives
   - Page load time, HTTP status
   - Duplicate title/description flags
3. **Also fetch rendered HTML** via `GET ${BASE_URL}/brand/{slug}/` for template-specific analysis:
   - **Template structure:** H1 = brand name? Description above/below product grid? Product listing format?
   - **Content blocks:** Description area, FAQ section, buying guide, "Why buy from us" block
   - **Internal linking patterns:** Breadcrumbs, related brands, category cross-links
4. Compare the 3 pages to identify what's **template-level** (identical across all brands) vs. **per-brand** (unique descriptions, etc.)
5. **Output:** `wordpress/data/brand-template-audit.json` — structured findings + template improvement recommendations. Includes both DataForSEO technical audit data and manual HTML analysis.
6. **Console:** Human-readable report summarizing top 5 issues affecting ALL brand pages (these are the theme-level fixes)

**DataForSEO cost:** ~$0.02 per page × 3 pages = **~$0.06**

**Flags:** `--dry-run`, `--brands=chaya-skates,powerslide,rollerblade` (override sample brands), `--skip-dataforseo` (manual HTML only)

**Run:**

```bash
node wordpress/scripts/audit-brand-template.js --dry-run
node wordpress/scripts/audit-brand-template.js
node wordpress/scripts/audit-brand-template.js --brands=luminous,seba,flying-eagle
```

---

### Script 3: `wordpress/scripts/build-brand-priority-list.js` ✅ Built & Run

**Purpose:** Build the prioritized master list using **DataForSEO as primary data source** (live keyword data) with CSV as historical baseline. The single source of truth for Phase 2.

**API flow:**

1. Load `wordpress/data/brand-pages-raw.json` (from Script 1 — already contains live DataForSEO ranked keywords + historical rank data)
2. **🆕 DataForSEO: Keyword discovery** — for each brand, find _opportunity keywords_ the brand page doesn't rank for yet:

   ```js
   const {relatedKeywords, keywordsForSite} = require('./lib/dataforseo');

   // Keywords related to seed (e.g., "chaya skates")
   const related = await relatedKeywords('chaya skates', {depth: 2, limit: 200});

   // Site-level keywords filtered by brand name
   const siteKws = await keywordsForSite('proskatersplace.com', {
     limit: 200,
     filters: ['keyword_data.keyword', 'like', '%chaya%'],
   });
   ```

3. **🆕 DataForSEO: Cannibalization detection** — compare DataForSEO ranked keywords:
   - If a brand-name keyword ranks on a _different_ URL (homepage, product, shop page) → flag as cannibalization
   - This is **far more accurate** than CSV matching because it's live SERP data with search intent labels
4. **Also parse CSV** — `wordpress/docs/proskatersplace.com-us-2026-02-27-full.csv` as historical baseline:
   - Compare CSV positions → DataForSEO live positions = detect rank changes since CSV date
   - Keywords that appeared in CSV but no longer rank = lost keywords
5. For each brand, compute:

   | Metric                       | Source           | Description                                                                                                       |
   | ---------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
   | **Ranking keywords**         | DataForSEO live  | All keywords where brand page is the ranking URL                                                                  |
   | **Lost keywords**            | CSV → DataForSEO | Keywords in CSV that no longer rank (rank tanking evidence)                                                       |
   | **Opportunity keywords**     | DataForSEO live  | Brand-name keywords where a _different_ URL ranks (cannibalization)                                               |
   | **Related keyword ideas**    | DataForSEO Labs  | Keywords from `relatedKeywords()` + `keywordsForSite()` the brand page _should_ target                            |
   | **Total addressable volume** | DataForSEO live  | Sum of search volume for all brand-name keywords                                                                  |
   | **Current traffic (est)**    | DataForSEO live  | Sum of estimated traffic value per keyword                                                                        |
   | **Traffic gap**              | DataForSEO live  | Volume from opportunity + related keywords not hitting the brand page                                             |
   | **Keyword difficulty avg**   | DataForSEO live  | Average KD of target keywords (lower = easier wins)                                                               |
   | **Search intent breakdown**  | DataForSEO live  | % commercial vs informational vs navigational                                                                     |
   | **Rank trend**               | DataForSEO hist  | Improving / declining / stable (from historical rank overview)                                                    |
   | **Content score**            | Script 1 audit   | Word count: `empty` = 0, `thin` < 200, `ok` ≥ 200                                                                 |
   | **SEO score**                | Script 1 audit   | Title optimized? Meta present? Schema markup? H1 correct?                                                         |
   | **Priority score**           | Computed         | `(totalVolume × 0.3) + (trafficGap × 0.25) + (lostKeywords × 0.15) + (contentGapPenalty × 0.15) + (lowKD × 0.15)` |

6. Sort brands by priority score descending
7. **Output (3 files):**

   - `wordpress/data/brand-master-list.json` — full structured data for every brand (keyword-level detail)
   - `wordpress/data/brand-master-list.csv` — spreadsheet version:

   ```
   Brand | Slug | URL | Products | Content Words | Top Keyword | Best Position | Total Volume | Est. Traffic | Traffic Gap | Lost Keywords | Avg KD | Intent Mix | Rank Trend | Content Score | SEO Score | Priority Rank
   ```

   - `wordpress/data/brand-keywords-full.json` — flat list of ALL keywords across all brands with DataForSEO metadata (for Script 4 prompt engineering)

8. **Console:** Top-20 priority brands in table format + total opportunity summary

**DataForSEO cost:** ~$0.15 per brand (related keywords + site keywords + search volume) × 70 brands = **~$10.50**  
_(Most data comes free from Script 1's ranked keywords calls; this script adds opportunity discovery.)_

**Flags:** `--dry-run`, `--csv=path/to/alternative.csv`, `--output-dir=path/`, `--skip-dataforseo` (use Script 1 data + CSV only)

**Expected priority order** (based on CSV analysis):

| #   | Brand            | Why                                                                                     |
| --- | ---------------- | --------------------------------------------------------------------------------------- |
| 1   | **Rollerblade**  | 1 keyword on brand page vs. 30+ on homepage; "rollerblade" = 9,900 vol                  |
| 2   | **Chaya Skates** | 12 keywords but pos 27 for "chaya" (9,900 vol) — massive upside                         |
| 3   | **Powerslide**   | pos 4 for "powerslide" (1,600 vol) but only 3 traffic; description likely thin          |
| 4   | **Luminous**     | 26 keywords, strong pos 1-2 rankings — protect + expand                                 |
| 5   | **Flying Eagle** | 11 keywords, pos 7 for main term (590 vol)                                              |
| 6   | **Seba**         | pos 10 for "seba skates" (480 vol); pagination issue `/page/2/`                         |
| 7   | **Fischer**      | pos 19 for "fischer" (14,800 vol) — volume massive but brand is general (skis + skates) |
| 8   | **USD Skates**   | 13 keywords, solid pos 3-5                                                              |

**Run:**

```bash
node wordpress/scripts/build-brand-priority-list.js --dry-run
node wordpress/scripts/build-brand-priority-list.js
```

---

## Phase 2 — The Fix Script

### Script 4: `wordpress/scripts/optimize-brand-page.js` ✅ Built & Tested (6/76 brands on test site)

**Purpose:** Single comprehensive script that accepts a brand slug (or `--all` / `--top=N`) and runs every optimization. Designed to be called individually per brand or batched.

**Usage:**

```bash
# Single brand — dry run
node wordpress/scripts/optimize-brand-page.js --brand=chaya-skates --dry-run

# Single brand — apply
node wordpress/scripts/optimize-brand-page.js --brand=chaya-skates

# Top 10 priority brands
node wordpress/scripts/optimize-brand-page.js --top=10 --dry-run
node wordpress/scripts/optimize-brand-page.js --top=10

# All brands in priority order
node wordpress/scripts/optimize-brand-page.js --all --dry-run
node wordpress/scripts/optimize-brand-page.js --all

# Skip content gen (meta only)
node wordpress/scripts/optimize-brand-page.js --brand=chaya-skates --skip-content

# Force re-process already-optimized brands
node wordpress/scripts/optimize-brand-page.js --all --force
```

**What it does per brand (sequential operations):**

#### Step 1 — Load context

Read `wordpress/data/brand-master-list.json` for the target brand's keyword data, current scores, and audit findings.

#### Step 2 — Fetch current state

`GET` the brand taxonomy term (description, meta, product count) and the rendered page HTML (current title, H1, word count).

#### Step 3 — Generate optimized content via Gemini

Using `lib/gemini.js` and prompt templates from `lib/brand-prompts.js`:

**SEO Title** (max 60 chars):

```
"{Brand} Skates & Gear | Official Retailer | ProSkaters Place"
```

Pattern: include primary keyword from master list (DataForSEO highest-volume keyword).

**Meta Description** (max 155 chars):
Include primary keyword + Canadian angle + CTA.

**🆕 DataForSEO-enhanced keyword targeting** — before generating content, pull the optimal keyword set:

```js
const {relatedKeywords, keywordSuggestions} = require('./lib/dataforseo');

// Get long-tail variations for content optimization
const related = await relatedKeywords(brand.primaryKeyword, {depth: 2, limit: 50});
const suggestions = await keywordSuggestions(brand.primaryKeyword, {limit: 50});

// Filter to commercial/transactional intent, KD < 50, volume > 10
const targets = [...related.items, ...suggestions.items]
  .filter((kw) => kw.keyword_data.keyword_info.search_volume > 10)
  .filter((kw) => kw.keyword_data.keyword_properties.keyword_difficulty < 50)
  .sort((a, b) => b.keyword_data.keyword_info.search_volume - a.keyword_data.keyword_info.search_volume)
  .slice(0, 15);
```

**Brand Description** (400-600 words, HTML):

> _"Write a 500-word brand page description for {brand} on ProSkaters Place Canada, a Toronto-based authorized retailer. Include: (1) Brief brand history/expertise (2) Why buy {brand} from ProSkaters Place (Canadian dealer, expert fitting, warranty) (3) Popular {brand} product lines we carry (reference: {top product names from WC API}) (4) 3-4 FAQ Q&As about {brand} in plain HTML. **Primary keyword: {DataForSEO highest-volume keyword}. Secondary keywords: {top 10 DataForSEO related keywords by volume}. Long-tail targets: {top 5 keyword suggestions}.** Search intent: {DataForSEO intent breakdown}. Use Canadian spelling. Do not start with the brand name."_

**FAQ section** (3-5 Q&As):
Separate Gemini call for structured FAQ items. **🆕 FAQ questions derived from DataForSEO data:**

- Informational-intent keywords from `relatedKeywords()` become FAQ questions
- "People also ask" style queries from `keywordSuggestions()`
- Questions that match SERP features flagged in DataForSEO ranked keyword data

#### Step 4 — Update taxonomy term

`PUT ${endpoint}/${termId}` with updated `description` field (the enriched brand page content).

#### Step 5 — Update SEO meta fields

**Confirmed working strategy:** `rankmath_rest_meta`

All 5 meta keys (`rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`, `psp_brand_content`, `psp_brand_schema`) are registered in the mu-plugin with `show_in_rest: true`, so they are written directly via the standard `PUT /wp-json/wp/v2/pwb-brand/{id}` request body under the `meta` key. No separate Rank Math API call needed.

Previous strategies (no longer used):

1. ~~Try Yoast: `meta: { _yoast_wpseo_title, _yoast_wpseo_metadesc }`~~ (not installed)
2. ~~Try `POST /wp-json/rankmath/v1/updateMeta`~~ (not needed — direct meta write via mu-plugin works)

#### Step 6 — Inject FAQPage schema

Append `<script type="application/ld+json">` FAQPage schema block to the description HTML, built from the generated FAQ Q&As.

#### Step 7 — Add "Authorized Retailer" badge

Prepend to description if brand is in the authorized list (configurable `AUTHORIZED_BRANDS` array):

```html
<p class="authorized-retailer"><strong>✓ Authorized Canadian Retailer</strong> — ProSkaters Place is an official {brand} dealer.</p>
```

#### Step 8 — Internal link injection

Fetch the brand's products via `GET /wp-json/wc/v3/products?brand={termId}&per_page=5` → inject product links into the description. Also link to relevant product categories (inline skates, roller skates, protective gear).

#### Step 9 — Log result

Append to `wordpress/data/brand-optimization-log.json`:

- Brand slug, timestamp, what was changed
- Before/after word count, before/after SEO score

**Batch mode (`--all` / `--top=N`):**

- Read `brand-master-list.json`, iterate brands in priority order
- Sleep 6s between Gemini calls (respects `lib/gemini.js` rate limiting)
- Sleep 300ms between WP REST writes
- **Resume-safe:** Skip brands already in `brand-optimization-log.json` (use `--force` to override)
- **Estimated run time:** ~5 min per brand (3 Gemini calls + REST writes) → ~6 hours for 70 brands

**Flags:** `--dry-run`, `--brand=slug`, `--all`, `--top=N`, `--force`, `--skip-content`, `--skip-schema`, `--batch=file.json`

---

## Supporting Files

### `wordpress/scripts/lib/dataforseo.js` ✅ Built

Shared DataForSEO API helper. Basic auth + rate limiting (30 RPM) + retry on 429/500/503.

| Export                     | Endpoint                                           | Purpose                                 |
| -------------------------- | -------------------------------------------------- | --------------------------------------- |
| `rankedKeywords()`         | `/dataforseo_labs/google/ranked_keywords`          | Get all keywords a URL ranks for (live) |
| `rankedKeywordsAll()`      | Same, paginated                                    | Auto-paginate to fetch all keywords     |
| `historicalRankOverview()` | `/dataforseo_labs/google/historical_rank_overview` | Ranking trajectory over time            |
| `keywordsForSite()`        | `/dataforseo_labs/google/keywords_for_site`        | Keyword ideas for a domain              |
| `relatedKeywords()`        | `/dataforseo_labs/google/related_keywords`         | Related searches for seed keyword       |
| `keywordSuggestions()`     | `/dataforseo_labs/google/keyword_suggestions`      | Long-tail keyword expansion             |
| `searchVolume()`           | `/keywords_data/google_ads/search_volume`          | Exact search volume for keyword batches |
| `onPageInstant()`          | `/on_page/instant_pages`                           | Single-page instant SEO audit           |
| `onPageTaskPost()`         | `/on_page/task_post`                               | Full site crawl (async)                 |
| `onPageSummary()`          | `/on_page/summary`                                 | Crawl progress/results                  |
| `onPagePages()`            | `/on_page/pages`                                   | Get crawled pages from task             |
| `checkBalance()`           | `/appendix/user_data`                              | Account balance + usage                 |
| `apiCall()`                | Generic                                            | Raw API call for custom endpoints       |

### `wordpress/scripts/lib/brand-prompts.js` ✅ Built

Prompt template functions kept separate from script logic (easy to iterate on prompts):

| Export                                              | Purpose                          |
| --------------------------------------------------- | -------------------------------- |
| `brandDescriptionPrompt(brand, keywords, products)` | Full 500-word description prompt |
| `brandFAQPrompt(brand, keywords)`                   | FAQ generation prompt            |
| `brandMetaPrompt(brand, primaryKeyword)`            | Title + meta description prompt  |

---

## Run Order (within existing automation plan)

Brand page scripts slot in after Tier 1 fixes and before product-level Tier 2 scripts:

```
 1. fix-media-alt-text.js              # ✅ Built — instant win
 2. fix-footer-menu.js                 # ✅ Built — instant win
 3. dedup-homepage-faq.js              # ✅ Built — instant win
 4. fix-shipping-threshold.js          # ✅ Built — confirm value first
 5. add-authorized-retailer-tag.js     # No dependencies
 6. create-author-profiles.js          # Before content scripts
 ──── BRAND PAGE AUTOMATION ────
 7. discover-brand-taxonomy.js         # Phase 1: discover all brands
 8. audit-brand-template.js            # Phase 1: template-level issues
 9. build-brand-priority-list.js       # Phase 1: prioritized master list
10. optimize-brand-page.js --top=10    # Phase 2: top 10 first
11. optimize-brand-page.js --all       # Phase 2: remaining brands
 ──── CONTINUE EXISTING PLAN ────
12. update-category-descriptions.js    # Category pages
13. build-roller-skates-hub.js         # Hub page
14. rewrite-product-descriptions.js    # Longest run — overnight
15. add-quick-answer-boxes.js          # Blog posts
16. inject-faq-schema.js              # After quick answers
17. create-redirects.js               # After Redirection plugin
18. create-topical-cluster.js          # Final — new posts
```

---

## Verification Checklist

### Phase 1 outputs

- [x] `brand-pages-raw.json` contains all brands — ✅ 76 brands discovered
- [x] `brand-master-list.json` + `brand-master-list.csv` generated — ✅ priority ranking confirmed
- [x] Spot-check 3 brand keyword matches against the raw CSV — ✅ done
- [x] Template audit identifies at least 3 structural issues — ✅ `audit-brand-template.js` run, findings in `brand-template-audit.json`

### Phase 2 dry-run ✅ Done

```bash
node wordpress/scripts/optimize-brand-page.js --brand=micro --dry-run
```

- [x] Prints generated content, SEO meta, FAQ schema — ✅ confirmed
- [x] Does NOT write to WordPress — ✅ confirmed

### Phase 2 test site ✅ In progress (6/76)

```bash
# Completed runs:
node wordpress/scripts/optimize-brand-page.js --brand=micro --force          # ✅ Feb 28
node wordpress/scripts/optimize-brand-page.js --top=6                         # ✅ Feb 28 (Rio Roller, SEBA, Chaya, NN Skates, SFR Skates)

# Next run — complete all brands on test:
node wordpress/scripts/optimize-brand-page.js --all
```

- [x] Micro: description renders, Rank Math title/desc confirmed, FAQPage schema in `<head>` — ✅
- [x] Rio Roller, SEBA, Chaya, NN Skates, SFR Skates — ✅ all 5/5 writes confirmed
- [x] Old `brand_content` meta auto-cleared on SEBA and Chaya — ✅
- [ ] Remaining 70 brands — run `--all` to complete

### Phase 2 production

- [ ] Complete all 76 brands on test (`--all`)
- [ ] Visual spot-check 3-4 brand pages on test site in browser
- [ ] Swap `BASE_URL` in `.env` to `https://proskatersplace.com`
- [ ] Run `--top=10` first on live, verify in browser
- [ ] Run `--all` on live, check `brand-optimization-log.json` for completion

### Theme follow-up (manual — after script runs)

- [ ] Remove Elementor widget `a622969` from brand archive template (the old description text widget — CSS-suppressed for now but should be deleted)
- [ ] Add CSS for `.psp-brand-content` styling in child theme (or Elementor custom CSS)
- [ ] Verify FAQ accordion renders correctly on mobile

---

## Scripts Build Checklist

| Script                         | Phase            | Est. Hours | Status                       | Notes                                                                   |
| ------------------------------ | ---------------- | ---------- | ---------------------------- | ----------------------------------------------------------------------- |
| `lib/dataforseo.js`            | Supporting       | —          | ✅ Built                     | —                                                                       |
| `lib/gemini.js`                | Supporting       | —          | ✅ Built                     | Shared rate-limited Gemini client                                       |
| `lib/brand-prompts.js`         | Supporting       | 1          | ✅ Built                     | Title 50-60 chars, desc 150-160 chars, FAQs with authorized dealer Q    |
| `discover-brand-taxonomy.js`   | 1 — Research     | 4          | ✅ Built & Run               | 76 brands found, `brand-pages-raw.json` written                         |
| `audit-brand-template.js`      | 1 — Research     | 3          | ✅ Built & Run               | `brand-template-audit.json` written                                     |
| `build-brand-priority-list.js` | 1 — Research     | 5          | ✅ Built & Run               | `brand-master-list.json` written, `--skip-dataforseo` flag used         |
| `optimize-brand-page.js`       | 2 — Fix          | 8          | ✅ Built — 6/76 done on test | Full pipeline confirmed; Rank Math meta via `rankmath_rest_meta` ✅     |
| `psp-brand-content-field.php`  | Supporting (PHP) | —          | ✅ Deployed                  | mu-plugin on test site; registers meta, renders content, REST endpoints |

**Build complete.** All scripts written.  
**Run progress:** 6/76 brands optimized on test site.  
**Remaining work:** Run `--all` to complete test site → promote to live.  
**DataForSEO spend to date:** ~$1-2 (Phase 1 runs used `--skip-dataforseo`; Phase 2 optimizer calls DataForSEO per brand for keyword targeting)

---

## Known Brand URLs from CSV (33 discovered)

| #   | Brand              | Slug                 | Keywords | Best Pos | Top Volume | Traffic |
| --- | ------------------ | -------------------- | -------- | -------- | ---------- | ------- |
| 1   | Chaya Skates       | `chaya-skates`       | 12       | 3        | 9,900      | ~82     |
| 2   | Luminous           | `luminous`           | 26       | 1        | 320        | ~59     |
| 3   | Flying Eagle       | `flying-eagle`       | 11       | 3        | 590        | ~48     |
| 4   | USD Skates         | `usd-skates`         | 13       | 3        | 110        | ~36     |
| 5   | Powerslide         | `powerslide`         | 12       | 3        | 1,600      | ~26     |
| 6   | NN Skates          | `nn-skates`          | 2        | 2        | 170        | ~22     |
| 7   | Seba               | `seba`               | 5        | 10       | 480        | ~12     |
| 8   | Ennui              | `ennui`              | 4        | 2        | 50         | ~10     |
| 9   | Adapt              | `adapt`              | 1        | 3        | 90         | 7       |
| 10  | Undercover Wheels  | `undercover-wheels`  | 1        | 4        | 90         | 5       |
| 11  | Fischer            | `fischer`            | 13       | 19       | 14,800     | ~4      |
| 12  | IQON               | `iqon`               | 4        | 6        | 260        | ~4      |
| 13  | Playlife           | `playlife`           | 1        | 5        | 210        | 2       |
| 14  | Dählie             | `daehlie`            | 7        | 5        | 210        | ~2      |
| 15  | FR Skates          | `fr-skates`          | 3        | 9        | 170        | ~1      |
| 16  | Summit Skiboards   | `summit-skiboards`   | 2        | 4        | 210        | ~1      |
| 17  | Toko               | `toko`               | 3        | 15       | 6,600      | ~1      |
| 18  | Swix               | `swix`               | 17       | 37       | 2,400      | ~0      |
| 19  | Rossignol          | `rossignol-ski`      | 9        | 18       | 140        | ~0      |
| 20  | Rollerblade        | `rollerblade`        | 1        | 14       | 30         | 0       |
| 21  | Mini Logo          | `mini-logo`          | 1        | 54       | 880        | 0       |
| 22  | Gawds              | `gawds`              | 1        | 35       | 140        | 0       |
| 23  | Micro              | `micro`              | 4        | 5        | 260        | 0       |
| 24  | Dream Wheels       | `dream-wheels`       | 2        | 51       | 40         | 0       |
| 25  | MyFit              | `myfit`              | 1        | 18       | 90         | 0       |
| 26  | Endless Blading    | `endless-blading`    | 2        | 7        | 140        | 0       |
| 27  | Twincam            | `twincam`            | 2        | 17       | 50         | 0       |
| 28  | Anarchy Aggressive | `anarchy-aggressive` | 1        | 41       | 480        | 0       |
| 29  | Epic Grindshoes    | `epic-grindshoes`    | 1        | 16       | 110        | 0       |
| 30  | REKD               | `rekd`               | 1        | 5        | 70         | 0       |
| 31  | Sidas              | `sidas`              | 1        | 20       | 480        | 0       |
| 32  | Lange Boots        | `lange-boots`        | 1        | 52       | 40         | 0       |
| 33  | Kizer              | `kizer`              | 1        | 94       | 30         | 0       |

**Note:** This is only brands appearing in the CSV. The full taxonomy likely has 70+ brands — Script 1 will discover all of them.

### Biggest Opportunity: Rollerblade

The Rollerblade brand page has **1 keyword** hitting `/brand/rollerblade/` ("rollar blade", pos 14, vol 30). Meanwhile, **30+ keywords** containing "rollerblade"/"rollerblades" rank on the homepage, product pages, or shop pages — including:

| Keyword                        | Pos | Volume | Currently Ranking URL  |
| ------------------------------ | --- | ------ | ---------------------- |
| rollerblade                    | 23  | 9,900  | homepage `/`           |
| best rollerblades              | 3   | 480    | homepage `/`           |
| rollerblade store near me      | 4   | 260    | homepage `/`           |
| rollerblades store near me     | 5   | 320    | homepage `/`           |
| rollerblade store              | 7   | 210    | homepage `/`           |
| rollerblades near me           | 23  | 1,000  | homepage `/`           |
| rollerblades aggressive inline | 18  | 1,900  | `/shop/inline-skates/` |

All of these should be captured by an optimized `/brand/rollerblade/` page.

---

## Environment Variables

```env
# Already in .env — no changes needed:
BASE_URL=https://proskatersplace.com      # Target WordPress site
WP_ADMIN_USERNAME=...                      # WP REST API auth
WP_ADMIN_APP_PASSWORD=...                  # WP REST API auth
WC_CONSUMER_KEY=...                        # WC REST API auth
WC_CONSUMER_SECRET=...                     # WC REST API auth
GEMINI_API_KEY=...                         # Or GOOGLE_AI_API_KEY — lib/gemini.js accepts both

# DataForSEO API — already configured
DATAFORSEO_LOGIN=...                       # Email used for DataForSEO account
DATAFORSEO_PASSWORD=...                    # API password (not account password)
# Dashboard: https://app.dataforseo.com/api-access
```

All API keys already configured. No new plugins required.
