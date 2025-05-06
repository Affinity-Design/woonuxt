// composables/useSearch.ts
import { ref, computed, watch } from "vue";
import Fuse from "fuse.js"; // We'll use Fuse.js for better search
// Nuxt 3 auto-imports defineNuxtConfig, useRuntimeConfig, etc.
// For client-side access to runtimeConfig, ensure REVALIDATION_SECRET is in public runtimeConfig if needed,
// OR make this fetch call from a server-side context if the secret must remain private.
// Assuming for now REVALIDATION_SECRET is available client-side via public runtimeConfig
// or this composable is used in a context where it can make a call that adds the secret server-side.
// For a pure client-side composable needing a secret, it's better to have an API route
// that doesn't require the secret in the browser, but gets data from KV server-side.
//
// Given our previous API setup, the /api/internal/script-storage/* routes are secured.
// This means useSearch.ts, if running purely client-side, cannot directly call them with a secret.
//
// OPTION 1: (If REVALIDATION_SECRET is exposed to public runtime config - less secure for this secret)
// const runtimeConfig = useRuntimeConfig();
// const internalApiSecret = runtimeConfig.public.REVALIDATION_SECRET;
//
// OPTION 2: (Preferred for security) Create a new, unsecured API route that internally calls the secured one or directly accesses KV.
// For this example, I will proceed as if we are creating a new, dedicated, *unsecured* API route
// specifically for the search composable to fetch product data. This new route would internally
// access KV without needing a secret from the client.
//
// Let's assume you create a new route: `server/api/search-products.get.ts`
// This new route will internally use `useStorage('script_data').getItem('products-list')`
// and will NOT require the X-Internal-Secret header.

export function useSearch() {
  const router = useRouter();
  const route = useRoute();
  const isLoading = ref(false);
  const searchQuery = ref((route.query.search as string) || "");
  const searchResults = ref<any[]>([]); // Define type for search results if known
  const isShowingSearch = useState("isShowingSearch", () => false);

  let fuseInstance: Fuse<any> | null = null; // Define type for Fuse instance

  // Initialize with products from our new API endpoint
  const initializeSearchEngine = async () => {
    isLoading.value = true;
    try {
      // NEW: Fetch from the dedicated (and potentially unsecured or differently secured) endpoint
      // that serves product data for the search component.
      // This endpoint internally fetches from KV's 'products-list'.
      // Let's call it '/api/search-products' for this example.
      // This '/api/search-products' route would be a new server API route you create.
      // It would use useStorage('script_data').getItem('products-list')
      console.log(
        "Initializing search engine, fetching products for search..."
      );
      const response = await fetch("/api/search-products"); // CHANGED

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to load products for search: ${response.status} ${response.statusText}`,
          errorText
        );
        searchResults.value = []; // Clear results on error
        fuseInstance = null; // Reset Fuse instance
        // Optionally, set a user-facing error message state here
        return;
      }

      // The new API endpoint /api/internal/script-storage/products-list
      // directly returns the array of products.
      const products = await response.json(); // CHANGED: No longer { products }

      if (!Array.isArray(products)) {
        console.error("Products data for search is not an array:", products);
        searchResults.value = [];
        fuseInstance = null;
        return;
      }
      if (products.length === 0) {
        console.warn(
          "No products loaded for search. Search will not function."
        );
        // fuseInstance will remain null or be initialized with an empty array
      }

      console.log(
        `Successfully loaded ${products.length} products for search.`
      );

      // Configure Fuse.js for search
      fuseInstance = new Fuse(products, {
        keys: [
          "name",
          "sku",
          "shortDescription",
          "productCategories.nodes.name", // Ensure this path exists in your product data
        ],
        threshold: 0.3, // Adjust as needed for search sensitivity
        ignoreLocation: true, // Depending on your needs
        includeScore: true, // To potentially rank results
      });

      // If there's an initial search query, perform search
      if (searchQuery.value) {
        performSearch();
      }
    } catch (error) {
      console.error("Error during search engine initialization:", error);
      // Optionally, set a user-facing error message state here
    } finally {
      isLoading.value = false;
    }
  };

  // Perform search using current query
  const performSearch = () => {
    if (!fuseInstance || !searchQuery.value) {
      searchResults.value = [];
      return;
    }
    // Ensure fuseInstance is initialized with data
    // Fuse.js documentation states that an empty array can be passed to the constructor.
    // If products.length was 0, fuseInstance would be new Fuse([], config).
    // A search on an empty Fuse index will correctly return an empty array.

    const results = fuseInstance.search(searchQuery.value);
    searchResults.value = results.map((result) => result.item);
  };

  // Update search query and URL
  const setSearchQuery = (query: string) => {
    searchQuery.value = query;

    // Update URL without adding empty search params
    if (query) {
      router.push({ query: { ...route.query, search: query } });
    } else {
      const queryParams = { ...route.query };
      delete queryParams.search; // Remove search param if query is empty
      router.push({ query: queryParams });
    }
    // performSearch is called by the watcher or when search is shown
  };

  // Clear search query
  const clearSearch = () => {
    setSearchQuery(""); // This will trigger the watcher to clear results
  };

  // Toggle search overlay visibility
  const toggleSearch = () => {
    isShowingSearch.value = !isShowingSearch.value;
    if (isShowingSearch.value && !fuseInstance) {
      // Initialize search engine when search is first shown if not already done
      initializeSearchEngine();
    } else if (isShowingSearch.value && searchQuery.value) {
      // If opening search and there's a query, ensure search is performed
      performSearch();
    }
  };

  // Watch for route changes to sync search state (e.g., browser back/forward)
  watch(
    () => route.query.search,
    (newQuery) => {
      const currentRouteQuery = (newQuery as string) || "";
      if (currentRouteQuery !== searchQuery.value) {
        searchQuery.value = currentRouteQuery; // Update internal state
        performSearch(); // Perform search with the new query
      }
    }
  );

  // Watch for direct changes to searchQuery (e.g., from input field)
  watch(searchQuery, (newSearchText) => {
    if (isShowingSearch.value) {
      // Only search if the panel is open
      performSearch();
    }
    // URL is updated by setSearchQuery
  });

  // Initialize on mounted, but only if search is already visible or has a query
  // This prevents loading all products if search is not immediately used.
  onMounted(() => {
    if (isShowingSearch.value || searchQuery.value) {
      initializeSearchEngine();
    }
  });

  return {
    searchQuery,
    searchResults,
    isLoading,
    isShowingSearch,
    setSearchQuery,
    clearSearch,
    toggleSearch,
    hasResults: computed(() => searchResults.value.length > 0),
    initializeSearchEngine, // Expose if manual initialization is needed elsewhere
  };
}
