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

  // Update your nitro config in nuxt.config.ts
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
  },

  // Set route rules for pre-rendering
  routeRules: {
    "/": { prerender: true }, // Only prerender homepage
    "/product-category/**": {
      cache: {
        maxAge: 60 * 60 * 24 * 7, // Cache for 1 week (in seconds)
        staleMaxAge: 60 * 60, // Serve stale content for up to 1 hour while revalidating
        swr: true, // Enable stale-while-revalidate behavior
      },
      prerender: false, // Don't prerender at build time
    },
    "/product/**": {
      cache: {
        maxAge: 60 * 60 * 48, // Cache for 48 hours (in seconds)
        staleMaxAge: 60 * 15, // Serve stale content for up to 15 minutes while revalidating
        swr: true, // Enable stale-while-revalidate behavior
      },
      prerender: false, // Don't prerender at build time
    },
    "/checkout/**": { ssr: true }, // Dynamic routes, no caching
    "/cart": { ssr: true }, // Dynamic routes, no caching
    "/account/**": { ssr: true }, // Dynamic routes, no caching
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
