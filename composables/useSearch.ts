// composables/useSearch.ts
import { ref, computed, watch } from "vue";
import Fuse from "fuse.js"; // We'll use Fuse.js for better search

export function useSearch() {
  const router = useRouter();
  const route = useRoute();
  const isLoading = ref(false);
  const searchQuery = ref("");
  const searchResults = ref([]);
  const isShowingSearch = useState("isShowingSearch", () => false);

  // Initialize from route query
  searchQuery.value = (route.query.search as string) || "";

  // Fuse.js instance - will be initialized with products
  let fuseInstance = null;

  // Initialize with products from cache
  const initializeSearchEngine = async () => {
    isLoading.value = true;
    try {
      // Fetch the cached products from the file system
      const response = await fetch("/api/products-cache");
      const { products } = await response.json();

      // Configure Fuse.js for search
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

      // If there's an initial search query, perform search
      if (searchQuery.value) {
        performSearch();
      }
    } catch (error) {
      console.error("Failed to load products for search:", error);
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

    const results = fuseInstance.search(searchQuery.value);
    searchResults.value = results.map((result) => result.item);
  };

  // Update search query and URL
  const setSearchQuery = (query) => {
    searchQuery.value = query;

    // Update URL without adding empty search params
    if (query) {
      router.push({ query: { ...route.query, search: query } });
    } else {
      // Remove search param if empty
      const queryParams = { ...route.query };
      delete queryParams.search;
      router.push({ query: queryParams });
    }

    performSearch();
  };

  // Clear search query
  const clearSearch = () => {
    setSearchQuery("");
    searchResults.value = [];
  };

  // Toggle search overlay visibility
  const toggleSearch = () => {
    isShowingSearch.value = !isShowingSearch.value;
    if (isShowingSearch.value && !fuseInstance) {
      // Initialize search engine when search is first shown
      initializeSearchEngine();
    }
  };

  // Watch for route changes to sync search state
  watch(
    () => route.query.search,
    (newQuery) => {
      if (newQuery !== searchQuery.value) {
        searchQuery.value = (newQuery as string) || "";
        performSearch();
      }
    }
  );

  // Initialize on mount
  onMounted(() => {
    initializeSearchEngine();
  });

  // Expose necessary functions and state
  return {
    searchQuery,
    searchResults,
    isLoading,
    isShowingSearch,
    setSearchQuery,
    clearSearch,
    toggleSearch,
    hasResults: computed(() => searchResults.value.length > 0),
  };
}
