// composables/useProductsCached.ts
import { useProducts } from "./useProducts";
import { useFetch } from "nuxt/app";

export function useProductsCached() {
  // Get the original products functionality
  const { products, allProducts, setProducts, updateProductList } =
    useProducts();

  // Add loading state
  const isLoadingCache = ref(false);
  const cacheError = ref<Error | null>(null);

  // Function to load products from cache
  const loadFromCache = async () => {
    isLoadingCache.value = true;
    cacheError.value = null;

    try {
      // Try to get products from our server-side cache endpoint
      const { data, error } = await useFetch("/api/products-cache");

      if (error.value) throw error.value;

      if (data.value?.products?.length) {
        // Set products in the state
        setProducts(data.value.products);
        return true;
      }

      return false;
    } catch (err) {
      console.error("Error loading products from cache:", err);
      cacheError.value = err as Error;
      return false;
    } finally {
      isLoadingCache.value = false;
    }
  };

  // Enhanced function to get products - tries cache first
  const getProducts = async (params?: any) => {
    // First try to get products from cache
    const cacheSuccess = await loadFromCache();

    // If cache failed, fall back to API
    if (!cacheSuccess) {
      // This would be your GraphQL query implementation
      // We'd implement it based on your existing code
      try {
        const { data } = await useAsyncGql("getProducts", params);
        if (data.value?.products?.nodes) {
          setProducts(data.value.products.nodes);
        }
      } catch (err) {
        console.error("Error fetching products from API:", err);
        throw err;
      }
    }

    return products.value;
  };

  return {
    products,
    allProducts,
    setProducts,
    updateProductList,
    getProducts,
    isLoadingCache,
    cacheError,
    loadFromCache,
  };
}
