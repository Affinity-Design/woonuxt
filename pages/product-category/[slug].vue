<script setup lang="ts">
const route = useRoute();
const slug = route.params.slug;
const { storeSettings } = useAppConfig();

// Separate static data fetching from filter-based updates
const {
  data: categoryData,
  pending,
  error,
} = await useAsyncData(
  `category-${slug}`, // Key based only on slug, not query parameters
  async () => {
    try {
      const { data } = await useAsyncGql("getProducts", { slug });
      return {
        products: data.value?.products?.nodes || [],
        categoryName: slug.toString().replace(/-/g, " "),
      };
    } catch (err) {
      console.error("Error fetching category data:", err);
      return { products: [], categoryName: slug.toString().replace(/-/g, " ") };
    }
  },
  {
    server: true,
    cache: true,
    watch: [() => route.params.slug], // Only refetch when slug changes, not queries
  }
);

// Initialize products store after data is loaded
const { setProducts, updateProductList } = useProducts();
const { isQueryEmpty } = useHelpers();

// Wait until we have data before updating the products store
watchEffect(() => {
  if (categoryData.value?.products?.length) {
    setProducts(categoryData.value.products);

    // Only apply filters if query parameters exist
    if (!isQueryEmpty.value) {
      // Use nextTick to ensure DOM is updated first
      nextTick(() => {
        updateProductList();
      });
    }
  }
});

// Handle retry functionality
const retryFetch = () => {
  refreshNuxtData(`category-${slug}`);
};

// Set page metadata
useHead({
  title: `${categoryData.value?.categoryName || slug} - Products`,
  meta: [
    {
      name: "description",
      content: `Browse our selection of ${categoryData.value?.categoryName || slug} products.`,
    },
  ],
});
</script>

<template>
  <div>
    <ClientOnly>
      <div v-if="pending" class="container py-12 text-center">
        <p>Loading products...</p>
      </div>
    </ClientOnly>

    <!-- Check if products exist and have items -->
    <div
      class="container flex items-start gap-16"
      v-if="categoryData?.products?.length > 0"
    >
      <ClientOnly>
        <Filters v-if="storeSettings.showFilters" :hide-categories="true" />
      </ClientOnly>

      <div class="w-full">
        <div
          class="flex items-center justify-between w-full gap-4 mt-8 md:gap-8"
        >
          <ClientOnly>
            <ProductResultCount />
            <OrderByDropdown
              class="hidden md:inline-flex"
              v-if="storeSettings.showOrderByDropdown"
            />
            <ShowFilterTrigger
              v-if="storeSettings.showFilters"
              class="md:hidden"
            />
          </ClientOnly>
        </div>

        <!-- ProductGrid wrapped in ClientOnly to prevent hydration mismatches -->
        <ClientOnly>
          <ProductGrid />
          <template #fallback>
            <!-- Static fallback for initial render -->
            <div
              class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 my-8"
            >
              <div
                v-for="i in 8"
                :key="i"
                class="bg-gray-100 rounded-lg h-80 animate-pulse"
              ></div>
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- Error state with retry option -->
    <div v-else-if="error" class="container py-12 text-center">
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
