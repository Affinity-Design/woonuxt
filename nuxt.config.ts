export default defineNuxtConfig({
  extends: ["./woonuxt_base"],
  components: [{ path: "./components", pathPrefix: false }],

  // Enable server-side rendering
  ssr: true,

  // Configure Nitro for pre-rendering
  nitro: {
    preset: "cloudflare-pages",
    prerender: {
      crawlLinks: false,
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
    // "/product-category/**": { prerender: true },
    // "/product/**": { prerender: true }, // Added this line for all product pages
    "/product-category/inline-frames": { prerender: true },
  },
});
