# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```
woonuxt/                        # Repo root
├── app.vue                     # App shell: layout, header, footer, cart overlay
├── nuxt.config.ts              # Main config: layers, route rules, KV storage, modules
├── nuxt.config.local.ts        # Local dev overrides (disables remote GraphQL introspection)
├── i18n.config.ts              # i18n locales: en-CA, en-US, fr-CA
├── cloudflare-pages.toml       # Cloudflare Pages deployment config
│
├── components/                 # Custom root components (override woonuxt_base)
│   ├── BlogPost.vue            # Full blog post layout component
│   ├── BlogPostCard.vue        # Blog listing card (normalizes /blog/ prefix)
│   ├── SEOStructuredData.vue   # Schema.org structured data injector
│   ├── GlobalSEOSchema.vue     # Site-wide Organization/WebSite schema
│   ├── cartElements/           # Cart UI: CartCard, CartTrigger, QuantityInput
│   ├── filtering/              # Product filter UI: Brand, Dropdown, Pill, Price filters
│   ├── forms/                  # Billing form, Login/Register
│   ├── generalElements/        # Layout: AppHeader, AppFooter, MainMenu, HeroBanner, SEOHead
│   ├── productElements/        # Product UI: ProductCard, AddToCartButton, ProductPrice, StockStatus
│   └── shopElements/           # Shop UI: Cart, ProductGrid, PaymentOptions, Pagination, Checkout parts
│
├── composables/                # Custom composables (override + extend woonuxt_base)
│   ├── useCanadianSEO.ts       # Bilingual SEO: hreflang, geo, og tags — MUST use on all public pages
│   ├── useCachedProduct.ts     # KV-first product fetch with GraphQL fallback
│   ├── useCart.ts              # Cart state + operations (useState 'cart')
│   ├── useAuth.ts              # Auth: login/logout, customer, viewer (useState 'viewer')
│   ├── useCheckout.ts          # Multi-step checkout state + order creation
│   ├── useCheckoutVerification.ts # Post-checkout order verification
│   ├── useCategorySEO.ts       # Category page meta tags
│   ├── useProductSEO.ts        # Product page meta tags
│   ├── useProductRichSnippets.ts # Product schema.org rich snippets
│   ├── useExchangeRate.ts      # USD→CAD exchange rate with build-time fallback
│   ├── useProducts.ts          # Product list state + filtering/sorting
│   ├── useProductsCached.ts    # Cached product list operations
│   ├── useCategoryFAQs.ts      # Category FAQ data
│   ├── useSearch.ts            # Product search state
│   ├── useHelpers.ts           # Shared utility functions (logging, cookies, formatting)
│   ├── useCountry.ts           # Country/state selection for shipping
│   ├── useToast.ts             # Toast notification state
│   └── useTurnstile.ts         # Cloudflare Turnstile CAPTCHA handling
│
├── pages/                      # Custom pages (override woonuxt_base pages)
│   ├── index.vue               # Homepage
│   ├── [...]slug].vue          # Catch-all (slug redirects)
│   ├── blog/
│   │   ├── index.vue           # Blog listing page
│   │   └── [slug].vue          # Individual blog post (reads from Nuxt Content)
│   ├── product/
│   │   └── [slug].vue          # Product detail page (KV cache → GQL fallback)
│   ├── product-category/
│   │   └── [slug].vue          # Category page (paginated GQL fetch)
│   ├── checkout/
│   │   └── order-received/[...orderId].vue  # Post-checkout confirmation (client-only)
│   ├── my-account/
│   │   ├── index.vue           # Account dashboard (client-only)
│   │   └── lost-password.vue   # Password reset (client-only)
│   ├── checkout.vue            # Redirect shim for main checkout flow
│   ├── search.vue              # Product search results
│   ├── contact.vue             # Contact form (prerendered)
│   ├── terms.vue               # Terms of service (prerendered)
│   ├── privacy.vue             # Privacy policy (prerendered)
│   ├── categories.vue          # All categories listing
│   ├── products.vue            # All products listing
│   └── inline-skates-size-calculator.vue  # Tool page (prerendered)
│
├── content/                    # Nuxt Content (Markdown)
│   └── blog/
│       └── {slug}/
│           └── index.md        # Blog post frontmatter + Markdown body
│
├── server/
│   ├── api/                    # Nitro API routes
│   │   ├── cached-product.ts   # KV product lookup by slug (POST)
│   │   ├── create-admin-order.post.ts  # Helcim order via WP REST API
│   │   ├── helcim.post.ts      # Helcim payment processing
│   │   ├── helcim-validate.post.ts     # Helcim payment validation
│   │   ├── stripe.post.ts      # Stripe webhook handler
│   │   ├── contact.ts          # SendGrid email endpoint
│   │   ├── exchange-rate.ts    # Exchange rate proxy
│   │   ├── sitemap.xml.ts      # Sitemap generation endpoint
│   │   ├── trigger-cache-warming.ts  # Cache warm trigger (POST, auth required)
│   │   ├── stock-status.get.ts # Real-time stock check
│   │   ├── verify-turnstile.post.ts  # Turnstile CAPTCHA verification
│   │   ├── validate-stock.post.ts    # Pre-checkout stock validation
│   │   ├── products-search.ts  # Product search endpoint
│   │   ├── product-seo/[slug].ts     # Per-product SEO meta data endpoint
│   │   ├── revalidate.ts       # Cache revalidation trigger
│   │   ├── internal/           # Internal script storage (KV state management)
│   │   └── webhook/
│   │       └── woocommerce.ts  # WooCommerce webhook receiver
│   ├── middleware/
│   │   └── forward-client-ip.ts  # Forwards real client IP to GraphQL
│   ├── plugins/
│   │   └── force-user-agent.ts   # Sets User-Agent for SSR GraphQL requests
│   └── routes/
│       └── sitemap.xml.ts        # Alternate sitemap route
│
├── scripts/                    # Build + cache management scripts (Node.js)
│   ├── build-sitemap.js        # Generates blog-routes.json, blog-redirects.json, sitemap-data.json
│   ├── build-all-routes.js     # All route data generation
│   ├── build-products-cache.js # Fetches products → KV cache at build time
│   ├── build-categories-cache.js # Fetches categories → KV
│   ├── setup-script.js         # Populates Cloudflare KV post-build
│   ├── cache-warmer.js         # HTTP-based cache warming (visits each URL)
│   ├── prebuild-cache-purge.js # Purges stale KV before build
│   └── verify-env.js           # Validates required env vars
│
├── data/                       # Generated build artifacts (git-committed for reproducibility)
│   ├── blog-routes.json        # Prerender route list for blog posts
│   ├── blog-redirects.json     # Slug → /blog/slug redirect rules
│   ├── blog-slugs.json         # All blog slugs (for redirect generation)
│   ├── sitemap-data.json       # Sitemap entries (read by /api/sitemap.xml)
│   ├── category-routes.json    # Category routes to prerender
│   ├── product-routes.json     # Product routes to prerender
│   ├── category-content.ts     # Static category description content
│   ├── seo_Keywordlist.csv     # Target keywords (check before creating blog posts)
│   └── blog-keywords-used.md   # Keyword usage tracker (prevent cannibalization)
│
├── locales/                    # i18n translation strings
│   ├── en-CA.json              # Canadian English (default)
│   ├── en-US.json              # US English
│   ├── fr-CA.json              # French Canadian
│   └── en.json                 # Fallback English
│
├── modules/
│   └── cache-sync.ts           # Custom Nuxt module for KV cache logging/hooks
│
├── plugins/
│   ├── graphql-headers.ts      # Sets headers for SSR GraphQL requests
│   └── i18n-routes.ts          # i18n route configuration
│
├── public/                     # Static assets served directly
│   ├── _headers                # Cloudflare Pages HTTP response headers (CSP, cache control)
│   ├── _redirects              # Cloudflare Pages redirect rules
│   ├── robots.txt
│   ├── images/                 # Product, blog, and marketing images
│   │   └── blog/posted/        # AI-generated blog post images
│   ├── icons/                  # Site icons
│   └── videos/                 # Video assets
│
├── utils/
│   ├── priceConverter.ts       # USD→CAD price conversion + formatting utilities
│   └── javascript.ts           # Misc JS utilities
│
├── types/
│   ├── index.d.ts              # Custom TypeScript type declarations
│   ├── gtag.d.ts               # Google Tag Manager type shims
│   └── vue-spinner.d.ts        # vue-spinner type shims
│
├── docs/                       # Developer documentation
│   ├── seo-master-guide.md     # SEO implementation guide
│   ├── blog-master-guide.md    # Blog writing rules and workflow
│   ├── caching-local.md        # Caching architecture for local dev
│   ├── infrastructure-and-integrations.md  # Helcim, Stripe, Cloudflare setup
│   └── development.md          # Local dev workflow
│
└── woonuxt_base/               # READ-ONLY base layer (upstream parent theme)
    └── app/
        ├── components/         # Base components (override by matching name in /components)
        │   ├── cartElements/
        │   ├── filtering/
        │   ├── forms/
        │   ├── generalElements/
        │   ├── productElements/
        │   └── shopElements/
        ├── composables/        # Base composables (override by matching name in /composables)
        ├── pages/              # Base pages (override by matching path in /pages)
        │   ├── my-account/
        │   ├── oauth/
        │   ├── product/
        │   └── product-category/
        ├── queries/            # GraphQL .gql files (read-only, auto-imported via nuxt-graphql-client)
        │   ├── fragments/      # Reusable GQL fragments
        │   └── *.gql           # Operations: getProduct, addToCart, login, etc.
        ├── types/              # Base TypeScript type declarations
        └── constants/          # Base constants
```

## Directory Purposes

**`components/` (root):**

- Purpose: Canadian-specific and overridden UI components
- Contains: Blog, SEO, payment UI (Helcim), custom product/category elements
- Convention: Override base by creating file with same name as `woonuxt_base/app/components/{...}/ComponentName.vue`

**`composables/` (root):**

- Purpose: State management and business logic (no Vuex/Pinia — all `useState`-based)
- Contains: Canadian SEO, caching, cart/auth/checkout, exchange rate, category/product SEO
- Convention: Override base by creating `composables/useComposableName.ts` matching base name

**`pages/` (root):**

- Purpose: Route-mapped Vue pages; override base pages at same path
- SSR disabled pages: `/checkout/**`, `/cart`, `/my-account/**`, `/account/**`
- Prerendered pages: `/`, `/blog/**`, `/product-category/**`, `/contact`, `/terms`, `/privacy`

**`server/api/`:**

- Purpose: Nitro server routes (API endpoints)
- Contains: Payment processing, KV cache access, order management
- Pattern: `defineEventHandler(async (event) => { ... })` — file path maps to URL

**`content/blog/`:**

- Purpose: Markdown blog posts consumed by Nuxt Content
- Contains: `{slug}/index.md` with YAML frontmatter
- Frontmatter keys: `title`, `description`, `category`, `date`, `author`, `authorBio`, `image`, `ogImage`, `tags`

**`scripts/`:**

- Purpose: Build-time and post-deploy automation (Node.js, not Nuxt)
- Contains: Route data generation, KV cache population and warming
- Must run before `nuxt build` via `npm run build` (full pipeline)

**`data/`:**

- Purpose: Generated build artifacts consumed by `nuxt.config.ts` and API routes
- Contains: Route lists, redirect maps, sitemap data, category content, keyword tracking
- Generated by: `scripts/` during `npm run build`

## Key File Locations

**Entry Points:**

- `app.vue`: App shell — every page request passes through this
- `nuxt.config.ts`: All route rules, caching, storage bindings, module config

**Configuration:**

- `nuxt.config.ts`: Main Nuxt config (route rules, KV bindings, global meta, modules)
- `nuxt.config.local.ts`: Local dev overrides
- `cloudflare-pages.toml`: Cloudflare deployment settings
- `i18n.config.ts`: Locales and i18n setup

**Core Commerce Flow:**

- `pages/product/[slug].vue`: Product detail (KV cache → GQL fallback)
- `pages/product-category/[slug].vue`: Category listing (paginated GQL)
- `composables/useCachedProduct.ts`: KV product retrieval
- `server/api/cached-product.ts`: KV cache lookup handler

**SEO (Critical):**

- `composables/useCanadianSEO.ts`: Hreflang + geo + og tags — use on every public page
- `composables/useProductSEO.ts`: Product-specific meta
- `composables/useCategorySEO.ts`: Category-specific meta
- `components/SEOStructuredData.vue`: Schema.org JSON-LD injector
- `nuxt.config.ts` (`app.head`): Global geo/currency meta and Organization schema

**Payment (Helcim Special Case):**

- `server/api/create-admin-order.post.ts`: Admin order via WP REST API (bypasses GQL sessions)
- `server/api/helcim.post.ts`: Helcim payment processing
- `composables/useCheckout.ts`: Checkout state and order submission logic
- `components/shopElements/PaymentOptions.vue`: Payment method selection
- `components/shopElements/HelcimCard.vue`: Helcim payment form

**Blog:**

- `content/blog/{slug}/index.md`: Blog post source
- `pages/blog/[slug].vue`: Blog post template
- `pages/blog/index.vue`: Blog listing
- `components/BlogPostCard.vue`: Blog listing card
- `scripts/build-sitemap.js`: Generates `data/blog-routes.json` + redirects + sitemap

**Cache Management:**

- `scripts/setup-script.js`: Populates KV namespaces at build time
- `scripts/cache-warmer.js`: Warms pages after deploy
- `server/api/trigger-cache-warming.ts`: HTTP trigger for post-deploy warming
- `modules/cache-sync.ts`: Nuxt module for KV cache hooks

## Naming Conventions

**Files:**

- Vue components: PascalCase (`ProductCard.vue`, `AppHeader.vue`)
- Composables: camelCase with `use` prefix (`useCanadianSEO.ts`, `useCachedProduct.ts`)
- Server routes: kebab-case with method suffix where needed (`cached-product.ts`, `create-admin-order.post.ts`)
- GQL queries: camelCase verb-noun (`getProduct.gql`, `addToCart.gql`)
- GQL fragments: PascalCase (`CartFragment.gql`, `SimpleProduct.gql`)
- Build scripts: kebab-case (`build-sitemap.js`, `cache-warmer.js`)
- Data files: kebab-case with `-` separators (`blog-routes.json`, `category-content.ts`)

**Directories:**

- Component subdirs: camelCase categories (`cartElements/`, `productElements/`, `shopElements/`)
- Pages: kebab-case to match URL segments (`product-category/`, `my-account/`)

**Composable State Keys:**

- `useState` keys: camelCase matching the composable domain (`'cart'`, `'viewer'`, `'orderInput'`, `'customer'`)

## Where to Add New Code

**New Public Page:**

- Create: `pages/your-page.vue`
- Use `useCanadianSEO()` for all meta tags
- Add to prerender routes in `nuxt.config.ts` if static

**New Blog Post:**

1. Create: `content/blog/your-slug/index.md` with required frontmatter
2. Check keyword: `data/seo_Keywordlist.csv` and `data/blog-keywords-used.md`
3. Generate image: `node scripts/generate-blog-image.js "keyword" --posted`
4. Run: `npm run build-all-routes` to regenerate `data/blog-routes.json` and redirects

**New Component:**

- Root override (replaces base): `components/{subdir}/ComponentName.vue` — must match exact base file name
- New component: `components/{appropriate-subdir}/NewComponent.vue`

**New Composable:**

- Root override: `composables/useComposableName.ts` — must match base file name
- New composable: `composables/useNewThing.ts`

**New API Endpoint:**

- Location: `server/api/endpoint-name.ts` (or `endpoint-name.post.ts`, `endpoint-name.get.ts`)
- Pattern: `export default defineEventHandler(async (event) => { ... })`
- URL maps to: `/api/endpoint-name`

**New GraphQL Query:**

- Do NOT modify `woonuxt_base/app/queries/` (read-only)
- Create custom queries in `/gql/queries/` if directory exists, or inline in page with `$fetch` to `GQL_HOST`

**New Server Middleware:**

- Location: `server/middleware/your-middleware.ts`
- Runs on every request before API handlers

## Special Directories

**`woonuxt_base/` (read-only):**

- Purpose: Upstream parent theme
- Generated: No
- Committed: Yes

**`data/` (generated artifacts):**

- Purpose: Build-time generated JSON/data files consumed by config and routes
- Generated: Yes (by `scripts/` during `npm run build`)
- Committed: Yes (needed for hot builds without running scripts)

**`.nuxt/dev-cache/` (local dev cache):**

- Purpose: Local filesystem cache emulating Cloudflare KV in development
- Generated: Yes
- Committed: No — in `.gitignore`

**`dist/` (production build output):**

- Purpose: Output of `nuxt build` / `nuxt generate`
- Generated: Yes
- Committed: No — in `.gitignore`

**`public/images/blog/posted/`:**

- Purpose: AI-generated blog post feature images
- Generated: By `scripts/generate-blog-image.js`
- Committed: Yes
- Rule: NEVER reuse across posts — each post must have a unique image

**`.planning/codebase/`:**

- Purpose: GSD codebase analysis documents for AI planning context
- Generated: By codebase mapper
- Committed: Yes (planning artifacts)

---

_Structure analysis: 2026-04-09_
