<script setup>
import { ref, watch, computed } from "vue";
import { useDebounceFn, onClickOutside } from "@vueuse/core";
import { useSearch } from "~/composables/useSearch";

const componentName = "SearchComponent";
const router = useRouter();
const { t } = useI18n(); // Import t function for translations

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

// Format price:
// 1. Handle comma-separated prices (take the first one).
// 2. Remove &nbsp;.
// 3. (Future step: Add currency symbol like '$')
const formatPrice = (priceString) => {
  if (!priceString) return ""; // Return empty if no price string

  let priceToFormat = String(priceString); // Ensure it's a string

  // If the price string contains commas, it might be a list (e.g., "9.97, 9.97")
  // We'll take the first price in such cases.
  if (priceToFormat.includes(",")) {
    priceToFormat = priceToFormat.split(",")[0];
  }

  // Remove &nbsp; and trim
  priceToFormat = priceToFormat.replace(/&nbsp;/g, " ").trim();

  // Prepend '$' if it's not already there and it looks like a simple price number
  // This is a basic check; more robust currency formatting might be needed for complex cases or i18n.
  const numericPart = priceToFormat.replace(/[^0-9.-]+/g, ""); // Attempt to extract numeric part

  if (priceToFormat.startsWith("$")) {
    // Already has a dollar sign (e.g., if data source provides it)
    return priceToFormat;
  } else if (
    numericPart &&
    !isNaN(parseFloat(numericPart)) &&
    priceToFormat === numericPart
  ) {
    // If the cleaned priceToFormat is purely numeric, prepend '$'
    return `$${priceToFormat}`;
  }
  // If it's not a simple numeric string after cleaning (e.g., "From ...", or contains other text),
  // return it as is, as prepending '$' might be incorrect.
  // Your more sophisticated priceConverter.ts would handle these cases better for site-wide consistency.
  return priceToFormat;
};

// Handle product click
const navigateToProduct = (slug) => {
  console.log(`[${componentName}] Navigating to product:`, slug);
  router.push(`/product/${slug}`);
  if (isShowingSearch.value) {
    console.log(`[${componentName}] Closing search panel after navigation.`);
    toggleSearch();
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
    toggleSearch();
  }
};

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

const handleFocus = () => {
  console.log(
    `[${componentName}] handleFocus called. Current isShowingSearch:`,
    isShowingSearch.value
  );
  if (!isShowingSearch.value) {
    console.log(
      `[${componentName}] handleFocus: Search not visible. Calling toggleSearch().`
    );
    toggleSearch();
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
  if (isShowingSearch.value) {
    console.log(
      `[${componentName}] onClickOutside detected. Closing search panel.`
    );
    toggleSearch();
  }
});

const shouldShowResultsDropdown = computed(() => {
  if (!isShowingSearch.value) return false;
  if (isLoading.value) return true;
  if (localInputValue.value && hasResults.value) return true;
  if (localInputValue.value && !isLoading.value && !hasResults.value)
    return true;
  return false;
});

const showNoResultsMessage = computed(() => {
  return (
    isShowingSearch.value &&
    localInputValue.value &&
    !isLoading.value &&
    !hasResults.value
  );
});

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
        :placeholder="t('messages.shop.searchProducts', 'Search products...')"
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
        class="absolute z-30 mt-[50px] w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-96 overflow-y-auto"
      >
        <div v-if="isLoading" class="p-4 text-center text-gray-500">
          <Icon name="ion:reload" size="24" class="animate-spin" />
          <p>{{ t("messages.shop.loading", "Loading results...") }}</p>
        </div>

        <div v-else-if="hasResults">
          <div class="p-2 text-xs text-gray-500 border-b">
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
