<script setup lang="ts">
/**
 * PillFilter.vue - Pill/Tag button filter for style, fit, flex attributes
 *
 * Features:
 * - Pill-shaped toggle buttons
 * - Multi-select with visual feedback
 * - Compact display for limited options
 * - URL sync via useFiltering
 */
const {getFilter, setFilter, isFiltersActive} = useFiltering();

const {attribute} = defineProps({
  attribute: {type: Object, required: true},
});

const selectedTerms = ref<string[]>(getFilter(attribute.slug) || []);
const filterTitle = ref(attribute.label || attribute.slug);
const isOpen = ref(attribute.openByDefault ?? true);

watch(isFiltersActive, () => {
  // Clear selection when filters are reset
  if (!isFiltersActive.value) {
    selectedTerms.value = [];
  }
});

// Toggle pill selection
const togglePill = (slug: string) => {
  const index = selectedTerms.value.indexOf(slug);
  if (index === -1) {
    selectedTerms.value.push(slug);
  } else {
    selectedTerms.value.splice(index, 1);
  }
  setFilter(attribute.slug, selectedTerms.value);
};

// Check if term is selected
const isSelected = (slug: string) => selectedTerms.value.includes(slug);
</script>

<template>
  <div class="pill-filter">
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

    <!-- Pills Container -->
    <div v-show="isOpen" class="mt-3 flex flex-wrap gap-2">
      <button
        v-for="term in attribute.terms"
        :key="term.slug"
        @click="togglePill(term.slug)"
        :class="['pill-button', isSelected(term.slug) ? 'pill-selected' : 'pill-default']"
        type="button">
        <span v-html="term.name" />
        <small v-if="attribute.showCount" class="pill-count">
          {{ term.count || 0 }}
        </small>
      </button>
    </div>
  </div>
</template>

<style scoped lang="postcss">
.pill-button {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 cursor-pointer;

  &:focus {
    @apply outline-none ring-2 ring-primary ring-offset-1;
  }
}

.pill-default {
  @apply bg-white border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50;
}

.pill-selected {
  @apply bg-primary border-primary text-white hover:bg-primary/90;
}

.pill-count {
  @apply text-xs opacity-70 tabular-nums;
}

.pill-selected .pill-count {
  @apply opacity-80;
}
</style>
