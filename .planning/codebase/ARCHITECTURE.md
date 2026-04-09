# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Two-layer Nuxt 3 headless WooCommerce SSR app with Cloudflare KV ISR-style caching

**Key Characteristics:**

- Parent-child layer override pattern: `woonuxt_base/` (base) + root `/` (custom overrides)
- Composable-driven state management via Nuxt `useState` (no Vuex/Pinia)
- Hybrid rendering: SSR enabled globally; checkout/cart/account are client-only
- Three-tier caching: static prerender → Cloudflare KV route cache → KV script data
- Dual data sources: WPGraphQL (commerce) + Nuxt Content (blog)

## Layers

**Base Layer (`woonuxt_base/`):**

- Purpose: Upstream parent theme. Provides shared components, composables, GQL queries, types, and Tailwind config.
- Location: `woonuxt_base/app/`
- Contains: Base components, GQL queries (`.gql` files), base composables, type fragments, base pages
- Depends on: `nuxt-graphql-client` package
- Used by: Root custom layer via `extends: ['./woonuxt_base']` in `nuxt.config.ts`
- Rule: READ-ONLY. Never modify directly.

**Custom Layer (Root `/`):**

- Purpose: All site-specific overrides and extensions for proskatersplace.ca (Canadian market)
- Location: root `components/`, `composables/`, `pages/`
- Contains: Canadian SEO composables, Helcim payment, bilingual support, overridden components/pages
- Depends on: Base layer
- Priority: Root components/pages load first (`priority: 1000` in nuxt.config.ts)

**Server Layer (`server/`):**

- Purpose: API routes, middleware, and server-side integrations
- Location: `server/api/`, `server/middleware/`, `server/plugins/`, `server/routes/`
- Contains: Payment handlers, KV cache access, order management, sitemap, webhooks
- Depends on: Cloudflare KV storage (`useStorage()`), WordPress REST API, Helcim API
- Used by: Frontend pages via `$fetch()` and `useAsyncData()`

**Content Layer (`content/blog/`):**

- Purpose: Static blog posts as Markdown files powered by Nuxt Content
- Location: `content/blog/{slug}/index.md`
- Contains: YAML frontmatter + Markdown body
- Depends on: `@nuxt/content` module, Nuxt Content `queryContent()`
- Used by: `pages/blog/[slug].vue`, `pages/blog/index.vue`

**Build Pipeline (`scripts/`):**

- Purpose: Pre-build data generation and post-deploy cache management
- Location: `scripts/`
- Contains: Route data generation, KV cache setup/warm, sitemap build
- Depends on: WordPress GraphQL API, Cloudflare KV API, local `content/blog/`
- Produces: `data/blog-routes.json`, `data/blog-redirects.json`, `data/sitemap-data.json`, `data/product-routes.json`

## Data Flow

**Product Page Load (Primary Path — KV Cache):**

1. Build time: `scripts/build-products-cache.js` fetches all products from WordPress GraphQL and stores array in Cloudflare KV under `cached-products`
2. SSR request hits `pages/product/[slug].vue`
3. `useCachedProduct().getProductFromCache(slug)` calls `$fetch('/api/cached-product', { method: 'POST', body: { slug } })`
4. `server/api/cached-product.ts` reads `cached-products` from `useStorage()` (Cloudflare KV `NUXT_CACHE` binding), finds matching product
5. If cache miss, `useAsyncData()` falls back to `GqlGetProduct()` (WordPress GraphQL)
6. `useProductSEO()` sets page meta; `useExchangeRate()` converts USD → CAD

**Category Page Load:**

1. Build time: `scripts/build-categories-cache.js` + `data/category-routes.json` define routes to prerender
2. SSR request hits `pages/product-category/[slug].vue`
3. Inline GraphQL (`$fetch` to `GQL_HOST`) paginates all products for category
4. Results cached in Cloudflare KV with 7-day TTL
5. `useCategorySEO()` sets page meta; `useProducts()` manages filter/sort state

**Blog Page Load:**

1. Build time: `scripts/build-sitemap.js` scans `content/blog/` and generates `data/blog-routes.json` for prerendering
2. SSR request hits `pages/blog/[slug].vue`
3. `queryContent('blog', blogSlug).findOne()` reads Markdown from Nuxt Content
4. `useCanadianSEO()` injects hreflang, geo meta, og tags
5. Page is prerendered and cached in KV with 7-day TTL

**Helcim Checkout Flow:**

1. User builds cart via GraphQL mutations (`GqlAddToCart`, etc.)
2. `useCheckout()` stores billing/shipping/payment selection in `useState`
3. Helcim payment processes externally
4. Frontend `$fetch('/api/create-admin-order', { method: 'POST', body: orderData })`
5. `server/api/create-admin-order.post.ts` authenticates via WordPress Application Password (basic auth)
6. Creates WooCommerce order via WordPress REST API (bypasses session-based GraphQL limitations)
7. Applies coupons post-creation via REST API
8. Redirects to `/checkout/order-received/{orderId}`

**Cart / Auth State Flow:**

1. `app.vue` mounts and calls `useCart().refreshCart()`
2. `GqlGetCart()` fetches cart + customer + viewer + paymentGateways in one query
3. Results distributed to `useState` keys: `cart`, `customer`, `viewer`, `paymentGateways`
4. All composables (`useCart`, `useAuth`, `useCheckout`) read from same `useState` keys — shared global state
5. Auth mutations (`GqlLogin`) set session token via `useGqlToken()`

## Key Abstractions

**`useCanadianSEO()` (`composables/useCanadianSEO.ts`):**

- Purpose: Encapsulates all page meta — hreflang (en-CA, fr-CA, en-US, x-default), geo targeting (Toronto), Open Graph, canonical
- Pattern: `setCanadianSEO({ title, description, image, type, locale })` — must be called on every public page
- Replaces: direct `useHead()` / `useSeoMeta()` calls for meta tags

**`useCachedProduct()` (`composables/useCachedProduct.ts`):**

- Purpose: KV-first product data retrieval with GraphQL fallback
- Pattern: `await getProductFromCache(slug)` → POST `/api/cached-product` → KV lookup → optional GQL fallback

**`useCart()` (`composables/useCart.ts`):**

- Purpose: Cart state, add/remove/update operations, payment gateways
- Pattern: `useState('cart')` shared key; `refreshCart()` for full server sync via `GqlGetCart`

**`useAuth()` (`composables/useAuth.ts`):**

- Purpose: Login/logout, customer data, viewer (logged-in user), order history
- Pattern: `useState('viewer')`, `useState('customer')` — set by `useCart().refreshCart()` on mount

**`useCheckout()` (`composables/useCheckout.ts`):**

- Purpose: Multi-step checkout, billing/shipping form state, payment method selection, order metadata
- Pattern: `useState('orderInput')` persists across steps; Helcim orders bypass GQL via admin REST

**GQL queries (`woonuxt_base/app/queries/**/\*.gql`):\*\*

- Purpose: Typed GraphQL operations auto-generated into TypeScript via `nuxt-graphql-client`
- Pattern: `GqlGetProduct()`, `GqlAddToCart()`, etc. — available as auto-imported functions via `#gql` alias

## Entry Points

**`app.vue`:**

- Location: `app.vue`
- Triggers: All page loads
- Responsibilities: Shell layout (header, footer, cart overlay, mobile menu), global title template, toast container

**`nuxt.config.ts`:**

- Location: `nuxt.config.ts`
- Triggers: Build and runtime
- Responsibilities: Layer extension, route rules (prerender/cache/SSR flags), KV storage bindings, module registration, runtime config (secrets), global product attribute filter config

**`server/api/*.ts`:**

- Location: `server/api/`
- Triggers: HTTP requests from frontend or external systems
- Responsibilities: Payment processing, KV cache reads, order creation, sitemap generation, exchange rate proxy, Turnstile validation

## Error Handling

**Strategy:** Composable-level try/catch with graceful degradation

**Patterns:**

- Product page: KV cache miss → GraphQL fallback; GQL error → show error state
- Exchange rate: Initialization failure → fallback to `buildTimeExchangeRate` from `runtimeConfig`
- Admin order creation: Retry with exponential backoff (3 attempts, 30s timeout per attempt)
- Cart refresh failure: Log error, clear cookies, reset state to null
- Blog post 404: `throw createError({ statusCode: 404 })` in `pages/blog/[slug].vue`

## Cross-Cutting Concerns

**SEO:** `useCanadianSEO()` — mandatory on all public pages. Sets hreflang, geo meta, og tags, canonical.
**Authentication:** WordPress session cookies + optional JWT auth token via `useGqlToken()`. Turnstile CAPTCHA on login/register.
**Currency:** USD source data → CAD display via `useExchangeRate()` + `utils/priceConverter.ts`. Build-time fallback rate in `runtimeConfig.public.buildTimeExchangeRate`.
**i18n:** `@nuxtjs/i18n` module. Locales: `en-CA` (default), `en-US`, `fr-CA`. Locale files in `locales/`.
**Logging:** `console.log`/`console.warn`/`console.error` throughout server routes and composables. No structured logging library.
**Validation:** Turnstile token verification via `server/api/verify-turnstile.post.ts` for checkout and login flows.

---

_Architecture analysis: 2026-04-09_
