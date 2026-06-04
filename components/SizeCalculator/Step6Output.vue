<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {CalculatorProduct} from '~/composables/useCalculatorProducts';
import PriceRevealCard from './PriceRevealCard.vue';

const calculator = useCalculator();
const region = useRegion();
const {fetchProducts} = useCalculatorProducts();

const products = ref<CalculatorProduct[]>([]);
const loadingProducts = ref(false);
const productError = ref<string | null>(null);

const selectedTargetBrand = computed(() => calculator.selectedTargetBrand.value);
const recommendation = computed(() => calculator.recommendation.value);

const browseUrl = computed(() => {
  const brand = selectedTargetBrand.value;
  if (!brand) return region.storeBaseUrl.value;
  return `${region.storeBaseUrl.value}/product-category/${brand.graphqlLookup.categorySlug}`;
});

const loadProducts = async () => {
  const brand = selectedTargetBrand.value;
  const recommendedRange = recommendation.value?.range;
  if (!brand || !recommendedRange || region.loading.value) return;

  loadingProducts.value = true;
  productError.value = null;
  products.value = [];

  try {
    products.value = await fetchProducts({
      brand,
      range: recommendedRange,
      graphqlEndpoint: region.graphqlEndpoint.value,
    });
    calculator.trackRecommendation();
  } catch (error) {
    productError.value = error instanceof Error ? error.message : 'Live product data unavailable.';
  } finally {
    loadingProducts.value = false;
  }
};

watch(
  [selectedTargetBrand, recommendation, () => region.loading.value],
  () => {
    loadProducts();
  },
  {immediate: true},
);

const handleProductClick = (slug: string) => {
  calculator.trackPriceRevealClick(slug, region.storeBaseUrl.value, region.countryCode.value);
};
</script>

<template>
  <section v-if="selectedTargetBrand && recommendation" class="grid gap-5 border-t border-zinc-200 pt-8">
    <div>
      <p class="text-sm font-bold uppercase tracking-wide text-zinc-500">Step 6</p>
      <h2 class="text-2xl font-black text-zinc-950">Your recommendation</h2>
    </div>

    <div class="grid gap-4 rounded-lg border border-emerald-200 bg-white p-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] md:items-center">
      <div>
        <p class="text-sm font-bold uppercase tracking-wide text-emerald-700">{{ selectedTargetBrand.name }}</p>
        <p class="mt-2 text-3xl font-black text-zinc-950">{{ recommendation.range.recommendedLabel }}</p>
        <p class="mt-3 text-sm leading-6 text-zinc-700">{{ calculator.widthDisclaimer(selectedTargetBrand) }}</p>
        <p v-if="recommendation.warning" class="mt-3 text-sm font-semibold text-amber-800">{{ recommendation.warning }}</p>
      </div>

      <div class="rounded-lg bg-zinc-950 p-4 text-white">
        <p class="text-xs font-bold uppercase tracking-wide text-zinc-300">Shopping region</p>
        <p class="mt-1 text-xl font-black">{{ region.countryCode.value }}</p>
        <p class="mt-2 break-all text-sm text-zinc-300">{{ region.storeBaseUrl.value }}</p>
      </div>
    </div>

    <div class="grid gap-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-xl font-black text-zinc-950">Matching products</h3>
          <p class="mt-1 text-sm leading-6 text-zinc-600">Prices stay hidden until you open a product on the correct store.</p>
        </div>

        <a
          :href="browseUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:border-zinc-500">
          <Icon name="ion:grid-outline" class="h-5 w-5" />
          Browse brand
        </a>
      </div>

      <div v-if="region.loading.value || loadingProducts" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="index in 6" :key="index" class="h-80 animate-pulse rounded-lg bg-zinc-200" />
      </div>

      <div v-else-if="productError" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
        Live product data unavailable.
        <a :href="browseUrl" target="_blank" rel="noopener" class="underline underline-offset-4">Browse {{ selectedTargetBrand.name }}</a>
      </div>

      <div v-else-if="!products.length" class="rounded-lg border border-zinc-200 bg-white p-4 text-sm font-semibold leading-6 text-zinc-700">
        No live results for {{ recommendation.range.recommendedLabel }}.
        <a :href="browseUrl" target="_blank" rel="noopener" class="text-emerald-700 underline underline-offset-4">Browse all {{ selectedTargetBrand.name }}</a>
      </div>

      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PriceRevealCard
          v-for="product in products"
          :key="product.id || product.slug"
          :product="product"
          :store-base-url="region.storeBaseUrl.value"
          :region-loading="region.loading.value"
          @click="handleProductClick" />
      </div>
    </div>
  </section>
</template>
