# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

### WordPress / WPGraphQL (Primary Data Source)

- **What it does:** Provides all product, category, cart, order, and customer data
- **SDK/Client:** `nuxt-graphql-client ^0.2.43` — auto-generates TypeScript types from schema
- **Auth:** `GQL_HOST` env var (GraphQL endpoint URL); requests proxied through Nuxt server
- **Admin Auth:** WordPress Application Password (`WP_ADMIN_USERNAME`, `WP_ADMIN_APP_PASSWORD`) for admin-level order creation bypassing session limitations
- **Query files:** `woonuxt_base/app/queries/**/*.gql` (READ-ONLY base layer)
- **Usage pattern:** `useAsyncGql()` in pages; `useCachedProduct()` composable for product pages
- **Known issue:** WordPress/Cloudflare blocks SSR requests → KV cache used as primary source, GraphQL as fallback
- **Local dev:** `data/local-schema.graphql` used with `nuxt.config.local.ts` to avoid remote introspection errors

### WooCommerce REST API

- **What it does:** Order management, stock status, coupon application on admin-created orders
- **Auth:** `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` (Basic auth)
- **Endpoints used:**
  - `server/api/create-admin-order.post.ts` — Creates orders via WooCommerce REST API
  - `server/api/stock-status.get.ts` — Stock availability checks
  - `server/api/validate-stock.post.ts` — Pre-checkout stock validation
- **Retry logic:** Exponential backoff (3 attempts, 1s/2s/4s delays, 30s timeout) in `create-admin-order.post.ts`

---

## Payment Processors

### Helcim (Primary Canadian Payment Gateway)

- **What it does:** Credit card processing for Canadian customers
- **Auth:** `NUXT_HELCIM_API_TOKEN` (server-only)
- **Server endpoints:**
  - `server/api/helcim.post.ts` — Payment processing (Level 3 data, line items, shipping, tax)
  - `server/api/helcim-validate.post.ts` — HMAC transaction hash validation (server-side)
- **Special integration:** WooCommerce GraphQL session limitations require a custom admin order creation flow:
  1. Cart managed via GraphQL
  2. Payment processed via Helcim API
  3. Order created via `server/api/create-admin-order.post.ts` using WordPress Application Password
  4. Coupons applied post-creation via WooCommerce REST API
- **Hash validation:** Uses Node.js `crypto` module; fallback allows transaction if crypto unavailable (temporary workaround)

### Stripe

- **What it does:** Credit card processing (alternative to Helcim)
- **Auth (server):** `NUXT_STRIPE_SECRET_KEY`
- **Auth (client):** `NUXT_STRIPE_PUBLISHABLE_KEY`
- **SDK (server):** `stripe ^17.7.0`
- **SDK (client):** `@stripe/stripe-js ^4.10.0`
- **Server endpoint:** `server/api/stripe.post.ts`
  - Actions: `create_payment_intent`, supports `paymentMethodId` and `customerId`
  - Currency: CAD (`currency: "cad"`)
  - API version: `2022-11-15`
- **Return URL:** `{origin}/checkout/order-received`

### PayPal

- **What it does:** Alternative payment method
- **Integration:** Standard WooCommerce/WPGraphQL integration (no custom server endpoint)
- **Configuration:** Via WooCommerce admin

---

## Cloud Infrastructure

### Cloudflare Pages

- **What it does:** Hosting platform for the deployed Nuxt application
- **Config:** `cloudflare-pages.toml`
- **Build:** `npm run build` → publish `.output/public`
- **Node version:** 20 (set in build environment)
- **Workers runtime:** `compatibilityDate: '2024-09-19'`, `compatibilityFlags: ['nodejs_compat']`

### Cloudflare KV Storage

- **What it does:** Two-namespace KV store for caching
- **Namespace 1 — `NUXT_CACHE`:**
  - Route HTML cache (ISR-style)
  - Products: 72h TTL (`/product/**`)
  - Categories/Blog: 7d TTL
  - Binding in nitro storage: `cache`
- **Namespace 2 — `NUXT_SCRIPT_DATA`:**
  - Build artifact data (product lists, category lists, sitemap data)
  - Read by `server/api/sitemap.xml.ts`, `server/api/cached-product.ts`
  - Written by `scripts/setup-script.js` at build time
  - Binding in nitro storage: `script_data`
- **Dev fallback:** Filesystem storage at `.nuxt/dev-cache/` in development

### Cloudflare Turnstile

- **What it does:** CAPTCHA / bot protection on forms (contact form, checkout)
- **Client widget:** `vue-turnstile ^1.0.11` and explicit render script loaded via `nuxt.config.ts` head
- **Server verification:** `server/api/verify-turnstile.post.ts` → POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- **Auth:** `TURNSTYLE_SITE_KEY` (public), `TURNSTYLE_SECRET_KEY` (server)
- **IP forwarding:** Reads `cf-connecting-ip` or `x-forwarded-for` headers for additional security

### Cloudflare Insights

- **What it does:** Web analytics
- **Integration:** DNS prefetch in `nuxt.config.ts` (`static.cloudflareinsights.com`)

---

## Email

### SendGrid

- **What it does:** Transactional email for contact form submissions
- **SDK:** `@sendgrid/mail ^8.1.4`
- **Server endpoint:** `server/api/contact.ts`
- **Auth:** `SENDGRID_API_KEY`, `SENDING_EMAIL` (from address), `RECEIVING_EMAIL` (to address)
- **Flow:** Form submission → Turnstile verified → SendGrid API call

---

## Analytics & Tracking

### Google Analytics / Tag Manager

- **What it does:** Web analytics and conversion tracking
- **Module:** `nuxt-gtag ^3.0.2`
- **Config:** Configured in `nuxt.config.ts` modules

---

## Currency

### ExchangeRate-API

- **What it does:** Daily USD → CAD exchange rate for product price conversion
- **Server endpoint:** `server/api/exchange-rate.ts`
- **Auth:** `EXCHANGE_RATE_API_KEY` (public)
- **Caching:** Rate stored in Cloudflare KV with 1-day TTL (UTC day key); distributed locking with 15s TTL to prevent stampede
- **Client persistence:** Exchange rate cached in `exchange-rate-data` cookie (24h)
- **Build-time fallback:** `NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE` env var (defaults to `1.37`)
- **Composable:** `composables/useExchangeRate.ts`

---

## AI / Content Generation

### Google Gemini (Imagen / Gemini Flash)

- **What it does:** AI blog image generation (build/dev scripts only, NOT in server API)
- **SDK:** `@google/genai ^1.43.0`
- **Script:** `scripts/generate-blog-image.js`
- **Auth:** `GOOGLE_AI_API_KEY` (loaded from `.env.local` in script)
- **Model:** `gemini-2.5-flash-image` via `https://generativelanguage.googleapis.com/v1beta/models/`

---

## Webhooks

### Incoming: WooCommerce Product/Order Webhooks

- **Endpoint:** `server/api/webhook/woocommerce.ts`
- **What it does:** Receives WooCommerce webhook events; invalidates/revalidates Cloudflare KV cache for affected product and category pages
- **Topics handled:** `product.*`, `product_cat.*`, order-related
- **No signature verification** currently implemented (security risk — see CONCERNS.md if generated)

### Outgoing: Cache Warming

- **Endpoint:** `server/api/trigger-cache-warming.ts`
- **Auth:** `Authorization: Bearer $REVALIDATION_SECRET` or `x-revalidation-secret` header
- **What it does:** Triggers `scripts/cache-warmer.js` to pre-warm Cloudflare KV cache after deployment

### Outgoing: Scheduled Cache Warming

- **Endpoint:** `server/api/sceduled-cache-warming.ts` (note: typo in filename)
- **What it does:** Cron/scheduled cache warming trigger

---

## Data Storage

### Databases

- **No traditional database** — All persistent product/commerce data lives in WordPress (WooCommerce)
- **Cloudflare KV** — Serves as the application-layer cache and build artifact store (see above)

### File Storage

- **Static assets:** `public/` directory (committed to repo, served from Cloudflare Pages)
- **Blog images:** `public/images/blog/posted/` and `public/images/posted/`
- **No external file/object storage** (no S3, R2, GCS)

### Content Storage

- **Blog content:** `content/blog/{slug}/index.md` (Markdown in git repo)
- **Build data:** `data/*.json` (generated at build time, git-ignored per project rules)

---

## Authentication & Identity

### WooCommerce Customer Auth

- **Provider:** WordPress / WooCommerce session (via Nuxt proxy)
- **Implementation:** Cookie-based session proxied through Nuxt server; `composables/useAuth.ts`
- **Operations:** Login, logout, register, customer data queries via WPGraphQL
- **No third-party identity provider** (no Auth0, Cognito, Supabase, etc.)

---

## Environment Configuration Summary

| Variable                                      | Scope                             | Purpose                       |
| --------------------------------------------- | --------------------------------- | ----------------------------- |
| `GQL_HOST`                                    | Server                            | WordPress GraphQL endpoint    |
| `NUXT_STRIPE_SECRET_KEY`                      | Server                            | Stripe payments               |
| `NUXT_STRIPE_PUBLISHABLE_KEY`                 | Public                            | Stripe client SDK             |
| `NUXT_HELCIM_API_TOKEN`                       | Server                            | Helcim payments               |
| `WC_CONSUMER_KEY` / `WC_CONSUMER_SECRET`      | Server                            | WooCommerce REST API          |
| `WP_ADMIN_USERNAME` / `WP_ADMIN_APP_PASSWORD` | Server                            | WordPress admin auth          |
| `SENDGRID_API_KEY`                            | Server                            | Email                         |
| `SENDING_EMAIL` / `RECEIVING_EMAIL`           | Server                            | Email from/to                 |
| `REVALIDATION_SECRET`                         | Server                            | Cache warming auth            |
| `EXCHANGE_RATE_API_KEY`                       | Public                            | ExchangeRate-API              |
| `TURNSTYLE_SITE_KEY`                          | Public                            | Cloudflare Turnstile form key |
| `TURNSTYLE_SECRET_KEY`                        | Public (⚠️ should be server-only) | Turnstile verification        |
| `CF_ACCOUNT_ID`                               | Build                             | Cloudflare API                |
| `CF_API_TOKEN`                                | Build                             | Cloudflare API                |
| `CF_KV_NAMESPACE_ID_CACHE`                    | Build                             | KV cache namespace ID         |
| `CF_KV_NAMESPACE_ID_SCRIPT_DATA`              | Build                             | KV script_data namespace ID   |
| `NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE`        | Public                            | Fallback CAD/USD rate         |
| `NUXT_PUBLIC_FREE_SHIPPING_THRESHOLD`         | Public                            | Free shipping threshold (CAD) |
| `GOOGLE_AI_API_KEY`                           | Build scripts only                | Gemini image generation       |
| `BASE_URL`                                    | Public                            | WordPress base URL            |

---

_Integration audit: 2026-04-09_
