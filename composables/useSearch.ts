// composables/useSearch.ts
import { ref, computed, watch, onMounted } from "vue";
import Fuse from "fuse.js";
import productsData from "~/data/products-list.json";

export function useSearch() {
  const router = useRouter();
  const route = useRoute();
  const isLoading = ref(false);
  const searchQuery = ref((route.query.search as string) || "");
  const searchResults = ref<any[]>([]);
  const isShowingSearch = useState("isShowingSearch", () => false);

  let fuseInstance: Fuse<any> | null = null;

  // Helper function to detect if we're in a local environment
  const isLocalEnvironment = (): boolean => {
    // Check if we're running in the browser
    if (process.client) {
      const hostname = window.location.hostname;
      const port = window.location.port;
      // Local environment check - localhost or 127.0.0.1, typically on port 3000
      return (
        (hostname === "localhost" || hostname === "127.0.0.1") &&
        port === "3000"
      );
    }
    return false;
  };

  const initializeSearchEngine = async () => {
    console.log("[useSearch] Attempting to initialize search engine...");
    isLoading.value = true;

    try {
      // Determine if we should use local text file or production KV store
      const isLocal = isLocalEnvironment();
      console.log(
        `[useSearch] Detected environment: ${isLocal ? "local" : "production"}`
      );

      let products: any[] = [];

      if (isLocal) {
        // LOCAL ENVIRONMENT: Use local text file
        console.log(
          "[useSearch] Local environment detected. Importing local products-list.json"
        );
        try {
          // Directly use the imported JSON data
          if (Array.isArray(productsData)) {
            products = productsData;
            console.log(
              `[useSearch] Successfully imported ${products.length} products from JSON file.`
            );
          } else {
            console.error(
              "[useSearch] Imported products-list.json is not an array. Data:",
              productsData
            );
            throw new Error("Imported JSON data is not an array");
          }
        } catch (localError) {
          console.error(
            "[useSearch] Error processing imported products-list.json:",
            localError
          );
          // Use mock data as fallback
          products = generateMockProducts();
        }
      } else {
        // PRODUCTION ENVIRONMENT: Use KV store via API endpoint
        console.log(
          "[useSearch] Production environment detected. Using API endpoint."
        );
        const response = await fetch("/api/search-products");
        console.log("[useSearch] Raw response status:", response.status);

        if (!response.ok) {
          let errorText = "No error text available.";
          try {
            errorText = await response.text();
          } catch (e) {
            console.error("[useSearch] Could not read error response text:", e);
          }
          console.error(
            `[useSearch] Failed to load products. Status: ${response.status} ${response.statusText}. Response text:`,
            errorText
          );
          searchResults.value = [];
          fuseInstance = null;
          isLoading.value = false;
          return;
        }

        products = await response.json();
      }

      // Validate products data structure
      if (!Array.isArray(products)) {
        console.error(
          "[useSearch] Products data is not an array. Received:",
          typeof products,
          products
        );
        searchResults.value = [];
        fuseInstance = null;
        isLoading.value = false;
        return;
      }

      if (products.length === 0) {
        console.warn(
          "[useSearch] No products loaded. Search will operate on an empty list."
        );
      } else {
        console.log(
          `[useSearch] Successfully loaded ${products.length} products for search.`
        );
      }

      fuseInstance = new Fuse(products, {
        keys: [
          "name",
          "sku",
          "shortDescription",
          "productCategories.nodes.name",
        ],
        threshold: 0.3,
        ignoreLocation: true,
        includeScore: true,
      });
      console.log("[useSearch] Fuse.js instance initialized.", fuseInstance);

      if (searchQuery.value) {
        console.log(
          "[useSearch] Initial search query exists, performing search:",
          searchQuery.value
        );
        performSearch();
      }
    } catch (error) {
      console.error(
        "[useSearch] Critical error during search engine initialization:",
        error
      );
    } finally {
      isLoading.value = false;
      console.log(
        "[useSearch] Initialization finished. Loading state:",
        isLoading.value
      );
    }
  };

  // Add a function to perform a full search and return results for search page
  const performFullPageSearch = async (query: string): Promise<any[]> => {
    console.log("[useSearch] Performing full page search for:", query);
    if (!query) return [];

    // Initialize search engine if not already done
    if (!fuseInstance) {
      console.log(
        "[useSearch] Fuse instance not available, initializing for full page search"
      );
      await initializeSearchEngine();
    }

    if (!fuseInstance) {
      console.error(
        "[useSearch] Failed to initialize search engine for full page search"
      );
      return [];
    }

    // Perform search using Fuse.js
    const fuseResults = fuseInstance.search(query);
    return fuseResults.map((result) => result.item);
  };

  const performSearch = () => {
    console.log("[useSearch] Performing search for query:", searchQuery.value);
    if (!fuseInstance) {
      console.warn(
        "[useSearch] Fuse instance not available for search. Attempting to initialize."
      );
      if (isShowingSearch.value) initializeSearchEngine();
      searchResults.value = [];
      return;
    }
    if (!searchQuery.value) {
      console.log("[useSearch] Search query is empty, clearing results.");
      searchResults.value = [];
      return;
    }

    const fuseResults = fuseInstance.search(searchQuery.value);
    console.log("[useSearch] Raw Fuse results:", fuseResults);
    searchResults.value = fuseResults.map((result) => result.item);
    console.log("[useSearch] Mapped search results:", searchResults.value);
  };

  const setSearchQuery = (query: string) => {
    console.log("[useSearch] Setting search query to:", query);
    searchQuery.value = query; // This will trigger the watcher

    if (query) {
      router.push({ query: { ...route.query, search: query } });
    } else {
      const queryParams = { ...route.query };
      delete queryParams.search;
      router.push({ query: queryParams });
    }
  };

  const clearSearch = () => {
    console.log("[useSearch] Clearing search.");
    setSearchQuery("");
  };

  const toggleSearch = () => {
    isShowingSearch.value = !isShowingSearch.value;
    console.log(
      "[useSearch] Toggled search visibility to:",
      isShowingSearch.value
    );
    if (isShowingSearch.value && !fuseInstance) {
      console.log(
        "[useSearch] Search shown and Fuse not initialized. Calling initializeSearchEngine."
      );
      initializeSearchEngine();
    } else if (
      isShowingSearch.value &&
      searchQuery.value &&
      searchResults.value.length === 0
    ) {
      console.log(
        "[useSearch] Search shown with existing query and no results. Performing search."
      );
      performSearch();
    }
  };

  watch(
    () => route.query.search,
    (newQuery) => {
      const currentRouteQuery = (newQuery as string) || "";
      console.log(
        "[useSearch] Route query 'search' changed to:",
        currentRouteQuery
      );
      if (currentRouteQuery !== searchQuery.value) {
        searchQuery.value = currentRouteQuery; // Update internal state, watcher on searchQuery will call performSearch
      }
    }
  );

  watch(searchQuery, (newSearchText) => {
    console.log(
      "[useSearch] searchQuery watcher triggered with:",
      newSearchText
    );
    if (isShowingSearch.value) {
      console.log(
        "[useSearch] Search is visible, performing search due to query change."
      );
      performSearch();
    } else {
      console.log(
        "[useSearch] Search not visible, search not performed despite query change."
      );
    }
  });

  onMounted(() => {
    console.log(
      "[useSearch] Component mounted. isShowingSearch:",
      isShowingSearch.value,
      "searchQuery:",
      searchQuery.value
    );
    if (isShowingSearch.value || searchQuery.value) {
      console.log(
        "[useSearch] onMounted: Calling initializeSearchEngine due to visible search or existing query."
      );
      initializeSearchEngine();
    } else {
      console.log(
        "[useSearch] onMounted: Search not visible and no query, Fuse will initialize on toggle."
      );
    }
  });

  // Helper function to generate mock products
  const generateMockProducts = () => {
    const mockProducts = [
      {
        id: "mock-1",
        name: "Mock Product 1",
        slug: "mock-product-1",
        price: "$19.99",
        sku: "MOCK001",
        shortDescription: "This is a sample product for testing",
      },
      {
        id: "mock-2",
        name: "Mock Product 2",
        slug: "mock-product-2",
        price: "$29.99",
        sku: "MOCK002",
        shortDescription: "Another sample product for testing",
      },
    ];
    console.log(
      `[useSearch] Using ${mockProducts.length} mock products for search`
    );
    return mockProducts;
  };

  return {
    searchQuery,
    searchResults,
    isLoading,
    isShowingSearch,
    setSearchQuery,
    clearSearch,
    toggleSearch,
    hasResults: computed(() => searchResults.value.length > 0),
    initializeSearchEngine,
    performFullPageSearch,
  };
}
