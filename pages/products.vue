<script setup lang="ts">
const { setProducts, updateProductList } = useProducts();
const route = useRoute();
const { storeSettings } = useAppConfig();
const { isQueryEmpty } = useHelpers();

// Use useAsyncData instead of useAsyncGql for caching
const { data, status } = await useAsyncData(
  "products",
  async () => {
    // Your existing GraphQL query logic
    const { data: queryData } = await useAsyncGql("getProducts");
    return queryData.value?.products?.nodes || [];
  },
  {
    // Add caching options
    lazy: false, // Fetch immediately
    server: true, // Enable server-side rendering
    transform: (data) => data as Product[], // Type transformation
    getCachedData: (key) => {
      const nuxtApp = useNuxtApp();
      return nuxtApp.payload.data[key];
    },
  }
);

const allProducts = computed(() => data.value || []);
setProducts(allProducts.value);

// Optional: Add cache hit indicator for debugging
const isCachedData = computed(() => {
  const nuxtApp = useNuxtApp();
  return !!nuxtApp.payload?.data?.["products"];
});

onMounted(() => {
  if (!isQueryEmpty.value) updateProductList();
});

watch(
  () => route.query,
  () => {
    if (route.name !== "products") return;
    updateProductList();
  }
);

useHead({
  title: `Products`,
  meta: [{ hid: "description", name: "description", content: "Products" }],
});
</script>

<template>
  <div class="container flex items-start gap-16" v-if="allProducts.length">
    <!-- Debug cache status (optional) -->
    <div
      v-if="isCachedData"
      class="fixed top-0 right-0 bg-green-600 text-white p-2 z-50 rounded-bl-lg"
    >
      Cache Hit ✅
    </div>

    <Filters v-if="storeSettings.showFilters" />

    <div class="w-full">
      <div class="flex items-center justify-between w-full gap-4 mt-8 md:gap-8">
        <ProductResultCount />
        <OrderByDropdown
          class="hidden md:inline-flex"
          v-if="storeSettings.showOrderByDropdown"
        />
        <ShowFilterTrigger v-if="storeSettings.showFilters" class="md:hidden" />
      </div>
      <ProductGrid />
    </div>
  </div>
  <NoProductsFound v-else
    >Could not fetch products from your store. Please check your
    configuration.</NoProductsFound
  >
</template>
