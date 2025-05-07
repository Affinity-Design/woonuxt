<script setup>
import { ref, watch, computed } from "vue";
import { useDebounceFn, onClickOutside } from "@vueuse/core";
import { useSearch } from "~/composables/useSearch"; // Assuming this path is correct

// Composables
const componentName = "SearchComponent";
const router = useRouter();
const { t } = useI18n();

// Search composable state and functions
const {
  searchQuery,
  searchResults,
  isLoading,
  isShowingSearch,
  setSearchQuery,
  clearSearch,
  toggleSearch,
  hasResults,
} = useSearch();

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

// Navigation handler for product selection
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

  // If there's input and search is not active, show search
  if (value && !isShowingSearch.value) {
    console.log(
      `[${componentName}] onInputChange: Input has value and search not active. Calling toggleSearch().`
    );
    toggleSearch(); // Shows the dropdown
  }
};

// Handler to clear search input and results
const handleClear = () => {
  console.log(`[${componentName}] handleClear called.`);
  localInputValue.value = "";
  clearSearch(); // Clears query and results in composable

  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] handleClear: Search was visible. Calling toggleSearch() to close.`
    );
    toggleSearch(); // Hides the dropdown
  }
  searchInputDOM.value?.focus(); // Re-focus the input
};

// Handler for input focus
const handleFocus = () => {
  console.log(
    `[${componentName}] handleFocus called. Current isShowingSearch:`,
    isShowingSearch.value
  );
  // If search is not visible, show it
  if (!isShowingSearch.value) {
    console.log(
      `[${componentName}] handleFocus: Search not visible. Calling toggleSearch().`
    );
    toggleSearch(); // Shows the dropdown
  }
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
// Close search dropdown when clicking outside the search component
onClickOutside(searchWrapper, (event) => {
  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] onClickOutside detected. Closing search panel.`
    );
    toggleSearch(); // Hides the dropdown
  }
});

// Computed property to determine if the results dropdown should be shown
const shouldShowResultsDropdown = computed(() => {
  if (!isShowingSearch.value) return false;
  if (isLoading.value) return true;
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

// Watcher for debugging or reacting to search visibility changes
watch(isShowingSearch, (newValue) => {
  console.log(
    `[${componentName}] Watcher: isShowingSearch (composable) changed to:`,
    newValue
  );
});
</script>

<template>
  <div ref="searchWrapper" class="relative w-full">
    <div class="relative flex items-center">
      <Icon
        name="ion:search-outline"
        size="20"
        class="absolute left-3 z-10 text-gray-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref="searchInputDOM"
        v-model="localInputValue"
        type="text"
        :placeholder="t('messages.shop.searchProducts', 'Search products...')"
        class="search-bar-input w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
        @input="onInputChange"
        @focus="handleFocus"
        aria-label="Search products"
        role="searchbox"
        :aria-expanded="shouldShowResultsDropdown"
        aria-controls="search-results-dropdown"
      />
      <button
        v-if="localInputValue"
        type="button"
        aria-label="Clear search query"
        class="absolute right-3 z-10 text-gray-400 hover:text-gray-600"
        @click="handleClear"
      >
        <Icon name="ion:close-circle" size="20" aria-hidden="true" />
      </button>
    </div>

    <Transition name="fade">
      <div
        v-if="shouldShowResultsDropdown"
        id="search-results-dropdown"
        class="absolute z-30 mt-[50px] w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-96 overflow-y-auto"
        role="listbox"
        aria-labelledby="search-results-info"
      >
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
          <div
            id="search-results-info"
            class="p-2 text-xs text-gray-500 border-b"
            aria-live="polite"
          >
            {{
              t(
                "messages.shop.resultsFound",
                { count: searchResults.length },
                searchResults.length + " results found"
              )
            }}
          </div>
          <ul>
            <li
              v-for="product in searchResults"
              :key="product.databaseId"
              class="border-b last:border-0"
              role="option"
            >
              <div
                class="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                @click="navigateToProduct(product.slug)"
                @keydown.enter="navigateToProduct(product.slug)"
                tabindex="0"
              >
                <div class="flex-1">
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
                <div class="ml-2">
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
        <div
          v-else-if="showNoResultsMessage"
          class="p-4 text-center text-gray-500"
          aria-live="polite"
        >
          <p>
            {{
              t(
                "messages.shop.noResults",
                "No products found matching your query."
              )
            }}
          </p>
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
}

/* Styles for the dropdown transition */
.fade-enter-active {
  /* For when the dropdown appears */
  transition: opacity 0.2s ease;
}
.fade-leave-active {
  /* For when the dropdown disappears */
  /* MODIFICATION: Removed transition for opacity on leave. */
  /* transition: opacity 0.2s ease; */ /* Original line */
}

.fade-enter-from {
  /* Start state for appearing (dropdown is transparent) */
  opacity: 0;
}
.fade-leave-to {
  /* End state for disappearing (dropdown is transparent) */
  /* MODIFICATION: Removed opacity: 0 on leave. */
  /* opacity: 0; */ /* Original line */
}

/* NEW STYLE: Attempt to force the search input to be opaque when focused.
   This is a workaround for an issue where the input bar itself might be fading
   on mobile due to external CSS or JavaScript.
   The root cause should ideally be found in global styles or the useSearch composable.
*/
.search-bar-input:focus {
  opacity: 1 !important;
  /* If it's still slowly fading TO opacity 1, the transition itself needs to be disabled: */
  /* transition: opacity 0s linear !important; */
}
</style>
