# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**

- TypeScript — All Nuxt pages, composables, components, and server API routes
- JavaScript — Build scripts in `scripts/` (Node.js CommonJS/ESM scripts)

**Secondary:**

- Markdown — Blog content in `content/blog/{slug}/index.md`
- TOML — Cloudflare Pages deployment config (`cloudflare-pages.toml`)

## Runtime

**Environment:**

- Node.js 20.x (enforced by `cloudflare-pages.toml` `NODE_VERSION = "20"` and `.nvmrc`)
- Cloudflare Workers runtime for deployed server functions (nitro preset: `cloudflare-pages`)

**Package Manager:**

- npm 10.x (enforced by preinstall script `npx only-allow npm`)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**

- Nuxt 3 (`^3.13.2`) — Full-stack Vue 3 framework; SSR enabled (`ssr: true`)
- Vue 3 — Component framework (included via Nuxt)
- Nitro — Server engine with `cloudflare-pages` preset and Node.js compat flags

**CSS/UI:**

- Tailwind CSS (`@nuxtjs/tailwindcss ^6.13.1`) — Utility-first styling
- `@tailwindcss/typography ^0.5.16` — Prose styling for blog posts
- `@nuxt/icon ^1.10.3` — Icon integration (Iconify with `@iconify-json/ion`)
- `@vueform/slider ^2.1.10` — Range slider component for price filters
- `vue-spinner ^1.0.4` — Loading spinners

**Content:**

- `@nuxt/content ^2.13.4` — Markdown-based blog (`content/blog/`), client DB mode enabled

**Image:**

- `@nuxt/image 1.9.0` — `<NuxtImg>` component (optimization disabled on Cloudflare)
- `sharp 0.32.6` — Image optimization in build scripts (`scripts/optimize-images.js`)

**Internationalization:**

- `@nuxtjs/i18n ^8.5.5` — Locales: `en-CA` (default), `en-US`, `fr-CA`
- Config: `i18n.config.ts`; locale files in `locales/`

**GraphQL:**

- `nuxt-graphql-client ^0.2.43` — WPGraphQL client with auto-generated TypeScript types; `#gql` import alias; proxied through Nuxt server

**SEO:**

- `@nuxtjs/seo ^2.0.3` — SEO module
- Custom `useCanadianSEO()` composable (`composables/useCanadianSEO.ts`) — Bilingual hreflang, geo-targeting, CAD currency

**Analytics:**

- `nuxt-gtag ^3.0.2` — Google Tag Manager / Analytics integration

**Search:**

- `fuse.js ^7.1.0` — Client-side fuzzy search (active, used in `composables/useSearch.ts`)
- `algoliasearch ^5.21.0`, `vue-instantsearch ^4.20.5`, `instantsearch.css ^8.5.1` — Installed but not actively used in current search implementation

**Utilities:**

- `lodash-es ^4.17.21` — Utility functions
- `@vueuse/core ^12.7.0` — Vue composable utilities
- `vue-turnstile ^1.0.11` — Cloudflare Turnstile CAPTCHA widget

**Payment SDKs:**

- `stripe ^17.7.0` — Stripe server-side SDK
- `@stripe/stripe-js ^4.10.0` — Stripe client-side SDK

**AI:**

- `@google/genai ^1.43.0` — Google Gemini SDK used in `scripts/generate-blog-image.js` for AI blog image generation

**Email:**

- `@sendgrid/mail ^8.1.4` — SendGrid email SDK

## Two-Layer Architecture

- `woonuxt_base/` — READ-ONLY base layer (parent theme). Contains shared components, composables, GQL queries (`woonuxt_base/app/queries/**/*.gql`), Tailwind config. Extended via `nuxt.config.ts: extends: ['./woonuxt_base']`
- Root `/` — Custom layer. Override any base file by placing a file with the same name under `components/`, `composables/`, `pages/`, etc. Root components load first via `priority: 1000`
- WooNuxt base settings package: `woonuxt-settings ^1.0.66`

## State Management

No Pinia or Vuex. Uses Nuxt `useState()` composables:

- `composables/useCart.ts` — Cart state and operations
- `composables/useAuth.ts` — Authentication and customer data
- `composables/useCheckout.ts` — Multi-step checkout, payment selection
- `composables/useExchangeRate.ts` — CAD/USD currency conversion with KV cache + cookie persistence
- `composables/useCachedProduct.ts` — KV-cached product retrieval with GraphQL fallback

## Caching Layers

1. **Static prerender** (build-time) — Blog posts, categories, home, static pages via `routeRules` in `nuxt.config.ts`
2. **Cloudflare KV route cache** (ISR-style) — Products: 72h TTL, Categories/Blog: 7d TTL. Storage binding: `NUXT_CACHE`
3. **KV script data** — Product/category lists for cache warmer. Storage binding: `NUXT_SCRIPT_DATA`
4. **Client-side cookie** — Exchange rate persisted 24h via `exchange-rate-data` cookie

## Build Pipeline

```bash
npm run build
# 1. scripts/prebuild-cache-purge.js  → Purge stale Cloudflare KV
# 2. scripts/build-sitemap.js         → Generate data/blog-routes.json, data/blog-redirects.json, data/sitemap-data.json
# 3. nuxt build                       → Static generation + prerendering
# 4. scripts/setup-script.js          → Populate Cloudflare KV with product/category data
```

Build script directory: `scripts/` (20 Node.js scripts for cache management, route generation, image optimization)

## Configuration

**Environment Variables (Server-only):**

- `GQL_HOST` — WordPress GraphQL endpoint
- `NUXT_STRIPE_SECRET_KEY` — Stripe secret
- `NUXT_HELCIM_API_TOKEN` — Helcim payment gateway
- `WC_CONSUMER_KEY` / `WC_CONSUMER_SECRET` — WooCommerce REST API
- `WP_ADMIN_USERNAME` / `WP_ADMIN_APP_PASSWORD` — WordPress Application Password
- `SENDGRID_API_KEY` / `SENDING_EMAIL` / `RECEIVING_EMAIL` — Email
- `REVALIDATION_SECRET` — Cache warming auth
- `CF_ACCOUNT_ID` / `CF_API_TOKEN` / `CF_KV_NAMESPACE_ID_CACHE` / `CF_KV_NAMESPACE_ID_SCRIPT_DATA` — Cloudflare

**Environment Variables (Public):**

- `NUXT_STRIPE_PUBLISHABLE_KEY` — Stripe client key
- `BASE_URL` — WordPress base URL
- `EXCHANGE_RATE_API_KEY` — ExchangeRate-API key
- `TURNSTYLE_SITE_KEY` / `TURNSTYLE_SECRET_KEY` — Cloudflare Turnstile
- `NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE` — Fallback USD/CAD rate (default `1.37`)
- `NUXT_PUBLIC_FREE_SHIPPING_THRESHOLD` — Free shipping threshold in CAD (default `135`)

**Key Config Files:**

- `nuxt.config.ts` — Main config (modules, routeRules, nitro, runtimeConfig, i18n, gtag)
- `nuxt.config.local.ts` — Local dev overrides (uses `data/local-schema.graphql` to avoid remote introspection errors)
- `cloudflare-pages.toml` — Cloudflare Pages deployment, Node 20, headers, redirects
- `i18n.config.ts` — Locale fallback chain configuration
- `data/local-schema.graphql` — Local GraphQL schema for dev without WordPress

## Platform Requirements

**Development:**

- Node.js 20.x
- npm 10.x
- Optional: `mkcert` for HTTPS dev (`npm run dev:ssl`)

**Production:**

- Cloudflare Pages (Workers runtime)
- Two Cloudflare KV namespaces: `NUXT_CACHE`, `NUXT_SCRIPT_DATA`
- WordPress + WPGraphQL backend (external, at `GQL_HOST`)

---

_Stack analysis: 2026-04-09_
