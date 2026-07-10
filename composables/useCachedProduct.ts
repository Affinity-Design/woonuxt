import {ref} from 'vue';

export function useCachedProduct() {
  const nuxtApp = useNuxtApp();
  const isFetchingCache = ref(false);
  const cacheError = ref(null);

  /**
   * Attempt to get a product from cache by slug
   */
  const getProductFromCache = async (slug: string): Promise<any | null> => {
    isFetchingCache.value = true;

    try {
      const payloadProduct = nuxtApp.payload?.data?.[`product-${slug}`];
      if (payloadProduct) {
        return payloadProduct;
      }

      const result = await $fetch('/api/cached-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({slug}),
      });

      if (result && result.success && result.product) {
        return result.product;
      }

      throw new Error(`No product data returned for ${slug}`);
    } catch (error) {
      cacheError.value = error;
      throw error;
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
