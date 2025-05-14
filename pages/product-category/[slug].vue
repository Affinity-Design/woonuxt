<script lang="ts" setup>
import {
  defineAsyncComponent,
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
} from "vue"; // Added ref, computed, watch, onMounted, onUnmounted
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
  : (route.params.slug as string); // Added type assertion for clarity

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
  title = title.replace(/pa /g, ""); // Consider if "pa " removal is always desired or specific
  title = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return title;
};

const isDesktop = ref(false);
const categoryTitle = computed(() => formatSlug(slug));

// Get product count first
// Using a default value if countResult.data.value or products or found is undefined
const countResult = await useAsyncGql("getProductsTotal", { slug });
const getCount =
  slug === "clearance-items"
    ? 255
    : countResult.data.value?.products?.found || 150; // Default to 150 if not found
const productCount = ref(getCount);

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
    watch: [], // Don't watch reactive dependencies for re-running the asyncData fetcher

    // Transform data for our needs
    transform: (result: any) => {
      // Added type for result
      return result; // Return as-is, but you could transform here if needed
    },

    // CRITICAL: Check for cached data explicitly
    getCachedData: (key: string) => {
      // Added type for key
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

// Set products when data becomes available from useAsyncData
watch(
  () => productsInCategory.value,
  (products) => {
    if (products && products.length > 0) {
      console.log(
        `📦 Setting ${products.length} products for display from initial fetch`
      );
      setProducts(products); // This sets the base list of products for the category
    }
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------
// MODIFICATION: Comment out or remove the watcher for route.query
// This watcher was responsible for reactively updating the product list
// based on changes in query parameters (e.g., search terms).
// ---------------------------------------------------------------------------
/*
watch(
  () => route.query,
  () => {
    // Guard to ensure this only runs on the category page, though now it's commented out
    if (route.name !== "product-category-slug") return;

    console.log('[Category Page] route.query changed, previously would call updateProductList. Now inactive.');
    // updateProductList(); // THIS LINE IS NOW COMMENTED OUT
                         // updateProductList() from useProducts() is what would typically
                         // read the query parameters (including search) and filter/sort
                         // the product list displayed in the UI.
  }
);
*/
// ---------------------------------------------------------------------------

// When the component mounts
onMounted(() => {
  // The following line might still apply initial filters/sorting if query params are present on load.
  // However, it will not reactively update to new search terms after the page has loaded
  // because the watcher above is disabled.
  if (!isQueryEmpty.value) {
    // isQueryEmpty likely checks for any query params
    console.log(
      "[Category Page] onMounted: Query is not empty, calling updateProductList for initial filters/sort."
    );
    updateProductList(); // This will apply filters/sorting based on URL params at load time.
    // If search terms are part of these initial params, they might be applied once.
  } else {
    console.log(
      "[Category Page] onMounted: Query is empty, no initial updateProductList call based on query."
    );
  }

  // Check viewport for desktop state
  isDesktop.value = window.innerWidth >= 768;
  window.addEventListener("resize", handleResize);

  // Log cache status for debugging
  console.log(
    `[Category Page] Mount: Cache status: ${pending.value ? "pending" : error.value ? "error" : "ready"}`
  );
  console.log(
    `[Category Page] Mount: Found ${productsInCategory.value.length} products initially.`
  );
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
    <div v-if="pending" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading products...</p>
      </div>
    </div>

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

    <div
      v-else-if="productsInCategory.length > 0"
      class="container py-4 md:py-8"
    >
      <div class="flex flex-col md:flex-row items-start md:gap-8">
        <div
          v-if="storeSettings.showFilters === true"
          class="w-full md:w-64 flex-shrink-0 md:mr-8"
        >
          <Filters :hide-categories="true" />
        </div>

        <div class="flex-1 w-full">
          <div class="flex flex-row items-center justify-between">
            <h1
              class="text-2xl md:text-3xl font-bold text-gray-900 font-system tracking-tight"
            >
              {{ categoryTitle }}
            </h1>

            <div class="flex items-center ml-auto">
              <OrderByDropdown
                vif="storeSettings.showOrderByDropdown === true"
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

          <ProductGrid :count="productCount" :slug="slug" />
        </div>
      </div>
    </div>

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
    font-size: 1.5rem; /* 24px */
    line-height: 2rem; /* 32px */
  }
}
</style>
