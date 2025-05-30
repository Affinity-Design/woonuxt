import { createResolver } from "@nuxt/kit";
import categoryRoutesToPrerender from "./data/category-routes.json"; // Assuming static list

const { resolve } = createResolver(import.meta.url);

console.log(
  `[Nuxt Config] Found ${categoryRoutesToPrerender.length} category routes to prerender from static file.`
);

export default defineNuxtConfig({
  extends: ["./woonuxt_base"],
  components: [{ path: "./components", pathPrefix: false, priority: 1000 }],

  runtimeConfig: {
    // Server-only secrets
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDING_EMAIL: process.env.SENDING_EMAIL,
    RECEIVING_EMAIL: process.env.RECEIVING_EMAIL,
    REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
    // Public config (available client+server/build)
    public: {
      stripePublishableKey: process.env.NUXT_STRIPE_PUBLISHABLE_KEY,
      exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY || "default_key",
      turnstyleSiteKey: process.env.TURNSTYLE_SITE_KEY,
      turnstyleSecretKey: process.env.TURNSTYLE_SECRET_KEY,
      turnstile: {
        siteKey: process.env.TURNSTYLE_SITE_KEY,
      },
      // --- NEW: Build-time fallback exchange rate ---
      // Provide a default value (e.g., 1.0) if the env var isn't set during build
      buildTimeExchangeRate:
        process.env.NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE || 1.37,
    },
  },

  devtools: { enabled: true },
  ssr: true,

  devServer: {
    /* ... */
  },

  nitro: {
    preset: "cloudflare-pages",
    storage: {
      cache: { driver: "cloudflare-kv-binding", binding: "NUXT_CACHE" },
      script_data: {
        driver: "cloudflare-kv-binding",
        binding: "NUXT_SCRIPT_DATA",
      },
    },
    devStorage: {
      cache: { driver: "fs", base: "./.nuxt/dev-cache/isr" },
      script_data: { driver: "fs", base: "./.nuxt/dev-cache/script_data" },
    },
    prerender: {
      crawlLinks: false,
      routes: [
        "/",
        "/contact",
        "/terms",
        "/privacy",
        ...(categoryRoutesToPrerender || []),
      ],
      ignore: ["/product/**", "/checkout/**", "/cart", "/account/**"],
      concurrency: 10,
      interval: 1000,
      failOnError: false,
      autoSubfolderIndex: false,
    },
  },

  routeRules: {
    "/": { prerender: true, cache: { maxAge: 60 * 60 * 24, base: "cache" } },
    "/product-category/**": {
      prerender: true,
      cache: { maxAge: 60 * 60 * 24 * 7, base: "cache" },
    }, // Rely on prerendering
    "/product/**": { cache: { maxAge: 60 * 60 * 72, base: "cache" } }, // Use KV cache for products
    "/checkout/**": { ssr: false },
    "/cart": { ssr: false },
    "/account/**": { ssr: false },
    "/contact": { prerender: true },
    "/terms": { prerender: true },
    "/privacy": { prerender: true },
  },

  hooks: {
    /* ... */
  },

  // ... (rest of your config) ...
  app: {
    /* ... */
  },

  modules: ["nuxt-gtag"]
});