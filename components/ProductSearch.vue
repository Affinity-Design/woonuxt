<script setup>
import { ref, watch, computed } from "vue";
import { useDebounceFn, onClickOutside } from "@vueuse/core";
import { useSearch } from "~/composables/useSearch"; // Assuming this path is correct

// It's good practice to ensure composables like useRouter and useI18n are available.
// If they are globally provided or auto-imported by Nuxt, this is fine.
// Otherwise, they might need explicit import if not already handled by Nuxt's auto-imports.
// import { useRouter } from 'vue-router'; // or 'nuxt/app' for Nuxt 3
// import { useI18n } from 'vue-i18n'; // or relevant Nuxt i18n import

const componentName = "SearchComponent";
const router = useRouter();
const { t } = useI18n();

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

// Format price
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

// Handle product click
const navigateToProduct = (slug) => {
  console.log(`[${componentName}] Navigating to product:`, slug);
  router.push(`/product/${slug}`);
  if (isShowingSearch.value) {
    console.log(`[${componentName}] Closing search panel after navigation.`);
    toggleSearch(); // This will hide the dropdown
  }
};

const searchInputDOM = ref(null);
const localInputValue = ref(searchQuery.value);

const debouncedSetSearchQuery = useDebounceFn((value) => {
  console.log(
    `[${componentName}] Debounced: Calling setSearchQuery with:`,
    value
  );
  setSearchQuery(value);
}, 300);

const onInputChange = (e) => {
  const value = e.target.value;
  console.log(`[${componentName}] onInputChange - value:`, value);
  localInputValue.value = value;
  debouncedSetSearchQuery(value);

  if (value && !isShowingSearch.value) {
    console.log(
      `[${componentName}] onInputChange: Input has value and search not active. Calling toggleSearch().`
    );
    toggleSearch(); // This will show the dropdown
  }
};

const handleClear = () => {
  console.log(`[${componentName}] handleClear called.`);
  localInputValue.value = "";
  clearSearch(); // This should clear results and query

  // If the search dropdown is visible, toggleSearch() will hide it.
  // If it's already hidden, toggleSearch() would show it, which might not be desired here.
  // Consider explicitly setting isShowingSearch to false if that's the intent of useSearch().clearSearch()
  // or if toggleSearch() correctly handles this.
  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] handleClear: Search was visible. Calling toggleSearch() to close.`
    );
    toggleSearch();
  }
  searchInputDOM.value?.focus();
};

const handleFocus = () => {
  console.log(
    `[${componentName}] handleFocus called. Current isShowingSearch:`,
    isShowingSearch.value
  );
  if (!isShowingSearch.value) {
    console.log(
      `[${componentName}] handleFocus: Search not visible. Calling toggleSearch().`
    );
    toggleSearch(); // This will show the dropdown
  }
};

watch(searchQuery, (newComposableQuery) => {
  console.log(
    `[${componentName}] Watcher: searchQuery (composable) changed to:`,
    newComposableQuery
  );
  if (newComposableQuery !== localInputValue.value) {
    localInputValue.value = newComposableQuery;
  }
});

const searchWrapper = ref(null);
onClickOutside(searchWrapper, (event) => {
  // Only close if the search dropdown is currently showing
  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] onClickOutside detected. Closing search panel.`
    );
    toggleSearch(); // This will hide the dropdown
  }
});

const shouldShowResultsDropdown = computed(() => {
  if (!isShowingSearch.value) return false; // If search isn't "active", don't show
  if (isLoading.value) return true; // Show if loading
  if (localInputValue.value && hasResults.value) return true; // Show if input has value and there are results
  // Show "no results" message if input has value, not loading, and no results
  if (localInputValue.value && !isLoading.value && !hasResults.value)
    return true;
  return false; // Otherwise, don't show
});

const showNoResultsMessage = computed(() => {
  return (
    isShowingSearch.value && // Only if search is "active"
    localInputValue.value && // And there's input
    !isLoading.value && // And not loading
    !hasResults.value // And no results
  );
});

watch(isShowingSearch, (newValue) => {
  console.log(
    `[${componentName}] Watcher: isShowingSearch (composable) changed to:`,
    newValue
  );
  // If the search is being hidden, and the input still has focus,
  // you might want to blur the input if the disappearing input field is the issue.
  // However, this is a guess. The core issue is the input field's opacity.
  // if (!newValue && document.activeElement === searchInputDOM.value) {
  //   searchInputDOM.value?.blur();
  // }
});
</script>

<template>
  <div ref="searchWrapper" class="relative w-full">
    <div class="relative flex items-center">
      <Icon
        name="ion:search-outline"
        size="20"
        class="absolute left-3 z-10 text-gray-400 pointer-events-none"
      />
      <input
        ref="searchInputDOM"
        v-model="localInputValue"
        type="text"
        :placeholder="t('messages.shop.searchProducts', 'Search products...')"
        class="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
        @input="onInputChange"
        @focus="handleFocus"
      />
      <button
        v-if="localInputValue"
        type="button"
        aria-label="Clear search query"
        class="absolute right-3 z-10 text-gray-400 hover:text-gray-600"
        @click="handleClear"
      >
        <Icon name="ion:close-circle" size="20" />
      </button>
    </div>

    <Transition name="fade">
      <div
        v-if="shouldShowResultsDropdown"
        class="absolute z-30 mt-[50px] w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-96 overflow-y-auto"
        role="listbox"
      >
        <div v-if="isLoading" class="p-4 text-center text-gray-500">
          <Icon name="ion:reload" size="24" class="animate-spin" />
          <p>{{ t("messages.shop.loading", "Loading results...") }}</p>
        </div>

        <div v-else-if="hasResults">
          <div class="p-2 text-xs text-gray-500 border-b" aria-live="polite">
            {{
              t(
                "messages.shop.resultsFound",
                { count: searchResults.length },
                searchResults.length + " results found"
              )
            }}
          </div>
          <ul aria-labelledby="search-results-info">
            <li
              v-for="product in searchResults"
              :key="product.databaseId"
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
                <div class="flex-1">
                  {/* Removed ml-3 as image placeholder is commented out */}
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
  /* The dropdown will now disappear without an opacity transition. */
}

.fade-enter-from {
  /* Start state for appearing (dropdown is transparent) */
  opacity: 0;
}
.fade-leave-to {
  /* End state for disappearing (dropdown is transparent) */
  /* MODIFICATION: Removed opacity: 0 on leave. */
  /* opacity: 0; */ /* Original line */
  /* The dropdown will no longer become transparent before being removed from the DOM. */
  /* It will disappear abruptly when v-if="shouldShowResultsDropdown" becomes false. */
}
</style>
