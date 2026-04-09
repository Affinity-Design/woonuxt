<!-- GSD:project-start source:PROJECT.md -->
## Project

**Backorder & Condition-Based Cart/Checkout Notices**

A reusable notice system for the ProSkaters Place Canada checkout flow that warns customers about product conditions (backorder status, clearance no-refund policy) before they complete purchase. Notices appear inline per line item and as summary banners in both cart and checkout. Order metadata is written to WooCommerce so backorder/clearance status is visible in admin and emails.

**Core Value:** Customers must see clear, unmissable warnings about backorder items and clearance no-refund policies before they hit "Place Order" — preventing disputes and setting correct expectations.

### Constraints

- **Architecture**: Must not modify `woonuxt_base/`. Override by copying files to root.
- **Data**: Must work with existing WPGraphQL schema — no WordPress plugin changes.
- **Rendering**: Cart/checkout are client-only (`ssr: false`). Notices render client-side only.
- **i18n**: All user-facing strings must have en-CA and fr-CA translations.
- **Reusability**: Notice component must be generic (condition + message + type), not hardcoded to backorder.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript — All Nuxt pages, composables, components, and server API routes
- JavaScript — Build scripts in `scripts/` (Node.js CommonJS/ESM scripts)
- Markdown — Blog content in `content/blog/{slug}/index.md`
- TOML — Cloudflare Pages deployment config (`cloudflare-pages.toml`)
## Runtime
- Node.js 20.x (enforced by `cloudflare-pages.toml` `NODE_VERSION = "20"` and `.nvmrc`)
- Cloudflare Workers runtime for deployed server functions (nitro preset: `cloudflare-pages`)
- npm 10.x (enforced by preinstall script `npx only-allow npm`)
- Lockfile: `package-lock.json` (present)
## Frameworks
- Nuxt 3 (`^3.13.2`) — Full-stack Vue 3 framework; SSR enabled (`ssr: true`)
- Vue 3 — Component framework (included via Nuxt)
- Nitro — Server engine with `cloudflare-pages` preset and Node.js compat flags
- Tailwind CSS (`@nuxtjs/tailwindcss ^6.13.1`) — Utility-first styling
- `@tailwindcss/typography ^0.5.16` — Prose styling for blog posts
- `@nuxt/icon ^1.10.3` — Icon integration (Iconify with `@iconify-json/ion`)
- `@vueform/slider ^2.1.10` — Range slider component for price filters
- `vue-spinner ^1.0.4` — Loading spinners
- `@nuxt/content ^2.13.4` — Markdown-based blog (`content/blog/`), client DB mode enabled
- `@nuxt/image 1.9.0` — `<NuxtImg>` component (optimization disabled on Cloudflare)
- `sharp 0.32.6` — Image optimization in build scripts (`scripts/optimize-images.js`)
- `@nuxtjs/i18n ^8.5.5` — Locales: `en-CA` (default), `en-US`, `fr-CA`
- Config: `i18n.config.ts`; locale files in `locales/`
- `nuxt-graphql-client ^0.2.43` — WPGraphQL client with auto-generated TypeScript types; `#gql` import alias; proxied through Nuxt server
- `@nuxtjs/seo ^2.0.3` — SEO module
- Custom `useCanadianSEO()` composable (`composables/useCanadianSEO.ts`) — Bilingual hreflang, geo-targeting, CAD currency
- `nuxt-gtag ^3.0.2` — Google Tag Manager / Analytics integration
- `fuse.js ^7.1.0` — Client-side fuzzy search (active, used in `composables/useSearch.ts`)
- `algoliasearch ^5.21.0`, `vue-instantsearch ^4.20.5`, `instantsearch.css ^8.5.1` — Installed but not actively used in current search implementation
- `lodash-es ^4.17.21` — Utility functions
- `@vueuse/core ^12.7.0` — Vue composable utilities
- `vue-turnstile ^1.0.11` — Cloudflare Turnstile CAPTCHA widget
- `stripe ^17.7.0` — Stripe server-side SDK
- `@stripe/stripe-js ^4.10.0` — Stripe client-side SDK
- `@google/genai ^1.43.0` — Google Gemini SDK used in `scripts/generate-blog-image.js` for AI blog image generation
- `@sendgrid/mail ^8.1.4` — SendGrid email SDK
## Two-Layer Architecture
- `woonuxt_base/` — READ-ONLY base layer (parent theme). Contains shared components, composables, GQL queries (`woonuxt_base/app/queries/**/*.gql`), Tailwind config. Extended via `nuxt.config.ts: extends: ['./woonuxt_base']`
- Root `/` — Custom layer. Override any base file by placing a file with the same name under `components/`, `composables/`, `pages/`, etc. Root components load first via `priority: 1000`
- WooNuxt base settings package: `woonuxt-settings ^1.0.66`
## State Management
- `composables/useCart.ts` — Cart state and operations
- `composables/useAuth.ts` — Authentication and customer data
- `composables/useCheckout.ts` — Multi-step checkout, payment selection
- `composables/useExchangeRate.ts` — CAD/USD currency conversion with KV cache + cookie persistence
- `composables/useCachedProduct.ts` — KV-cached product retrieval with GraphQL fallback
## Caching Layers
## Build Pipeline
# 1. scripts/prebuild-cache-purge.js  → Purge stale Cloudflare KV
# 2. scripts/build-sitemap.js         → Generate data/blog-routes.json, data/blog-redirects.json, data/sitemap-data.json
# 3. nuxt build                       → Static generation + prerendering
# 4. scripts/setup-script.js          → Populate Cloudflare KV with product/category data
## Configuration
- `GQL_HOST` — WordPress GraphQL endpoint
- `NUXT_STRIPE_SECRET_KEY` — Stripe secret
- `NUXT_HELCIM_API_TOKEN` — Helcim payment gateway
- `WC_CONSUMER_KEY` / `WC_CONSUMER_SECRET` — WooCommerce REST API
- `WP_ADMIN_USERNAME` / `WP_ADMIN_APP_PASSWORD` — WordPress Application Password
- `SENDGRID_API_KEY` / `SENDING_EMAIL` / `RECEIVING_EMAIL` — Email
- `REVALIDATION_SECRET` — Cache warming auth
- `CF_ACCOUNT_ID` / `CF_API_TOKEN` / `CF_KV_NAMESPACE_ID_CACHE` / `CF_KV_NAMESPACE_ID_SCRIPT_DATA` — Cloudflare
- `NUXT_STRIPE_PUBLISHABLE_KEY` — Stripe client key
- `BASE_URL` — WordPress base URL
- `EXCHANGE_RATE_API_KEY` — ExchangeRate-API key
- `TURNSTYLE_SITE_KEY` / `TURNSTYLE_SECRET_KEY` — Cloudflare Turnstile
- `NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE` — Fallback USD/CAD rate (default `1.37`)
- `NUXT_PUBLIC_FREE_SHIPPING_THRESHOLD` — Free shipping threshold in CAD (default `135`)
- `nuxt.config.ts` — Main config (modules, routeRules, nitro, runtimeConfig, i18n, gtag)
- `nuxt.config.local.ts` — Local dev overrides (uses `data/local-schema.graphql` to avoid remote introspection errors)
- `cloudflare-pages.toml` — Cloudflare Pages deployment, Node 20, headers, redirects
- `i18n.config.ts` — Locale fallback chain configuration
- `data/local-schema.graphql` — Local GraphQL schema for dev without WordPress
## Platform Requirements
- Node.js 20.x
- npm 10.x
- Optional: `mkcert` for HTTPS dev (`npm run dev:ssl`)
- Cloudflare Pages (Workers runtime)
- Two Cloudflare KV namespaces: `NUXT_CACHE`, `NUXT_SCRIPT_DATA`
- WordPress + WPGraphQL backend (external, at `GQL_HOST`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Vue SFCs: PascalCase — `BlogPostCard.vue`, `ProductCard.vue`, `AddToCartButton.vue`
- Composables: camelCase prefixed with `use` — `useCart.ts`, `useCanadianSEO.ts`
- Server routes: kebab-case with HTTP method suffix — `create-admin-order.post.ts`, `stock-status.get.ts`, `contact.ts`
- Utilities: camelCase — `priceConverter.ts`, `javascript.ts`
- Config overrides: `.local` suffix — `nuxt.config.local.ts`
- Composable exports: `use` prefix noun in PascalCase — `useCart`, `useCanadianSEO`, `useCachedProduct`
- Internal functions: camelCase verbs — `refreshCart`, `addToCart`, `toggleCart`, `setCanadianSEO`
- Async functions: camelCase, async/await only (no `.then()` chaining)
- Reactive state: camelCase — `cart`, `isPending`, `isUpdatingCart`
- `ref()` values: camelCase, no `Ref` suffix
- Constants: camelCase (no ALL_CAPS convention observed)
- PascalCase — `BlogPost`, `AuthCredentials`, `CanadianSEOOptions`, `FAQItem`, `ProductSEOData`
- Interfaces declared inline near their usage (not in a separate global types file)
- Global WooCommerce types imported from `#woo`, GraphQL input types from `#gql`
- String keys match composable noun — `'cart'`, `'viewer'`, `'isPending'`, `'exchangeRate'`
- Shared across composables via same key string (acts as global store key)
- Standard Nuxt/Vue conventions: `v-if`, `v-for`, `v-model`, `:prop`, `@event`
## Code Style (Prettier)
- `"semi": true` — always use semicolons
- `"singleQuote": true` — single quotes for strings
- `"bracketSameLine": true` — closing `>` of JSX/template on same line
- `"printWidth": 160` — wide lines (160 chars)
- `"bracketSpacing": false` — no spaces in `{obj}` destructures → `{obj}` not `{ obj }`
## Vue Component Structure
- Always `<script setup>` syntax
- `defineProps<Interface>()` generic style preferred in simple components:
- Legacy object style in some older components:
- Emits: `defineEmits` — not observed in examined components (no custom events in root layer)
- `computed()`, `ref()`, `watch()` imported explicitly in complex pages
- `useState<T>('key', () => init)` for server/client shared reactive state
- `toRef(props, 'key')` for converting props to reactive refs
## Import Organization
- Composables (`useCart`, `useAuth`, `useCanadianSEO`) required **no import statement** — Nuxt auto-imports
- `useRoute`, `useHead`, `useRuntimeConfig`, `useAsyncData`, `useAsyncGql` — all auto-imported
- `GqlGetCart`, `GqlLogin`, etc. — auto-imported from nuxt-graphql-client
- `defineNuxtPlugin`, `defineEventHandler` — global Nuxt auto-imports (no import needed)
- `~/utils/xxx` — root utils directory
- `#gql` — GraphQL generated types
- `#woo` — WooCommerce types (likely from woonuxt_base)
- `#imports` — explicit fallback for Nuxt imports when auto-import doesn't resolve
## Error Handling
- Return structured objects with `statusCode` and `body` JSON string (inconsistent — not using `createError()` in server routes)
- `readBody(event)` followed by manual field validation
- `logGQLError(error)` from `useHelpers()` as centralized GQL error logger
- Followed by `clearAllCookies()` and state reset on auth-related failures
- `// @ts-ignore` used in 16+ places across the codebase
- Primarily for Nuxt auto-imports inside composables (`useRoute`, `useRuntimeConfig` in `useCanadianSEO.ts`)
- Also used for GraphQL response typing in `pages/product/[slug].vue` (lines 80, 137, 374, 387, 396)
- `import.meta.server` / `import.meta.client` for SSR guards (not `process.server`)
- `typeof window === 'undefined'` also used for SSR/client detection
## Logging
- Server-side (API routes): Emoji-prefixed messages — `console.log('🛠️ Creating order...')`, `console.error('❌ Missing...')`, `console.warn('⚠️ ...')`
- Composable dev logging: `console.log('[useProducts] Sample...')` with `[composableName]` prefix
- No structured logging library used
## Comments
## Composable Design Patterns
- Each composable owns its state keys
- State is shared across multiple component instances via the same string key
- Composables call each other (e.g., `useCart` calls `useAuth` methods)
## Template Patterns
## Server API Conventions
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Parent-child layer override pattern: `woonuxt_base/` (base) + root `/` (custom overrides)
- Composable-driven state management via Nuxt `useState` (no Vuex/Pinia)
- Hybrid rendering: SSR enabled globally; checkout/cart/account are client-only
- Three-tier caching: static prerender → Cloudflare KV route cache → KV script data
- Dual data sources: WPGraphQL (commerce) + Nuxt Content (blog)
## Layers
- Purpose: Upstream parent theme. Provides shared components, composables, GQL queries, types, and Tailwind config.
- Location: `woonuxt_base/app/`
- Contains: Base components, GQL queries (`.gql` files), base composables, type fragments, base pages
- Depends on: `nuxt-graphql-client` package
- Used by: Root custom layer via `extends: ['./woonuxt_base']` in `nuxt.config.ts`
- Rule: READ-ONLY. Never modify directly.
- Purpose: All site-specific overrides and extensions for proskatersplace.ca (Canadian market)
- Location: root `components/`, `composables/`, `pages/`
- Contains: Canadian SEO composables, Helcim payment, bilingual support, overridden components/pages
- Depends on: Base layer
- Priority: Root components/pages load first (`priority: 1000` in nuxt.config.ts)
- Purpose: API routes, middleware, and server-side integrations
- Location: `server/api/`, `server/middleware/`, `server/plugins/`, `server/routes/`
- Contains: Payment handlers, KV cache access, order management, sitemap, webhooks
- Depends on: Cloudflare KV storage (`useStorage()`), WordPress REST API, Helcim API
- Used by: Frontend pages via `$fetch()` and `useAsyncData()`
- Purpose: Static blog posts as Markdown files powered by Nuxt Content
- Location: `content/blog/{slug}/index.md`
- Contains: YAML frontmatter + Markdown body
- Depends on: `@nuxt/content` module, Nuxt Content `queryContent()`
- Used by: `pages/blog/[slug].vue`, `pages/blog/index.vue`
- Purpose: Pre-build data generation and post-deploy cache management
- Location: `scripts/`
- Contains: Route data generation, KV cache setup/warm, sitemap build
- Depends on: WordPress GraphQL API, Cloudflare KV API, local `content/blog/`
- Produces: `data/blog-routes.json`, `data/blog-redirects.json`, `data/sitemap-data.json`, `data/product-routes.json`
## Data Flow
## Key Abstractions
- Purpose: Encapsulates all page meta — hreflang (en-CA, fr-CA, en-US, x-default), geo targeting (Toronto), Open Graph, canonical
- Pattern: `setCanadianSEO({ title, description, image, type, locale })` — must be called on every public page
- Replaces: direct `useHead()` / `useSeoMeta()` calls for meta tags
- Purpose: KV-first product data retrieval with GraphQL fallback
- Pattern: `await getProductFromCache(slug)` → POST `/api/cached-product` → KV lookup → optional GQL fallback
- Purpose: Cart state, add/remove/update operations, payment gateways
- Pattern: `useState('cart')` shared key; `refreshCart()` for full server sync via `GqlGetCart`
- Purpose: Login/logout, customer data, viewer (logged-in user), order history
- Pattern: `useState('viewer')`, `useState('customer')` — set by `useCart().refreshCart()` on mount
- Purpose: Multi-step checkout, billing/shipping form state, payment method selection, order metadata
- Pattern: `useState('orderInput')` persists across steps; Helcim orders bypass GQL via admin REST
- Purpose: Typed GraphQL operations auto-generated into TypeScript via `nuxt-graphql-client`
- Pattern: `GqlGetProduct()`, `GqlAddToCart()`, etc. — available as auto-imported functions via `#gql` alias
## Entry Points
- Location: `app.vue`
- Triggers: All page loads
- Responsibilities: Shell layout (header, footer, cart overlay, mobile menu), global title template, toast container
- Location: `nuxt.config.ts`
- Triggers: Build and runtime
- Responsibilities: Layer extension, route rules (prerender/cache/SSR flags), KV storage bindings, module registration, runtime config (secrets), global product attribute filter config
- Location: `server/api/`
- Triggers: HTTP requests from frontend or external systems
- Responsibilities: Payment processing, KV cache reads, order creation, sitemap generation, exchange rate proxy, Turnstile validation
## Error Handling
- Product page: KV cache miss → GraphQL fallback; GQL error → show error state
- Exchange rate: Initialization failure → fallback to `buildTimeExchangeRate` from `runtimeConfig`
- Admin order creation: Retry with exponential backoff (3 attempts, 30s timeout per attempt)
- Cart refresh failure: Log error, clear cookies, reset state to null
- Blog post 404: `throw createError({ statusCode: 404 })` in `pages/blog/[slug].vue`
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
