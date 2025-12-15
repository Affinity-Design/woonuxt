<script setup lang="ts">
/**
 * BrandFilter.vue - Searchable checkbox filter for brands/manufacturers
 *
 * Features:
 * - Search input to filter long brand lists (60+ brands)
 * - Checkbox selection with URL sync
 * - Shows product counts per brand
 * - Collapsible accordion style
 */
const {getFilter, setFilter, isFiltersActive} = useFiltering();

const {attribute} = defineProps({
  attribute: {type: Object, required: true},
});

const selectedTerms = ref<string[]>(getFilter(attribute.slug) || []);
const filterTitle = ref(attribute.label || attribute.slug);
const isOpen = ref(attribute.openByDefault ?? true); // Default open for brand filter
const searchQuery = ref('');

// Filter terms based on search query
const filteredTerms = computed(() => {
  if (!searchQuery.value.trim()) {
    return attribute.terms || [];
  }
  const query = searchQuery.value.toLowerCase().trim();
  return (attribute.terms || []).filter((term: any) => term.name?.toLowerCase().includes(query) || term.slug?.toLowerCase().includes(query));
});

// Sort terms: selected first, then alphabetically
const sortedTerms = computed(() => {
  return [...filteredTerms.value].sort((a: any, b: any) => {
    const aSelected = selectedTerms.value.includes(a.slug);
    const bSelected = selectedTerms.value.includes(b.slug);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
});

watch(isFiltersActive, () => {
  // Uncheck all checkboxes when filters are cleared
  if (!isFiltersActive.value) {
    selectedTerms.value = [];
    searchQuery.value = '';
  }
});

// Update the URL when the checkbox is changed
const checkboxChanged = () => {
  setFilter(attribute.slug, selectedTerms.value);
};

// Clear search
const clearSearch = () => {
  searchQuery.value = '';
};
</script>

<template>
  <div class="brand-filter">
    <!-- Header -->
    <div class="cursor-pointer flex font-semibold mt-8 leading-none justify-between items-center" @click="isOpen = !isOpen">
      <span>{{ filterTitle }}</span>
      <div class="flex items-center gap-2">
        <span v-if="selectedTerms.length" class="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
          {{ selectedTerms.length }}
        </span>
        <Icon name="ion:chevron-down-outline" class="transform transition-transform" :class="isOpen ? 'rotate-180' : ''" />
      </div>
    </div>

    <!-- Content -->
    <div v-show="isOpen" class="mt-3">
      <!-- Search Input -->
      <div class="relative mb-3">
        <Icon name="ion:search-outline" class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search brands..."
          class="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        <button v-if="searchQuery" @click="clearSearch" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <Icon name="ion:close-outline" class="w-4 h-4" />
        </button>
      </div>

      <!-- Brand List -->
      <div class="max-h-[280px] grid gap-1.5 overflow-auto custom-scrollbar pr-1">
        <template v-if="sortedTerms.length">
          <div v-for="term in sortedTerms" :key="term.slug" class="flex gap-2 items-center hover:bg-gray-50 rounded px-1 py-0.5 transition-colors">
            <input
              :id="`brand-${term.slug}`"
              v-model="selectedTerms"
              type="checkbox"
              :value="term.slug"
              @change="checkboxChanged"
              class="rounded border-gray-300 text-primary focus:ring-primary" />
            <label :for="`brand-${term.slug}`" class="cursor-pointer m-0 text-sm flex items-center justify-between flex-1">
              <span v-html="term.name" class="truncate" />
              <small v-if="attribute.showCount" class="ml-1 text-gray-400 tabular-nums shrink-0"> ({{ term.count || 0 }}) </small>
            </label>
          </div>
        </template>
        <div v-else class="text-sm text-gray-500 py-2 text-center">No brands found</div>
      </div>

      <!-- Selected brands summary -->
      <div v-if="selectedTerms.length > 0" class="mt-2 pt-2 border-t border-gray-100">
        <div class="flex flex-wrap gap-1">
          <span v-for="slug in selectedTerms.slice(0, 3)" :key="slug" class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {{ attribute.terms?.find((t: any) => t.slug === slug)?.name || slug }}
          </span>
          <span v-if="selectedTerms.length > 3" class="text-xs text-gray-500"> +{{ selectedTerms.length - 3 }} more </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="postcss">
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e5e7eb;
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #d1d5db;
}
</style>
