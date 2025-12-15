<script setup lang="ts">
/**
 * Filters.vue - Category-aware filter container
 *
 * APPROACH: Extract filter terms from product attributes instead of separate terms query.
 * This ensures filters show only values that exist in the current product set.
 */
import {TaxonomyEnum} from '#woo';

const {isFiltersActive} = useFiltering();
const {removeBodyClass} = useHelpers();
const runtimeConfig = useRuntimeConfig();
const {storeSettings} = useAppConfig();
const route = useRoute();

// Get the reactive products state directly
const products = useState<Product[]>('products');

const {hideCategories} = defineProps({
  hideCategories: {type: Boolean, default: false},
});

// Get current category slug from route
const currentCategorySlug = computed(() => {
  const path = route.path;
  const match = path.match(/\/product-category\/(.+)/);
  if (match) {
    const segments = match[1].split('/').filter(Boolean);
    return segments[segments.length - 1] || segments[0] || '';
  }
  return '';
});

// Get all parent category slugs
const categoryPathSlugs = computed(() => {
  const path = route.path;
  const match = path.match(/\/product-category\/(.+)/);
  if (match) {
    return match[1]
      .split('/')
      .filter(Boolean)
      .map((s) => s.toLowerCase());
  }
  return [];
});

const globalProductAttributes = (runtimeConfig?.public?.GLOBAL_PRODUCT_ATTRIBUTES as WooNuxtFilter[]) || [];

// Filter attributes based on current category
const visibleAttributes = computed(() => {
  const currentSlug = currentCategorySlug.value?.toLowerCase();
  const pathSlugs = categoryPathSlugs.value;

  if (!currentSlug && pathSlugs.length === 0) {
    return globalProductAttributes.filter((attr) => !attr.categories || attr.categories.length === 0);
  }

  return globalProductAttributes.filter((attr) => {
    if (!attr.categories || attr.categories.length === 0) {
      return true;
    }
    return attr.categories.some((cat: string) => {
      const catLower = cat.toLowerCase();
      if (currentSlug === catLower) return true;
      if (pathSlugs.includes(catLower)) return true;
      return false;
    });
  });
});

// Extract terms from product attributes
const extractTermsFromProducts = (products: any[], attributeSlug: string) => {
  const termsMap = new Map<string, {name: string; slug: string; count: number; taxonomyName: string}>();

  for (const product of products) {
    // Check product.attributes.nodes for GlobalProductAttribute
    const attrs = (product as any).attributes?.nodes || [];
    for (const attr of attrs) {
      // Match by slug or name (e.g., "pa_manufacturer" or "Manufacturer")
      if (attr.slug === attributeSlug || attr.name === attributeSlug) {
        // Options are the values like ["Bauer", "CCM", "Rollerblade"]
        const options = attr.options || [];
        for (const option of options) {
          const slug = option
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
          if (termsMap.has(slug)) {
            termsMap.get(slug)!.count++;
          } else {
            termsMap.set(slug, {
              name: option,
              slug: slug,
              count: 1,
              taxonomyName: attributeSlug,
            });
          }
        }
      }
    }
  }

  return Array.from(termsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
};

// Build terms for each visible attribute from products
const attributesWithTerms = computed(() => {
  const productList = products.value || [];

  if (import.meta.dev && productList.length > 0) {
    console.log('[Filters] Building terms from', productList.length, 'products');
    console.log('[Filters] Sample product attributes:', productList[0]?.attributes);
  }

  return visibleAttributes.value
    .map((attr) => {
      const terms = extractTermsFromProducts(productList, attr.slug);
      return {...attr, terms};
    })
    .filter((attr) => !attr.hideEmpty || (attr.terms && attr.terms.length > 0));
});

// Still fetch category terms from GraphQL (these work fine)
const {data: categoryData} = await useAsyncGql('getAllTerms', {
  taxonomies: [TaxonomyEnum.PRODUCTCATEGORY],
  hideEmpty: true,
  first: 200,
});
const productCategoryTerms = categoryData.value?.terms?.nodes || [];

// Debug logging
if (import.meta.dev) {
  watch(
    [currentCategorySlug, attributesWithTerms],
    () => {
      console.log('[Filters] Category:', currentCategorySlug.value);
      console.log(
        '[Filters] Visible attributes:',
        visibleAttributes.value.map((a) => a.slug),
      );
      console.log(
        '[Filters] Attributes with terms:',
        attributesWithTerms.value.map((a) => `${a.slug}(${a.terms?.length || 0})`),
      );
    },
    {immediate: true},
  );
}
</script>

<template>
  <aside id="filters">
    <OrderByDropdown class="block w-full md:hidden" />
    <div class="relative z-30 grid mb-12 space-y-8 divide-y">
      <PriceFilter />
      <CategoryFilter v-if="!hideCategories" :terms="productCategoryTerms" />

      <!-- Dynamic attribute filters based on type -->
      <template v-for="attribute in attributesWithTerms" :key="attribute.slug">
        <div v-if="attribute.terms && attribute.terms.length > 0">
          <!-- Brand filter (searchable checkbox list) -->
          <BrandFilter v-if="attribute.type === 'brand'" :attribute />

          <!-- Color swatch filter -->
          <ColorFilter v-else-if="attribute.type === 'color' || attribute.slug === 'pa_color' || attribute.slug === 'pa_colour'" :attribute />

          <!-- Pill/tag filter -->
          <PillFilter v-else-if="attribute.type === 'pill'" :attribute />

          <!-- Dropdown filter -->
          <DropdownFilter v-else-if="attribute.type === 'dropdown'" :attribute />

          <!-- Default checkbox filter -->
          <GlobalFilter v-else :attribute />
        </div>
      </template>

      <OnSaleFilter />
      <LazyStarRatingFilter v-if="storeSettings.showReviews" />
      <LazyResetFiltersButton v-if="isFiltersActive" />
    </div>
  </aside>
  <div class="fixed inset-0 z-50 hidden bg-black opacity-25 filter-overlay" @click="removeBodyClass('show-filters')"></div>
</template>

<style lang="postcss">
.show-filters .filter-overlay {
  @apply block;
}
.show-filters {
  overflow: hidden;
}

#filters {
  @apply w-[280px];

  & .slider-connect {
    @apply bg-primary;
  }

  &::-webkit-scrollbar {
    display: none;
  }
}

.price-input {
  @apply border rounded-xl outline-none leading-tight w-full p-2 transition-all;

  &.active {
    @apply border-gray-400 pl-6;
  }
}

@media (max-width: 768px) {
  #filters {
    @apply bg-white h-full p-8 transform pl-2 transition-all ease-in-out bottom-0 left-4 -translate-x-[110vw] duration-300 overflow-auto fixed;

    box-shadow:
      -100px 0 0 white,
      -200px 0 0 white,
      -300px 0 0 white;
    z-index: 60;
  }

  .show-filters #filters {
    @apply transform-none;
  }
}
</style>
