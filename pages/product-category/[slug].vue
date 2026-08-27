<script lang="ts" setup>
import {defineAsyncComponent, ref, computed, watch, onMounted, onUnmounted} from 'vue';
const PulseLoader = defineAsyncComponent(() => import('vue-spinner/src/PulseLoader.vue'));

// Core composables
const {products: visibleProducts, setProducts, updateProductList} = useProducts();
const {isQueryEmpty, productsPerPage} = useHelpers();
const {isFiltersActive, filterProducts} = useFiltering();
const {isSortingActive, sortProducts} = useSorting();
const {storeSettings} = useAppConfig();
const route = useRoute();
const nuxtApp = useNuxtApp();

// SEO composables
const {setCategorySEO} = useCategorySEO();

// Resolve an endpoint for direct $fetch calls. GQL_HOST is not guaranteed to be
// available to the deployed Worker at runtime, while wpBaseUrl is public runtime
// configuration and always points at the WordPress origin.
const runtimeConfig = useRuntimeConfig();
const wordpressBaseUrl = String(runtimeConfig.public.wpBaseUrl || 'https://proskatersplace.com').replace(/\/$/, '');
const graphQlEndpoint = (runtimeConfig.public as {GQL_HOST?: string}).GQL_HOST || process.env.GQL_HOST || `${wordpressBaseUrl}/graphql`;

// GraphQL query for batched fetching (must include fragments inline for $fetch)
const PRODUCTS_PAGED_QUERY = `
query getProductsPaged($after: String, $slug: [String], $first: Int, $includeVariations: Boolean!) {
  products(
    first: $first
    after: $after
    where: {categoryIn: $slug, visibility: VISIBLE, minPrice: 0, orderby: {field: DATE, order: DESC}, status: "publish", typeIn: [SIMPLE, VARIABLE]}
  ) {
    found
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      name
      slug
      type
      databaseId
      id
      averageRating
      reviewCount
      productCategories(first: 100) {
        nodes {
          slug
        }
      }
      ... on SimpleProduct {
        price
        rawPrice: price(format: RAW)
        date
        regularPrice
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        onSale
        attributes {
          nodes {
            ... on GlobalProductAttribute {
              name
              slug
              options
            }
          }
        }
        image {
          sourceUrl
          altText
          title
          cartSourceUrl: sourceUrl(size: THUMBNAIL)
          producCardSourceUrl: sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
        }
      }
      ... on VariableProduct {
        price
        rawPrice: price(format: RAW)
        date
        regularPrice
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        onSale
        attributes {
          nodes {
            ... on GlobalProductAttribute {
              name
              slug
              options
            }
          }
        }
        image {
          sourceUrl
          altText
          title
          cartSourceUrl: sourceUrl(size: THUMBNAIL)
          producCardSourceUrl: sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
        }
        variations(first: 50) @include(if: $includeVariations) {
          nodes {
            slug
            image {
              sourceUrl
              altText
              title
              cartSourceUrl: sourceUrl(size: THUMBNAIL)
              producCardSourceUrl: sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
            }
            attributes {
              nodes {
                name
                value
              }
            }
          }
        }
      }
    }
  }
}
`;

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

// Direct requests to paginated category URLs must render enough products for
// that page. Page one is intentionally limited to one product grid so the
// initial HTML does not serialize the entire catalogue before mobile LCP.
const requestedPage = computed(() => {
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const pageNumber = parseInt(String(rawPage ?? ''), 10);
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
});
const initialProductTarget = computed(() => requestedPage.value * productsPerPage);
const hasActiveColourFilter = computed(() => String(route.query.filter || '').includes('pa_color['));

// Get SEO content for this category
const categoryContent = getCategoryContent(slug);
const productCount = ref(0);

// Reactive state for progressive loading
const isLoadingProducts = ref(true);
const loadError = ref<Error | null>(null);
let backgroundCatalogueController: AbortController | null = null;
let backgroundLoadIdleCallback: number | null = null;
const completeCatalogueHasVariationImages = ref(false);

interface CategoryProductBatch {
  found: number;
  nodes: Product[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

async function fetchProductBatch(first: number, after: string | null, includeVariations: boolean, signal?: AbortSignal): Promise<CategoryProductBatch> {
  const response: any = await $fetch(graphQlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      query: PRODUCTS_PAGED_QUERY,
      variables: {
        slug: [slug],
        first,
        after,
        includeVariations,
      },
    },
    signal,
  });

  if (response?.errors) {
    throw new Error(`GraphQL errors while loading ${slug}: ${JSON.stringify(response.errors)}`);
  }

  const products = response?.data?.products;
  return {
    found: Number(products?.found || 0),
    nodes: products?.nodes || [],
    pageInfo: {
      hasNextPage: products?.pageInfo?.hasNextPage === true,
      endCursor: products?.pageInfo?.endCursor || null,
    },
  };
}

async function fetchProductsUntil(targetCount: number, includeVariations: boolean, signal?: AbortSignal): Promise<CategoryProductBatch> {
  const loadedProducts: Product[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let found = 0;

  while (hasNextPage && loadedProducts.length < targetCount) {
    const fetchSize = Math.min(100, targetCount - loadedProducts.length);
    if (fetchSize <= 0) break;

    const batch = await fetchProductBatch(fetchSize, cursor, includeVariations, signal);
    found = batch.found || found;
    loadedProducts.push(...batch.nodes);
    hasNextPage = batch.pageInfo.hasNextPage;
    cursor = batch.pageInfo.endCursor;

    if (batch.nodes.length === 0) break;
  }

  return {
    found: found || loadedProducts.length,
    nodes: loadedProducts,
    pageInfo: {hasNextPage, endCursor: cursor},
  };
}

// Render only the products needed for the requested page. The complete product
// set is loaded after first paint so filters keep their existing client-side
// behaviour without holding back the category heading and introductory copy.
const {data, pending, error, refresh, status} = await useAsyncData(
  cacheKey,
  async () => {
    isLoadingProducts.value = true;
    loadError.value = null;

    try {
      const products = await fetchProductsUntil(initialProductTarget.value, hasActiveColourFilter.value);
      return {products};
    } catch (fetchError) {
      loadError.value = fetchError as Error;
      throw fetchError;
    } finally {
      isLoadingProducts.value = false;
    }
  },
  {
    // Caching options per Nuxt docs
    server: true, // Enable server-side caching
    lazy: false, // IMPORTANT: Wait for ALL batches to complete before rendering
    immediate: true, // Start fetching immediately
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

      const isValidCache = (cachedData: any) => {
        const cachedCount = cachedData?.products?.nodes?.length || 0;
        const totalCount = cachedData?.products?.found || cachedCount;
        const requiredCount = Math.min(initialProductTarget.value, totalCount);
        return cachedCount >= requiredCount && requiredCount > 0;
      };

      // Check in payload first (client-side navigation)
      const payloadData = nuxtApp.payload?.data?.[key];
      if (payloadData && isValidCache(payloadData)) {
        console.log(`💰 Found valid cached data in payload for ${key} (${payloadData?.products?.nodes?.length} products)`);
        return payloadData;
      }

      // Check in static data (if using SSG/prerendering)
      const staticData = nuxtApp.static?.data?.[key];
      if (staticData && isValidCache(staticData)) {
        console.log(`📘 Found valid cached data in static data for ${key} (${staticData?.products?.nodes?.length} products)`);
        return staticData;
      }

      console.log(`❌ No valid cached data found for ${key}, will fetch fresh`);
      return undefined;
    },
  },
);

// Products storage for UI
const productsInCategory = computed(() => data.value?.products?.nodes || []);

// Display count - use the actual count from data (which includes cached data count)
const displayProductCount = computed(() => {
  // First priority: use the 'found' count from the data (set during fetch)
  const foundCount = data.value?.products?.found;
  if (foundCount && foundCount > 0) return foundCount;

  // Second priority: use the actual number of products loaded
  const loadedCount = productsInCategory.value?.length;
  if (loadedCount && loadedCount > 0) return loadedCount;

  return productCount.value || loadedCount || 0;
});

// Set products when data becomes available from useAsyncData
watch(
  () => data.value?.products,
  (categoryProducts) => {
    const products = categoryProducts?.nodes || [];
    if (products && products.length > 0) {
      console.log(`📦 Setting ${products.length} products for display from initial fetch`);
      setProducts(products);
      productCount.value = categoryProducts?.found || products.length;
      if (!categoryProducts?.pageInfo?.hasNextPage && hasActiveColourFilter.value) {
        completeCatalogueHasVariationImages.value = true;
      }
    }
  },
  {immediate: true},
);

// Current page from the URL, so paginated views self-canonicalize and get their
// own title instead of duplicating page 1 (2026-07-23 audit).
const seoCurrentPage = requestedPage;

async function loadCompleteCatalogueForFilters(includeVariationImages = false) {
  const initialProducts = data.value?.products;
  if (!initialProducts) return;

  const needsRemainingProducts = initialProducts.pageInfo?.hasNextPage === true;
  const needsVariationImageRefresh = includeVariationImages && !completeCatalogueHasVariationImages.value;
  if (!needsRemainingProducts && !needsVariationImageRefresh) return;

  backgroundCatalogueController?.abort();
  backgroundCatalogueController = new AbortController();

  try {
    // Re-fetch from the beginning so filtering has the complete catalogue.
    // Variation images are included only when a colour filter needs them, so
    // they do not belong in the normal server-rendered page-one payload.
    const completeCatalogue = await fetchProductsUntil(initialProducts.found, includeVariationImages, backgroundCatalogueController.signal);
    setProducts(completeCatalogue.nodes);
    completeCatalogueHasVariationImages.value = includeVariationImages;

    // A shopper can select a filter while the background request is running.
    // Reapply the current view without calling updateProductList(), which would
    // unexpectedly scroll the page back to the top.
    let productsForCurrentView = [...completeCatalogue.nodes];
    if (isFiltersActive.value) productsForCurrentView = filterProducts(productsForCurrentView);
    if (isSortingActive.value) productsForCurrentView = sortProducts(productsForCurrentView);
    visibleProducts.value = productsForCurrentView;
  } catch (backgroundError) {
    if ((backgroundError as Error)?.name !== 'AbortError') {
      console.error(`[Category Page] Could not finish background catalogue load for ${slug}:`, backgroundError);
    }
  }
}

function scheduleCompleteCatalogueLoad() {
  if (!data.value?.products?.pageInfo?.hasNextPage) return;

  if ('requestIdleCallback' in window) {
    backgroundLoadIdleCallback = window.requestIdleCallback(() => void loadCompleteCatalogueForFilters(hasActiveColourFilter.value), {timeout: 2500});
    return;
  }

  window.setTimeout(() => void loadCompleteCatalogueForFilters(hasActiveColourFilter.value), 0);
}

// Apply comprehensive SEO for category
watch(
  () => [productsInCategory.value, productCount.value, seoCurrentPage.value],
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
        currentPage: seoCurrentPage.value,
        totalPages: Math.max(1, Math.ceil((count as number) / productsPerPage)),
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

    // Variation images are only requested when a colour filter needs them.
    // This keeps the normal category payload small without removing the
    // existing colour-specific product-card image behaviour.
    if (hasActiveColourFilter.value && !completeCatalogueHasVariationImages.value) {
      void loadCompleteCatalogueForFilters(true);
    }
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
  scheduleCompleteCatalogueLoad();
});

function handleResize() {
  isDesktop.value = window.innerWidth >= 768;
}

// Clean up
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (backgroundLoadIdleCallback !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(backgroundLoadIdleCallback);
  }
  backgroundCatalogueController?.abort();
});

// Note: SEO meta tags are now handled by setCategorySEO composable
// which applies Canadian SEO, structured data, and comprehensive meta tags
</script>

<template>
  <div>
    <!-- Loading State: Show when pending or when error with no data yet -->
    <div v-if="(pending || isLoadingProducts) && productsInCategory.length === 0" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading products...</p>
      </div>
    </div>

    <!-- Error State: Only show if error AND no products AND not pending -->
    <div v-else-if="(error || loadError) && productsInCategory.length === 0 && !pending" class="container my-12 text-center">
      <div class="text-red-500 mb-4">
        {{ error?.message || loadError?.message || 'Failed to load products' }}
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
              <p class="text-sm text-gray-600 mt-1">{{ displayProductCount }} products available in Canada</p>
            </div>

            <div class="flex items-center ml-auto">
              <OrderByDropdown v-if="storeSettings.showOrderByDropdown === true" class="ml-auto" />
              <ShowFilterTrigger v-if="storeSettings.showFilters && !isDesktop" class="md:hidden ml-2" />
            </div>
          </div>

          <div class="flex items-center mt-1 mb-4">
            <ProductResultCount />
          </div>

          <ProductGrid :count="displayProductCount" :slug="slug" />
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

      <!-- All Categories List -->
      <AllCategories class="mt-12 border-t pt-12" />
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
