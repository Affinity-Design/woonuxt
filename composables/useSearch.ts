// composables/useSearch.ts
import {ref, computed, watch, onMounted} from 'vue';
import Fuse from 'fuse.js';

export function useSearch() {
  const router = useRouter();
  const route = useRoute();
  const isLoading = ref(false);
  const searchQuery = ref((route.query.search as string) || '');
  const searchResults = ref<any[]>([]);
  const isShowingSearch = useState('isShowingSearch', () => false);

  let fuseInstance: Fuse<any> | null = null;

  // Helper function to detect if we're in a local environment
  const isLocalEnvironment = (): boolean => {
    // Check if we're running in the browser
    if (process.client) {
      const hostname = window.location.hostname;
      const port = window.location.port;
      // Local environment check - localhost or 127.0.0.1, typically on port 3000
      return (hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000';
    }
    return false;
  };

  const initializeSearchEngine = async () => {
    isLoading.value = true;

    try {
      // Determine if we should use local text file or production KV store
      const isLocal = isLocalEnvironment();

      let products: any[] = [];

      if (isLocal) {
        // LOCAL ENVIRONMENT: Use local text file
        try {
          // Dynamically fetch the JSON data
          const response = await fetch('/data/products-list.json');
          if (!response.ok) throw new Error('Failed to fetch products data');
          const productsData = await response.json();

          if (Array.isArray(productsData)) {
            products = productsData;
          } else {
            throw new Error('Imported JSON data is not an array');
          }
        } catch (localError) {
          // Use mock data as fallback
          products = generateMockProducts();
        }
      } else {
        // PRODUCTION ENVIRONMENT: Use KV store via API endpoint
        products = await $fetch('/api/search-products', {
          // Ignore errors and use empty array as fallback
          ignoreResponseError: true,
        }).catch(() => []);

        if (!Array.isArray(products) || products.length === 0) {
          searchResults.value = [];
          fuseInstance = null;
          isLoading.value = false;
          return;
        }
      }

      // Validate products data structure
      if (!Array.isArray(products)) {
        searchResults.value = [];
        fuseInstance = null;
        isLoading.value = false;
        return;
      }

      if (products.length === 0) {
      } else {
        console.log(`[useSearch] Successfully loaded ${products.length} products for search.`);
      }

      fuseInstance = new Fuse(products, {
        keys: ['name', 'sku', 'shortDescription', 'productCategories.nodes.name'],
        threshold: 0.3,
        ignoreLocation: true,
        includeScore: true,
      });

      if (searchQuery.value) {
        performSearch();
      }
    } catch (error) {
    } finally {
      isLoading.value = false;
    }
  };

  // Add a function to perform a full search and return results for search page
  const performFullPageSearch = async (query: string): Promise<any[]> => {
    if (!query) return [];

    // Initialize search engine if not already done
    if (!fuseInstance) {
      await initializeSearchEngine();
    }

    if (!fuseInstance) {
      return [];
    }

    // Perform search using Fuse.js
    const fuseResults = fuseInstance.search(query);
    return fuseResults.map((result) => result.item);
  };

  const performSearch = () => {
    if (!fuseInstance) {
      if (isShowingSearch.value) initializeSearchEngine();
      searchResults.value = [];
      return;
    }
    if (!searchQuery.value) {
      searchResults.value = [];
      return;
    }

    const fuseResults = fuseInstance.search(searchQuery.value);
    searchResults.value = fuseResults.map((result) => result.item);
  };

  const setSearchQuery = (query: string) => {
    searchQuery.value = query; // This will trigger the watcher

    if (query) {
      router.push({query: {...route.query, search: query}});
    } else {
      const queryParams = {...route.query};
      delete queryParams.search;
      router.push({query: queryParams});
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const toggleSearch = () => {
    isShowingSearch.value = !isShowingSearch.value;
    if (isShowingSearch.value && !fuseInstance) {
      initializeSearchEngine();
    } else if (isShowingSearch.value && searchQuery.value && searchResults.value.length === 0) {
      performSearch();
    }
  };

  watch(
    () => route.query.search,
    (newQuery) => {
      const currentRouteQuery = (newQuery as string) || '';
      if (currentRouteQuery !== searchQuery.value) {
        searchQuery.value = currentRouteQuery; // Update internal state, watcher on searchQuery will call performSearch
      }
    },
  );

  watch(searchQuery, (newSearchText) => {
    if (isShowingSearch.value) {
      performSearch();
    } else {
    }
  });

  onMounted(() => {
    if (isShowingSearch.value || searchQuery.value) {
      initializeSearchEngine();
    } else {
    }
  });

  // Helper function to generate mock products
  const generateMockProducts = () => {
    const mockProducts = [
      {
        id: 'mock-1',
        name: 'Mock Product 1',
        slug: 'mock-product-1',
        price: '$19.99',
        sku: 'MOCK001',
        shortDescription: 'This is a sample product for testing',
      },
      {
        id: 'mock-2',
        name: 'Mock Product 2',
        slug: 'mock-product-2',
        price: '$29.99',
        sku: 'MOCK002',
        shortDescription: 'Another sample product for testing',
      },
    ];
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
