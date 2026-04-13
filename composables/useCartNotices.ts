// composables/useCartNotices.ts

interface CartNoticeItem {
  key: string;
  productName: string;
  productSlug: string;
  productDatabaseId: number;
  quantity: number;
}

interface CategoryLookupResult {
  isClearance: boolean;
  categories: Array<{slug: string; name: string}>;
}

export function useCartNotices() {
  const {cart} = useCart();

  // Category data fetched from server
  const categoryData = useState<Record<string, CategoryLookupResult>>('cartNotices-categoryData', () => ({}));
  const isFetchingCategories = useState<boolean>('cartNotices-fetching', () => false);

  // Extract cart item slugs for category lookup
  const cartItemSlugs = computed<string[]>(() => {
    if (!cart.value?.contents?.nodes) return [];
    return cart.value.contents.nodes
      .map((item: any) => item.product?.node?.slug)
      .filter((slug: string | undefined): slug is string => !!slug);
  });

  // Fetch categories when cart items change
  const fetchCategoriesForCart = async () => {
    const slugs = cartItemSlugs.value;
    if (slugs.length === 0) {
      categoryData.value = {};
      return;
    }

    // Skip if we already have data for all current slugs
    const missingSlugs = slugs.filter((s) => !(s in categoryData.value));
    if (missingSlugs.length === 0) return;

    isFetchingCategories.value = true;
    try {
      const result = await $fetch('/api/cart-item-categories', {
        method: 'POST',
        body: {slugs},
      });

      if (result && (result as any).success && (result as any).data) {
        categoryData.value = {...categoryData.value, ...(result as any).data};
      }
    } catch (error) {
      console.error('[useCartNotices] Failed to fetch categories:', error);
    } finally {
      isFetchingCategories.value = false;
    }
  };

  // Watch for cart changes and refresh category data
  watch(cartItemSlugs, fetchCategoriesForCart, {immediate: true});

  // Computed: backorder items (from cart stockStatus field)
  const backorderItems = computed<CartNoticeItem[]>(() => {
    if (!cart.value?.contents?.nodes) return [];
    return cart.value.contents.nodes
      .filter((item: any) => {
        // For variable products, check variation-level stockStatus first
        const variationStatus = item.variation?.node?.stockStatus;
        if (variationStatus) return variationStatus === 'ON_BACKORDER';
        // Fall back to product-level stockStatus (simple products)
        const node = item.product?.node;
        if (!node) return false;
        return node.stockStatus === 'ON_BACKORDER';
      })
      .map((item: any) => ({
        key: item.key,
        productName: item.product?.node?.name || '',
        productSlug: item.product?.node?.slug || '',
        productDatabaseId: item.product?.node?.databaseId || 0,
        quantity: item.quantity || 1,
      }));
  });

  // Computed: clearance items (from category lookup)
  const clearanceItems = computed<CartNoticeItem[]>(() => {
    if (!cart.value?.contents?.nodes) return [];
    return cart.value.contents.nodes
      .filter((item: any) => {
        const slug = item.product?.node?.slug;
        if (!slug) return false;
        return categoryData.value[slug]?.isClearance === true;
      })
      .map((item: any) => ({
        key: item.key,
        productName: item.product?.node?.name || '',
        productSlug: item.product?.node?.slug || '',
        productDatabaseId: item.product?.node?.databaseId || 0,
        quantity: item.quantity || 1,
      }));
  });

  // Convenience booleans
  const hasBackorderItems = computed(() => backorderItems.value.length > 0);
  const hasClearanceItems = computed(() => clearanceItems.value.length > 0);
  const hasAnyNotices = computed(() => hasBackorderItems.value || hasClearanceItems.value);

  return {
    backorderItems,
    clearanceItems,
    hasBackorderItems,
    hasClearanceItems,
    hasAnyNotices,
    isFetchingCategories,
    fetchCategoriesForCart,
  };
}
