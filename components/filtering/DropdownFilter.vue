<script setup lang="ts">
/**
 * DropdownFilter.vue - Dropdown/select filter for size, length, wheel size attributes
 *
 * Features:
 * - Native select dropdown for compact display
 * - Multi-select support via checkbox dropdown
 * - Shows product counts
 * - URL sync via useFiltering
 */
const {getFilter, setFilter, isFiltersActive} = useFiltering();

const {attribute} = defineProps({
  attribute: {type: Object, required: true},
});

const selectedTerms = ref<string[]>(getFilter(attribute.slug) || []);
const filterTitle = ref(attribute.label || attribute.slug);
const isOpen = ref(attribute.openByDefault ?? false);
const dropdownOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

// Sort terms numerically if possible, otherwise alphabetically
const sortedTerms = computed(() => {
  return [...(attribute.terms || [])].sort((a: any, b: any) => {
    // Try to parse as numbers for numeric sorting (e.g., wheel sizes: 80, 84, 90, 100)
    const aNum = parseFloat(a.name?.replace(/[^\d.-]/g, '') || '');
    const bNum = parseFloat(b.name?.replace(/[^\d.-]/g, '') || '');

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }

    // Fall back to alphabetical
    return (a.name || '').localeCompare(b.name || '', undefined, {numeric: true});
  });
});

watch(isFiltersActive, () => {
  // Clear selection when filters are reset
  if (!isFiltersActive.value) {
    selectedTerms.value = [];
  }
});

// Toggle term selection
const toggleTerm = (slug: string) => {
  const index = selectedTerms.value.indexOf(slug);
  if (index === -1) {
    selectedTerms.value.push(slug);
  } else {
    selectedTerms.value.splice(index, 1);
  }
  setFilter(attribute.slug, selectedTerms.value);
};

// Clear all selections
const clearAll = () => {
  selectedTerms.value = [];
  setFilter(attribute.slug, []);
};

// Format display text
const displayText = computed(() => {
  if (selectedTerms.value.length === 0) {
    return `Select ${filterTitle.value}`;
  }
  if (selectedTerms.value.length === 1) {
    const term = attribute.terms?.find((t: any) => t.slug === selectedTerms.value[0]);
    return term?.name || selectedTerms.value[0];
  }
  return `${selectedTerms.value.length} selected`;
});

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    dropdownOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="dropdown-filter">
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

    <!-- Dropdown -->
    <div v-show="isOpen" class="mt-3" ref="dropdownRef">
      <div class="relative">
        <!-- Dropdown Button -->
        <button type="button" @click="dropdownOpen = !dropdownOpen" class="dropdown-button" :class="{'dropdown-button-active': selectedTerms.length > 0}">
          <span class="truncate">{{ displayText }}</span>
          <Icon name="ion:chevron-down-outline" class="w-4 h-4 shrink-0 transition-transform" :class="dropdownOpen ? 'rotate-180' : ''" />
        </button>

        <!-- Dropdown Menu -->
        <Transition name="dropdown">
          <div v-if="dropdownOpen" class="dropdown-menu">
            <!-- Clear button -->
            <button v-if="selectedTerms.length > 0" @click="clearAll" type="button" class="dropdown-clear">
              <Icon name="ion:close-circle-outline" class="w-4 h-4" />
              Clear all
            </button>

            <!-- Options -->
            <div class="dropdown-options">
              <div
                v-for="term in sortedTerms"
                :key="term.slug"
                class="dropdown-option"
                :class="{'dropdown-option-selected': selectedTerms.includes(term.slug)}"
                @click="toggleTerm(term.slug)">
                <span class="dropdown-checkbox">
                  <Icon v-if="selectedTerms.includes(term.slug)" name="ion:checkmark" class="w-3 h-3" />
                </span>
                <span v-html="term.name" class="flex-1 truncate" />
                <small v-if="attribute.showCount" class="text-gray-400 tabular-nums shrink-0"> ({{ term.count || 0 }}) </small>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped lang="postcss">
.dropdown-button {
  @apply w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all;
}

.dropdown-button-active {
  @apply border-primary bg-primary/5;
}

.dropdown-menu {
  @apply absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg;
}

.dropdown-clear {
  @apply w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-b border-gray-100 transition-colors;
}

.dropdown-options {
  @apply max-h-[200px] overflow-auto;
}

.dropdown-option {
  @apply flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors;
}

.dropdown-option-selected {
  @apply bg-primary/5;
}

.dropdown-checkbox {
  @apply w-4 h-4 rounded border border-gray-300 flex items-center justify-center shrink-0 transition-colors;
}

.dropdown-option-selected .dropdown-checkbox {
  @apply bg-primary border-primary text-white;
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
