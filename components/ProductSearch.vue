<script setup>
import { ref, watch } from "vue";
import { useDebounceFn, onClickOutside } from "@vueuse/core";
import { useSearch } from "~/composables/useSearch";

const router = useRouter();

const {
  searchQuery,
  searchResults,
  isLoading,
  setSearchQuery,
  clearSearch,
  hasResults,
} = useSearch();

// Format price to remove &nbsp;
const formatPrice = (price) => {
  return price ? price.replace(/&nbsp;/g, " ").trim() : "";
};

// Handle product click
const navigateToProduct = (slug) => {
  router.push(`/product/${slug}`);
  showResults.value = false;
};

// Local refs for input handling
const inputValue = ref(searchQuery.value || "");
const showResults = ref(false);
const searchInput = ref(null);

// Update searchQuery when input changes (with debounce)
const debouncedSearch = useDebounceFn((value) => {
  setSearchQuery(value);
  showResults.value = Boolean(value);
}, 300);

// Handle input changes
const onInputChange = (e) => {
  const value = e.target.value;
  inputValue.value = value;
  debouncedSearch(value);
};

// Clear search and close results
const handleClear = () => {
  inputValue.value = "";
  clearSearch();
  showResults.value = false;

  // Focus the input after clearing
  searchInput.value?.focus();
};

// Watch for external searchQuery changes
watch(
  () => searchQuery.value,
  (newQuery) => {
    if (newQuery !== inputValue.value) {
      inputValue.value = newQuery;
    }
  }
);

// Close results when clicking outside
onClickOutside(searchInput, () => {
  showResults.value = false;
});
</script>

<template>
  <div class="relative w-full">
    <!-- Search Input -->
    <div class="relative flex items-center">
      <Icon
        name="ion:search-outline"
        size="20"
        class="absolute left-3 z-10 text-gray-400"
      />
      <input
        ref="searchInput"
        v-model="inputValue"
        type="text"
        :placeholder="$t('messages.shop.searchProducts')"
        class="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
        @input="onInputChange"
        @focus="showResults = Boolean(inputValue)"
      />
      <button
        v-if="inputValue"
        type="button"
        class="absolute right-3 z-10 text-gray-400 hover:text-gray-600"
        @click="handleClear"
      >
        <Icon name="ion:close-circle" size="20" />
      </button>
    </div>

    <!-- Search Results -->
    <Transition name="fade">
      <div
        v-if="showResults && (isLoading || hasResults)"
        class="absolute z-30 mt-1 w-full bg-white shadow-lg rounded-lg border border-gray-200 max-h-96 overflow-y-auto"
      >
        <!-- Loading state -->
        <div v-if="isLoading" class="p-4 text-center text-gray-500">
          <Icon name="ion:reload" size="24" class="animate-spin" />
          <p>Loading results...</p>
        </div>

        <!-- Results list -->
        <div v-else-if="hasResults">
          <div class="p-2 text-xs text-gray-500 border-b">
            {{ searchResults.length }} results found
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
                <!-- Product details -->
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
