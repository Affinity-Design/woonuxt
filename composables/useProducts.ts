let allProducts = [] as Product[];

export function useProducts() {
  // Declare the state variables and the setter functions
  const products = useState<Product[]>('products');

  /**
   * Sets the products state variable and the allProducts variable.
   * @param {Product[]} newProducts - The new products to set.
   */
  function setProducts(newProducts: Product[]): void {
    if (!Array.isArray(newProducts)) throw new Error('Products must be an array.');
    products.value = newProducts ?? [];
    allProducts = JSON.parse(JSON.stringify(newProducts));

    // Debug: Log product terms structure
    if (newProducts.length > 0) {
      console.log(
        '[useProducts] Sample product terms:',
        newProducts[0]?.terms?.nodes?.map((t) => ({taxonomyName: t.taxonomyName, slug: t.slug})),
      );
    }
  }

  const updateProductList = async (): Promise<void> => {
    const {scrollToTop} = useHelpers();
    const {isSortingActive, sortProducts} = useSorting();
    const {isFiltersActive, filterProducts} = useFiltering();
    const {searchQuery, searchResults} = useSearch();

    // Check if search is active based on searchQuery
    const isSearchActive = computed(() => !!searchQuery.value);

    // scroll to top of page
    scrollToTop();

    // return all products if no filters are active
    if (!isFiltersActive.value && !isSearchActive.value && !isSortingActive.value) {
      products.value = allProducts;
      return;
    }

    // IMPORTANT:
    // Do not short-circuit on `searchQuery` here.
    // The full-page search (`/search?q=...`) sets products via `setProducts(results)` and relies on
    // this pipeline to apply sorting & filters reactively.
    // The global header search uses `searchQuery/searchResults`, but that should not bypass sorting.

    // otherwise, apply filter, search and sorting in that order
    try {
      let newProducts = [...allProducts];
      if (isFiltersActive.value) newProducts = filterProducts(newProducts);

      // If the mini-search is active (header search), use its results as the base list,
      // then apply sorting/filters on top so UX stays consistent.
      if (isSearchActive.value && searchResults.value?.length) {
        newProducts = [...(searchResults.value as any)];
        if (isFiltersActive.value) newProducts = filterProducts(newProducts);
      }

      if (isSortingActive.value) newProducts = sortProducts(newProducts);

      products.value = newProducts;
    } catch (error) {
      console.error(error);
    }
  };

  return {products, allProducts, setProducts, updateProductList};
}
