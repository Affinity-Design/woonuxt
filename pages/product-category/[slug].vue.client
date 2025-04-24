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
const slug = Array.isArray(route.params.slug)
  ? route.params.slug[0]
  : route.params.slug;
// Create cache key based on the slug
const cacheKey = `cat-${slug}`;
const nuxtApp = useNuxtApp();

console.log(`🔑 Using cache key: ${cacheKey}`);

// ----------------------------------------
// CRITICAL FIX: Use state to manage cached data
// ----------------------------------------
// Create products data state that persists between route changes
const globalCachedProducts = useState(cacheKey, () => null);
// Loading state that we control manually
const isLoading = ref(true);
const errorState = ref(null);
// ----------------------------------------

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
const productCount = ref(150);

// Get product count first
const countResult = await useAsyncGql("getProductsTotal", { slug });
if (process.client) {
  productCount.value = countResult.data.value?.products?.found || 150;
}

// Store for the processed products data
const productsInCategory = ref([]);

// Function to load products (either from cache or API)
async function loadProducts() {
  try {
    isLoading.value = true;
    errorState.value = null;

    // Check if we already have data in our global state
    console.log(`🔍 Checking global state cache for ${cacheKey}`);
    if (globalCachedProducts.value) {
      console.log(`✅ Found cached data in global state for ${cacheKey}`);
      productsInCategory.value =
        globalCachedProducts.value.products?.nodes || [];
      setProducts(productsInCategory.value);
      isLoading.value = false;
      return;
    }

    console.log(`🔄 No cache found, fetching products for ${slug}`);
    // Use the Gql function directly
    const result = await GqlGetProducts({
      slug,
      first: slug === "clearance-items" ? 255 : productCount.value,
    });

    // Store in our global state cache
    if (result && result.products?.nodes) {
      console.log(
        `💾 Saving ${result.products.nodes.length} products to global state`
      );
      globalCachedProducts.value = result;
      productsInCategory.value = result.products.nodes;
      setProducts(productsInCategory.value);
    } else {
      productsInCategory.value = [];
    }
  } catch (err) {
    console.error("Error loading products:", err);
    errorState.value = err.message || "Failed to load products";
    productsInCategory.value = [];
  } finally {
    isLoading.value = false;
  }
}

// When the component mounts
onMounted(async () => {
  // Load products (from cache or API)
  await loadProducts();

  // Update filters if needed
  if (!isQueryEmpty.value) {
    updateProductList();
  }

  isDesktop.value = window.innerWidth >= 768;
  window.addEventListener("resize", handleResize);
});

function handleResize() {
  isDesktop.value = window.innerWidth >= 768;
}

// Update the product list when query params change
watch(
  () => route.query,
  () => {
    if (route.name !== "product-category-slug") return;
    updateProductList();
  }
);

// Clean up
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

useHead({
  title: categoryTitle.value,
  meta: [
    {
      hid: "description",
      name: "description",
      content: `Browse our ${categoryTitle.value} collection`,
    },
  ],
});

// Function to refresh data
async function refreshData() {
  // Clear the cached data
  globalCachedProducts.value = null;
  // Reload
  await loadProducts();
}
</script>

<template>
  <div>
    <!-- Show loading state -->
    <div
      v-if="isLoading"
      class="container flex items-center justify-center min-h-screen"
    >
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading product...</p>
      </div>
    </div>

    <!-- Show error state -->
    <div v-else-if="errorState" class="container my-12 text-center">
      <div class="text-red-500 mb-4">{{ errorState }}</div>
      <button
        @click="refreshData"
        class="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-primary-dark"
      >
        Try Again
      </button>
    </div>

    <!-- Show data when it's ready -->
    <div v-else class="container py-8">
      <!-- Filters and Products Layout -->
      <div class="container flex items-start gap-16">
        <!-- Filters sidebar - fixed width -->
        <div
          v-if="storeSettings.showFilters === true"
          class="w-full md:w-64 flex-shrink-0"
        >
          <Filters :hide-categories="true" />
        </div>

        <!-- Product area - flex 1 -->
        <div class="flex-1">
          <!-- Product header with title and sorting -->
          <div
            class="flex flex-col md:flex-row md:items-center md:justify-between mb-6"
          >
            <div class="flex items-baseline gap-4">
              <h1
                class="text-3xl font-bold text-gray-900 font-system tracking-tight"
              >
                {{ categoryTitle }}
              </h1>
              <ProductResultCount v-if="productsInCategory.length > 0" />
            </div>

            <div class="flex items-center gap-3 mt-4 md:mt-0">
              <OrderByDropdown
                v-if="storeSettings.showOrderByDropdown === true"
                class="ml-auto md:ml-0"
              />
              <ShowFilterTrigger
                v-if="storeSettings.showFilters && !isDesktop"
                class="md:hidden"
              />
            </div>
          </div>

          <!-- Product grid -->
          <ProductGrid
            v-if="productsInCategory.length > 0"
            :count="productCount"
            :slug="slug"
          />

          <!-- No products message -->
          <div v-else class="text-center py-12">
            <p>No products found in this category.</p>
          </div>
        </div>
      </div>
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
