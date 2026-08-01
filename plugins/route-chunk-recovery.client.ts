/**
 * Recover from stale-deployment chunk failures instead of dead-ending on "Error 500".
 *
 * When a visitor lands on HTML that predates the current deployment (a KV route-cache
 * entry, a browser/intermediate cache, or an open tab), that HTML asks for /_nuxt/*
 * chunks whose content hashes no longer exist. Nuxt's own listener calls
 * `event.preventDefault()` on `vite:preloadError` while `isHydrating`
 * (nuxt/dist/app/nuxt.js), so Vite's `handlePreloadError` returns instead of
 * rethrowing — the page's dynamic import resolves to `undefined` rather than
 * rejecting, and vue-router throws:
 *
 *   Couldn't resolve component "default" at "/product-category/:slug()"
 *
 * Nuxt renders that as a 500 error page. Nuxt's built-in nuxt:chunk-reload plugin
 * cannot recover it: that plugin only reloads when `router.onError` receives an error
 * it recorded in its own `chunkErrors` set, and the error vue-router throws here is a
 * different object than the swallowed payload. So the visitor is stuck, and refreshing
 * re-serves the same stale HTML.
 *
 * This plugin retries once, on the URL plus a marker. The marker matters twice over:
 * it makes the retry loop-proof (we refuse to recover a URL that already carries it),
 * and it changes Nitro's cache key — which is a hash of the full request URL, query
 * included — so the retry bypasses a stale KV entry rather than re-reading it.
 *
 * The marker is inert for the pages it lands on: useCategorySEO's generateCanonicalUrl
 * builds canonicals from an allowlist (brand/size/skill-level/page), so it cannot leak
 * into a canonical or an hreflang, and useProducts' updateProductList() short-circuits
 * back to the unfiltered list when no filter/search/sort is active.
 *
 * The real fix for the stale entries is per-deployment cache integrity — see BUILD_ID
 * in nuxt.config.ts. This is the safety net for HTML already cached outside KV.
 */
const RECOVERY_MARKER = 'chunk-reload';

/** Messages that mean "the JS this document was built against is gone". */
const STALE_CHUNK_ERROR =
  /Couldn't resolve component|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export default defineNuxtPlugin({
  name: 'route-chunk-recovery',
  setup(nuxtApp) {
    const router = useRouter();

    const recover = (fullPath?: string) => {
      const url = new URL(fullPath || window.location.href, window.location.origin);

      // One attempt only. If the marker is already there, the freshly fetched HTML
      // failed too, so the problem is not staleness — let the error page render.
      if (url.searchParams.has(RECOVERY_MARKER)) return;
      url.searchParams.set(RECOVERY_MARKER, '1');

      reloadNuxtApp({path: url.pathname + url.search, persistState: true, ttl: 15_000});
    };

    // The swallowed case, and the only one Nuxt cannot handle itself. Gated on the
    // same condition Nuxt gates preventDefault() on, so we take exactly the set it drops
    // and leave ordinary client-side navigation to nuxt:chunk-reload.
    nuxtApp.hook('app:chunkError', () => {
      if (nuxtApp.isHydrating) recover();
    });

    // Backstop: catch the downstream symptom directly, in case the error surfaces
    // after hydration has flipped.
    router.onError((error, to) => {
      if (STALE_CHUNK_ERROR.test(String((error as Error)?.message ?? ''))) recover(to?.fullPath);
    });
  },
});
