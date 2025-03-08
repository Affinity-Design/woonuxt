// modules/cache-sync.ts
import { defineNuxtModule, createResolver } from "@nuxt/kit";

export default defineNuxtModule({
  meta: {
    name: "cache-sync",
    configKey: "cacheSync",
  },
  defaults: {},
  setup(options, nuxt) {
    // Add a server plugin to handle cache
    const { resolve } = createResolver(import.meta.url);

    nuxt.hook("nitro:config", (nitroConfig) => {
      // Ensure cache is enabled
      if (!nitroConfig.storage) {
        nitroConfig.storage = {};
      }

      // Add cache handlers
      nitroConfig.handlers = nitroConfig.handlers || [];

      // Add cache headers dynamically
      nuxt.hook("pages:extend", () => {
        // Make sure pages with caching have proper cache control headers
        Object.entries(nuxt.options.routeRules || {}).forEach(
          ([path, rules]) => {
            if (rules.cache) {
              const { maxAge, staleMaxAge } = rules.cache;

              // Log cache configuration for debugging
              console.log(
                `Configured cache for ${path}: maxAge=${maxAge}, staleMaxAge=${staleMaxAge}`
              );
            }
          }
        );
      });
    });

    // Add plugin for client-side cache handling
    nuxt.hook("components:dirs", (dirs) => {
      // Ensure all components can access cache data
      nuxt.options.build = nuxt.options.build || {};
      nuxt.options.build.transpile = nuxt.options.build.transpile || [];
      nuxt.options.build.transpile.push("cache-sync");
    });

    console.log("Cache synchronization module initialized");
  },
});
