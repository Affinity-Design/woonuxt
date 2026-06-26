<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {CalculatorProduct} from '~/composables/useCalculatorProducts';
import PriceRevealCard from './PriceRevealCard.vue';

const calculator = useCalculator();
const storefront = useStorefrontSelection();
const {fetchProducts, fetchBrowseProducts} = useCalculatorProducts();

const products = ref<CalculatorProduct[]>([]);
const loadingProducts = ref(false);
const productError = ref<string | null>(null);
const copyToast = ref<'idle' | 'copied'>('idle');

const browseMode = computed(() => calculator.state.value.browseMode);
const selectedTargetBrand = computed(() => calculator.selectedTargetBrand.value);
const recommendation = computed(() => calculator.recommendation.value);
const resolvedSize = computed(() => calculator.resolvedReferenceSize.value);

// Human explanation of the brand-specific fit adjustment, shown when the brand runs small/large.
const fitNote = computed(() => {
  const offset = recommendation.value?.fitOffsetMm ?? 0;
  if (!offset) return null;
  const brand = selectedTargetBrand.value?.name ?? 'This brand';
  const abs = Math.abs(offset);
  const magnitude = abs < 6 ? 'about half a size' : abs < 11 ? 'about a full size' : 'about 1½ sizes';
  return offset > 0
    ? `${brand} runs small, so we sized you up ${magnitude} from your foot measurement.`
    : `${brand} runs large, so we sized you down ${magnitude} from your foot measurement.`;
});

const activeStorefront = computed(
  () => storefront.storefrontOptions.find((o) => o.value === storefront.choice.value) ?? null,
);

// Split "EU 42 / US Men 9 / US Women 10.5" into primary and secondary parts.
const primarySize = computed(() => {
  const label = recommendation.value?.range.recommendedLabel ?? '';
  return label.split(' / ')[0] ?? label;
});
const secondarySizes = computed(() => {
  const label = recommendation.value?.range.recommendedLabel ?? '';
  const parts = label.split(' / ');
  return parts.length > 1 ? parts.slice(1).join(' / ') : null;
});

// Verified category browse URLs for each store.
// CA uses WooCommerce's default /product-category/ base.
// COM uses the /shop/ hierarchy (e.g. .com/shop/inline-skating/inline-skates/).
const CA_CATEGORY_URLS: Record<string, string> = {
  'inline-skates': 'https://proskatersplace.ca/product-category/inline-skates/',
  'roller-skates': 'https://proskatersplace.ca/product-category/roller-skates/',
  'alpine-ski-boots': 'https://proskatersplace.ca/product-category/alpine-ski-boots/',
};

const COM_CATEGORY_URLS: Record<string, string> = {
  'inline-skates': 'https://proskatersplace.com/shop/inline-skating/inline-skates/',
  'roller-skates': 'https://proskatersplace.com/shop/roller-skating/roller-skates/',
  'alpine-ski-boots': 'https://proskatersplace.com/shop/winter-sports/alpine-ski-boots/',
};

const browseUrl = computed(() => {
  const brand = selectedTargetBrand.value;
  const categorySlug = brand?.graphqlLookup.categorySlug ?? '';
  const isCA = storefront.choice.value === 'canada';

  if (isCA) {
    return CA_CATEGORY_URLS[categorySlug] ?? `https://proskatersplace.ca/product-category/${categorySlug}/`;
  }

  // For COM, first try to derive the exact category path from a loaded product permalink.
  // If no products were returned (e.g. OOS), fall back to the hardcoded map.
  const comProduct = products.value.find(
    (p) => typeof p.link === 'string' && p.link.includes('proskatersplace.com/shop/'),
  );
  if (comProduct?.link) {
    try {
      const url = new URL(comProduct.link);
      const categoryPath = url.pathname.replace(/\/[^/]+\/?$/, '/');
      return `https://proskatersplace.com${categoryPath}`;
    } catch {}
  }

  return COM_CATEGORY_URLS[categorySlug] ?? `https://proskatersplace.com/product-category/${categorySlug}/`;
});

const loadProducts = async () => {
  loadingProducts.value = true;
  productError.value = null;
  products.value = [];

  try {
    if (browseMode.value) {
      const targetCategory = calculator.state.value.targetCategory;
      const targetBrands = calculator.targetBrands.value;
      if (!targetCategory || !targetBrands.length) {
        loadingProducts.value = false;
        return;
      }
      products.value = await fetchBrowseProducts({
        categorySlug: targetBrands[0].graphqlLookup.categorySlug,
        productCategory: targetCategory,
      });
    } else {
      const brand = selectedTargetBrand.value;
      const recommendedRange = recommendation.value?.range;
      if (!brand || !recommendedRange) {
        loadingProducts.value = false;
        return;
      }
      products.value = await fetchProducts({brand, range: recommendedRange});
      calculator.trackRecommendation();
    }
  } catch (error) {
    productError.value = error instanceof Error ? error.message : 'Live product data unavailable.';
  } finally {
    loadingProducts.value = false;
  }
};

watch([browseMode, selectedTargetBrand, recommendation], () => {
  loadProducts();
}, {immediate: true});

const handleProductClick = (slug: string) => {
  const choice = storefront.choice.value ?? 'international';
  calculator.trackPriceRevealClick(slug, storefront.storeBaseUrl.value, choice);
};

// Draw the recommendation as a PNG and trigger a download.
// Uses only the Canvas 2D API — no external libraries required.
const saveSize = () => {
  if (typeof document === 'undefined') return;

  const brandName = selectedTargetBrand.value?.name ?? '';
  const primary = primarySize.value;
  const secondary = secondarySizes.value;
  const mm = resolvedSize.value?.mm ?? '';

  const W = 600;
  const H = 300;
  const DPR = 2; // retina
  const EMERALD = '#15803d';
  const ZINC950 = '#09090b';
  const ZINC500 = '#71717a';
  const ZINC400 = '#9ca3af';
  const ZINC100 = '#f4f4f5';

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(DPR, DPR);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Emerald header strip
  ctx.fillStyle = EMERALD;
  ctx.fillRect(0, 0, W, 52);

  // Brand name in header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(brandName.toUpperCase(), 22, 32);

  // "ProSkaters Place" right-aligned in header
  ctx.fillStyle = '#86efac';
  ctx.font = '11px Arial, sans-serif';
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillText('ProSkaters Place', W - 20, 32);
  ctx.textAlign = 'left';

  // "YOUR RECOMMENDED SIZE" label
  ctx.fillStyle = ZINC400;
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText('YOUR RECOMMENDED SIZE', 22, 80);

  // Primary size — large
  ctx.fillStyle = ZINC950;
  ctx.font = 'bold 80px Arial, sans-serif';
  ctx.fillText(primary, 16, 170);

  // Secondary sizes
  if (secondary) {
    ctx.fillStyle = ZINC500;
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(`Also ${secondary}`, 22, 196);
  }

  // "Converted from" line
  ctx.fillStyle = EMERALD;
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(`✓  Converted from your ${mm} mm measurement`, 22, 228);

  // Thin divider
  ctx.fillStyle = ZINC100;
  ctx.fillRect(0, 255, W, 1);

  // Footer URL
  ctx.fillStyle = ZINC400;
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('proskatersplace.ca/roller-skates-size-calculator', 22, 282);

  // Trigger download
  const link = document.createElement('a');
  const filename = `skate-size-${primary.toLowerCase().replace(/[\s/]+/g, '-')}.png`;
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();

  copyToast.value = 'copied';
  setTimeout(() => { copyToast.value = 'idle'; }, 2000);
};
</script>

<template>
  <section class="grid gap-6">

    <!-- ── Specific brand recommendation card ── -->
    <div
      v-if="!browseMode && selectedTargetBrand && recommendation"
      class="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">

      <!-- Header: brand + save + store -->
      <div class="flex items-center justify-between gap-3 bg-emerald-700 px-5 py-3">
        <p class="text-sm font-bold uppercase tracking-widest text-white">{{ selectedTargetBrand.name }}</p>
        <div class="flex items-center gap-2">
          <!-- Save / Share button -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-emerald-500"
            :title="copyToast === 'copied' ? 'Downloading…' : 'Download size card as PNG'"
            @click="saveSize">
            <Icon
              :name="copyToast === 'copied' ? 'ion:checkmark-outline' : 'ion:download-outline'"
              class="h-3.5 w-3.5" />
            {{ copyToast === 'copied' ? 'Saved!' : 'Save card' }}
          </button>
          <span v-if="activeStorefront" class="text-xs font-semibold text-emerald-200">
            {{ activeStorefront.flag }} {{ activeStorefront.label }}
          </span>
        </div>
      </div>

      <!-- Size hero -->
      <div class="px-5 pt-6 pb-5">
        <p class="text-xs font-bold uppercase tracking-widest text-zinc-400">Your recommended size</p>
        <p class="mt-2 text-6xl font-black leading-none tracking-tight text-zinc-950 sm:text-7xl">
          {{ primarySize }}
        </p>
        <p v-if="secondarySizes" class="mt-2 text-sm font-semibold text-zinc-500">
          Also {{ secondarySizes }}
        </p>
        <p class="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <Icon name="ion:checkmark-circle-outline" class="h-4 w-4 shrink-0" />
          Converted from your {{ resolvedSize?.mm }} mm measurement
        </p>
      </div>

      <!-- Fit guidance + range hint -->
      <div class="border-t border-zinc-100 bg-zinc-50 px-5 py-4 grid gap-3">
        <p v-if="fitNote" class="flex items-start gap-1.5 text-sm font-semibold text-emerald-800">
          <Icon name="ion:resize-outline" class="mt-0.5 h-4 w-4 shrink-0" />{{ fitNote }}
        </p>
        <p class="text-sm leading-6 text-zinc-600">{{ calculator.widthDisclaimer(selectedTargetBrand) }}</p>
        <p v-if="recommendation.warning" class="text-sm font-semibold text-amber-800">
          <Icon name="ion:warning-outline" class="mr-1 inline h-4 w-4" />{{ recommendation.warning }}
        </p>

        <!-- Range selector tip -->
        <div class="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3">
          <Icon name="ion:finger-print-outline" class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <p class="text-sm leading-5 text-blue-900">
            <span class="font-bold">On the product page</span>, sizes may appear as ranges (e.g.
            <span class="font-bold">41-42EU</span>, <span class="font-bold">43-44EU</span>).
            Select the range that includes <span class="font-bold">{{ primarySize }}</span>.
          </p>
        </div>
      </div>
    </div>

    <!-- ── Browse mode card ── -->
    <div v-if="browseMode" class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div class="flex items-center justify-between gap-3 bg-zinc-900 px-5 py-3">
        <p class="text-sm font-bold uppercase tracking-widest text-zinc-300">All options by price</p>
        <span v-if="activeStorefront" class="text-xs font-semibold text-zinc-400">
          {{ activeStorefront.flag }} {{ activeStorefront.label }}
        </span>
      </div>
      <div class="px-5 py-5 grid gap-3">
        <div>
          <p class="text-2xl font-black text-zinc-950">Budget-friendly picks</p>
          <p class="mt-2 text-sm leading-6 text-zinc-600">
            Sorted lowest to highest. On each product page, look for a size closest to
            <span class="font-bold text-zinc-900">{{ resolvedSize?.mm }} mm</span>.
          </p>
        </div>
        <!-- Range tip for browse mode too -->
        <div class="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3">
          <Icon name="ion:finger-print-outline" class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <p class="text-sm leading-5 text-blue-900">
            <span class="font-bold">Heads up:</span> sizes on our product pages often show as ranges
            (e.g. <span class="font-bold">41-42EU</span>). Click the range that includes your foot measurement of
            <span class="font-bold">{{ resolvedSize?.mm }} mm</span>.
          </p>
        </div>
      </div>
    </div>

    <!-- ── Product grid ── -->
    <div class="grid gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-black text-zinc-950">
            {{ browseMode ? 'Options in this category' : 'Matching products' }}
          </h3>
          <p class="text-sm text-zinc-500">Prices reveal when you open the product on your store.</p>
        </div>

        <a
          v-if="!browseMode && selectedTargetBrand"
          :href="browseUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:border-zinc-500">
          <Icon name="ion:grid-outline" class="h-4 w-4" />
          Browse all
        </a>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loadingProducts" class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div v-for="index in 6" :key="index" class="h-72 animate-pulse rounded-xl bg-zinc-200" />
      </div>

      <!-- Error state -->
      <div v-else-if="productError" class="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p class="text-sm font-bold text-amber-900">Live product data unavailable right now.</p>
        <a
          v-if="!browseMode && selectedTargetBrand"
          :href="browseUrl"
          target="_blank"
          rel="noopener"
          class="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-amber-800 underline underline-offset-4">
          Browse {{ selectedTargetBrand.name }} directly
          <Icon name="ion:open-outline" class="h-4 w-4" />
        </a>
      </div>

      <!-- Empty state -->
      <div v-else-if="!products.length && !loadingProducts" class="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <p class="text-sm font-bold text-zinc-700">
          <template v-if="!browseMode && recommendation">
            No products found for {{ recommendation.range.recommendedLabel }} right now.
          </template>
          <template v-else>No products found in this category right now.</template>
        </p>
        <a
          v-if="!browseMode && selectedTargetBrand"
          :href="browseUrl"
          target="_blank"
          rel="noopener"
          class="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 underline underline-offset-4">
          Browse all {{ selectedTargetBrand.name }}
          <Icon name="ion:open-outline" class="h-4 w-4" />
        </a>
      </div>

      <!-- Product cards -->
      <div v-else class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <PriceRevealCard
          v-for="product in products"
          :key="product.id || product.slug"
          :product="product"
          @click="handleProductClick" />

        <!-- Filler CTA when fewer than 3 results -->
        <a
          v-if="!browseMode && products.length < 3 && selectedTargetBrand"
          :href="browseUrl"
          target="_blank"
          rel="noopener"
          class="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 bg-white p-4 text-center transition hover:border-emerald-400 hover:bg-emerald-50">
          <Icon name="ion:grid-outline" class="h-8 w-8 text-zinc-300" />
          <div>
            <p class="text-sm font-bold text-zinc-600">More {{ selectedTargetBrand.name }}</p>
            <p class="mt-0.5 text-xs text-zinc-400">Browse the full range</p>
          </div>
          <Icon name="ion:open-outline" class="h-4 w-4 text-zinc-400" />
        </a>
      </div>
    </div>

  </section>
</template>
