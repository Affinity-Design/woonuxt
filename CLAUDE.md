# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WooNuxt is a headless WooCommerce e-commerce frontend built with **Nuxt 3** for ProSkaters Place (proskatersplace.ca). It connects to a WordPress + WPGraphQL backend and deploys on **Cloudflare Pages** with KV-based caching.

This repository is the Canadian headless Woo experience derived from a US site ecosystem. Source commerce and content data stream from the WordPress backend and are transformed for Canadian presentation and SEO requirements.

Everything under `wordpress/` is US backend infrastructure context (including USD-oriented backend concerns and US-specific SEO implementation details), not the primary Canadian frontend layer.

**Key characteristics**: Canadian-focused (en-CA, fr-CA, CAD pricing, Toronto geo-targeting), multi-layer caching (prerender + ISR + Cloudflare KV), custom payment integrations (Helcim, Stripe, PayPal), blog via Nuxt Content (Markdown).

**Primary objective**: SEO dominance across both US and CAD properties, while maintaining stable shared infrastructure between the two ecosystems.

## Commands

```bash
# Development
npm run dev              # Start dev server (HTTP)
npm run dev:ssl          # HTTPS with local certs
npm run dev:ssl:local    # HTTPS + local config (no remote GraphQL introspection)

# Building
npm run build            # Full production build (includes route generation + sitemap)
npm run build:local      # Build with local GraphQL schema
npm run generate         # Static generation

# Preview
npm run preview          # Preview production build
npm run preview:local    # Preview with local config

# Cache management
npm run warm-cache       # Warm all caches post-deploy
npm run clear-cache-all  # Clear all KV cache namespaces
npm run reset-cache      # Full reset (clear + setup + warm)
npm run debug:cache      # Debug cache state

# Build data (run before build if routes changed)
npm run build-all-routes # Generate blog routes, redirects, sitemap data
npm run build-product-cache   # Generate product cache JSON
npm run build-category-cache  # Generate category cache JSON

# Utilities
npm run clean:build      # Clean node_modules, reinstall, rebuild
npm run optimize-images  # Optimize images with Sharp
npm run verify-env       # Verify environment variables
```

**Package manager**: npm only (enforced by preinstall script). **Node version**: 20.x (see `.nvmrc`).

There are no test commands configured. Code formatting uses Prettier (`.prettierrc`).

## Architecture

### Two-Layer Nuxt Pattern
- **`woonuxt_base/`** — Base layer (READ-ONLY parent theme). Contains shared components, composables, GraphQL queries, and Tailwind config.
- **Root `/`** — Custom layer that overrides and extends the base. Override a base component by placing a file with the same name in root `components/`.

This uses Nuxt's Layers feature (`extends: './woonuxt_base'` in `nuxt.config.ts`).

### Data Sources
1. **GraphQL (WPGraphQL)** — Products, categories, cart, orders, customer data. Queries live in `woonuxt_base/app/queries/**/*.gql`. Client: `nuxt-graphql-client` with auto-generated TypeScript types (`#gql` import alias). Fetching via `useAsyncGql()`.
2. **Nuxt Content (Markdown)** — Blog posts in `content/blog/{slug}/index.md` with YAML frontmatter.
3. **Cloudflare KV** — Two namespaces: `NUXT_CACHE` (route cache, product/category data) and `NUXT_SCRIPT_DATA` (build artifacts). Access via `useStorage('cache')`.

### State Management
No Vuex/Pinia — uses Nuxt composables with `useState`:
- `useCart()` — Cart state and operations (add, remove, refresh)
- `useAuth()` — Authentication, login/logout, customer data
- `useCheckout()` — Multi-step checkout, billing/shipping forms, payment selection
- `useCanadianSEO()` — Bilingual meta tags, hreflang, geographic targeting
- `useCachedProduct()` — KV-cached product retrieval with GraphQL fallback
- `useExchangeRate()` — CAD/USD currency conversion

### Caching Strategy
1. **Static prerender** (build-time) — Blog posts, categories, home, static pages
2. **Cloudflare KV route cache** (ISR-style) — Products: 72h TTL, Categories: 7d TTL. Binding: `NUXT_CACHE`
3. **KV script data** — Product/category lists for cache warmer. Binding: `NUXT_SCRIPT_DATA`
4. Cache warming (`npm run warm-cache`) is required after deploy to avoid cold starts

### Payment Integration
- **Stripe/PayPal** — Standard WooCommerce GraphQL integration
- **Helcim** — Special handling: WooCommerce GraphQL session limitations require admin-level order creation via WordPress REST API. Flow: cart (GraphQL) → Helcim payment → admin order creation (`server/api/create-admin-order.post.ts`). See `docs/helcim-integration.md`.

### Server API Routes (`server/api/`)
Key endpoints: `create-admin-order.post.ts` (Helcim orders), `helcim.post.ts` (payment processing), `stripe.post.ts` (webhook), `contact.ts` (SendGrid email), `cached-product.ts` (KV retrieval), `sitemap.xml.ts`, `verify-turnstile.post.ts`, `stock-status.get.ts`.

### Routing
- Product pages: `/product/[slug]`
- Category pages: `/product-category/[slug]`
- Blog: `/blog/[slug]` (Nuxt Content auto-routes from `content/blog/`)
- Client-only (SSR disabled): `/checkout/**`, `/cart`, `/my-account/**`
- Route data is pre-generated by build scripts into `data/` (blog-routes.json, blog-redirects.json, sitemap-data.json)

## Development Rules

1. **Never modify `woonuxt_base/`** — Override by creating files in root directories with matching names.
2. **Always use `useCanadianSEO()`** for page meta tags — never use generic `useHead()` alone. Include hreflang tags (en-CA, fr-CA, en-US, x-default).
3. **Use `useCachedProduct()`** for product data fetching — it handles KV cache with GraphQL fallback.
4. **Build scripts are mandatory** — `npm run build` runs route generation. Skipping creates missing route data. Run `npm run build-all-routes` if blog routes change.
5. **Blog posts** — Check `data/seo_Keywordlist.csv` for target keywords, `data/blog-keywords-used.md` for used ones. Generate images with `node scripts/generate-blog-image.js "keyword" --posted`. Use internal links from `data/sitemap-data.json`. 1,000-2,500 words with H2/H3 headings.
6. **Images** — Use `<NuxtImg>` component (optimization is disabled on Cloudflare but component is still used for consistency).
7. **Local dev with GraphQL issues** — Use `npm run dev:ssl:local` which uses `nuxt.config.local.ts` with a local schema file (`data/local-schema.graphql`) to avoid "Unauthorized request origin" errors.
8. **US/CAD boundary** — Treat `wordpress/` as US backend infrastructure scope. Changes there require explicit cross-site impact review (US SEO impact, CAD SEO impact, and shared infrastructure risk).
9. **Currency and localization integrity** — Preserve USD-origin backend assumptions while enforcing CAD/en-CA/fr-CA presentation behavior in the frontend layer.
10. **Dual-site SEO safety** — Do not ship changes that improve one market while degrading the other without an explicit decision and mitigation plan.
11. **NEVER rename a flat page to a directory index without keeping a wrapper** — Moving `pages/foo.vue` → `pages/foo/index.vue` silently breaks the layer override of `woonuxt_base/app/pages/foo.vue`. The base layer's page renders instead. You MUST keep a `pages/foo.vue` with `<template><NuxtPage /></template>` as a pass-through wrapper. See "Layer Override Routing" below.
12. **NEVER add client-side currency conversion or formatting that prepends symbols** — Prices come from WPGraphQL already in the store currency. Do not create composables/plugins that layer additional currency symbols (e.g. `$€109.99`). Use `formatCADPrice()` for display. Any price-formatting changes must be tested on product pages, cart, and checkout before merging.

### Layer Override Routing (CRITICAL)

This project uses Nuxt Layers (`extends: './woonuxt_base'`). The base layer has its own pages in `woonuxt_base/app/pages/`. Root pages override base pages **only when the file path matches exactly**.

**The trap**: `pages/checkout.vue` (flat file) and `pages/checkout/index.vue` (directory) are NOT the same route. If the base has `checkout.vue` and you only have `checkout/index.vue`, Nuxt treats the base's `checkout.vue` as a **parent layout** and your `checkout/index.vue` as a **child**. Since the base page has no `<NuxtPage />`, your child never renders.

**Rules**:
- When converting any flat page to a directory (e.g. for nested routes like `checkout/order-received/`), ALWAYS keep a `pages/<name>.vue` wrapper with just `<NuxtPage />`
- Current examples: `pages/checkout.vue` → wrapper → renders `pages/checkout/index.vue` (Helcim) and `pages/checkout/order-received/`
- Before renaming/moving any page, check if `woonuxt_base/app/pages/` has a matching file
- **Test checkout after ANY page restructuring** — Helcim is the only payment method

### Currency & Price Formatting (CRITICAL)

**WPGraphQL is the single source of truth for prices.** All product prices arrive pre-formatted from WooCommerce in the store's currency (CAD for proskatersplace.ca).

**Rules**:
- Use `formatCADPrice()` or `formatPrice()` from `useHelpers()` for display formatting
- NEVER create middleware, plugins, or composables that intercept and reformat prices with additional currency symbols
- NEVER add a second currency conversion layer on top of WPGraphQL prices (caused `$€109.99` in production)
- The `useExchangeRate()` composable is for informational USD↔CAD display only, NOT for reformatting product prices
- `i18n` number formatting must not prepend currency symbols to already-formatted price strings
- Any pricing changes must be visually verified on: product cards, product pages, cart line items, cart totals, and checkout summary

## Key Config Files

- `nuxt.config.ts` — Main config (extends woonuxt_base, SSR, route rules, KV storage, modules)
- `nuxt.config.local.ts` — Local dev overrides (disables remote GraphQL introspection)
- `cloudflare-pages.toml` — Cloudflare Pages deployment config
- `i18n.config.ts` — Locales: en-CA (default), en-US, fr-CA
- `.github/copilot-instructions.md` — Detailed AI development guide (architecture, SEO, blog, payments)

## Documentation

See `docs/` for detailed guides: `helcim-integration.md`, `how-caching-works.md`, `seo-master-guide.md`, `blog-master-guide.md`, `infrastructure-and-integrations.md`, `development.md`.
