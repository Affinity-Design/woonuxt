# Codebase Concerns

**Analysis Date:** 2026-04-09

---

## CRITICAL: Security Vulnerabilities

### Helcim Payment Validation Bypass

- **Risk:** Payment transactions are allowed through even when cryptographic signature validation fails
- **Files:** `server/api/helcim-validate.post.ts` (lines 35-44, 83-94)
- **Issue:** Two separate `try/catch` blocks catch crypto import failures AND general errors, and both silently return `isValid: true` with warning comments saying "TEMPORARY". This means if `node:crypto` fails to load (e.g., environment misconfiguration or unenv polyfill issues in Cloudflare Workers), fraudulent payment data will be accepted.
- **Current mitigation:** None — bypass is unconditional when crypto errors occur
- **Fix:** Replace silent bypass with hard failure. If crypto is unavailable, throw a 503. Do not process payments without validation. Investigate the unenv/crypto compatibility issue and fix it properly.

### Turnstile Secret Key Exposed in Public Runtime Config

- **Risk:** The Cloudflare Turnstile secret key is stored in `config.public`, making it available to the browser bundle
- **Files:** `nuxt.config.ts` (line 74), `server/api/verify-turnstile.post.ts` (line 16), `server/api/contact.ts` (line 66)
- **Issue:** `turnstyleSecretKey` is under `runtimeConfig.public`, meaning it is serialized into the client-side JS bundle. The Turnstile secret key is meant to be server-only (used only for verification with Cloudflare's API). Exposing it allows anyone to spoof the Turnstile check.
- **Fix:** Move `TURNSTYLE_SECRET_KEY` to server-only `runtimeConfig` (not nested under `public`). Update `server/api/verify-turnstile.post.ts` and `server/api/contact.ts` to read from `config.turnstyleSecretKey` (server-only path).

---

## Tech Debt

### "TEMPORARY" Payment Validation Flags Left in Production

- **Issue:** Three locations in `server/api/helcim-validate.post.ts` have explicit `// TEMPORARY` comments with `isValid: true` bypass logic, written as short-term workarounds for crypto environment issues. These have not been resolved.
- **Files:** `server/api/helcim-validate.post.ts` (lines 35, 40, 83, 88)
- **Impact:** Security regression on every deployment — if the right error is triggered, fraud prevention is disabled silently
- **Fix approach:** Investigate and fix the root cause of `unenv`/`node:crypto` availability in the Cloudflare Workers runtime with `nodejs_compat` flag enabled. Use `globalThis.crypto` (Web Crypto API) directly as the primary path since it is always available in Workers.

### Hardcoded Domain in Multiple Composables

- **Issue:** `https://proskatersplace.ca` is hardcoded directly in business logic, making the app non-portable and error-prone for staging/preview environments
- **Files:**
  - `composables/useCanadianSEO.ts` (lines 44, 154)
  - `composables/useCategorySEO.ts` (lines 127, 157, 212, 264, 300)
  - `composables/useProductRichSnippets.ts` (lines 88, 97, 101, 262, 273, 282, 454, 456, 457)
  - `composables/useCheckout.ts` (lines 33, 34, 38, 44, 45)
- **Impact:** Structured data and SEO meta point to production domain even during staging. Order attribution metadata always credits `proskatersplace.ca` regardless of origin.
- **Fix approach:** Use `config.public.wpBaseUrl` or introduce a `NUXT_PUBLIC_SITE_URL` env var. Read via `useRuntimeConfig()` in composables.

### Hardcoded Phone Placeholder in Rich Snippets

- **Issue:** Organization schema has `telephone: '+1-XXX-XXX-XXXX'` as a literal placeholder
- **Files:** `composables/useProductRichSnippets.ts` (line 492)
- **Impact:** Invalid structured data submitted to Google Search Console; potential schema validation warnings
- **Fix approach:** Add real phone number or remove the `telephone` field entirely

### `cached-product.ts` Returns Incorrect Timestamp

- **Issue:** `server/api/cached-product.ts` returns `timestamp: Date.now()` at response time, not the actual cache population time. The freshness check in `composables/useCachedProduct.ts` (24-hour TTL) therefore always passes because the timestamp is always "now".
- **Files:** `server/api/cached-product.ts` (line 42), `composables/useCachedProduct.ts` (lines 33-39)
- **Impact:** The cache freshness check is completely ineffective — stale cached products from the previous build will always be served, never triggering a GraphQL fallback
- **Fix approach:** Store and return the actual cache population timestamp from the KV entry (set during build by `scripts/build-products-cache.js`), not `Date.now()`.

### `products-cache.ts` Reads From `.nuxt/` Build Artifact

- **Issue:** `server/api/products-cache.ts` reads from `.nuxt/cache/cached-products.json` using `readFileSync`. This file does not exist in production (Cloudflare Workers have no filesystem access), making this endpoint permanently broken in production.
- **Files:** `server/api/products-cache.ts` (lines 9-11)
- **Impact:** This endpoint always fails in production with a file-not-found error
- **Fix approach:** Replace with KV storage lookup via `useStorage('cache')` consistent with `cached-product.ts`

### `sceduled-cache-warming.ts` Is a Stub

- **Issue:** `server/api/sceduled-cache-warming.ts` is an incomplete stub with `/* get next batch of URLs */` placeholder comments and references undefined `newState` variable, making it non-functional and a compile risk
- **Files:** `server/api/sceduled-cache-warming.ts` (lines 12-19)
- **Impact:** If this endpoint is called, it will throw a ReferenceError (`newState is not defined`). Filename also has a typo ("sceduled" vs "scheduled").
- **Fix approach:** Either complete the implementation or delete the file if unused

### `test-content.get.ts` Is Empty

- **Issue:** `server/api/test-content.get.ts` is a zero-byte file registered as an API route
- **Files:** `server/api/test-content.get.ts`
- **Impact:** Nuxt will register `/api/test-content` as a route that returns `undefined`
- **Fix approach:** Delete the file or implement it

### Debug/Test/Backup Files Committed to Source

- **Issue:** Multiple debug, test, and backup files are committed to the repository and exposed as either live routes or dead code
- **Files:**
  - `pages/test-graphql.vue` — Full test harness page, publicly accessible at `/test-graphql`. Contains calls to non-existent API endpoints (`/api/test-graphql`, `/api/test-payment-methods`, `/api/test-mock-checkout`, `/api/test-create-order`, `/api/test-nuxt-auth`). These endpoints do not exist in `server/api/`.
  - `pages/backup/checkout old.vue` — Old checkout implementation; not a live route but pollutes the codebase
  - `pages/backup/index copy.vue.bac` — Stale backup file
  - `pages/backup/useCheckout.ts.bac` — Stale backup file
  - `pages/privacy_new.vue` — Appears to be a staging draft of the privacy page
  - `pages/terms_backup.vue` — Backup of terms page
- **Impact:** `/test-graphql` is publicly accessible and reveals internal system diagnostics (GraphQL endpoint, payment flow structure). Backup files add noise.
- **Fix approach:** Delete all backup/test pages. Add `pages/test-graphql.vue` to a `.gitignore` pattern or gate it behind an auth check if needed for debugging.

---

## Known Bugs

### `[...slug].vue` Catch-All Has a Hardcoded Blog Slug Whitelist

- **Symptoms:** Only 3 blog slugs (`best-inline-skates-2025`, `roller-skating-toronto-guide`, `skate-maintenance-winter`) are handled by name in the catch-all handler. New blog posts without a `/blog/` prefix will get a 404 instead of a redirect.
- **Files:** `pages/[...slug].vue` (lines 4-9)
- **Trigger:** Accessing any blog post slug directly (e.g., `/my-new-post`) that was added after these 3 entries were hardcoded
- **Workaround:** Blog redirects in `data/blog-redirects.json` handle most cases via `routeRules`, but the catch-all is a secondary fallback that is stale
- **Fix:** Remove the hardcoded slug list from `[...slug].vue`. Rely solely on the `data/blog-redirects.json` route rules (which are dynamically generated).

### `categories.vue` Has Debug Logging Left in Production

- **Symptoms:** Every page load of `/categories` logs verbose JSON dumps to the browser console
- **Files:** `pages/categories.vue` (lines 27, 103, 148, 166, 258)
- **Impact:** Console noise for users; potential performance hit from `JSON.parse(JSON.stringify(...))` on every computed evaluation
- **Fix:** Remove all `[DEBUG V3]` console.log statements from the production page

### Session Error Recovery Uses `alert()`

- **Symptoms:** When a WooCommerce GraphQL session expires mid-checkout and retry fails, the user sees a native browser `alert()` dialog
- **Files:** `composables/useCheckout.ts` (line ~553)
- **Impact:** Poor UX; `alert()` is a blocking call that freezes the tab; inconsistent with the rest of the UI which uses `useToast()`
- **Fix:** Replace `alert()` calls in `useCheckout.ts` with `useToast()` notifications

---

## Performance Bottlenecks

### Category Pages: 17+ Second GraphQL Queries

- **Problem:** Category pages trigger expensive WPGraphQL queries that can take 17+ seconds on cold requests
- **Files:** `pages/product-category/[slug].vue` (implied), `routeRules` in `nuxt.config.ts`
- **Cause:** WPGraphQL querying all products with filtering on uncached WordPress instances
- **Current mitigation:** Prerendering + KV cache with 7-day TTL; cache warming post-deploy
- **Scaling limit:** Cache warming must be run manually after every deploy. If warming fails silently, users hit the 17-second cold path.
- **Improvement path:** Add cache warming health check endpoint that verifies key categories are cached; add alerting if warm fails

### `trigger-cache-warming.ts` Uses `child_process.spawn` in a Serverless Environment

- **Problem:** `server/api/trigger-cache-warming.ts` and `server/api/trigger-cache-products.ts` use `child_process.spawn` to run Node.js scripts
- **Files:** `server/api/trigger-cache-warming.ts` (line 33), `server/api/trigger-cache-products.ts` (line 21)
- **Cause:** Cloudflare Workers do not support `child_process`. This code will throw at runtime in production.
- **Impact:** Cache warming trigger endpoint is non-functional in production Cloudflare Pages deployment
- **Improvement path:** Replace with an HTTP-based invocation pattern — the warm-cache script should be called via an external cron (Cloudflare Workers Cron Triggers) or webhook, not spawned as a subprocess from within the Worker

### Exchange Rate Composable: Global Module-Level Singleton State

- **Problem:** `composables/useExchangeRate.ts` uses a module-level `let initializationAttempted = false` variable as a singleton guard
- **Files:** `composables/useExchangeRate.ts` (line 11)
- **Cause:** Module-level state in SSR is shared across all concurrent requests in the same server process (not request-scoped). On the client, it prevents re-initialization if the rate expires within a session.
- **Impact:** In SSR contexts, if one request initializes the exchange rate, all subsequent requests in the same process reuse the same state. Stale exchange rates may be served.
- **Improvement path:** Use `useState` or `useNuxtApp().$once` for request-scoped initialization guards

---

## Fragile Areas

### KV Cache Architecture: No Fallback if Both Cache and GraphQL Fail

- **Files:** `composables/useCachedProduct.ts`, `pages/product/[slug].vue` (implied)
- **Why fragile:** The cache-first product loading strategy has no circuit breaker. If KV is unavailable AND WordPress GraphQL returns 403, the product page will show an error with no graceful degradation.
- **Safe modification:** Any changes to `useCachedProduct.ts` must preserve the try/catch fallback chain. Do not assume KV is always available.
- **Test coverage:** No automated tests for the cache fallback path

### `data/` Directory: Build-Time JSON Files as Runtime Dependencies

- **Files:** `data/blog-routes.json`, `data/blog-redirects.json`, `data/product-routes.json`, `data/category-routes.json`
- **Why fragile:** `nuxt.config.ts` imports these files at build time using `require()`. If any file is missing, the build fails with an unhandled exception (or falls back to empty arrays, silently breaking prerendering). The files are gitignored but required for the build to succeed.
- **Safe modification:** Always run `npm run build-all-routes` before `nuxt build`. Do not delete files from `data/` without checking for `require()` calls in `nuxt.config.ts`.
- **Test coverage:** No verification that all required `data/` files exist before build starts

### `nuxt.config.ts`: Product Routes Loaded With `require()` at Config Evaluation

- **Files:** `nuxt.config.ts` (lines 5-13)
- **Why fragile:** Uses a `try/catch` around `require('./data/product-routes.json')` but silently falls back to `[]`, meaning product pages simply won't prerender if the file is missing — with no build error.
- **Safe modification:** Consider adding a hard failure with clear message if the file is missing in CI/production builds. The fallback to `[]` is acceptable for local dev only.

### Helcim Admin Order Flow: Complex Multi-Step Process with No Idempotency for Coupon Application

- **Files:** `server/api/create-admin-order.post.ts`
- **Why fragile:** The idempotency guard protects against duplicate order creation, but coupon application (done as a separate REST call after order creation) has no idempotency protection. Network failures between order creation and coupon application can leave orders without applied discounts, and retries will apply the coupon again.
- **Safe modification:** Any changes to order creation flow must account for the two-phase commit problem (create order → apply coupons). Both steps must be atomic or idempotent.
- **Test coverage:** No automated tests for the admin order creation flow

---

## Security Considerations

### Turnstile Secret in Public Config (Repeat — High Severity)

- **Risk:** Server secret exposed to client bundle (see Tech Debt section above)
- **Files:** `nuxt.config.ts` (line 74)
- **Current mitigation:** None
- **Recommendations:** Move to `runtimeConfig` server-only section immediately

### `/test-graphql` Endpoint Exposes System Architecture

- **Risk:** Public page at `/test-graphql` reveals GraphQL endpoint, payment processor details, and internal test patterns. It calls API endpoints that don't exist (`/api/test-graphql` etc.) — some of which may exist in some environments.
- **Files:** `pages/test-graphql.vue`
- **Current mitigation:** None
- **Recommendations:** Delete the page or add `middleware: 'auth'` with admin-only access check

### `revalidate.ts` Logs the Provided Secret Token on Mismatch

- **Risk:** If an attacker probes the endpoint with guesses, the invalid token is logged to server logs: `console.log(\`Invalid token provided: ${secret}\`)`
- **Files:** `server/api/revalidate.ts` (line 19)
- **Current mitigation:** Secret comparison is correct (not exploitable directly)
- **Recommendations:** Remove the token value from the log line; log only "invalid token attempt" without reflecting the input

### `create-admin-order.post.ts` Uses WordPress Application Password Over HTTP Potentially

- **Risk:** If `BASE_URL` environment variable is accidentally set to `http://` instead of `https://`, WordPress admin credentials (Application Password) are sent over plaintext HTTP
- **Files:** `server/api/create-admin-order.post.ts`
- **Current mitigation:** Production environment uses HTTPS
- **Recommendations:** Add an assertion that `wpBaseUrl` starts with `https://` before making authenticated requests

---

## Missing Critical Features

### No Rate Limiting on Payment Endpoints

- **Problem:** `server/api/helcim.post.ts` and `server/api/create-admin-order.post.ts` have no rate limiting
- **Blocks:** Protects against payment enumeration attacks and accidental duplicate submissions beyond the idempotency key
- **Priority:** High — Cloudflare WAF provides some protection but no per-session or per-IP rate limiting at the application layer

### No Automated Cache Warm Verification

- **Problem:** After deployment, there is no way to know if cache warming succeeded without manually checking pages
- **Blocks:** Silent cache warming failures result in 17+ second cold loads for category pages
- **Priority:** Medium

---

## Test Coverage Gaps

### No Tests for Payment Flow

- **What's not tested:** Helcim payment processing, admin order creation, coupon application, idempotency guard
- **Files:** `server/api/helcim.post.ts`, `server/api/create-admin-order.post.ts`, `composables/useCheckout.ts`
- **Risk:** Regressions in checkout flow go undetected until production
- **Priority:** High

### No Tests for Cache Layer

- **What's not tested:** KV cache fallback behavior, cache freshness logic in `useCachedProduct.ts`
- **Files:** `composables/useCachedProduct.ts`, `server/api/cached-product.ts`
- **Risk:** Cache bugs silently serve stale or wrong product data
- **Priority:** Medium

### No Tests for SEO Composables

- **What's not tested:** `useCanadianSEO()`, `useCategorySEO()`, `useProductRichSnippets()` output correctness
- **Files:** `composables/useCanadianSEO.ts`, `composables/useCategorySEO.ts`, `composables/useProductRichSnippets.ts`
- **Risk:** Structured data regressions (broken schema, missing hreflang) go unnoticed
- **Priority:** Medium

---

## Naming / Typo Issues

### Typo: "sceduled" in filename

- **Files:** `server/api/sceduled-cache-warming.ts`
- **Impact:** File is discoverable only via misspelled name. Any code referencing the correct spelling "scheduled" would not find it.
- **Fix:** Rename to `scheduled-cache-warming.ts` (or delete if unused)

### Typo: "TURNSTYLE" vs "TURNSTILE" in env vars and config

- **Files:** `nuxt.config.ts` (lines 73-76), `server/api/contact.ts`, `server/api/verify-turnstile.post.ts`, `composables/useTurnstile.ts`
- **Impact:** `TURNSTYLE_SITE_KEY` / `TURNSTYLE_SECRET_KEY` environment variables are named with the wrong word ("style" instead of "stile"). While internally consistent, this is confusing for onboarding and documentation.
- **Fix:** Low priority — would require renaming env vars in Cloudflare Pages settings and all local `.env` files simultaneously

---

_Concerns audit: 2026-04-09_
