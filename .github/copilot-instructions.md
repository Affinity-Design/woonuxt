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

### 🗺️ Documentation Map

- **SEO:** `docs/seo-implementation.md`
- **Caching:** `docs/how-caching-works.md`
- **Blog:** `docs/blog-architecture.md`
- **Payments:** `docs/helcim-integration.md`

---

## Project Overview

This is a **headless WooCommerce e-commerce site** built with Nuxt 3, using WordPress + WPGraphQL as the backend. The frontend is statically generated and deployed to **Cloudflare Pages** with aggressive KV-based caching for performance.

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
npm run build  # Automatically runs build-all-routes first
```

**What happens during build:**

1. `build-all-routes.js` → Scans `content/blog/` and generates:
   - `data/blog-routes.json` (for prerendering)
   - `data/blog-redirects.json` (slug → /blog/slug redirects)
   - `data/sitemap-data.json` (for `/api/sitemap.xml`)
2. `setup-script.js` → Populates Cloudflare KV with:
   - `build-categories-cache.js` → Category data
   - `build-products-cache.js` → Product data (limited by `LIMIT_PRODUCTS` env var)
3. `nuxt build` → Static generation with prerendering

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
3. Build automatically discovers it (no manual route config needed!)

### Automatic Features

- **Redirects:** `/your-slug` → `/blog/your-slug` (auto-generated)
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

## Common Pitfalls

1. **Blog post not appearing?**

   - Check `content/blog/your-slug/index.md` exists
   - Run `npm run build-all-routes` manually
   - Verify `data/blog-routes.json` includes it

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

- `docs/seo-implementation.md` - **Complete SEO guide with fail-safe architecture**
  - Triple-layer error handling (pages always load)
  - SSR compatibility patterns (fetch → $fetch migration)
  - Exchange rate optimization (non-blocking initialization)
  - Before/after performance metrics
- `docs/how-caching-works.md` - Cache layers explained
- `docs/helcim-integration.md` - Payment flow
- `docs/architecture.md` - System overview
- `docs/blog-architecture.md` - Blog system details

**Recent Updates (November 2025):**

- SEO system now has triple-layer fail-safe (API → generator → defaults)
- All composables migrated to `$fetch()` for SSR compatibility
- Exchange rate initialization is non-blocking (instant page loads)
- Zero SEO-related failures in production

## Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run dev:ssl          # Dev with HTTPS

# Building
npm run build            # Production build (with route generation)
npm run generate         # Static site generation
npm run preview          # Preview production build

# Caching
npm run setup-cache      # Populate KV with product/category data
npm run warm-cache       # Warm all caches
npm run rebuild-cache    # Full cache rebuild

# Build Components
npm run build-all-routes      # Generate routing data
npm run build-blog-routes     # Blog routes only
npm run build-product-cache   # Product cache only
npm run build-category-cache  # Category cache only
```

## Key Conventions

- **Canadian spelling:** Use "colour", "centre", "grey" (helper: `toCanadianSpelling()`)
- **Currency:** Always CAD, format with `formatCADPrice()`
- **Image optimization:** Use `<NuxtImg>` component
- **Lazy loading:** Default for images (except hero images)
- **Route naming:** Products use slug, categories use `/product-category/slug`
- **GraphQL caching:** Uses `getCachedGqlQuery` from nuxt-graphql-client

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
