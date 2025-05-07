import { createResolver } from "@nuxt/kit";
// Import the static JSON file
import categoryRoutesToPrerender from "./data/category-routes.json"; // Adjust path if needed

const { resolve } = createResolver(import.meta.url);

console.log(
  `[Nuxt Config] Found ${categoryRoutesToPrerender.length} category routes to prerender from static file.`
);

export default defineNuxtConfig({
  // ... (your existing config: extends, components, runtimeConfig, etc.) ...
  extends: ["./woonuxt_base"],
  components: [{ path: "./components", pathPrefix: false, priority: 1000 }],
  runtimeConfig: {
    /* ... */
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

    // --- Updated Prerender Config ---
    prerender: {
      crawlLinks: false,
      routes: [
        "/", // Prerender homepage
        "/contact",
        "/terms",
        "/privacy",
        // Spread the list imported from the JSON file
        ...(categoryRoutesToPrerender || []), // Use || [] as fallback
      ],
      ignore: [
        "/product/**", // Keep products using KV cache (ISR)
        "/checkout/**",
        "/cart",
        "/account/**",
      ],
      concurrency: 10,
      interval: 1000,
      failOnError: false,
      autoSubfolderIndex: false,
    },
  },

  // --- Updated Route Rules ---
  routeRules: {
    "/": {
      prerender: true,
      cache: { maxAge: 60 * 60 * 24, base: "cache" },
    },
    // Mark category pages as prerendered
    "/product-category/**": {
      prerender: true,
      // You can optionally remove the 'cache' rule here if prerendering is sufficient,
      // or keep it for potential KV fallback (though less likely to be hit).
      // cache: { maxAge: 60 * 60 * 24 * 7, base: "cache" },
    },
    "/product/**": {
      cache: { maxAge: 60 * 60 * 72, base: "cache" },
    },
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
  app: {
    /* ... */
  },
  // ... (rest of your config) ...
});
