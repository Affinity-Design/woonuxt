# Codebase Summary

**Generated:** 2026-04-09
**Source:** 4 parallel mapper agents (tech, arch, quality, concerns)

---

## What This Codebase Is

A headless WooCommerce e-commerce frontend for **ProSkaters Place Canada** (`proskatersplace.ca`). Built on Nuxt 3 with a two-layer architecture (read-only `woonuxt_base/` base + root custom overrides), deployed to Cloudflare Pages with aggressive KV-based caching.

Primary market: Canada (en-CA / fr-CA, CAD pricing, Toronto geo-targeting).

---

## Stack Summary

| Dimension        | Choice                                                      |
| ---------------- | ----------------------------------------------------------- |
| Framework        | Nuxt 3.13 + Vue 3                                           |
| Styling          | Tailwind CSS + @tailwindcss/typography                      |
| State            | Nuxt `useState` composables (no Pinia/Vuex)                 |
| Commerce backend | WordPress + WPGraphQL via `nuxt-graphql-client`             |
| Blog             | Nuxt Content (Markdown in `content/blog/`)                  |
| Caching          | Cloudflare KV (ISR-style, 3 layers)                         |
| Payments         | Helcim (admin REST flow), Stripe, PayPal                    |
| Email            | SendGrid                                                    |
| Auth             | WooCommerce session token via GraphQL                       |
| Deployment       | Cloudflare Pages (Node 20.x, Nitro cloudflare-pages preset) |
| i18n             | @nuxtjs/i18n — en-CA (default), en-US, fr-CA                |
| Images           | @nuxt/image (optimization disabled on CF Workers)           |
| Search           | Fuse.js (active) + Algolia (installed, unused)              |

---

## Architecture Highlights

**Two-Layer Pattern:**

- `woonuxt_base/` — READ-ONLY base layer. Contains shared components, GQL queries, composables, Tailwind config.
- Root `/` — All custom overrides for proskatersplace.ca (components, composables, pages, server routes).
- Override mechanism: place file with same name in root directory (root loads first via `priority: 1000`).

**Three-Tier Caching:**

1. Static prerender (build-time) — blog, home, static pages
2. Cloudflare KV route cache (ISR) — products 72h, categories/blog 7d (binding: `NUXT_CACHE`)
3. KV script data — product/category lists for cache warmer (binding: `NUXT_SCRIPT_DATA`)

**Hybrid Rendering:**

- SSR enabled globally
- Client-only: `/checkout/**`, `/cart`, `/my-account/**`

**Helcim Special Flow:**

- WooCommerce GraphQL session limitations prevent standard Helcim integration
- Workaround: admin-level WP REST API order creation (bypasses session) via `server/api/create-admin-order.post.ts`

---

## Coding Conventions

- TypeScript throughout (pages, composables, server API)
- Vue 3 Composition API with `<script setup>` pattern exclusively
- YAML frontmatter in all blog posts
- `useCanadianSEO()` required on every public page (replaces direct `useHead`)
- `<NuxtImg>` for all images
- `$fetch` (not `fetch`) for server-side API calls
- Composables use `useState` for shared state; naming pattern: `use[Entity][Action].ts`

---

## Critical Concerns (Prioritized)

### 🔴 Security — Fix Immediately

1. **Helcim payment validation bypass** (`server/api/helcim-validate.post.ts`)

   - Silent `isValid: true` fallback when `node:crypto` fails — allows fraudulent payments through
   - Marked `// TEMPORARY` but has never been fixed
   - **Fix:** Hard-fail (503) if crypto unavailable; use `globalThis.crypto` (Web Crypto API) as primary

2. **Turnstile secret key in public runtime config** (`nuxt.config.ts` line 74)
   - `turnstyleSecretKey` under `runtimeConfig.public` → serialized into client bundle
   - **Fix:** Move to server-only `runtimeConfig`

### 🟡 Tech Debt — Address Soon

3. **Hardcoded `proskatersplace.ca` domain** in 4 composables — breaks staging/preview environments
4. **Incorrect timestamp in cached-product.ts** — freshness check always passes (timestamp is always "now")
5. **`products-cache.ts` reads from `.nuxt/`** — always fails in Cloudflare Workers production (no filesystem)
6. **`sceduled-cache-warming.ts` is a broken stub** — `newState` is undefined, will throw if called; filename typo
7. **`test-content.get.ts` is empty** — dead route registered
8. **Debug/backup pages exposed** — `pages/test-graphql.vue` publicly accessible at `/test-graphql` and calls non-existent endpoints

### 🟢 Opportunities

- Algolia installed but unused — Fuse.js is active for search
- `sharp` used only in build scripts (images not optimized at request time on CF Workers)
- No test suite currently — zero test coverage

---

## Key Files Quick Reference

| Purpose            | File                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| Main Nuxt config   | `nuxt.config.ts`                                                                 |
| Canadian SEO       | `composables/useCanadianSEO.ts`                                                  |
| Product KV cache   | `composables/useCachedProduct.ts`, `server/api/cached-product.ts`                |
| Cart state         | `composables/useCart.ts`                                                         |
| Checkout + Helcim  | `composables/useCheckout.ts`, `server/api/create-admin-order.post.ts`            |
| Helcim validation  | `server/api/helcim-validate.post.ts` ← SECURITY ISSUE                            |
| Blog posts         | `content/blog/{slug}/index.md`                                                   |
| Build pipeline     | `scripts/` (20 scripts)                                                          |
| Route data         | `data/blog-routes.json`, `data/category-routes.json`, `data/product-routes.json` |
| GQL queries (base) | `woonuxt_base/app/queries/**/*.gql`                                              |
