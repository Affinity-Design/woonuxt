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
    storage: {
      // Existing cache configuration for Nitro's internal ISR/route caching
      cache: {
        driver: "cloudflare-kv-binding",
        binding: "NUXT_CACHE", // <-- your Cloudflare KV binding name for ISR cache
      },
      // New configuration for script data
      script_data: {
        driver: "cloudflare-kv-binding",
        binding: "NUXT_SCRIPT_DATA", // <-- Your NEW Cloudflare KV binding for script data
      },
    },
    devStorage: {
      // Existing dev storage for ISR cache
      cache: {
        driver: "fs",
        base: "./.nuxt/dev-cache/isr", // Explicit base path for dev ISR cache
      },
      // New dev configuration for script data
      script_data: {
        driver: "fs",
        // Store script data locally during development in a separate folder
        base: "./.nuxt/dev-cache/script_data",
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ["/"],
      ignore: ["/product/**", "/product-category/**"],
      concurrency: 10,
      interval: 1000,
      failOnError: false,
      autoSubfolderIndex: false,
    },
  },

  // --- START: Updated Route Rules ---
  routeRules: {
    "/": {
      // Cache options for the homepage
      cache: {
        maxAge: 60 * 60 * 24, // Cache duration: 24 hours
        base: "cache", // Target the 'cache' storage mount point
      },
      prerender: true, // Prerender this route during build
    },
    "/product-category/**": {
      // Cache options for product category pages
      cache: {
        maxAge: 60 * 60 * 24 * 7, // Cache duration: 7 days
        base: "cache", // Target the 'cache' storage mount point
      },
    },
    "/product/**": {
      // Cache options for individual product pages
      cache: {
        maxAge: 60 * 60 * 72, // Cache duration: 72 hours
        base: "cache", // Target the 'cache' storage mount point
      },
    },
    // Routes that should not be server-side rendered (client-side only)
    "/checkout/**": { ssr: false },
    "/cart": { ssr: false },
    "/account/**": { ssr: false },
    // Static pages to be prerendered
    "/contact": { prerender: true },
    "/terms": { prerender: true },
    "/privacy": { prerender: true },
  },
  // --- END: Updated Route Rules ---

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

  // TODO only for testing
  // image: {
  //   // Disable for development/testing
  //   domains:
  //     process.env.NODE_ENV === "production"
  //       ? ["test.proskatersplace.com", "proskatersplace.ca"]
  //       : [],
  //   // Use simpler format for local testing
  //   format: ["webp"],
  //   // Placeholder options
  //   placeholder: process.env.NODE_ENV === "production",
  // },

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
