# WooNuxt E-commerce Development Guide

## 🤖 AI Agent Quick Guide

**Context:** Nuxt 3 + WPGraphQL + Cloudflare Pages (KV Cache).
**Target:** Canadian Market (CAD, en-CA/fr-CA).

### ⚡ Critical Rules

1.  **Architecture:** `woonuxt_base/` is READ-ONLY. Override components by copying to root `components/`.
2.  **SEO:** MUST use `useCanadianSEO()` composable. Never use generic `useHead` for meta tags.
3.  **Data:** Products = WPGraphQL (via `useCachedProduct` for SSR). Blog = Nuxt Content.
4.  **Images:** Always use `<NuxtImg>`.
5.  **Build:** `npm run build` is REQUIRED (runs route generation scripts).
6.  **Cache:** Run `npm run warm-cache` after deploy.
7.  **Cross-site boundary:** `wordpress/` belongs to US backend infrastructure context (including USD and US SEO implementation concerns). Treat changes there as cross-site impact changes.
8.  **Business objective:** Prioritize SEO dominance for BOTH US and CAD properties while maintaining stable shared infrastructure between them.

### 🗺️ Documentation Map

- **SEO:** `docs/seo-master-guide.md`
- **Caching:** `docs/caching-local.md`
- **Blog:** `docs/blog-master-guide.md`
- **Payments:** `docs/infrastructure-and-integrations.md`
- **Development:** `docs/development.md`

---

## Project Overview

This is a **headless WooCommerce e-commerce site** built with Nuxt 3, using WordPress + WPGraphQL as the backend. The frontend is statically generated and deployed to **Cloudflare Pages** with aggressive KV-based caching for performance.

This repository is primarily the Canadian headless Woo experience derived from the US ecosystem. Data streams from WordPress and is transformed for Canadian market behavior (CAD and en-CA/fr-CA presentation), while US backend concerns remain in the WordPress domain.

**Key Features:**

- Static blog with Nuxt Content (`content/blog/`)
- Canadian-focused SEO optimization (en-CA, CAD pricing, Toronto geo-targeting)
- Custom payment integration (Helcim, Stripe, PayPal)
- Cloudflare KV caching for products/categories
- Multi-layer caching: static prerender + ISR + KV storage

## Architecture

```
WordPress (CMS) → WPGraphQL → Nuxt 3 Frontend → Cloudflare Pages (KV Cache)
```

### US/CAD Context (Critical)

- Canadian Nuxt frontend is the primary concern in this repo.
- `wordpress/` content represents US backend infrastructure concerns, including USD-oriented behavior and US-specific SEO implementation.
- Any change that touches the US/CAD interface must document expected impact on US SEO, CAD SEO, and shared infrastructure operations.

**Two-Layer Nuxt Setup:**

- `woonuxt_base/`: Base WooNuxt layer (like a parent theme - rarely modify)
- Root `/`: Custom layer overriding base (your customizations go here)

**Data Sources:**

- Products/Categories: GraphQL from WordPress
- Blog: Markdown files in `content/blog/` (Nuxt Content)
- Order Management: Mix of GraphQL + REST API (admin endpoints)

## Critical Build Process

**Always run before building:**

```bash
npm run build  # Full pipeline: purge + sitemap + nuxt build + KV setup
```

**What happens during build (in order):**

1. `prebuild-cache-purge.js` → Purges stale Cloudflare KV cache
2. `build-sitemap.js` → Scans `content/blog/` and generates:
   - `data/blog-routes.json` (for prerendering)
   - `data/blog-redirects.json` (slug → /blog/slug redirects)
   - `data/sitemap-data.json` (for `/api/sitemap.xml`)
3. `nuxt build` → Static generation with prerendering
4. `setup-script.js` → Populates Cloudflare KV with product/category data

**Skip cache purge (faster, local iterations):** `npm run build:no-purge`

**Never skip the build scripts** - they generate critical routing data.

## Caching Strategy (Read This Carefully)

### Three Cache Layers

1. **Static Prerender** (Build-time HTML generation)

   - Blog posts: `routeRules: { '/blog/**': { prerender: true } }`
   - Categories: Prerendered during build
   - Static pages: `/`, `/contact`, `/terms`, `/privacy`

2. **Cloudflare KV Route Cache** (ISR-style)

   - Products: `{ cache: { maxAge: 60*60*72, base: 'cache' } }`
   - Categories: `{ cache: { maxAge: 60*60*24*7, base: 'cache' } }`
   - Storage binding: `NUXT_CACHE` (configured in `nitro.storage`)

3. **KV Script Data** (Build artifact storage)
   - Category/product lists for cache warmer
   - Storage binding: `NUXT_SCRIPT_DATA`

### Cache Warming (Post-Deploy)

**Never expect pages to be instantly cached!** Run cache warming after deployment:

```bash
# Production (via API)
POST /api/trigger-cache-warming
Authorization: Bearer $REVALIDATION_SECRET

# Local testing
npm run warm-cache
```

How it works:

- `cache-warmer.js` reads product/category lists from KV
- Makes HTTP requests to each URL (simulates user visits)
- Forces Nitro to render and store pages in KV cache
- **Critical for expensive category pages** (17+ second GraphQL queries)

See `docs/how-caching-works.md` for deep dive.

## Working with Blog Posts

### Blog Writing Rules (CRITICAL - READ FIRST)

**Before writing ANY blog post, you MUST follow these rules:**

1. **Keywords:** Only use keywords from `data/seo_Keywordlist.csv`

   - Check `data/blog-keywords-used.md` to verify keyword not already used
   - Update checklist when using a keyword
   - Prevent keyword cannibalization

2. **Images:** Generate AI images BEFORE writing the post

   - Run: `node scripts/generate-blog-image.js "keyword" --posted`
   - Use the provided path in frontmatter
   - Fallback to existing images if AI generation fails
   - **NEVER reuse an image from another blog post** — each post MUST have a unique image
   - Check existing images in `public/images/blog/posted/` and `public/images/posted/` to avoid duplicates

3. **Internal Links:** Use `data/sitemap-data.json` for all internal links

   - Link to product categories, products, and related blog posts
   - Minimum 5-10 internal links per post
   - Use descriptive anchor text

4. **Word Count:** 1,000 - 2,500 words total

   - Write in 500-word sections
   - Paragraphs max 120 words
   - NEVER use: "Introduction", "In Conclusion", "Historically", "In This Section", "Comprehensive Guide"

5. **Formatting:** Use markdown only (no HTML)

   - H1, H2, H3 headings (include keyword in H2/H3)
   - Lists, tables, blockquotes, bold/italic
   - Target keyword used 5-15 times naturally

6. **SEO Title & Meta:**

   - Title: Max 60 chars, keyword at start, power word, number, sentiment
   - Description: Max 155 chars, includes keyword

7. **Links:**
   - 5-10 internal links from sitemap-data.json
   - 2-4 outbound links to authority sites (DA 60+)
   - healthline.com, nih.gov, cpsc.gov, wikipedia.org, etc.

**📚 Full Documentation:** See `docs/blog-architecture.md` section "Blog Writing Rules & Guidelines"

### Creating New Posts

1. Create directory: `content/blog/your-slug-here/`
2. Add `index.md` with frontmatter:
   ```yaml
   ---
   title: 'Post Title (50-60 chars, includes keyword)'
   description: 'SEO description (150-160 chars)'
   category: 'Skating Tips'
   date: 2025-01-15
   author: 'Author Name'
   authorBio: 'Short bio'
   image: '/images/post-image.jpg'
   ogImage: '/images/post-image.jpg'
   tags: ['inline skates', 'toronto', 'canada']
   ---
   ```
3. Run `npm run build-all-routes` to regenerate route data (redirects, sitemap, slugs)
4. Build automatically discovers it (no manual route config needed!)

### Automatic Features

- **Redirects:** `/your-slug` → `/blog/your-slug` (auto-generated by `npm run build-all-routes`)
- **Sitemap:** Auto-included in `/api/sitemap.xml`
- **Canadian SEO:** Auto-applied via `useCanadianSEO()` composable
- **Structured Data:** Schema.org Article markup (via `<SEOStructuredData>`)
- **Bilingual Support:** French content via `/fr` prefix routes

## Bilingual (French) Support

### Creating French Content

For French blog posts or pages:

1. Create French route with `/fr` prefix:

   - English: `content/blog/best-skates/index.md`
   - French: `content/blog/meilleurs-patins/index.md` (with `/fr` route)

2. Use French locale in SEO:

   ```typescript
   const {setCanadianSEO} = useCanadianSEO();

   setCanadianSEO({
     title: 'Meilleurs Patins 2025 | ProSkaters Place Canada',
     description: 'Guide complet des meilleurs patins...',
     image: '/images/post-image.jpg',
     type: 'article',
     locale: 'fr-CA', // French Canadian
   });
   ```

3. Auto-detection is available:
   ```typescript
   const {detectLocale} = useCanadianSEO();
   const locale = detectLocale(); // Returns 'fr-CA' if route starts with /fr
   ```

### French Language Features

- **Hreflang tags**: Auto-generated for en-CA/fr-CA/en-US/x-default
- **Price formatting**: `formatCADPrice(123.45, 'fr-CA')` → `123,45 $`
- **HTML lang**: Automatically set to `lang="fr-CA"` when locale is French
- **og:locale**: Set to `fr_CA` with `en_CA` as alternate
- **URL structure**: `/fr/blog/post-slug` for French content

### French Routes in nuxt.config.ts

If adding French routes, update route rules:

```typescript
routeRules: {
  '/fr/blog/**': {
    prerender: true,
    cache: {maxAge: 60 * 60 * 24 * 7, base: 'cache'},
  },
}
```

## Canadian SEO Pattern (Critical)

**Always use for any public page:**

```typescript
const {setCanadianSEO, detectLocale} = useCanadianSEO();

// Auto-detect locale from route (/fr prefix = French)
const locale = detectLocale(); // Returns 'en-CA' or 'fr-CA'

setCanadianSEO({
  title: 'Page Title',
  description: 'SEO description',
  image: '/images/og-image.jpg',
  type: 'website', // or 'article', 'product'
  locale, // Optional: 'en-CA' (default) or 'fr-CA'
});
```

**What it does:**

- Sets bilingual hreflang tags (en-CA, fr-CA, en-US, x-default)
- Adds geo-targeting meta (Toronto coordinates)
- Currency: CAD (with locale-aware formatting)
- Locale: en_CA or fr_CA (with og:locale:alternate)
- Canonical URLs (proskatersplace.ca)
- **Cache-friendly**: Works with SSR, prerender, and KV caching

**Caching Compatibility:**

- `useSeoMeta()` and `useHead()` are fully compatible with Nuxt caching
- Meta tags generated during SSR/prerender and included in static HTML
- Cloudflare KV caches complete HTML (with all meta tags)
- No runtime lookups needed
- Blog posts prerendered with SEO meta baked in

**Bilingual Support:**

- English: `locale: 'en-CA'` (default)
- French: `locale: 'fr-CA'`
- French URLs use `/fr` prefix (e.g., `/fr/blog/post-slug`)
- `detectLocale()` auto-detects from route path
- Price formatting: `formatCADPrice(price, locale)`

See `composables/useCanadianSEO.ts` for all features.

## Payment Integration (Helcim Special Case)

**Problem:** WooCommerce GraphQL session issues prevent normal checkout with Helcim.

**Solution:** Admin-level order creation via REST API.

**Flow:**

1. User adds items to cart (GraphQL)
2. User selects Helcim payment (stored in `useCheckout.ts`)
3. Payment processes externally
4. Backend creates order via `server/api/create-admin-order.post.ts`
5. Uses WordPress Application Password (not user session!)
6. Applies coupons post-creation via REST API

**Key Files:**

- `composables/useCheckout.ts` - Main checkout logic
- `server/api/create-admin-order.post.ts` - Admin order creation
- `components/shopElements/PaymentOptions.vue` - Payment selection

**Auth Required:**

```env
WP_ADMIN_USERNAME=proskatersplace.ca
WP_ADMIN_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

See `docs/helcim-integration.md` for complete details.

## Environment Variables

**Required for Build:**

```env
GQL_HOST=https://your-wordpress-site.com/graphql
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_API_TOKEN=your-api-token
CF_KV_NAMESPACE_ID_CACHE=your-cache-namespace
CF_KV_NAMESPACE_ID_SCRIPT_DATA=your-script-data-namespace
```

**Optional Build Control:**

```env
LIMIT_PRODUCTS=true        # Limit products during build (faster)
MAX_PRODUCTS=2000          # Max products to cache
```

**Runtime Secrets (server-only):**

```env
NUXT_STRIPE_SECRET_KEY=sk_live_...
NUXT_HELCIM_API_TOKEN=...
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
SENDGRID_API_KEY=SG....
REVALIDATION_SECRET=your-secret  # For cache warming
```

## Common Development Tasks

### Adding a New Component

**Override base components:**

1. Copy from `woonuxt_base/app/components/` to `/components/`
2. Modify as needed (your version takes precedence)

**Priority:** Root components load first (defined in `nuxt.config.ts` with `priority: 1000`)

### Adding a New Page

Create in `/pages/` - automatically overrides `woonuxt_base/app/pages/`.

**Example:** `/pages/contact.vue` overrides base contact page.

### ⚠️ CRITICAL: Renaming Pages to Directories (Layer Override Trap)

**NEVER rename a flat page to a directory index without keeping a wrapper file.**

This project uses Nuxt Layers (`extends: './woonuxt_base'`). If the base layer has `woonuxt_base/app/pages/checkout.vue` and you rename your `pages/checkout.vue` to `pages/checkout/index.vue`, Nuxt treats them as **different routes**:
- Base's `checkout.vue` becomes a **parent layout**
- Your `checkout/index.vue` becomes a **child** that never renders (because the base has no `<NuxtPage />`)

**Result**: The base layer's page silently takes over. In our case this meant the Stripe-based base checkout replaced the Helcim checkout — breaking all payments in production.

**Correct pattern when converting flat page → directory:**
```
pages/checkout.vue          ← Wrapper: <template><NuxtPage /></template>
pages/checkout/index.vue    ← Your actual page content (Helcim checkout)
pages/checkout/order-received/[...orderId].vue  ← Nested route
```

**Before renaming/moving ANY page:**
1. Check if `woonuxt_base/app/pages/` has a matching file
2. If yes, keep a wrapper `.vue` file at the original path
3. Test the page renders YOUR version, not the base layer's

### Modifying GraphQL Queries

**Location:** `woonuxt_base/app/gql/queries/` (read-only base)

**To customize:**

1. Copy query to `/gql/queries/` (if this directory doesn't exist, create it)
2. Modify as needed
3. Nuxt auto-imports from root first

### Testing Locally with SSL

```bash
# Generate certificates (one-time)
mkcert localhost
mkcert -install

# Run dev server
npm run dev:ssl
```

## Blog URL Rules (CRITICAL)

**All blog post links MUST use the `/blog/` prefix.** The canonical URL for every post is `/blog/your-slug`.

- **Correct:** `/blog/best-inline-skates-2025`
- **Wrong:** `/best-inline-skates-2025` (relies on redirect, bad for SEO)
- **NEVER** use `.replace('/blog/', '/')` or strip the `/blog/` prefix from `_path`
- `BlogPostCard.vue` has built-in normalization to ensure `/blog/` prefix
- Redirects from `/slug` → `/blog/slug` exist as a safety net, NOT as the primary URL
- After adding a new post, always run `npm run build-all-routes` to generate the redirect entry

## Common Pitfalls

1. **Blog post not appearing?**

   - Check `content/blog/your-slug/index.md` exists
   - Run `npm run build-all-routes` manually
   - Verify `data/blog-routes.json` includes it
   - Verify `data/blog-slugs.json` includes the slug (needed for redirects)
   - Verify `data/blog-redirects.json` has the `/slug` → `/blog/slug` entry

2. **404 on slug-only URL (e.g., `/my-post`)?**

   - Check `data/blog-redirects.json` was generated
   - Ensure redirects are spread in `nuxt.config.ts: routeRules`

3. **Category page slow (17+ seconds)?**

   - Run cache warming: `npm run warm-cache`
   - Check KV cache is configured correctly
   - Verify `routeRules` has proper `cache` config

4. **"Module not found" in build?**

   - Ensure `setup-script.js` ran successfully
   - Check Cloudflare KV credentials in env vars
   - Verify data files exist in `data/` directory

5. **Helcim checkout fails?**
   - Check WordPress Application Password is valid
   - Verify admin user has Shop Manager role
   - See `docs/wordpress-app-password-setup.md`

6. **Helcim card not rendering (purple fallback button instead)?**
   - Check that `pages/checkout.vue` exists as a `<NuxtPage />` wrapper
   - If missing, the base layer's Stripe checkout renders instead of the Helcim one
   - Verify `pages/checkout/index.vue` contains the Helcim `shouldShowHelcimCard` logic
   - Check console for `[shouldShowHelcimCard]` logs — if absent, wrong checkout is loaded
   - Test: the deployed JS should contain `shouldShowHelcimCard` and `appendHelcim`

7. **Prices showing `$€` or double currency symbols?**
   - NEVER add client-side currency conversion that prepends symbols to WPGraphQL prices
   - Prices from GraphQL are already in store currency (CAD) — no conversion needed
   - If you see `$€109.99`, a pricing interceptor/plugin is prepending an extra symbol
   - Remove any `authoritativePricing`, `lifecyclePricing`, or price-reformatting middleware
   - Use only `formatCADPrice()` or `formatPrice()` from `useHelpers()` for display

## Testing & Debugging

**Check cache effectiveness:**

```bash
npm run debug:cache
```

**Warm specific cache sections:**

```bash
npm run warm-products   # Products only
npm run warm-categories # Categories only
npm run warm-home       # Homepage
```

**Force rebuild cache:**

```bash
npm run rebuild-cache  # setup + warm with --force
```

**Test sitemap:**

```bash
curl http://localhost:3000/api/sitemap.xml
# Check x-sitemap-generated header
```

## File Organization

**Don't modify directly:**

- `woonuxt_base/` - Base layer (upstream updates)

**Your code goes here:**

- `/components/` - Custom components
- `/composables/` - Custom composables (e.g., `useCanadianSEO.ts`)
- `/pages/` - Custom pages
- `/content/blog/` - Blog posts
- `/scripts/` - Build and caching scripts
- `/server/api/` - API endpoints

**Generated files (git-ignored):**

- `data/*.json` - Route/cache data (regenerated each build)

## Documentation

**Read these for deep understanding:**

- `docs/seo-master-guide.md` - Complete SEO guide with fail-safe architecture
  - Triple-layer error handling (pages always load)
  - SSR compatibility patterns ($fetch required, not fetch)
  - Exchange rate optimization (non-blocking initialization)
- `docs/caching-local.md` - Cache layers explained (local dev)
- `docs/infrastructure-and-integrations.md` - Helcim/Stripe/Cloudflare/WooCommerce setup
- `docs/blog-master-guide.md` - Blog system, SEO rules, writing guidelines
- `docs/development.md` - Development workflow and local setup

## Commands Reference

```bash
# Development
npm run dev              # Start dev server (with --host)
npm run dev:ssl          # Dev with HTTPS (requires mkcert)

# Building
npm run build            # Production: purge + sitemap + nuxt build + KV setup
npm run build:no-purge   # Production build without cache purge (faster)
npm run build:local      # Build using nuxt.config.local.ts
npm run generate         # Static site generation
npm run preview          # Preview production build

# Route/Sitemap Data Generation
npm run build-sitemap         # Generate sitemap + blog routes/redirects (REPLACES build-all-routes)
npm run build-blog-routes     # Blog routes only
npm run build-product-cache   # Product cache only
npm run build-category-cache  # Category cache only

# KV Cache Management
npm run setup-cache      # Populate KV with product/category data
npm run warm-cache       # Warm all caches
npm run warm-products    # Products only
npm run warm-categories  # Categories only
npm run warm-home        # Homepage only
npm run rebuild-cache    # setup + warm --force
npm run clear-cache      # Safe KV cache clear
npm run clear-cache-all  # Clear ALL KV namespaces
npm run clear-page-cache # Clear page cache namespace only
npm run clear-data-cache # Clear script_data namespace only
npm run purge-cache      # Prebuild purge only (runs as part of npm run build)
npm run reset-cache      # clear-all + setup

# Utilities
npm run clean            # Clean build artifacts
npm run clean:build      # clean + install + build
npm run verify-env       # Verify all required env vars are set
npm run debug:cache      # Check cache effectiveness
npm run optimize-images  # Optimize images in public/
```

## Key Conventions

- **Canadian spelling:** Use "colour", "centre", "grey" (helper: `toCanadianSpelling()`)
- **Currency:** Always CAD, format with `formatCADPrice()`. **WPGraphQL prices are the single source of truth** — never layer additional currency symbols or conversion on top
- **Image optimization:** Use `<NuxtImg>` component
- **Lazy loading:** Default for images (except hero images)
- **Route naming:** Products use slug, categories use `/product-category/slug`
- **GraphQL caching:** Uses `getCachedGqlQuery` from nuxt-graphql-client
- **Page overrides:** When converting a flat page to a directory, ALWAYS keep a wrapper `.vue` file at the original path (see "Layer Override Trap" above)

## Known Console Warnings (Safe to Ignore)

### External Script Violations

The following warnings are from **third-party scripts** (YouTube, Cloudflare) and cannot be fixed:

- `[Violation] Added non-passive event listener to a scroll-blocking 'touchstart' event`

  - Source: YouTube embed player (`base.js`, `www-embed-player.js`)
  - Cause: YouTube's player adds touch listeners for mobile interaction
  - Impact: None - informational only
  - Fix: Not possible (external code)

- `[Violation] 'setTimeout' handler took XXms`
  - Source: YouTube embeds, Cloudflare scripts
  - Cause: Initialization code exceeds Chrome's 50ms guideline
  - Impact: None - informational only
  - Fix: Not possible (external code)

### Content Security Policy (CSP) Issues

**Fixed CSP Violations:**

✅ **Iconify API** - `https://api.iconify.design` added to `connect-src`

- Issue: Icon library fetching JSON from external API
- Fix: Updated `public/_headers` to allow Iconify API

✅ **YouTube Embeds** - `https://www.youtube.com` and `https://www.youtube-nocookie.com` added to `frame-src`

- Issue: YouTube iframes blocked by CSP
- Fix: Updated `public/_headers` to allow YouTube domains

**CSP vs CORS (Important Distinction):**

- **CSP (Content Security Policy)**: Browser-enforced security based on `Content-Security-Policy` header in YOUR HTML response
  - Error format: "violates the following Content Security Policy directive"
  - Fix location: `public/_headers` file (YOUR app configuration)
- **CORS (Cross-Origin Resource Sharing)**: Server-enforced security based on `Access-Control-Allow-Origin` header in REMOTE API response
  - Error format: "No 'Access-Control-Allow-Origin' header is present"
  - Fix location: Remote API server (NOT your app)

### Nuxt Content 404s

**Issue:** `/api/_content/query/*.json` endpoints returning 404

- Cause: Nuxt Content queries looking for pre-generated JSON files
- Fix: Enabled `experimental.clientDB: true` in `nuxt.config.ts` to use client-side database instead
- Result: Content queries no longer require server-side JSON files

### Hydration Mismatches

**Issue:** "Hydration completed but contains mismatches"

- Cause: Server HTML differs from client-rendered HTML
- Common causes:
  - Using `window`, `document`, `Date.now()`, `Math.random()` in templates
  - Conditionals based on viewport size or browser-only APIs
- Fix: Guard browser logic with `process.client` or `onMounted()`
- Not CSP-related: This is a Nuxt SSR rendering issue

### GraphQL 403 Errors on Product Pages

**Issue:** Product pages fail on first load with `statusCode: 403` during SSR, work on second load

**Error Pattern:**

```
ERROR [[slug].vue] useAsyncData: Error fetching product: {
  statusCode: 403,
  operationType: 'query',
  operationName: 'getProduct'
}
```

**Root Cause:**

- WordPress GraphQL API has security protection (Cloudflare, security plugins, rate limiting)
- SSR requests from Node.js don't look like "real browsers" to WordPress
- Even with proper headers (User-Agent, Origin, Referer), WordPress/Cloudflare may block server-side requests

**Fix:** Use Cloudflare KV cache as primary source, GraphQL as fallback

- Product page first tries `useCachedProduct()` to get data from KV cache
- KV cache is populated during build by `scripts/build-products-cache.js`
- Only fetches from WordPress GraphQL if product not in cache
- SSR re-enabled since we're using cached data
- Files: `pages/product/[slug].vue`, `server/api/cached-product.ts`, `composables/useCachedProduct.ts`

**Result:**

- ✅ Zero 403 errors (primary data source is KV cache)
- ✅ Fast loading (KV cache <5ms lookup)
- ✅ SEO perfect (full product data in SSR payload)
- ✅ Fallback to GraphQL if product not in cache
- ✅ Fresh data (cache rebuilt on deploy)

**How It Works:**

1. **During Build:**

   - `scripts/build-products-cache.js` fetches all products from WordPress
   - Stores them in Cloudflare KV under `cached-products` key
   - Each product includes full data (price, images, categories, etc.)

2. **During SSR (Server-Side):**

   - Product page calls `useCachedProduct().getProductFromCache(slug)`
   - Reads from `/api/cached-product` endpoint
   - Endpoint queries KV storage for product list
   - Returns matching product instantly (<5ms)
   - No WordPress API call needed

3. **Fallback (If Not in Cache):**
   - If product not found in cache, falls back to GraphQL
   - Fetches fresh data from WordPress
   - Still works, just slightly slower

**Cache Warming:**

After deployment, run:

```bash
npm run warm-cache
# or
POST /api/trigger-cache-warming
```

This ensures all product pages are fully cached in Cloudflare KV.

**To filter these warnings in DevTools:**

1. Open Console
2. Click the filter dropdown
3. Select "Hide violations" or add custom filter: `-Violation`

These warnings do not affect site functionality or SEO.

## When Making Changes

**Always test the build process:**

```bash
npm run build && npm run preview
```

**For blog changes:**

1. Add/modify post
2. Test locally: `npm run dev`
3. Build: `npm run build` (auto-generates routes)
4. Deploy
5. Warm cache: POST to `/api/trigger-cache-warming`

**For payment changes:**

- Test Helcim separately (requires admin order flow)
- Verify order attribution (proskatersplace.ca)
- Check coupon application works

**For caching changes:**

- Update `routeRules` in `nuxt.config.ts`
- Clear KV cache (Cloudflare dashboard or API)
- Re-warm cache after deployment

---

**Questions? Check:**

- `README.md` - Project overview
- `docs/` - Detailed documentation
- WooNuxt docs: https://woonuxt.com/
- Nuxt 3 docs: https://nuxt.com/
