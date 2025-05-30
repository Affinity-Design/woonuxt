<script lang="ts" setup>
import {
  defineAsyncComponent,
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
} from "vue";
const PulseLoader = defineAsyncComponent(
  () => import("vue-spinner/src/PulseLoader.vue")
);

// Core composables
const { setProducts, updateProductList } = useProducts();
const { isQueryEmpty } = useHelpers();
const { storeSettings } = useAppConfig();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// Search-specific composables - now using more of its functionality
const {
  searchQuery,
  searchResults,
  isLoading: searchIsLoading,
  performFullPageSearch,
  initializeSearchEngine,
} = useSearch();

// Get the search query from URL - we have a parameter inconsistency to fix
// useSearch uses 'search' parameter while this page uses 'q'
const searchTerm = ref(route.query.q || route.query.search || "");

// Set page title based on search query
const pageTitle = computed(() => {
  return searchTerm.value
    ? t(
        "messages.shop.searchResults",
        { term: searchTerm.value },
        `Search results for "${searchTerm.value}"`
      )
    : t("messages.shop.search", "Search");
});

const isDesktop = ref(false);
const productCount = ref(0);
const pending = ref(true);
const error = ref(null);

// Reference to product data
const productsInCategory = ref([]);

// Updated: Function to fetch search results using the enhanced useSearch composable
const fetchSearchResults = async () => {
  // Check if there's no search term, and handle it properly
  if (!searchTerm.value || searchTerm.value.trim() === "") {
    productsInCategory.value = [];
    productCount.value = 0;
    pending.value = false;
    return;
  }

  pending.value = true;
  error.value = null;

  try {
    console.log(`🔍 Searching for products matching: "${searchTerm.value}"`);

    // Use our enhanced search functionality from the composable
    const results = await performFullPageSearch(searchTerm.value);

    console.log(
      `✅ Found ${results.length} products matching "${searchTerm.value}"`
    );

    productsInCategory.value = results;
    productCount.value = results.length;
    setProducts(results);
  } catch (err) {
    console.error("Error searching for products:", err);
    error.value = err;
  } finally {
    pending.value = false;
  }
};

// Watch for changes to the search term (both 'q' and 'search' parameters)
watch(
  [() => route.query.q, () => route.query.search],
  ([newQ, newSearch]) => {
    // Use either parameter, preferring 'q' for backward compatibility
    const newQuery = newQ || newSearch || "";
    // Update the search term
    searchTerm.value = newQuery;
    // Always fetch results (or properly handle empty case)
    fetchSearchResults();
  },
  { immediate: true }
);

// When the component mounts
onMounted(() => {
  // Initialize the search engine
  initializeSearchEngine();

  // Check viewport for desktop state
  isDesktop.value = window.innerWidth >= 768;
  window.addEventListener("resize", handleResize);

  // Apply any initial filters if query params exist
  if (!isQueryEmpty.value) {
    updateProductList();
  }
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
  title: pageTitle,
  meta: [
    {
      name: "description",
      content: searchTerm.value
        ? `Search results for "${searchTerm.value}"`
        : "Search our products",
    },
  ],
});
</script>

<template>
  <div>
    <div v-if="pending" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">
          {{ t("messages.shop.searching", "Searching products...") }}
        </p>
      </div>
    </div>

    <div v-else-if="error" class="container my-12 text-center">
      <div class="text-red-500 mb-4">
        {{
          error.message ||
          t("messages.general.error", "Failed to load search results")
        }}
      </div>
      <button
        @click="fetchSearchResults"
        class="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-primary-dark"
      >
        {{ t("messages.general.tryAgain", "Try Again") }}
      </button>
    </div>

    <!-- Add a specific case for when no search term is provided -->
    <div v-else-if="!searchTerm" class="container my-12 text-center">
      <div class="py-8 text-center text-gray-500">
        {{
          t(
            "messages.shop.noSearchProvided",
            "Please enter a search term to find products."
          )
        }}
        <div class="mt-4">
          <ProductSearch class="max-w-md mx-auto" />
        </div>
        <div class="mt-4">
          <router-link to="/" class="text-primary hover:underline">
            {{ t("messages.shop.backToHome", "Back to home") }}
          </router-link>
        </div>
      </div>
    </div>

    <div v-else class="container py-4 md:py-8">
      <div class="flex flex-col md:flex-row items-start md:gap-8">
        <div
          v-if="storeSettings.showFilters === true"
          class="w-full md:w-64 flex-shrink-0 md:mr-8"
        >
          <Filters :hide-categories="true" :hide-price-slider="true" :hide-ratings="true" />
        </div>

        <div class="flex-1 w-full">
          <div class="flex flex-row items-center justify-between">
            <h1
              class="text-2xl md:text-3xl font-bold text-gray-900 font-system tracking-tight"
            >
              {{ pageTitle }}
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

          <div v-if="productsInCategory.length > 0">
            <ProductGrid />
          </div>
          <div v-else class="py-8 text-center text-gray-500">
            {{
              t(
                "messages.shop.noResults",
                "No products found matching your search."
              )
            }}
            <div class="mt-4">
              <router-link to="/" class="text-primary hover:underline">
                {{ t("messages.shop.backToHome", "Back to home") }}
              </router-link>
            </div>
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
    font-size: 1.5rem; /* 24px */
    line-height: 2rem; /* 32px */
  }
}
</style>
