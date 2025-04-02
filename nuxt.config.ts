import { createResolver } from "@nuxt/kit";
const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  extends: ["./woonuxt_base"],
  components: [{ path: "./components", pathPrefix: false, priority: 1000 }],
  runtimeConfig: {
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDING_EMAIL: process.env.SENDING_EMAIL,
    RECEIVING_EMAIL: process.env.RECEIVING_EMAIL,
    REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
    public: {
      stripePublishableKey: process.env.NUXT_STRIPE_PUBLISHABLE_KEY,
      exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY || "default_key", // Fallback for development
      turnstyleSiteKey: process.env.TURNSTYLE_SITE_KEY, // Fallback for development
      turnstyleSecretKey: process.env.TURNSTYLE_SECRET_KEY,
      turnstile: {
        siteKey: process.env.TURNSTYLE_SITE_KEY,
      },
    },
  },
  devtools: { enabled: true },
  ssr: true,

  devServer: {
    port: 3000,
    https: {
      key: "./localhost-key.pem",
      cert: "./localhost.pem",
    },
  },

  // Updated Nitro configuration for Cloudflare Pages
  nitro: {
    preset: "cloudflare-pages",
    prerender: {
      crawlLinks: false, // Don't automatically crawl all links
      routes: ["/"], // Only prerender the homepage
      ignore: ["/product/**", "/product-category/**"], // Explicitly ignore product and category pages during prerendering
      concurrency: 10,
      interval: 1000,
      failOnError: false,
      autoSubfolderIndex: false,
    },
    experimental: {
      openAPI: true,
    },
    // Configure the storage for the cache
    storage: {
      cache: {
        driver: "cloudflare-kv",
        // Optional: Configure specific KV namespace if needed
        // binding: 'YOUR_KV_NAMESPACE',
      },
    },
    // Cloudflare-specific optimizations
  },

  // Enhanced route rules with ISR (Incremental Static Regeneration)
  // Enhanced route rules with ISR (Incremental Static Regeneration)
  routeRules: {
    // Homepage prerendered at build time
    "/": {
      cache: {
        staleMaxAge: 60 * 60 * 24, // 7 days in seconds
        swr: true,
      },
    },
    // Product category pages with stale-while-revalidate for 1 week
    "/product-category/**": {
      cache: {
        staleMaxAge: 60 * 60 * 24 * 7, // 7 days in seconds
        swr: true,
      },
    },
    // Product pages with stale-while-revalidate for 72 hours
    "/product/**": {
      cache: {
        staleMaxAge: 60 * 60 * 72, // 7 days in seconds
        swr: true,
      },
    },
    // Dynamic routes with no caching - client-side rendering only
    "/checkout/**": {
      ssr: false,
    },
    "/cart": {
      ssr: false,
    },
    "/account/**": {
      ssr: false,
    },
    // Static pages prerendered
    "/contact": {
      prerender: true,
    },
    "/terms": {
      prerender: true,
    },
    "/privacy": {
      prerender: true,
    },
  },

  // Hook overides
  hooks: {
    "pages:extend"(pages) {
      // First, remove the existing order-summary routes
      const filteredPages = pages.filter(
        (page) => !["order-received", "order-summary"].includes(page.name)
      );

      // Add your custom routes with absolute path
      const addPage = (name: string, path: string, file: string) => {
        filteredPages.push({
          name,
          path,
          file: resolve(process.cwd(), `./pages/${file}`), // Use absolute path
        });
      };

      addPage(
        "order-received",
        "/checkout/order-received/:orderId",
        "order-summary.vue"
      );
      addPage("order-summary", "/order-summary/:orderId", "order-summary.vue");

      // Replace the pages array
      pages.splice(0, pages.length, ...filteredPages);
    },
  },
  // Whitelisting for agent
  app: {
    head: {
      meta: [
        {
          name: "user-agent",
          content:
            "Mozilla/5.0 (compatible; ProSkatersPlaceFrontend/1.0; https://*.proskatersplace.ca)",
        },
      ],
    },
  },
});
