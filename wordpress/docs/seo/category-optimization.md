# Category Page Optimization

SEO optimization for WooCommerce product category pages on proskatersplace.com.  
Modeled after the brand optimization pipeline — same Gemini + DataForSEO + WordPress REST API stack.

## Critical Live Note

As of 2026-04-07, the category automation pipeline is successfully writing category SEO content and meta into live WordPress term fields, but the public child theme is not yet rendering all of that data on category archive pages.

- Writing is working.
- Canonical category URLs are working.
- Public rendering of below-content, FAQ, and several head tags still depends on child-theme changes.

Implementation handoff and retest assets:

- `wordpress/docs/category-frontend-handoff-roller-skating-2026-04-07.md`
- `wordpress/docs/category-frontend-retest-checklist.md`
- `wordpress/psp-category-archive-seo-child-theme-reference.php`

## Prerequisites

1. **Install the mu-plugin** — copy `wordpress/mu-plugins/psp-category-content-field.php` to `wp-content/mu-plugins/` on the WordPress server
2. **Environment variables** — same `.env` as brand optimization (`BASE_URL`, `WP_ADMIN_USERNAME`, `WP_ADMIN_APP_PASSWORD`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`, `GEMINI_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`)

## Quick Start (First Batch of 5)

```bash
# 1. Build the priority-ranked category master list
node wordpress/scripts/discover-category-taxonomy.js

# 2. Preview the top 5 categories (no writes)
node wordpress/scripts/optimize-category-page.js --top=5 --dry-run

# 3. Apply changes to the top 5
node wordpress/scripts/optimize-category-page.js --top=5
```

## Scripts

| Script                          | Phase            | What it does                                                                                                |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `discover-category-taxonomy.js` | 1 (read-only)    | Fetches all categories from WP, enriches with DataForSEO keywords, outputs `data/category-master-list.json` |
| `optimize-category-page.js`     | 2 (writes to WP) | Generates content via Gemini, writes description + below-content + FAQ schema + Rank Math meta              |

## What Gets Updated Per Category

| WP Field                  | Content                                                      | Location                         |
| ------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `description`             | Short intro (80–120 words)                                   | Above product grid               |
| `second_desc`             | Full SEO content (400–600 words) + FAQ HTML + internal links | Below product grid (Shoptimizer) |
| `psp_cat_schema`          | FAQPage JSON-LD                                              | `<head>` via `wp_head`           |
| `rank_math_title`         | SEO title (50–60 chars)                                      | Rank Math                        |
| `rank_math_description`   | Meta description (150–160 chars)                             | Rank Math                        |
| `rank_math_focus_keyword` | Target keyword                                               | Rank Math                        |
| `name`                    | Category display name (if a higher-volume keyword fits)      | WP taxonomy                      |

## Flags

```bash
# Target selection (pick one)
--category=inline-skates   # Single category by slug
--top=5                    # Top N by priority score
--batch=cats.json          # JSON file of slugs
--all                      # All categories

# Modes
--dry-run                  # Preview only, no WordPress writes
--force                    # Re-process already-optimized categories

# Skip options
--skip-content             # Update meta only (no Gemini content gen)
--skip-schema              # Skip FAQ schema
--skip-dataforseo          # Use master list keywords (no live API calls)
--skip-rename              # Don't suggest/apply category name changes
```

## Examples

```bash
# Single category dry run
node wordpress/scripts/optimize-category-page.js --category=roller-skates --dry-run

# Batch file
echo '["inline-skates","roller-skates","protective-helmets"]' > batch.json
node wordpress/scripts/optimize-category-page.js --batch=batch.json --dry-run

# All categories, skip name changes, use cached keywords
node wordpress/scripts/optimize-category-page.js --all --skip-rename --skip-dataforseo

# Re-run a specific category
node wordpress/scripts/optimize-category-page.js --category=inline-skates --force

# Discovery without DataForSEO (fast, just fetches WP data)
node wordpress/scripts/discover-category-taxonomy.js --skip-dataforseo
```

## How Priority Scoring Works

Categories are ranked by:

- **Product count** (40%) — more products = more impact
- **Keyword volume** (30%) — higher search volume = more opportunity
- **Content gap** (20%) — categories with little/no existing content score higher
- **Top-level bonus** (10%) — parent categories get a boost

Utility categories (`uncategorized`, `clearance-items`, `discount-products`, `new-arrivals`) are auto-skipped unless `--force` is used.

## Timing & Costs

- **~35 seconds per category** (5 Gemini calls + DataForSEO + WP writes)
- **Gemini**: 5 calls per category (meta, short desc, below content, FAQs, name suggestion)
- **DataForSEO**: 2-3 calls per category (~$0.10–0.15)
- **Resume-safe**: logs each category to `data/category-optimization-log.json` — re-running skips completed ones

## Output Files

| File                                  | Purpose                                         |
| ------------------------------------- | ----------------------------------------------- |
| `data/category-master-list.json`      | Priority-ranked category list with keyword data |
| `data/category-optimization-log.json` | Execution log (resume-safe, append-only)        |

## Verification Checklist

After running on a batch:

1. Visit 2–3 category pages in browser — confirm above/below content renders
2. Check WordPress admin → Products → Categories → edit a category — confirm description saved
3. View page source — confirm `<script type="application/ld+json">` FAQPage schema in `<head>`
4. Check Rank Math panel on category edit screen — confirm title, description, focus keyword
5. If name was changed — confirm slug is unchanged, only display name updated
6. Submit updated URLs to Google Search Console
