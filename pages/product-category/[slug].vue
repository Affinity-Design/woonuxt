<script setup lang="ts">
const { setProducts, updateProductList } = useProducts();
const { isQueryEmpty } = useHelpers();
const { storeSettings } = useAppConfig();
const route = useRoute();
const slug = route.params.slug;

// Add loading state to handle async data
const isLoading = ref(true);
const productsInCategory = ref([]);
const fetchError = ref(false);

// Create a composable function to fetch products
const fetchProducts = async () => {
  isLoading.value = true;
  fetchError.value = false;

  try {
    const { data } = await useAsyncGql("getProducts", { slug });

    if (data.value?.products?.nodes) {
      productsInCategory.value = data.value.products.nodes as Product[];
      // Update the product store
      setProducts(productsInCategory.value);
    } else {
      productsInCategory.value = [];
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    fetchError.value = true;
  } finally {
    isLoading.value = false;
  }
};

// Use server prefetch for SSR caching
if (process.server) {
  await fetchProducts();
}

onMounted(async () => {
  // If using client-side navigation or if we need to refetch
  if (process.client) {
    if (productsInCategory.value.length === 0) {
      await fetchProducts();
    }
  }

  if (!isQueryEmpty.value) updateProductList();
});

// Watch for route changes to update product list
watch(
  () => route.query,
  () => {
    if (route.name !== "product-category-slug") return;
    updateProductList();
  }
);

// Watch for slug changes to refetch products
watch(
  () => route.params.slug,
  async (newSlug, oldSlug) => {
    if (newSlug !== oldSlug) {
      await fetchProducts();
    }
  }
);

// Add retry functionality
const retryFetch = async () => {
  await fetchProducts();
};

useHead({
  title: `Product Category: ${slug}`,
  meta: [
    {
      hid: "description",
      name: "description",
      content: `Browse ${slug} products`,
    },
  ],
});
</script>

<template>
  <div>
    <!-- Show loading indicator while data is being fetched -->
    <div v-if="isLoading" class="container py-12 text-center">
      <p>Loading products...</p>
    </div>

    <!-- Check if productsInCategory exists AND has items -->
    <div
      class="container flex items-start gap-16"
      v-else-if="productsInCategory && productsInCategory.length > 0"
    >
      <Filters v-if="storeSettings.showFilters" :hide-categories="true" />

      <div class="w-full">
        <div
          class="flex items-center justify-between w-full gap-4 mt-8 md:gap-8"
        >
          <ProductResultCount />
          <OrderByDropdown
            class="hidden md:inline-flex"
            v-if="storeSettings.showOrderByDropdown"
          />
          <ShowFilterTrigger
            v-if="storeSettings.showFilters"
            class="md:hidden"
          />
        </div>
        <ProductGrid />
      </div>
    </div>

    <!-- Error state with retry option -->
    <div v-else-if="fetchError" class="container py-12 text-center">
      <p>There was an error loading the products.</p>
      <button
        @click="retryFetch"
        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Retry
      </button>
    </div>

    <!-- No products found state -->
    <NoProductsFound v-else>
      Could not find products in this category.
      <button @click="retryFetch" class="mt-4 text-blue-500 underline">
        Refresh
      </button>
    </NoProductsFound>
  </div>
</template>
