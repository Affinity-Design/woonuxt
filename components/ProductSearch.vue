<!-- ProductSearch.vue -->
<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router"; // Add this import
import { useSearchCached } from "~/composables/useSearchCached";
import { useDebounceFn } from "~/composables/useDebounceFn";
// Define route and router at the top of your script
const route = useRoute();
const router = useRouter();

const {
  searchQuery,
  searchResults,
  isSearching,
  isSearchActive,
  setSearchQuery,
  clearSearchQuery,
  navigateToSearchResults,
  limitedSearchResults,
} = useSearchCached();

const searchInput = ref<HTMLInputElement | null>(null);
const showResults = ref(false);
const minCharsToSearch = 2;

// Focus on search input when mounted
onMounted(() => {
  if (searchInput.value) {
    searchInput.value.focus();
  }
});

// Handle input changes with debounce
const onSearchInput = useDebounceFn((val: string) => {
  if (val.length >= minCharsToSearch) {
    setSearchQuery(val);
    showResults.value = true;
  } else if (val.length === 0) {
    clearSearchQuery();
    showResults.value = false;
  }
}, 300);

// Handle focus events
const onSearchFocus = () => {
  if (searchQuery.value && searchQuery.value.length >= minCharsToSearch) {
    showResults.value = true;
  }
};

// Close results when clicking outside
const closeResults = () => {
  setTimeout(() => {
    showResults.value = false;
  }, 200);
};

// Submit search and navigate to results page
const submitSearch = (event: Event) => {
  event.preventDefault();
  navigateToSearchResults();
};

// Watch for searchResults changes
watch(searchResults, (newResults) => {
  if (newResults && newResults.length > 0) {
    showResults.value = true;
  }
});

// Reset search on route change
watch(
  () => route.path,
  () => {
    if (!isSearchActive.value) {
      clearSearchQuery();
      showResults.value = false;
    }
  }
);
</script>

<template>
  <div class="relative">
    <form @submit="submitSearch" class="bg-white relative flex items-center">
      <input
        ref="searchInput"
        :value="searchQuery"
        type="text"
        placeholder="Search products..."
        class="border rounded-lg p-2 pr-8 w-full focus:outline-none focus:ring-1 focus:ring-primary"
        @input="onSearchInput($event.target.value)"
        @focus="onSearchFocus"
        @blur="closeResults"
      />
      <div class="absolute right-2 flex items-center">
        <span v-if="isSearching" class="animate-spin">
          <Icon name="ion:reload-outline" size="16" />
        </span>
        <button
          v-else-if="searchQuery"
          type="button"
          @click="clearSearchQuery"
          class="text-gray-500 hover:text-gray-700 focus:outline-none"
          aria-label="Clear search"
        >
          <Icon name="ion:close-outline" size="16" />
        </button>
        <button
          v-else
          type="submit"
          class="text-gray-500 hover:text-gray-700 focus:outline-none"
          aria-label="Search"
        >
          <Icon name="ion:search-outline" size="16" />
        </button>
      </div>
    </form>

    <!-- Search Results Dropdown -->
    <div
      v-if="showResults && limitedSearchResults.length > 0"
      class="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto"
    >
      <ul>
        <li
          v-for="product in limitedSearchResults"
          :key="product.databaseId"
          class="border-b last:border-0"
        >
          <NuxtLink
            :to="`/product/${product.slug}`"
            class="flex items-center p-2 hover:bg-gray-50"
            @click="showResults = false"
          >
            {{ product.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>

    <!-- No Results Message -->
    <div
      v-else-if="
        showResults && searchQuery.length >= minCharsToSearch && !isSearching
      "
      class="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-4 text-center"
    >
      <p class="text-gray-500">No products found for "{{ searchQuery }}"</p>
    </div>
  </div>
</template>

<style scoped>
/* Add any component-specific styles here */
</style>
