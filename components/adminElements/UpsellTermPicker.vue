<script setup lang="ts">
// Searchable multi-select of categories or brands for a rule selector. Options come from the
// WordPress plugin (hidden/empty terms included) through /api/admin/upsell-terms.
import type {UpsellTaxonomy} from '#shared/types/upsell';

const props = defineProps<{modelValue: number[]; taxonomy: UpsellTaxonomy}>();
const emit = defineEmits<{(e: 'update:modelValue', value: number[]): void}>();

const {termsByTaxonomy, termsLoading, loadTerms, termPath} = useUpsellAdmin();
const search = ref('');
const isOpen = ref(false);
const loadError = ref(false);

const ensureLoaded = async (): Promise<void> => {
  loadError.value = false;
  try {
    await loadTerms(props.taxonomy);
  } catch {
    loadError.value = true;
  }
};
onMounted(ensureLoaded);
watch(() => props.taxonomy, ensureLoaded);

const options = computed(() => termsByTaxonomy.value[props.taxonomy] || []);
const isLoading = computed(() => Boolean(termsLoading.value[props.taxonomy]));

const results = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const selected = new Set(props.modelValue);
  return options.value
    .filter((term) => !selected.has(term.id))
    .filter((term) => !needle || term.name.toLowerCase().includes(needle) || term.slug.toLowerCase().includes(needle))
    .slice(0, 30);
});

const add = (id: number): void => {
  emit('update:modelValue', [...props.modelValue, id]);
  search.value = '';
};

const remove = (id: number): void => {
  emit(
    'update:modelValue',
    props.modelValue.filter((value) => value !== id),
  );
};

const close = (): void => {
  setTimeout(() => {
    isOpen.value = false;
  }, 150);
};
</script>

<template>
  <div class="relative">
    <div class="flex flex-wrap gap-1.5 mb-1.5" v-if="modelValue.length">
      <span v-for="id in modelValue" :key="id" class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800">
        {{ termPath(taxonomy, id) }}
        <button type="button" class="text-gray-400 hover:text-red-600" :aria-label="`Remove ${termPath(taxonomy, id)}`" @click="remove(id)">×</button>
      </span>
    </div>
    <input
      v-model="search"
      type="search"
      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      :placeholder="isLoading ? 'Loading…' : `Search ${taxonomy === 'product_cat' ? 'categories' : 'brands'}…`"
      :disabled="isLoading"
      @focus="isOpen = true"
      @blur="close" />
    <p v-if="loadError" class="mt-1 text-xs text-red-700">Could not load options. <button type="button" class="underline" @click="ensureLoaded">Retry</button></p>
    <ul v-if="isOpen && results.length" class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg">
      <li v-for="term in results" :key="term.id">
        <button type="button" class="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-50" @mousedown.prevent="add(term.id)">
          <span>{{ termPath(taxonomy, term.id) }}</span>
          <span class="text-xs text-gray-400">{{ term.count }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="isOpen && !isLoading && !results.length && search" class="mt-1 text-xs text-gray-500">No matches.</p>
  </div>
</template>
