# Infrastructure & Integrations Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Caching & Performance](#caching--performance)
3. [Payment Integration (Helcim)](#payment-integration-helcim)
4. [Security & Spam Protection (Turnstile)](#security--spam-protection-turnstile)
5. [WordPress Configuration](#wordpress-configuration)
6. [Build System](#build-system)

---

## Architecture Overview

This project is a modern e-commerce web application that leverages a headless architecture:

- **Backend**: WordPress + WPGraphQL (Headless CMS).
- **Frontend**: Nuxt 3 (Vue.js framework) deployed on Cloudflare Pages.
- **Caching**: Cloudflare KV + Nitro Caching.

### High-Level Diagram

```
[WordPress + WPGraphQL] <--GraphQL--> [Nuxt 3 Frontend] --> [Cloudflare Pages] --> [User's Browser]
```

---

## Caching & Performance

We use a multi-layer caching strategy leveraging Nuxt's Nitro engine and Cloudflare KV.

### Caching Layers

1.  **Static Prerender**: Blog posts and static pages are generated at build time.
2.  **Cloudflare KV Route Cache (ISR)**:
    - **Products**: Cached for 72 hours.
    - **Categories**: Cached for 7 days.
    - **Storage**: Uses `NUXT_CACHE` KV namespace.
3.  **KV Script Data**: Stores build artifacts (product lists) in `NUXT_SCRIPT_DATA`.

### Cache Warming

To prevent slow initial loads (cold starts), we use a cache warming script.

- **Script**: `scripts/cache-warmer.js`
- **Trigger**: Runs after deployment via `scripts/post-deploy.js` or manually via API.
- **Process**: Fetches lists of URLs from KV and makes HTTP requests to force Nitro to render and cache them.

### Configuration (`nuxt.config.ts`)

```typescript
routeRules: {
  '/product/**': { cache: { maxAge: 60 * 60 * 72, base: 'cache' } },
  '/product-category/**': { cache: { maxAge: 60 * 60 * 24 * 7, base: 'cache' } }
}
```

---

## Payment Integration (Helcim)

We use a custom integration for Helcim payments to bypass WooCommerce GraphQL session issues.

### Flow

1.  **User Cart**: Managed via GraphQL.
2.  **Payment**: User enters details in Helcim iframe/form.
3.  **Order Creation**: Backend creates order via Admin REST API (`server/api/create-admin-order.post.ts`).
4.  **Attribution**: Order metadata tracks source (`proskatersplace.ca`).

### Key Components

- `composables/useCheckout.ts`: Handles checkout logic and admin order creation.
- `server/api/create-admin-order.post.ts`: Secure endpoint using WordPress Application Password.
- `components/shopElements/PaymentOptions.vue`: UI for payment selection.

---

## Security & Spam Protection (Turnstile)

Cloudflare Turnstile is integrated to prevent spam orders while allowing legitimate traffic.

### Features

- **Smart Detection**: Only protects checkout requests.
- **Bypass Mechanisms**: Allows trusted origins (main site) and User-Agents to bypass checks.
- **Invisible Verification**: Frictionless experience for real users.

### Configuration

- **Env Vars**: `TURNSTILE_ENABLED`, `TURNSTYLE_SITE_KEY`, `TURNSTYLE_SECRET_KEY`.
- **Middleware**: `server/middleware/smart-turnstile.ts` (Note: Currently disabled/renamed to `.disabled` in production).

---

## WordPress Configuration

### Application Passwords

Required for the Helcim integration to create orders as an admin.

1.  User: `proskatersplace.ca` (Shop Manager role).
2.  Generate Application Password in WP Admin > Users.
3.  Set env vars: `WP_ADMIN_USERNAME`, `WP_ADMIN_APP_PASSWORD`.

---

## Build System

The build process is automated to generate routes and cache data.

### Commands

- `npm run build`: Full production build.
  1.  `scripts/build-sitemap.js`: Generates sitemap.
  2.  `nuxt build`: Builds the application.
  3.  `scripts/setup-script.js`: Populates KV with product/category data.
- `npm run warm-cache`: Triggers cache warming.

### Critical Scripts

- `build-all-routes.js`: Scans content and API to generate route JSONs.
- `setup-script.js`: Orchestrates KV population.
