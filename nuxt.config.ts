export default defineNuxtConfig({
  extends: ["./woonuxt_base"],
  components: [{ path: "./components", pathPrefix: false }],
  runtimeConfig: {
    public: {
      exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY || "default_key", // Fallback for development
      turnstyleSiteKey: process.env.TURNSTYLE_SITE_KEY, // Fallback for development
      turnstyleSecretKey: process.env.TURNSTYLE_SECRET_KEY,
      turnstile: {
        siteKey: process.env.TURNSTYLE_SECRET_KEY,
      },
    },
  },
  devtools: { enabled: true },
  ssr: true,

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
  },

  // Set route rules for pre-rendering
  routeRules: {
    // "/**": { prerender: true },
    "/product-category/**": { prerender: true },
    // "/product/**": { prerender: true }, // Added this line for all product pages
  },
});
