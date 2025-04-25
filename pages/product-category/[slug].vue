<script lang="ts" setup>
import { defineAsyncComponent } from "vue";
const PulseLoader = defineAsyncComponent(
  () => import("vue-spinner/src/PulseLoader.vue")
);

// Core composables
const { setProducts, updateProductList } = useProducts();
const { isQueryEmpty } = useHelpers();
const { storeSettings } = useAppConfig();
const route = useRoute();
const nuxtApp = useNuxtApp();

// Ensure slug is a string
const slug = Array.isArray(route.params.slug)
  ? route.params.slug[0]
  : route.params.slug;

// Create a consistent cache key for this request
const cacheKey = `category-${slug}`;

/**
 * Formats a slug string to a readable title
 */
const formatSlug = (slugValue: string | string[]): string => {
  if (!slugValue) return "";
  if (Array.isArray(slugValue)) {
    slugValue = slugValue.join("-");
  }
  let title = slugValue.toString().replace(/-/g, " ");
  title = title.replace(/pa /g, "");
  title = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return title;
};

const isDesktop = ref(false);
const categoryTitle = computed(() => formatSlug(slug));

// Get product count first
const countResult = await useAsyncGql("getProductsTotal", { slug });
const productCount = ref(countResult.data.value?.products?.found || 150);

// Use Nuxt's useAsyncData with proper caching options
const { data, pending, error, refresh } = await useAsyncData(
  cacheKey,
  async () => {
    console.log(`🔄 Fetching products for category: ${slug}`);

    // Use GqlGetProducts directly for the data fetch
    const result = await GqlGetProducts({
      slug,
      first: slug === "clearance-items" ? 255 : productCount.value,
    });

    console.log(
      `✅ Fetched ${result?.products?.nodes?.length || 0} products for ${slug}`
    );
    return result;
  },
  {
    // Caching options per Nuxt docs
    server: true, // Enable server-side caching
    lazy: false, // Start fetching immediately
    immediate: true, // Don't wait for onMounted
    watch: [], // Don't watch reactive dependencies

    // Transform data for our needs
    transform: (result) => {
      return result; // Return as-is, but you could transform here if needed
    },

    // CRITICAL: Check for cached data explicitly
    getCachedData: (key) => {
      console.log(`🔍 Checking for cached data with key: ${key}`);

      // Check in payload first (client-side navigation)
      const payloadData = nuxtApp.payload?.data?.[key];
      if (payloadData) {
        console.log(`💰 Found cached data in payload for ${key}`);
        return payloadData;
      }

      // Check in static data (if using SSG/prerendering)
      const staticData = nuxtApp.static?.data?.[key];
      if (staticData) {
        console.log(`📘 Found cached data in static data for ${key}`);
        return staticData;
      }

      console.log(`❌ No cached data found for ${key}`);
      return undefined;
    },
  }
);

// Products storage for UI
const productsInCategory = computed(() => data.value?.products?.nodes || []);

// Set products when data becomes available
watch(
  () => productsInCategory.value,
  (products) => {
    if (products && products.length > 0) {
      console.log(`📦 Setting ${products.length} products for display`);
      setProducts(products);
    }
  },
  { immediate: true }
);

// Update the product list when query params change
watch(
  () => route.query,
  () => {
    if (route.name !== "product-category-slug") return;
    updateProductList();
  }
);

// When the component mounts
onMounted(() => {
  if (!isQueryEmpty.value) updateProductList();

  // Check viewport for desktop state
  isDesktop.value = window.innerWidth >= 768;
  window.addEventListener("resize", handleResize);

  // Log cache status for debugging
  console.log(
    `🔍 Cache status: ${pending.value ? "pending" : error.value ? "error" : "ready"}`
  );
  console.log(`📊 Found ${productsInCategory.value.length} products`);
});

function handleResize() {
  isDesktop.value = window.innerWidth >= 768;
}

// Clean up
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

// Set page metadata
useHead({
  title: categoryTitle.value,
  meta: [
    {
      name: "description",
      content: `Browse our ${categoryTitle.value} collection`,
    },
  ],
});
</script>

<template>
  <div>
    <!-- Show loading state with full-page height and centered spinner -->
    <div v-if="pending" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading products...</p>
      </div>
    </div>

    <!-- Show error state -->
    <div v-else-if="error" class="container my-12 text-center">
      <div class="text-red-500 mb-4">
        {{ error.message || "Failed to load products" }}
      </div>
      <button
        @click="refresh"
        class="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-primary-dark"
      >
        Try Again
      </button>
    </div>

    <!-- Show data when it's ready -->
    <div
      v-else-if="productsInCategory.length > 0"
      class="container py-4 md:py-8"
    >
      <!-- Filters and Products Layout -->
      <div class="flex flex-col md:flex-row items-start md:gap-8">
        <!-- Filters sidebar - fixed width -->
        <div
          v-if="storeSettings.showFilters === true"
          class="w-full md:w-64 flex-shrink-0 md:mr-8"
        >
          <Filters :hide-categories="true" />
        </div>

        <!-- Product area - flex 1 -->
        <div class="flex-1 w-full">
          <!-- Product header with title and sorting -->
          <div class="flex flex-row items-center justify-between">
            <h1
              class="text-2xl md:text-3xl font-bold text-gray-900 font-system tracking-tight"
            >
              {{ categoryTitle }}
            </h1>

            <div class="flex items-center ml-auto">
              <OrderByDropdown
                v-if="storeSettings.showOrderByDropdown === true"
                class="ml-auto"
              />
              <ShowFilterTrigger
                v-if="storeSettings.showFilters && !isDesktop"
                class="md:hidden ml-2"
              />
            </div>
          </div>

          <div class="flex items-center mt-1 mb-4">
            <ProductResultCount />
          </div>

          <!-- Product grid -->
          <ProductGrid :count="productCount" :slug="slug" />
        </div>
      </div>
    </div>

    <!-- No products message -->
    <div v-else class="container py-8 text-center">
      <p>No products found in this category.</p>
    </div>
  </div>
</template>

<style scoped>
.font-system {
  font-family:
    ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
    "Segoe UI Symbol", "Noto Color Emoji";
}

@media (max-width: 768px) {
  .text-3xl {
    font-size: 1.5rem;
    line-height: 2rem;
  }
}
</style>
