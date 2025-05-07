<script setup>
import { ref, watch, computed } from "vue";
import { useDebounceFn, onClickOutside } from "@vueuse/core";
import { useSearch } from "~/composables/useSearch";

const componentName = "SearchComponent"; // For easier log identification
const router = useRouter();

const {
  searchQuery,
  searchResults,
  isLoading,
  isShowingSearch, // This is the key state from the composable
  setSearchQuery,
  clearSearch,
  toggleSearch, // This is the key function to call from the composable
  hasResults,
  // initializeSearchEngine, // Generally not called directly from component anymore
} = useSearch();

// Format price
const formatPrice = (price) => {
  return price ? price.replace(/&nbsp;/g, " ").trim() : "";
};

// Handle product click
const navigateToProduct = (slug) => {
  console.log(`[${componentName}] Navigating to product:`, slug);
  router.push(`/product/${slug}`);
  if (isShowingSearch.value) {
    console.log(`[${componentName}] Closing search panel after navigation.`);
    toggleSearch(); // This will set isShowingSearch to false
  }
};

const searchInputDOM = ref(null);
const localInputValue = ref(searchQuery.value); // Initialize with current searchQuery

// Debounced function to update the composable's searchQuery
const debouncedSetSearchQuery = useDebounceFn((value) => {
  console.log(
    `[${componentName}] Debounced: Calling setSearchQuery with:`,
    value
  );
  setSearchQuery(value);
}, 300);

// Handle input changes from the text field
const onInputChange = (e) => {
  const value = e.target.value;
  console.log(`[${componentName}] onInputChange - value:`, value);
  localInputValue.value = value;
  debouncedSetSearchQuery(value);

  // If user types and the search composable is not yet "active" (isShowingSearch is false),
  // then activate it.
  if (value && !isShowingSearch.value) {
    console.log(
      `[${componentName}] onInputChange: Input has value and search not active. Calling toggleSearch().`
    );
    toggleSearch(); // This should make isShowingSearch true & trigger init in composable
  }
  // If input is cleared and search is active, results will clear via composable's logic.
  // The dropdown visibility is handled by shouldShowResultsDropdown.
};

// Clear search input and hide results
const handleClear = () => {
  console.log(`[${componentName}] handleClear called.`);
  localInputValue.value = "";
  // setSearchQuery(''); // Debounced call will handle this, or call directly if immediate clear needed
  clearSearch(); // Clears composable's query and results, doesn't change isShowingSearch

  // If the search panel was visible, toggle it to close it.
  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] handleClear: Search was visible. Calling toggleSearch() to close.`
    );
    toggleSearch();
  }
  searchInputDOM.value?.focus();
};

// Handle focus on the search input
const handleFocus = () => {
  console.log(
    `[${componentName}] handleFocus called. Current isShowingSearch:`,
    isShowingSearch.value
  );
  // If the search panel is not already showing, toggle it to show.
  // This will call initializeSearchEngine in the composable if it hasn't run yet.
  if (!isShowingSearch.value) {
    console.log(
      `[${componentName}] handleFocus: Search not visible. Calling toggleSearch().`
    );
    toggleSearch();
  }
};

// Watch for external changes to searchQuery (e.g., from URL via composable)
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
  // Only close if isShowingSearch is true
  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] onClickOutside detected. Closing search panel.`
    );
    toggleSearch(); // This will set isShowingSearch.value to false
  }
});

const shouldShowResultsDropdown = computed(() => {
  // console.log(
  //   `[${componentName}] computed shouldShowResultsDropdown: isShowingSearch=${isShowingSearch.value}, isLoading=${isLoading.value}, localInputValue='${localInputValue.value}', hasResults=${hasResults.value}`
  // );
  if (!isShowingSearch.value) return false; // If composable says search is not active, don't show
  if (isLoading.value) return true; // Show for loading
  if (localInputValue.value && hasResults.value) return true; // Show if there's input and results
  // Show "no results" if there's input, not loading, and no results
  if (localInputValue.value && !isLoading.value && !hasResults.value)
    return true;
  return false; // Default to not showing
});

const showNoResultsMessage = computed(() => {
  return (
    isShowingSearch.value &&
    localInputValue.value &&
    !isLoading.value &&
    !hasResults.value
  );
});

// Watch isShowingSearch from the composable for debugging
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
        class="absolute left-3 z-10 text-gray-400"
      />
      <input
        ref="searchInputDOM"
        v-model="localInputValue"
        type="text"
        :placeholder="$t('messages.shop.searchProducts')"
        class="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
        @input="onInputChange"
        @focus="handleFocus"
      />
      <button
        v-if="localInputValue"
        type="button"
        class="absolute right-3 z-10 text-gray-400 hover:text-gray-600"
        @click="handleClear"
      >
        <Icon name="ion:close-circle" size="20" />
      </button>
    </div>

    <Transition name="fade">
      <div
        v-if="shouldShowResultsDropdown"
        class="absolute z-30 mt-1 w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-96 overflow-y-auto"
      >
        <div v-if="isLoading" class="p-4 text-center text-gray-500">
          <Icon name="ion:reload" size="24" class="animate-spin" />
          <p>{{ $t("messages.shop.loading") || "Loading results..." }}</p>
        </div>

        <div v-else-if="hasResults">
          <div class="p-2 text-xs text-gray-500 border-b">
            {{ searchResults.length }}
            {{ $t("messages.shop.resultsFound") || "results found" }}
          </div>
          <ul>
            <li
              v-for="product in searchResults"
              :key="product.databaseId"
              class="border-b last:border-0"
            >
              <div
                class="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                @click="navigateToProduct(product.slug)"
              >
                <div class="flex-1 ml-3">
                  <p class="font-medium line-clamp-1">{{ product.name }}</p>
                  <p class="text-sm text-gray-500">
                    {{ formatPrice(product.price) }}
                  </p>
                  <div class="text-xs text-gray-400 mt-1">
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
                  <Icon name="ion:chevron-forward" size="16" />
                </div>
              </div>
            </li>
          </ul>
        </div>
        <div
          v-else-if="showNoResultsMessage"
          class="p-4 text-center text-gray-500"
        >
          <p>
            {{
              $t("messages.shop.noResults") ||
              "No products found matching your query."
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
