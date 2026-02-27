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
| Gemini API           | `GEMINI_API_KEY` (= `GOOGLE_AI_API_KEY`)      | `generativelanguage.googleapis.com` | Content generation, rewrites |

Script pattern: follow `scripts/build-products-cache.js` — `require('dotenv').config()`, `node-fetch`, paginated batches, exponential backoff, `--dry-run` flag on every script.  
Tier 2 scripts `require('./lib/gemini')` for all LLM calls — shared rate-limiting + retry logic in `wordpress/scripts/lib/gemini.js`.  
All new scripts live in `wordpress/scripts/` to separate from build scripts.

**Standard run procedure for every script:**

1. `--dry-run` first — review console output, confirm targets are correct
2. Run live against **test site** (`BASE_URL=https://test.proskatersplace.com`)
3. **Visually verify** 2-3 target pages on the test site in browser (specific URLs listed per script below)
4. Only after test site confirms ✅ → swap `.env` to live block and re-run against production

---

## What CAN Be Done by Scripts from Here

### TIER 1 — Quick fixes, no content generation (build these first)

#### `scripts/wordpress/fix-footer-menu.js`

**SEO task:** Broken footer link — `skaterboards-and-longboards` typo (bleeds PageRank, crawl errors)  
**Status:** ✅ Built — `wordpress/scripts/fix-footer-menu.js`  
**Applied on test site Feb 27, 2026:** Fixed 1 homepage Elementor link + 1 blog post body copy. 0 menu items had the typo on test (live site menu is the main target).

**Covers 3 layers:**

1. WP nav menu items (all menus)
2. Page + post `post_content` (Gutenberg / raw)
3. **Elementor `_elementor_data` post meta** — homepage uses Elementor; typo was in JSON meta, not `post_content`

**Run:**

```bash
node wordpress/scripts/fix-footer-menu.js --dry-run   # preview all 3 layers
node wordpress/scripts/fix-footer-menu.js              # apply
```

**✅ Safe for proskatersplace.ca — verified Feb 27, 2026:**

- WooCommerce category slug is already `skateboards-and-longboards` (correct) — WP id: 2526
- Nuxt routes, sitemap, `pages/categories.vue`, and `build-all-routes.js` all use the correct slug
- Category images exist: `public/images/Skateboards-and-longboards.jpeg/.webp`
- The typo **only lives in the WordPress menu link URL** — it points to a dead path that never existed
- Script fixes only the menu item URL and any matching body copy typos — does NOT touch the category slug
- No redirects needed, no .ca code changes needed

**Visual verification after running:**

- `https://test.proskatersplace.com` → inspect footer nav → hover the Skateboards link → confirm URL shows `skateboards-and-longboards` (no typo)
- `https://test.proskatersplace.com` → homepage body copy → confirm anchor text link resolves without 404

---

#### `scripts/wordpress/fix-shipping-threshold.js`

**SEO task:** $99 vs $150 free shipping inconsistency across site — trust destroyer, bounce signal  
**Status:** ✅ Built — `wordpress/scripts/fix-shipping-threshold.js`  
**Test site audit result:** Homepage body copy mentions $99 only. No WC zone-level free_shipping methods configured. No widgets mention either value.

**⚠️ CONFIRM correct threshold before running --fix:**

```bash
# Step 1 — Audit (read-only, safe to run now):
node wordpress/scripts/fix-shipping-threshold.js

# Step 2 — After confirming correct value (default: --correct=150 --wrong=99):
node wordpress/scripts/fix-shipping-threshold.js --fix --dry-run
node wordpress/scripts/fix-shipping-threshold.js --fix

# If $99 is actually correct:
node wordpress/scripts/fix-shipping-threshold.js --fix --correct=99 --wrong=150
```

**Visual verification after running:**

- `https://test.proskatersplace.com` → check header/banner — confirm single consistent threshold
- `https://test.proskatersplace.com/shop/inline-skates/` → confirm category page shows matching threshold
- `https://test.proskatersplace.com/shop/` → confirm shop page matches

---

#### `scripts/wordpress/fix-media-alt-text.js`

**SEO task:** Brand logos have alt text "Home 1", "Home 2" — misses brand entity association  
**API:** `GET /wp-json/wp/v2/media?per_page=100` → paginate full library → filter alt text matching `/^Home \d+$/i` → `POST /wp-json/wp/v2/media/{id}` with correct brand name  
**Status:** ✅ Built — `wordpress/scripts/fix-media-alt-text.js`  
**Note:** Test site has 0 matches (issue confirmed on live only). Run against live with BASE_URL swap.

**Flags:** `--dry-run`, `--limit=N`, `--max-pages=N` (default 200 = 20,000 items)  
**Brand mapping:** Hardcoded in `BRAND_MAP` at top of script — add entries for any brand it misnames  
**Run against live:**

```bash
# 1. Dry-run first — swap BASE_URL in .env to live, then:
node wordpress/scripts/fix-media-alt-text.js --dry-run
# 2. Review output — confirm brand names are correct
# 3. Apply:
node wordpress/scripts/fix-media-alt-text.js
```

**Visual verification after running:**

- `https://test.proskatersplace.com` → scroll to "Brands We Carry" section → right-click each logo image → Inspect → confirm `alt` attribute shows brand name, not "Home 1" etc.
- Check 3-4 logos to confirm the mapping applied correctly

---

#### `scripts/wordpress/dedup-homepage-faq.js`

**SEO task:** "Are roller skates better tight or loose?" appears twice on homepage — dilutes content signal  
**Status:** ✅ Built — `wordpress/scripts/dedup-homepage-faq.js`  
**Note:** Issue is on live only (test site has 0 occurrences). Homepage is Elementor-built; raw block content is only 5,390 chars. Script searches `post_content` raw — if live uses Elementor too, the duplicate may be in `_elementor_data` meta instead. Script auto-detects Gutenberg block boundaries.

**Run against live:**

```bash
node wordpress/scripts/dedup-homepage-faq.js --dry-run
node wordpress/scripts/dedup-homepage-faq.js
# Custom search string if needed:
node wordpress/scripts/dedup-homepage-faq.js --search="tight or loose"
```

**Visual verification after running:**

- `https://test.proskatersplace.com` → scroll to FAQ section → Ctrl+F "Are roller skates better tight" → confirm it appears exactly once
- Check page source to confirm no duplicate block markup remains

---

### TIER 2 — Content at scale using Gemini API (highest ROI)

#### `scripts/wordpress/rewrite-product-descriptions.js`

**SEO task:** Hundreds of products running manufacturer copy — worst `OriginalContentScore` drag on the domain. This is the single highest-ROI script. One run fixes 500+ pages; then runs on every new product.  
**API flow:**

1. `GET /wp-json/wc/v3/products?per_page=100&page={n}` — paginate all products
2. Heuristic: skip descriptions that already mention "ProSkaters" — these are already customized
3. POST to Gemini API:
   > _"Rewrite this product description in the voice of ProSkaters Place Canada — a Toronto-based expert skate shop. Add: (1) a unique skating expertise angle, (2) a Canadian sizing/shipping note, (3) who this skate is best for. Keep under 200 words. Do not start with the product name. Original: {description}"_
4. `PUT /wp-json/wc/v3/products/{id}` with `{ "description": rewrittenContent }`

**Visual verification after running:**

- `https://test.proskatersplace.com/shop/` → open 3 random products → confirm description mentions "ProSkaters" or Canadian context, doesn't start with product name
- View page source → confirm no manufacturer boilerplate remains on those pages

**Flags:** `--dry-run`, `--limit=50`, `--force` (overwrite already-customized)  
**Rate:** 1 call per 6s (10 RPM default) — configured in `lib/gemini.js`; raise via `GEMINI_RPM` env var on paid tier  
**Effort:** 5-6 hours to build; ~2 hours to run across 500 products

---

#### `scripts/wordpress/update-category-descriptions.js`

**SEO task:** Roller skates category pages too shallow — explains "roller skates" at position #47  
**API flow:**

1. `GET /wp-json/wc/v3/products/categories` — list all categories
2. For shallow categories (under 300 words), generate via Gemini:
   > _"Write a 400-word WooCommerce category description for '{name}' for ProSkaters Place Canada. Include: who it's for, 3-4 key specs to look for, ProSkaters expertise + Canadian delivery note, 2-3 FAQ Q&As. Plain HTML only — p and ul/li tags."_
3. `PUT /wp-json/wc/v3/products/categories/{id}` with `{ "description": fullHTML }`

**Visual verification after running:**

- `https://test.proskatersplace.com/product-category/roller-skates/` → confirm descriptive buying guide content renders below products
- `https://test.proskatersplace.com/product-category/roller-blades/` → same check

**Priority categories:** `roller-skates`, `roller-blades`, `penny-boards`, `longboards`  
**Effort:** 3-4 hours

---

#### `scripts/wordpress/build-roller-skates-hub.js`

**SEO task:** Build a dedicated roller skates hub page — the direct fix for position #47 on "roller skates" (60,500/mo)  
**API flow:**

1. `GET /wp-json/wc/v3/products?category=roller-skates&per_page=50` for product data to reference
2. Generate 600+ word hub page via Gemini with buying guide, FAQ, brand overview, internal links
3. `POST /wp-json/wp/v2/pages` with `{ slug: "roller-skates", title, content, status: "publish" }`
4. Update Yoast/Rank Math meta via post meta fields: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`

**Visual verification after running:**

- `https://test.proskatersplace.com/roller-skates/` (or wherever the slug resolves) → confirm page renders with buying guide content
- View page source → check `<title>` and `<meta name="description">` contain target keyword

**Effort:** 4-5 hours

---

#### `scripts/wordpress/add-quick-answer-boxes.js`

**SEO task:** 23% of keywords have AI Overviews — site not cited. Quick Answer = direct AI-extractable content  
**API flow:**

1. `GET /wp-json/wp/v2/posts?per_page=100&page={n}` — paginate all posts
2. Skip posts with `<!-- wp:group {"className":"quick-answer"}` already present
3. Gemini prompt:
   > _"Write a 2-sentence direct answer to the implied question of this article. Lead with the most specific fact. Under 60 words. Never start with 'Yes', 'No', or 'In conclusion'."_
4. Prepend this Gutenberg block to `post_content`:
   ```html
   <!-- wp:group {"className":"quick-answer","style":{"color":{"background":"#f0f7ff"}}} -->
   <div class="wp-block-group quick-answer" style="background-color:#f0f7ff;padding:1rem;border-radius:8px;margin-bottom:1.5rem">
     <!-- wp:paragraph -->
     <p><strong>Quick Answer:</strong> {GEMINI_OUTPUT}</p>
     <!-- /wp:paragraph -->
   </div>
   <!-- /wp:group -->
   ```
5. `PUT /wp-json/wp/v2/posts/{id}` with updated `content`

**Visual verification after running:**

- Open 2-3 blog posts on `https://test.proskatersplace.com/` → confirm blue Quick Answer box appears at top of article above the intro
- View page source → confirm `wp-block-group quick-answer` class is present

**Effort:** 4-5 hours; ~45 min run time for 50 posts

---

#### `scripts/wordpress/create-author-profiles.js`

**SEO task:** No author attribution on any blog post — major E-E-A-T gap  
**API flow:**

1. Define 2-3 author profiles in script config (name, bio, skating credentials)
2. `POST /wp-json/wp/v2/users` for each new author (requires `create_users` capability on app password user)
3. `GET /wp-json/wp/v2/posts?per_page=100` — assign author by topic/date rule
4. `PUT /wp-json/wp/v2/posts/{id}` with `{ "author": authorId }`

**Visual verification after running:**

- Open 2-3 blog posts → confirm author byline name is visible
- `https://test.proskatersplace.com/author/{slug}/` → confirm author profile page renders

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

**Visual verification after running:**

- Open a Powerslide and a Rollerblade product → confirm "✓ Authorized Retailer" badge appears in the short description above the Add to Cart button

**Effort:** 2 hours

---

#### `scripts/wordpress/inject-faq-schema.js`

**SEO task:** FAQPage schema absent from homepage FAQ and blog articles — missing rich result opportunity  
**API flow:**

1. `GET /wp-json/wp/v2/pages?slug=home` — parse Q&A content blocks
2. Build `application/ld+json` FAQPage schema from detected Q&A pairs
3. Append schema via inline `wp:html` block to post content
4. Same logic applied to all blog posts with identifiable FAQ sections

**Visual verification after running:**

- `https://test.proskatersplace.com` → view source → search for `"@type":"FAQPage"` → confirm JSON-LD schema block is present
- Paste homepage URL into [Google Rich Results Test](https://search.google.com/test/rich-results) → confirm FAQPage detected

**Note:** If Rank Math Pro is already installed, script can also do `POST /wp-json/rankmath/v1/updateMeta` — detect active SEO plugin first with `GET /wp-json/` capability check  
 **Effort:** 4 hours

---

#### `scripts/wordpress/create-topical-cluster.js`

**SEO task:** "How to rollerblade" at position 34 (14,800 vol) — needs topical authority cluster to reach page 1  
**API flow:**

1. Hub: "Complete Beginner's Guide to Rollerblading" — 1 hub + 5 spoke articles
2. Spokes: stopping, turning, uphill skating, choosing first skates, safety gear
3. Generate each via Gemini (~1,200 words each, internal links to product categories)
4. `POST /wp-json/wp/v2/posts` for each article
5. Update hub to link all spokes

**Visual verification after running:**

- `https://test.proskatersplace.com/?p={id}` (use post ID from script output) → confirm all 5-6 articles render with correct content and internal links
- Confirm hub article links to all spokes

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
| `fix-footer-menu.js`              | Broken `skaterboards` link                    | 🔴 Immediate   | ✅ Built   | No                    |
| `fix-shipping-threshold.js`       | $99 vs $150 inconsistency                     | 🔴 Immediate   | ✅ Built   | No                    |
| `fix-media-alt-text.js`           | Brand logo alt text                           | 🔴 Immediate   | ✅ Built   | No                    |
| `dedup-homepage-faq.js`           | Duplicate FAQ entry                           | 🔴 Immediate   | ✅ Built   | No                    |
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

# Add for Gemini-powered scripts (GOOGLE_AI_API_KEY already in .env serves as GEMINI_API_KEY):
GEMINI_API_KEY=AIzaSy...   # or keep using GOOGLE_AI_API_KEY — lib/gemini.js accepts both

# Confirm this exists (check nuxt.config.ts runtimeConfig.public):
WP_BASE_URL=https://proskatersplace.com
```

---

## Original Plan vs. This Approach

| Original Recommended Tool               | Replaced By                                                  | Why Better                                                             |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Make → Claude → WooCommerce             | `rewrite-product-descriptions.js` + `lib/gemini.js`          | No subscription cost; git-tracked; dry-run mode; runs from this repo   |
| n8n/Make ongoing triggers               | OS cron calling npm scripts                                  | Simpler; no external platform dependency                               |
| PublishPress Authors plugin             | `create-author-profiles.js` via WP REST                      | Author creation + bulk post assignment fully scriptable without plugin |
| Velvet Blues Update URLs plugin         | `fix-footer-menu.js` + `fix-shipping-threshold.js`           | Targeted REST API calls; no plugin; audits before writing              |
| Kadence Blocks Quick Answer             | Inline Gutenberg HTML group block prepended via REST         | No block plugin needed; renders in any theme                           |
| WP-CLI for alt text                     | `fix-media-alt-text.js` via WP REST media endpoint           | No SSH required                                                        |
| Rank Math Pro bulk editor for titles/H1 | Direct `PUT /wp-json/wp/v2/pages` + `wp-json/wc/v3/products` | Scriptable in bulk with custom logic; no plugin needed for basic meta  |
