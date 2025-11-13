// composables/useCachedProduct.ts
import {ref, Ref} from 'vue';

export function useCachedProduct() {
  const nuxtApp = useNuxtApp();
  const isFetchingCache = ref(false);
  const cacheError = ref(null);

  /**
   * Attempt to get a product from cache by slug
   */
  const getProductFromCache = async (slug: string): Promise<any | null> => {
    isFetchingCache.value = true;
    if (nuxtApp.payload?.data?.[`product-${slug}`]) {
      return nuxtApp.payload.data[`product-${slug}`];
    }

    try {
      // Try to fetch from our product cache using $fetch for SSR compatibility
      const result = await $fetch('/api/cached-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({slug}),
        ignoreResponseError: true,
      });

      if (result && result.success && result.product) {
        // Check if the cached data is still fresh (e.g., less than 24 hours old)
        const cacheTimestamp = result.timestamp;
        const currentTime = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        if (currentTime - cacheTimestamp < maxAge) {
          return result.product;
        } else {
          console.log('Cached product data is stale, fetching fresh data...');
          return null;
        }
      }
    } catch (error) {
      console.error('Error fetching product from cache:', error);
      cacheError.value = error;
      return null;
    } finally {
      isFetchingCache.value = false;
    }
  };

  return {
    getProductFromCache,
    isFetchingCache,
    cacheError,
  };
}
