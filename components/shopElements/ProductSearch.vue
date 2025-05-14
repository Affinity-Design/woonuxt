<script setup>
import { ref, watch, computed, nextTick } from "vue";
import { useDebounceFn, onClickOutside } from "@vueuse/core";
import { useSearch } from "~/composables/useSearch"; // Assuming this path is correct

// Composables
const componentName = "SearchComponent";
const router = useRouter();
const { t } = useI18n();

// Search composable state and functions
const {
  searchQuery,
  searchResults, // This will be an array of product objects
  isLoading,
  isShowingSearch,
  setSearchQuery,
  clearSearch,
  toggleSearch,
  hasResults, // Computed: !!searchResults.value?.length
} = useSearch();

// Added: Flag to prevent click outside from closing the dropdown
const preventAutoClose = ref(true);

// Helper to format price string
const formatPrice = (priceString) => {
  if (!priceString) return "";
  let priceToFormat = String(priceString);
  if (priceToFormat.includes(",")) {
    priceToFormat = priceToFormat.split(",")[0];
  }
  priceToFormat = priceToFormat.replace(/&nbsp;/g, " ").trim();
  const numericPart = priceToFormat.replace(/[^0-9.-]+/g, "");
  if (priceToFormat.startsWith("$")) {
    return priceToFormat;
  } else if (
    numericPart &&
    !isNaN(parseFloat(numericPart)) &&
    priceToFormat === numericPart
  ) {
    return `$${priceToFormat}`;
  }
  return priceToFormat;
};

// Navigation handler for product selection (used by click and now by Enter key)
const navigateToProduct = (slug) => {
  console.log(`[${componentName}] Navigating to product:`, slug);
  router.push(`/product/${slug}`);
  if (isShowingSearch.value) {
    console.log(`[${componentName}] Closing search panel after navigation.`);
    toggleSearch(); // Hides the dropdown
  }
};

// Refs for DOM elements and local state
const searchInputDOM = ref(null);
const localInputValue = ref(searchQuery.value); // Sync local input with composable state

// Add flag to prevent unwanted dismissals after activating search
const isSearchJustOpened = ref(false);
const isInputFocused = ref(false);

// Debounced function to update search query in composable
const debouncedSetSearchQuery = useDebounceFn((value) => {
  console.log(
    `[${componentName}] Debounced: Calling setSearchQuery with:`,
    value
  );
  setSearchQuery(value);
}, 300);

// Handler for input changes
const onInputChange = (e) => {
  const value = e.target.value;
  console.log(`[${componentName}] onInputChange - value:`, value);
  localInputValue.value = value;
  debouncedSetSearchQuery(value);

  if (value && !isShowingSearch.value) {
    console.log(
      `[${componentName}] onInputChange: Input has value and search not active. Calling toggleSearch().`
    );
    toggleSearch();
  }
};

// Handler to clear search input and results
const handleClear = () => {
  console.log(`[${componentName}] handleClear called.`);
  localInputValue.value = "";
  clearSearch();

  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] handleClear: Search was visible. Calling toggleSearch() to close.`
    );
    toggleSearch();
  }
  searchInputDOM.value?.focus();
};

// NEW: Explicit close button handler
const handleClose = () => {
  console.log(`[${componentName}] handleClose called.`);
  if (isShowingSearch.value) {
    toggleSearch();
  }
};

// Handler for input focus
const handleFocus = () => {
  console.log(
    `[${componentName}] handleFocus called. Current isShowingSearch:`,
    isShowingSearch.value
  );
  isInputFocused.value = true;
  if (!isShowingSearch.value) {
    console.log(
      `[${componentName}] handleFocus: Search not visible. Calling toggleSearch().`
    );
    isSearchJustOpened.value = true;
    toggleSearch();
    setTimeout(() => {
      isSearchJustOpened.value = false;
    }, 300);
  }
};

// Handler for input blur
const handleBlur = () => {
  setTimeout(() => {
    isInputFocused.value = false;
  }, 300);
};

// Watcher to sync local input value if composable's searchQuery changes externally
watch(searchQuery, (newComposableQuery) => {
  console.log(
    `[${componentName}] Watcher: searchQuery (composable) changed to:`,
    newComposableQuery
  );
  if (newComposableQuery !== localInputValue.value) {
    localInputValue.value = newComposableQuery;
  }
});

// Ref for the main search wrapper div
const searchWrapper = ref(null);

// Prevent auto-closing when search is activated by search icon click
watch(isShowingSearch, (newValue, oldValue) => {
  console.log(
    `[${componentName}] Watcher: isShowingSearch (composable) changed to:`,
    newValue
  );
  if (newValue && !oldValue) {
    isSearchJustOpened.value = true;
    nextTick(() => {
      if (searchInputDOM.value) {
        searchInputDOM.value.focus();
        setTimeout(() => {
          isSearchJustOpened.value = false;
        }, 500);
      }
    });
  }
});

// MODIFIED: Click outside handler now respects preventAutoClose flag
onClickOutside(searchWrapper, (event) => {
  if (
    !preventAutoClose.value &&
    isShowingSearch.value &&
    !isInputFocused.value &&
    !isSearchJustOpened.value
  ) {
    console.log(
      `[${componentName}] onClickOutside detected. Closing search panel.`
    );
    toggleSearch();
  } else {
    console.log(
      `[${componentName}] onClickOutside detected but ignored due to conditions: preventAutoClose=${preventAutoClose.value}, isShowingSearch=${isShowingSearch.value}, isInputFocused=${isInputFocused.value}, isSearchJustOpened=${isSearchJustOpened.value}`
    );
  }
});

// Computed property to determine if the results dropdown should be shown
const shouldShowResultsDropdown = computed(() => {
  if (!isShowingSearch.value) return false;
  if (isLoading.value) return true; // Show dropdown for loading state
  if (localInputValue.value && hasResults.value) return true;
  if (localInputValue.value && !isLoading.value && !hasResults.value)
    return true; // For "no results" message
  return false;
});

// Computed property to determine if the "no results" message should be shown
const showNoResultsMessage = computed(() => {
  return (
    isShowingSearch.value &&
    localInputValue.value &&
    !isLoading.value &&
    !hasResults.value
  );
});

// ---------------------------------------------------------------------------
// NEW: Handler for Enter key press in the search input
// ---------------------------------------------------------------------------
const handleEnterKeyNavigation = () => {
  console.log(`[${componentName}] handleEnterKeyNavigation called.`);
  // Check if searchResults is available, is an array, and has items
  if (
    hasResults.value &&
    Array.isArray(searchResults.value) &&
    searchResults.value.length > 0
  ) {
    const firstProduct = searchResults.value[0]; // Get the first product
    if (firstProduct && firstProduct.slug) {
      console.log(
        `[${componentName}] Enter key: Navigating to first product:`,
        firstProduct.slug
      );
      navigateToProduct(firstProduct.slug); // Navigate to the product
    } else {
      console.warn(
        `[${componentName}] Enter key: First product found, but slug is missing. Product:`,
        firstProduct
      );
    }
  } else {
    console.log(
      `[${componentName}] Enter key: No search results to navigate to, or searchResults is not as expected. hasResults: ${hasResults.value}, searchResults:`,
      searchResults.value
    );
    // Optionally, you could add behavior here if no results (e.g., show a message or do nothing)
  }
};
// ---------------------------------------------------------------------------
</script>

<template>
  <div ref="searchWrapper" class="relative w-full">
    <div class="relative flex items-center w-full">
      <Icon
        name="ion:search-outline"
        size="20"
        class="absolute z-10 opacity-50 pointer-events-none left-2"
      />
      <input
        ref="searchInputDOM"
        v-model="localInputValue"
        type="text"
        :placeholder="t('messages.shop.searchProducts', 'Search products...')"
        class="z-0 inline-flex items-center w-full p-2 pl-10 text-sm text-gray-500 border border-gray-300 rounded-md shadow-inner outline-none bg-gray-50 shadow-gray-200"
        @input="onInputChange"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown.enter.prevent="handleEnterKeyNavigation"
        aria-label="Search products"
        role="searchbox"
        :aria-expanded="shouldShowResultsDropdown"
        aria-controls="search-results-dropdown"
      />
      <span
        vif="localInputValue"
        class="absolute z-10 flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer bg-primary bg-opacity-10 hover:bg-opacity-20 text-primary right-2"
        @click="handleClear"
      >
        <span>{{ $t("messages.general.clear") }}</span>
        <Icon name="ion:close-outline" size="18" />
      </span>
    </div>

    <Transition name="fade">
      <div
        v-if="shouldShowResultsDropdown"
        id="search-results-dropdown"
        class="absolute z-30 mt-[50px] w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-96 overflow-y-auto"
        role="listbox"
        aria-labelledby="search-results-info"
      >
        <div
          class="flex justify-between items-center p-2 border-b bg-gray-50 sticky top-0 z-10"
        >
          <div
            id="search-results-info"
            class="text-xs text-gray-500"
            aria-live="polite"
          >
            <span v-if="isLoading">
              {{ t("messages.shop.searching", "Searching...") }}
            </span>
            <span v-else-if="hasResults">
              {{
                t(
                  "messages.shop.resultsFound",
                  { count: searchResults.length },
                  searchResults.length + " results found"
                )
              }}
            </span>
            <span v-else-if="localInputValue && !isLoading && !hasResults">
              {{
                t(
                  "messages.shop.noResults",
                  "No products found matching your query."
                )
              }}
            </span>
            <span v-else> {{ t("messages.shop.search", "Search") }} </span>
          </div>
          <button
            type="button"
            aria-label="Close search results"
            class="text-gray-400 hover:text-gray-600 p-1"
            @click="handleClose"
          >
            <Icon name="ion:close" size="16" aria-hidden="true" />
          </button>
        </div>

        <div v-if="isLoading" class="p-4 text-center text-gray-500">
          <Icon
            name="ion:reload"
            size="24"
            class="animate-spin"
            aria-hidden="true"
          />
          <p>{{ t("messages.shop.loading", "Loading results...") }}</p>
        </div>

        <div v-else-if="hasResults">
          <ul>
            <li
              v-for="(product, index) in searchResults"
              :key="product.databaseId || index"
              class="border-b last:border-0"
              role="option"
              :aria-selected="false"
            >
              <div
                class="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                @click="navigateToProduct(product.slug)"
                @keydown.enter="navigateToProduct(product.slug)"
                tabindex="0"
              >
                <div class="flex-1 min-w-0">
                  <p class="font-medium line-clamp-1">{{ product.name }}</p>
                  <p class="text-sm text-gray-500">
                    {{ formatPrice(product.price) }}
                  </p>
                  <div class="text-xs text-gray-400 mt-1 line-clamp-1">
                    <span v-if="product.productCategories?.nodes?.length">
                      {{
                        product.productCategories.nodes
                          .map((cat) => cat.name)
                          .join(", ")
                      }}
                    </span>
                  </div>
                </div>
                <div class="ml-2 flex-shrink-0">
                  <Icon
                    name="ion:chevron-forward"
                    size="16"
                    class="text-gray-400"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis; /* Added for better visual truncation */
}

/* Styles for the dropdown transition */
.fade-enter-active {
  transition: opacity 0.2s ease-out; /* Adjusted timing function */
}
.fade-leave-active {
  transition: opacity 0.2s ease-in; /* Adjusted timing function */
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Ensure the search input is always fully visible */
/* These might not be necessary if opacity is not being manipulated elsewhere */
.search-bar-input {
  opacity: 1 !important;
  transition: none !important;
}

.search-bar-input:focus {
  opacity: 1 !important;
  transition: none !important;
}
</style>
