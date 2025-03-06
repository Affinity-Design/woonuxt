import { createResolver } from "@nuxt/kit";
const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  extends: ["./woonuxt_base"],
  components: [{ path: "./components", pathPrefix: false, priority: 1000 }],
  runtimeConfig: {
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
    GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI,
    RECEIVING_EMAIL: process.env.RECEIVING_EMAIL,
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
  },

  nitro: {
    preset: "cloudflare-pages",
    prerender: {
      crawlLinks: false, // set to true for render
      routes: ["/"],
      concurrency: 10,
      interval: 1000,
      failOnError: false,
      autoSubfolderIndex: false,
    },
    experimental: {
      openAPI: true,
    },
  },

  // Set route rules for pre-rendering
  routeRules: {
    // "/**": { prerender: true },
    "/product-category/**": { prerender: true },
    // "/product/**": { prerender: true }, // Added this line for all product pages
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
