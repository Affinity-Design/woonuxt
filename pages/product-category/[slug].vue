<script lang="ts" setup>
import {defineAsyncComponent, ref, computed, watch, onMounted, onUnmounted} from 'vue';
const PulseLoader = defineAsyncComponent(() => import('vue-spinner/src/PulseLoader.vue'));

// Core composables
const {setProducts, updateProductList} = useProducts();
const {isQueryEmpty} = useHelpers();
const {storeSettings} = useAppConfig();
const route = useRoute();
const nuxtApp = useNuxtApp();

// SEO composables
const {setCategorySEO} = useCategorySEO();

// Category content data
import {getCategoryContent} from '../../data/category-content';

// Ensure slug is a string
const slug = Array.isArray(route.params.slug) ? route.params.slug[0] : (route.params.slug as string);

// Create a consistent cache key for this request
const cacheKey = `category-${slug}`;

/**
 * Formats a slug string to a readable title
 */
const formatSlug = (slugValue: string | string[]): string => {
  if (!slugValue) return '';
  if (Array.isArray(slugValue)) {
    slugValue = slugValue.join('-');
  }
  let title = slugValue.toString().replace(/-/g, ' ');
  title = title.replace(/pa /g, '');
  title = title
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return title;
};

const isDesktop = ref(false);
const categoryTitle = computed(() => formatSlug(slug));

// Get SEO content for this category
const categoryContent = getCategoryContent(slug);

// Get product count first
// Using a default value if countResult.data.value or products or found is undefined
const countResult = await useAsyncGql('getProductsTotal', {slug});
const getCount = slug === 'clearance-items' ? 255 : countResult.data.value?.products?.found || 150; // Default to 150 if not found
const productCount = ref(getCount);

// Use Nuxt's useAsyncData with proper caching options
const {data, pending, error, refresh} = await useAsyncData(
  cacheKey,
  async () => {
    console.log(`🔄 Fetching products for category: ${slug}`);

    // Use the base GqlGetProducts query
    const result = await GqlGetProducts({
      slug,
      first: slug === 'clearance-items' ? 255 : productCount.value,
    });

    console.log(`✅ Fetched ${result?.products?.nodes?.length || 0} products for ${slug}`);

    if (result?.products?.nodes?.length > 0) {
      console.log('📋 First product structure:', {
        name: result.products.nodes[0].name,
        keys: Object.keys(result.products.nodes[0]),
        hasTerms: 'terms' in result.products.nodes[0],
      });
    }

    return result;
  },
  {
    // Caching options per Nuxt docs
    server: true, // Enable server-side caching
    lazy: false, // Start fetching immediately
    immediate: true, // Don't wait for onMounted
    watch: [], // Don't watch reactive dependencies for re-running the asyncData fetcher

    // Transform data for our needs
    transform: (result: any) => {
      // Added type for result
      return result; // Return as-is, but you could transform here if needed
    },

    // CRITICAL: Check for cached data explicitly
    getCachedData: (key: string) => {
      // Added type for key
      console.log(`🔍 Checking for cached data with key: ${key}`);

      // Check in payload first (client-side navigation)
      const payloadData = nuxtApp.payload?.data?.[key];
      if (payloadData) {
        console.log(`💰 Found cached data in payload for ${key}`);
        return payloadData;
      }

      // Check in static data (if using SSG/prerendering)
      const staticData = nuxtApp.static?.data?.[key];
      if (staticData) {
        console.log(`📘 Found cached data in static data for ${key}`);
        return staticData;
      }

      console.log(`❌ No cached data found for ${key}`);
      return undefined;
    },
  },
);

// Products storage for UI
const productsInCategory = computed(() => data.value?.products?.nodes || []);

// Set products when data becomes available from useAsyncData
watch(
  () => productsInCategory.value,
  (products) => {
    if (products && products.length > 0) {
      console.log(`📦 Setting ${products.length} products for display from initial fetch`);
      setProducts(products); // This sets the base list of products for the category
    }
  },
  {immediate: true},
);

// Apply comprehensive SEO for category
watch(
  () => [productsInCategory.value, productCount.value],
  async ([products, count]) => {
    if (products && products.length > 0 && count > 0) {
      await setCategorySEO({
        slug,
        name: categoryTitle.value,
        description: categoryContent?.topDescription,
        products: products.map((p: any) => ({
          name: p.name,
          slug: p.slug,
          image: p.image,
          regularPrice: p.regularPrice,
          salePrice: p.salePrice,
          onSale: p.onSale,
          averageRating: p.averageRating,
          reviewCount: p.reviewCount,
        })),
        totalProducts: count,
        locale: 'en-CA',
      });
    }
  },
  {immediate: true},
);

// Watch for filter changes in the URL query parameters
watch(
  () => route.query,
  () => {
    console.log('[Category Page] route.query changed, updating product list with filters');
    updateProductList(); // Update filtered product list when query params change
  },
);

// When the component mounts
onMounted(() => {
  // The following line might still apply initial filters/sorting if query params are present on load.
  // However, it will not reactively update to new search terms after the page has loaded
  // because the watcher above is disabled.
  if (!isQueryEmpty.value) {
    // isQueryEmpty likely checks for any query params
    console.log('[Category Page] onMounted: Query is not empty, calling updateProductList for initial filters/sort.');
    updateProductList(); // This will apply filters/sorting based on URL params at load time.
    // If search terms are part of these initial params, they might be applied once.
  } else {
    console.log('[Category Page] onMounted: Query is empty, no initial updateProductList call based on query.');
  }

  // Check viewport for desktop state
  isDesktop.value = window.innerWidth >= 768;
  window.addEventListener('resize', handleResize);

  // Log cache status for debugging
  console.log(`[Category Page] Mount: Cache status: ${pending.value ? 'pending' : error.value ? 'error' : 'ready'}`);
  console.log(`[Category Page] Mount: Found ${productsInCategory.value.length} products initially.`);
});

function handleResize() {
  isDesktop.value = window.innerWidth >= 768;
}

// Clean up
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// Note: SEO meta tags are now handled by setCategorySEO composable
// which applies Canadian SEO, structured data, and comprehensive meta tags
</script>

<template>
  <div>
    <div v-if="pending" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading products...</p>
      </div>
    </div>

    <div v-else-if="error" class="container my-12 text-center">
      <div class="text-red-500 mb-4">
        {{ error.message || 'Failed to load products' }}
      </div>
      <button @click="refresh" class="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-primary-dark">Try Again</button>
    </div>

    <div v-else-if="productsInCategory.length > 0" class="container pt-4 md:pt-8 pb-4 md:pb-8">
      <!-- SEO-Optimized Category Header Content (Above fold) - NO BENEFITS -->
      <CategoryContent v-if="categoryContent" :top-description="categoryContent.topDescription" :subcategories="categoryContent.subcategories" class="mb-8" />

      <div class="flex flex-col md:flex-row items-start md:gap-8">
        <div v-if="storeSettings.showFilters === true" class="w-full md:w-64 flex-shrink-0 md:mr-8">
          <Filters :hide-categories="true" />
        </div>

        <div class="flex-1 w-full">
          <div class="flex flex-row items-center justify-between mb-4">
            <div>
              <h1 class="text-2xl md:text-3xl font-bold text-gray-900 font-system tracking-tight">
                {{ categoryTitle }}
              </h1>
              <p class="text-sm text-gray-600 mt-1">{{ productCount }} products available in Canada</p>
            </div>

            <div class="flex items-center ml-auto">
              <OrderByDropdown v-if="storeSettings.showOrderByDropdown === true" class="ml-auto" />
              <ShowFilterTrigger v-if="storeSettings.showFilters && !isDesktop" class="md:hidden ml-2" />
            </div>
          </div>

          <div class="flex items-center mt-1 mb-4">
            <ProductResultCount />
          </div>

          <ProductGrid :count="productCount" :slug="slug" />
        </div>
      </div>

      <!-- Benefits Section (After Products) -->
      <CategoryContent v-if="categoryContent" :benefits="categoryContent.benefits" class="mt-12" />

      <!-- SEO-Optimized Category Bottom Content (Below fold) -->
      <CategoryContent
        v-if="categoryContent"
        :bottom-description="categoryContent.bottomDescription"
        :faqs="categoryContent.faqs"
        :buying-guide="categoryContent.buyingGuide"
        class="mt-12" />
    </div>

    <div v-else class="container py-8 text-center">
      <p>No products found in this category.</p>
    </div>
  </div>
</template>

<style scoped>
.font-system {
  font-family: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
}

@media (max-width: 768px) {
  .text-3xl {
    font-size: 1.5rem; /* 24px */
    line-height: 2rem; /* 32px */
  }
}
</style>
