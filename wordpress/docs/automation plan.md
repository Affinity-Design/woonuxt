# WordPress SEO Automation Plan

**Target:** proskatersplace.com WordPress backend  
**Source:** Scripts run from this Nuxt codebase via existing API connections  
**Audit reference:** `wordpress/docs/seo-for-root.md` (Feb 25, 2026)  
**Updated:** Feb 27, 2026

---

## API Connections Available

All scripts use credentials already in `.env` — no new auth setup:

| Connection           | Env Vars                                      | Endpoint            | Capability                                   |
| -------------------- | --------------------------------------------- | ------------------- | -------------------------------------------- |
| WooCommerce REST API | `WC_CONSUMER_KEY` + `WC_CONSUMER_SECRET`      | `/wp-json/wc/v3/`   | Read/write products, categories, settings    |
| WordPress REST API   | `WP_ADMIN_USERNAME` + `WP_ADMIN_APP_PASSWORD` | `/wp-json/wp/v2/`   | Read/write pages, posts, media, users, menus |
| WPGraphQL (admin)    | `GQL_HOST` + same app password                | `GQL_HOST`          | Admin-authed mutations                       |
| Claude API           | `CLAUDE_API_KEY` (add to .env)                | `api.anthropic.com` | Content generation, rewrites                 |

Script pattern: follow `scripts/build-products-cache.js` — `require('dotenv').config()`, `node-fetch`, paginated batches, exponential backoff, `--dry-run` flag on every script.  
All new scripts live in `scripts/wordpress/` to separate from build scripts.

---

## What CAN Be Done by Scripts from Here

### TIER 1 — Quick fixes, no content generation (build these first)

#### `scripts/wordpress/fix-footer-menu.js`

**SEO task:** Broken footer link — `skaterboards-and-longboards` typo (bleeds PageRank, crawl errors)  
**API:** `GET /wp-json/wp/v2/menu-items` → find items where `url` contains `skaterboards` → `PATCH` each with corrected slug. Also `GET /wp-json/wp/v2/pages?search=skaterboards` to patch any in-page body copies.  
**Effort:** 2-3 hours

---

#### `scripts/wordpress/fix-shipping-threshold.js`

**SEO task:** $99 vs $150 free shipping inconsistency across site — trust destroyer, bounce signal  
**API:**

- `GET /wp-json/wc/v3/settings/general` to read WooCommerce free shipping floor
- `GET /wp-json/wp/v2/widgets` to find and patch header/banner widgets
- `GET /wp-json/wp/v2/pages` text-search both values, patch each page's content
- `GET /wp-json/wc/v3/shipping/zones` for zone-level overrides  
  **Prerequisite:** Confirm the correct threshold ($99 or $150) before running — hardcode in script config  
  **Output:** Full audit of every instance found before writing anything  
  **Effort:** 3-4 hours

---

#### `scripts/wordpress/fix-media-alt-text.js`

**SEO task:** Brand logos have alt text "Home 1", "Home 2" — misses brand entity association  
**API:** `GET /wp-json/wp/v2/media?per_page=100&search=home` → filter alt text matching `/^Home \d+$/` → `POST /wp-json/wp/v2/media/{id}` with correct brand name  
**Note:** Requires one manual mapping pass to confirm which file = which brand before running  
**Effort:** 2 hours

---

#### `scripts/wordpress/dedup-homepage-faq.js`

**SEO task:** "Are roller skates better tight or loose?" appears twice on homepage — dilutes contentEffort signal  
**API:** `GET /wp-json/wp/v2/pages?slug=home` → parse Gutenberg block serialized HTML → remove second occurrence of the duplicate FAQ block → `PUT` updated content  
**Effort:** 2-3 hours

---

### TIER 2 — Content at scale using Claude API (highest ROI)

#### `scripts/wordpress/rewrite-product-descriptions.js`

**SEO task:** Hundreds of products running manufacturer copy — worst `OriginalContentScore` drag on the domain. This is the single highest-ROI script. One run fixes 500+ pages; then runs on every new product.  
**API flow:**

1. `GET /wp-json/wc/v3/products?per_page=100&page={n}` — paginate all products
2. Heuristic: skip descriptions that already mention "ProSkaters" — these are already customized
3. POST to Claude API:
   > _"Rewrite this product description in the voice of ProSkaters Place Canada — a Toronto-based expert skate shop. Add: (1) a unique skating expertise angle, (2) a Canadian sizing/shipping note, (3) who this skate is best for. Keep under 200 words. Do not start with the product name. Original: {description}"_
4. `PUT /wp-json/wc/v3/products/{id}` with `{ "description": rewrittenContent }`

**Flags:** `--dry-run`, `--limit=50`, `--force` (overwrite already-customized)  
**Rate:** 1 req/sec to avoid Claude throttle  
**Effort:** 5-6 hours to build; ~2 hours to run across 500 products

---

#### `scripts/wordpress/update-category-descriptions.js`

**SEO task:** Roller skates category pages too shallow — explains "roller skates" at position #47  
**API flow:**

1. `GET /wp-json/wc/v3/products/categories` — list all categories
2. For shallow categories (under 300 words), generate via Claude:
   > _"Write a 400-word WooCommerce category description for '{name}' for ProSkaters Place Canada. Include: who it's for, 3-4 key specs to look for, ProSkaters expertise + Canadian delivery note, 2-3 FAQ Q&As. Plain HTML only — p and ul/li tags."_
3. `PUT /wp-json/wc/v3/products/categories/{id}` with `{ "description": fullHTML }`

**Priority categories:** `roller-skates`, `roller-blades`, `penny-boards`, `longboards`  
**Effort:** 3-4 hours

---

#### `scripts/wordpress/build-roller-skates-hub.js`

**SEO task:** Build a dedicated roller skates hub page — the direct fix for position #47 on "roller skates" (60,500/mo)  
**API flow:**

1. `GET /wp-json/wc/v3/products?category=roller-skates&per_page=50` for product data to reference
2. Generate 600+ word hub page via Claude with buying guide, FAQ, brand overview, internal links
3. `POST /wp-json/wp/v2/pages` with `{ slug: "roller-skates", title, content, status: "publish" }`
4. Update Yoast/Rank Math meta via post meta fields: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`  
   **Effort:** 4-5 hours

---

#### `scripts/wordpress/add-quick-answer-boxes.js`

**SEO task:** 23% of keywords have AI Overviews — site not cited. Quick Answer = direct AI-extractable content  
**API flow:**

1. `GET /wp-json/wp/v2/posts?per_page=100&page={n}` — paginate all posts
2. Skip posts with `<!-- wp:group {"className":"quick-answer"}` already present
3. Claude prompt:
   > _"Write a 2-sentence direct answer to the implied question of this article. Lead with the most specific fact. Under 60 words. Never start with 'Yes', 'No', or 'In conclusion'."_
4. Prepend this Gutenberg block to `post_content`:
   ```html
   <!-- wp:group {"className":"quick-answer","style":{"color":{"background":"#f0f7ff"}}} -->
   <div class="wp-block-group quick-answer" style="background-color:#f0f7ff;padding:1rem;border-radius:8px;margin-bottom:1.5rem">
     <!-- wp:paragraph -->
     <p><strong>Quick Answer:</strong> {CLAUDE_OUTPUT}</p>
     <!-- /wp:paragraph -->
   </div>
   <!-- /wp:group -->
   ```
5. `PUT /wp-json/wp/v2/posts/{id}` with updated `content`  
   **Effort:** 4-5 hours; ~45 min run time for 50 posts

---

#### `scripts/wordpress/create-author-profiles.js`

**SEO task:** No author attribution on any blog post — major E-E-A-T gap  
**API flow:**

1. Define 2-3 author profiles in script config (name, bio, skating credentials)
2. `POST /wp-json/wp/v2/users` for each new author (requires `create_users` capability on app password user)
3. `GET /wp-json/wp/v2/posts?per_page=100` — assign author by topic/date rule
4. `PUT /wp-json/wp/v2/posts/{id}` with `{ "author": authorId }`  
   **Fallback:** If `create_users` not allowed, create authors manually in WP Admin first — script only handles the bulk post assignment  
   **Effort:** 2-3 hours

---

#### `scripts/wordpress/add-authorized-retailer-tag.js`

**SEO task:** "Authorized Retailer" trust signal missing from product pages  
**API flow:**

1. `GET /wp-json/wc/v3/products?per_page=100` — paginate all
2. Match against hardcoded brand list (Powerslide, Rollerblade, FR Skates, K2, Seba)
3. For matching products not already tagged, prepend `short_description`:
   ```html
   <p><strong>✓ Authorized Retailer</strong> — ProSkaters Place is an official authorized dealer for {brand}.</p>
   ```
4. `PUT /wp-json/wc/v3/products/{id}` with updated `short_description`  
   **Effort:** 2 hours

---

#### `scripts/wordpress/inject-faq-schema.js`

**SEO task:** FAQPage schema absent from homepage FAQ and blog articles — missing rich result opportunity  
**API flow:**

1. `GET /wp-json/wp/v2/pages?slug=home` — parse Q&A content blocks
2. Build `application/ld+json` FAQPage schema from detected Q&A pairs
3. Append schema via inline `wp:html` block to post content
4. Same logic applied to all blog posts with identifiable FAQ sections  
   **Note:** If Rank Math Pro is already installed, script can also do `POST /wp-json/rankmath/v1/updateMeta` — detect active SEO plugin first with `GET /wp-json/` capability check  
   **Effort:** 4 hours

---

#### `scripts/wordpress/create-topical-cluster.js`

**SEO task:** "How to rollerblade" at position 34 (14,800 vol) — needs topical authority cluster to reach page 1  
**API flow:**

1. Hub: "Complete Beginner's Guide to Rollerblading" — 1 hub + 5 spoke articles
2. Spokes: stopping, turning, uphill skating, choosing first skates, safety gear
3. Generate each via Claude (~1,200 words each, internal links to product categories)
4. `POST /wp-json/wp/v2/posts` for each article
5. Update hub to link all spokes  
   **Effort:** 6-8 hours; creates 5-6 new posts

---

### TIER 3 — Requires one plugin pre-installed on WordPress first

#### `scripts/wordpress/create-redirects.js`

**SEO task:** "Roller blades" (22,200/mo, pos 4) and "roller skate" (12,100/mo, pos 5) both route to a cost article instead of a shop page — guaranteed high bounce, NavBoost suppression  
**Requires:** [Redirection plugin](https://wordpress.org/plugins/redirection/) (free) installed in WP Admin first (5 min)  
**API:** `POST /wp-json/redirection/v1/redirect` once plugin is active  
**Alternative without plugin:** Script can add `Redirect 301` rules by updating a custom options value that the theme reads — but this is theme-dependent  
**Effort:** 2 hours once plugin is installed

---

## What CANNOT Be Done by Scripts from Here

| Task                                                                             | Reason                                                                                                                                                                             | What's Actually Needed                                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Install WordPress plugins** (Rank Math Pro, Redirection, PublishPress Authors) | REST API has no plugin installation endpoint                                                                                                                                       | WP Admin dashboard — 5 min each                                                                                                               |
| **Edit PHP theme files** (footer.php where the typo may live)                    | REST API cannot write to filesystem                                                                                                                                                | FTP/SSH, or WP Admin → Appearance → Theme Editor                                                                                              |
| **WP-CLI commands**                                                              | Requires SSH to the server                                                                                                                                                         | SSH access or hosting panel terminal                                                                                                          |
| **Homepage H1 tag change**                                                       | H1 is the post title field in WP — `PUT /wp-json/wp/v2/pages/{id}` with `{ "title": "..." }` works IF it's a page. If it's hardcoded in the theme template, needs theme file edit. | Try REST first; fall back to theme edit                                                                                                       |
| **Google Business Profile optimization**                                         | Entirely separate Google API + its own OAuth                                                                                                                                       | GBP dashboard or Google My Business API                                                                                                       |
| **YouTube channel + video content**                                              | External platform, no API shortcut                                                                                                                                                 | Manual — human decision and production                                                                                                        |
| **Make / n8n ongoing triggers**                                                  | External platforms                                                                                                                                                                 | Replace entirely with OS cron calling these same scripts: `0 2 * * * node /path/scripts/wordpress/rewrite-product-descriptions.js --new-only` |
| **Per-product Rank Math schema fields**                                          | Rank Math Pro REST API (`/wp-json/rankmath/v1/updateMeta`) only works if plugin installed                                                                                          | Install Rank Math Pro first — then fully scriptable                                                                                           |

---

## Run Order

Later scripts build on work done by earlier ones:

```
1. fix-media-alt-text.js              # No dependencies, instant win
2. fix-footer-menu.js                 # No dependencies, instant win
3. dedup-homepage-faq.js             # No dependencies, instant win
4. fix-shipping-threshold.js         # Confirm correct value first
5. add-authorized-retailer-tag.js    # No dependencies
6. create-author-profiles.js         # Before content scripts (posts need author IDs)
7. update-category-descriptions.js   # Roller skates priority — feeds hub page
8. build-roller-skates-hub.js        # After category content updated
9. rewrite-product-descriptions.js   # Longest run — execute overnight
10. add-quick-answer-boxes.js        # All blog posts
11. inject-faq-schema.js             # After quick answers in place
12. create-redirects.js              # After Redirection plugin installed
13. create-topical-cluster.js        # Final — new posts
```

---

## Scripts Build Checklist

| Script                            | SEO Task from Audit                           | Priority       | Est. Hours | Plugin Required       |
| --------------------------------- | --------------------------------------------- | -------------- | ---------- | --------------------- |
| `fix-footer-menu.js`              | Broken `skaterboards` link                    | 🔴 Immediate   | 2          | No                    |
| `fix-shipping-threshold.js`       | $99 vs $150 inconsistency                     | 🔴 Immediate   | 3          | No                    |
| `fix-media-alt-text.js`           | Brand logo alt text                           | 🔴 Immediate   | 2          | No                    |
| `dedup-homepage-faq.js`           | Duplicate FAQ entry                           | 🔴 Immediate   | 2          | No                    |
| `rewrite-product-descriptions.js` | Manufacturer copy duplication (500+ products) | 🔴 Highest ROI | 6          | No                    |
| `update-category-descriptions.js` | Shallow roller skates category pages          | 🔴 High        | 3          | No                    |
| `build-roller-skates-hub.js`      | "Roller skates" at position #47               | 🔴 High        | 5          | No                    |
| `add-quick-answer-boxes.js`       | AI Overview extractability (23% exposure)     | 🟡 Medium      | 4          | No                    |
| `create-author-profiles.js`       | E-E-A-T author attribution gap                | 🟡 Medium      | 3          | No                    |
| `add-authorized-retailer-tag.js`  | Trust signal on product pages                 | 🟡 Medium      | 2          | No                    |
| `inject-faq-schema.js`            | FAQPage schema missing                        | 🟡 Medium      | 4          | Optional (Rank Math)  |
| `create-redirects.js`             | Intent mismatch routing                       | 🟡 Medium      | 2          | **Yes — Redirection** |
| `create-topical-cluster.js`       | Topical authority for "how to rollerblade"    | 🟢 Quarter     | 7          | No                    |

**Total build time estimate:** ~45 hours  
**Plugins to install first (one-time, 10 min total):** Redirection (free), optionally Rank Math Pro

---

## Environment Variables Needed

```env
# Already in .env — no changes needed for WP/WC connections:
# GQL_HOST, WC_CONSUMER_KEY, WC_CONSUMER_SECRET
# WP_ADMIN_USERNAME, WP_ADMIN_APP_PASSWORD

# Add for Claude-powered scripts:
CLAUDE_API_KEY=sk-ant-...

# Confirm this exists (check nuxt.config.ts runtimeConfig.public):
WP_BASE_URL=https://proskatersplace.com
```

---

## Original Plan vs. This Approach

| Original Recommended Tool               | Replaced By                                                  | Why Better                                                             |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Make → Claude → WooCommerce             | `rewrite-product-descriptions.js` direct script              | No subscription cost; git-tracked; dry-run mode; runs from this repo   |
| n8n/Make ongoing triggers               | OS cron calling npm scripts                                  | Simpler; no external platform dependency                               |
| PublishPress Authors plugin             | `create-author-profiles.js` via WP REST                      | Author creation + bulk post assignment fully scriptable without plugin |
| Velvet Blues Update URLs plugin         | `fix-footer-menu.js` + `fix-shipping-threshold.js`           | Targeted REST API calls; no plugin; audits before writing              |
| Kadence Blocks Quick Answer             | Inline Gutenberg HTML group block prepended via REST         | No block plugin needed; renders in any theme                           |
| WP-CLI for alt text                     | `fix-media-alt-text.js` via WP REST media endpoint           | No SSH required                                                        |
| Rank Math Pro bulk editor for titles/H1 | Direct `PUT /wp-json/wp/v2/pages` + `wp-json/wc/v3/products` | Scriptable in bulk with custom logic; no plugin needed for basic meta  |
