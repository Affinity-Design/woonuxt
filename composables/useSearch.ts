// composables/useSearch.ts
import { ref, computed, watch } from "vue";
import Fuse from "fuse.js";

export function useSearch() {
  const router = useRouter();
  const route = useRoute();
  const isLoading = ref(false);
  const searchQuery = ref((route.query.search as string) || "");
  const searchResults = ref<any[]>([]);
  const isShowingSearch = useState("isShowingSearch", () => false);

  let fuseInstance: Fuse<any> | null = null;

  const initializeSearchEngine = async () => {
    console.log("[useSearch] Attempting to initialize search engine...");
    isLoading.value = true;
    try {
      console.log("[useSearch] Fetching products from /api/search-products");
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

      const products = await response.json();
      console.log("[useSearch] Parsed products from API:", products);

      if (!Array.isArray(products)) {
        console.error(
          "[useSearch] Products data from API is not an array. Received:",
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
          "[useSearch] No products loaded from API. Search will operate on an empty list."
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

  const performSearch = () => {
    console.log("[useSearch] Performing search for query:", searchQuery.value);
    if (!fuseInstance) {
      console.warn(
        "[useSearch] Fuse instance not available for search. Attempting to initialize."
      );
      // Potentially re-initialize if it's null and search is attempted.
      // However, this might lead to multiple initializations if not handled carefully.
      // For now, we rely on toggleSearch or onMounted to initialize.
      // If search is critical and might be called before toggle/mount, consider initializing earlier.
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
    // performSearch() is now primarily driven by the watcher on searchQuery
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
      // If opening search and there's a query but no results yet, perform search
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
  };
}
