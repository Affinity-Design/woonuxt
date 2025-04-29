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
      cache: {
        driver: "cloudflare-kv-binding",
        binding: "NUXT_CACHE", // <-- your Cloudflare KV binding name
      },
    },
    devStorage: {
      cache: {
        driver: "fs",
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

  routeRules: {
    "/": {
      cache: {
        maxAge: 60 * 60 * 24, // 24 hours
        isr: true,
        storage: "cache",
      },
      prerender: true,
    },
    "/product-category/**": {
      cache: {
        maxAge: 60 * 60 * 24 * 7, // 7 days
        isr: true,
        storage: "cache",
      },
    },
    "/product/**": {
      cache: {
        maxAge: 60 * 60 * 72, // 72 hours
        isr: true,
        storage: "cache",
      },
    },
    "/checkout/**": { ssr: false },
    "/cart": { ssr: false },
    "/account/**": { ssr: false },
    "/contact": { prerender: true },
    "/terms": { prerender: true },
    "/privacy": { prerender: true },
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
