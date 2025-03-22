// composables/useSearchCached.ts
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDebounceFn } from "~/composables/useDebounceFn";

export function useSearchCached() {
  const { products } = useProducts();
  const route = useRoute();
  const router = useRouter();
  const runtimeConfig = useRuntimeConfig();

  const isShowingSearch = useState<boolean>("isShowingSearch", () => false);
  const searchQuery = useState<string>("searchQuery", () => "");
  const searchResults = useState<Product[]>("searchResults", () => []);
  const isSearching = useState<boolean>("isSearching", () => false);
  const isSearchActive = computed<boolean>(() => !!searchQuery.value);
  const limitedSearchResults = computed(() => searchResults.value.slice(0, 10)); // Even stricter for UI

  // Initialize search query from route
  searchQuery.value = route.query.search as string;

  const searchIndex = computed(() => {
    if (!products.value || !products.value.length) return [];
    return products.value.map((product) => ({
      id: product.id,
      name: product.name?.toLowerCase() || "",
      sku: product.sku?.toLowerCase() || "",
      categoryNames:
        product.productCategories?.nodes
          ?.map((cat) => cat.name?.toLowerCase())
          .filter(Boolean) || [],
    }));
  });

  /**
   * Get the current search query from the route
   */
  function getSearchQuery(): string {
    return route.query.search as string;
  }

  const isInternalUpdate = ref(false);
  /**
   * Set the search query and update the route
   */
  function setSearchQuery(search: string): void {
    isInternalUpdate.value = true;
    searchQuery.value = search;

    // Only update route if search exists
    if (route.query.search !== search) {
      router.push({ query: { ...route.query, search } });
    }

    // Perform the search
    performSearch(search);
  }

  /**
   * Clear the search query
   */
  function clearSearchQuery(): void {
    setSearchQuery("");
    searchResults.value = [];
  }

  /**
   * Toggle the search UI visibility
   */
  const toggleSearch = (): void => {
    isShowingSearch.value = !isShowingSearch.value;
  };

  /**
   * Perform client-side search on cached products
   */
  async function performSearch(query: string): Promise<void> {
    if (!query) {
      searchResults.value = [];
      return;
    }
    isSearching.value = true;
    try {
      if (products.value && products.value.length > 0) {
        searchResults.value = searchLocalProducts(products.value, query);
        isSearching.value = false;
        return;
      }
      const { data } = await useFetch("/api/products-search", {
        method: "POST",
        body: { query },
      });
      searchResults.value = (data.value as Product[])?.slice(0, 20) || [];
    } catch (error) {
      console.error("Search error:", error);
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }
  /**
   * Search locally in already loaded products
   */
  function searchLocalProducts(
    productsToSearch: Product[],
    query: string
  ): Product[] {
    if (!query || !productsToSearch?.length) return [];
    const lowerQuery = query.toLowerCase();
    const matchingIds = searchIndex.value
      .filter(
        (item) =>
          item.name.includes(lowerQuery) ||
          item.sku.includes(lowerQuery) ||
          item.categoryNames.some((cat) => cat.includes(lowerQuery))
      )
      .map((item) => item.id);
    return productsToSearch
      .filter((product) => matchingIds.includes(product.id))
      .slice(0, 20);
  }

  /**
   * Navigate to the search results page
   */
  function navigateToSearchResults(): void {
    if (!searchQuery.value) return;

    // If we are on a category page, preserve the category context
    if (route.name === "product-category-slug") {
      const categorySlug = route.params.slug as string;
      router.push({
        path: `/product-category/${categorySlug}`,
        query: { ...route.query, search: searchQuery.value },
      });
    } else {
      // Otherwise go to the main products page
      router.push({
        path: "/products",
        query: { search: searchQuery.value },
      });
    }

    // Hide the search UI after navigation
    isShowingSearch.value = false;
  }

  return {
    searchQuery,
    searchResults,
    isSearching,
    isShowingSearch,
    isSearchActive,
    getSearchQuery,
    setSearchQuery,
    clearSearchQuery,
    performSearch,
    navigateToSearchResults,
    toggleSearch,
    limitedSearchResults,
  };
}
