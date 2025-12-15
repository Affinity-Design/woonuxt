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

// Get the GQL host for direct $fetch calls (avoids composable context issues in async loops)
const runtimeConfig = useRuntimeConfig();
const GQL_HOST = runtimeConfig.public.GQL_HOST || process.env.GQL_HOST;

// GraphQL query for batched fetching (must include fragments inline for $fetch)
const PRODUCTS_PAGED_QUERY = `
query getProductsPaged($after: String, $slug: [String], $first: Int) {
  products(
    first: $first
    after: $after
    where: {categoryIn: $slug, visibility: VISIBLE, minPrice: 0, orderby: {field: DATE, order: DESC}, status: "publish"}
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
      ... on SimpleProduct {
        name
        slug
        price
        rawPrice: price(format: RAW)
        date
        regularPrice
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        stockStatus
        stockQuantity
        lowStockAmount
        averageRating
        weight
        length
        width
        height
        reviewCount
        onSale
        virtual
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
        galleryImages(first: 20) {
          nodes {
            sourceUrl
            altText
            title
            databaseId
          }
        }
      }
      ... on VariableProduct {
        name
        slug
        price
        rawPrice: price(format: RAW)
        date
        regularPrice
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        stockStatus
        stockQuantity
        lowStockAmount
        averageRating
        weight
        length
        width
        height
        reviewCount
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
        galleryImages(first: 20) {
          nodes {
            sourceUrl
            altText
            title
            databaseId
          }
        }
        variations(first: 50) {
          nodes {
            name
            databaseId
            price
            regularPrice
            salePrice
            slug
            stockQuantity
            stockStatus
            hasAttributes
            image {
              sourceUrl
              altText
              title
              cartSourceUrl: sourceUrl(size: THUMBNAIL)
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

// Get SEO content for this category
const categoryContent = getCategoryContent(slug);

// Get product count first using direct $fetch (consistent with batch fetching)
const COUNT_QUERY = `
query getProductsTotal($slug: [String]) {
  products(where: { categoryIn: $slug, visibility: VISIBLE, minPrice: 0, status: "publish" }) {
    found
  }
}
`;

let productCountValue = 150; // Default fallback
try {
  const countResponse: any = await $fetch(GQL_HOST as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      query: COUNT_QUERY,
      variables: {
        slug: [slug], // GraphQL expects [String] array
      },
    },
  });

  if (countResponse?.errors) {
    console.error(`⚠️ Count query errors:`, countResponse.errors);
  }

  productCountValue = countResponse?.data?.products?.found || 150;
  console.log(`📊 Category "${slug}" - Total count from GraphQL: ${productCountValue}`);
} catch (err) {
  console.error(`❌ Error fetching product count for ${slug}:`, err);
}

const productCount = ref(productCountValue);

// Reactive state for progressive loading
const allLoadedProducts = ref<any[]>([]);
const isLoadingProducts = ref(true);
const loadingProgress = ref(0);
const loadError = ref<Error | null>(null);

// Function to fetch all products in batches using direct $fetch (avoids composable context issues)
async function fetchAllProductsInBatches() {
  console.log(`🔄 Fetching products for category: ${slug}`);
  console.log(`🎯 Target count: ${productCount.value}`);

  const targetCount = productCount.value;
  const batchSize = 100;
  let allNodes: any[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let totalFetched = 0;

  isLoadingProducts.value = true;
  loadError.value = null;

  // Fetch in batches to avoid server limits/timeouts
  while (hasNextPage && totalFetched < targetCount) {
    const fetchSize = Math.min(batchSize, targetCount - totalFetched);

    // Don't fetch 0
    if (fetchSize <= 0) break;

    console.log(`📦 Fetching batch: size=${fetchSize}, cursor=${cursor || 'start'}, total so far: ${totalFetched}`);

    try {
      // Use $fetch directly to avoid Nuxt composable context issues in async loops
      // This preserves caching since useAsyncData wraps this entire function
      const response: any = await $fetch(GQL_HOST as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          query: PRODUCTS_PAGED_QUERY,
          variables: {
            slug: [slug], // GraphQL expects [String] array
            first: fetchSize,
            after: cursor,
          },
        },
      });

      // Check for GraphQL errors
      if (response?.errors) {
        console.error(`⚠️ GraphQL errors:`, response.errors);
      }

      const result = response?.data;
      const nodes = result?.products?.nodes || [];
      if (nodes.length === 0) {
        console.log(`📭 No more products returned, stopping`);
        break;
      }

      allNodes = [...allNodes, ...nodes];
      totalFetched += nodes.length;

      // Update progress for UI feedback
      loadingProgress.value = Math.round((totalFetched / targetCount) * 100);

      // IMPORTANT: Update the reactive ref after each batch so UI can react
      allLoadedProducts.value = [...allNodes];

      // Also update the products store progressively
      setProducts([...allNodes]);

      const pageInfo = result?.products?.pageInfo;
      hasNextPage = pageInfo?.hasNextPage === true;
      cursor = pageInfo?.endCursor || null;

      console.log(`✅ Batch complete: fetched ${nodes.length}, total now ${totalFetched}, hasNextPage: ${hasNextPage}`);
    } catch (err) {
      console.error(`❌ Error fetching batch for ${slug}:`, err);
      loadError.value = err as Error;
      break; // Stop on error, return what we have
    }
  }

  console.log(`🏁 Finished fetching: total ${allNodes.length} products for ${slug}`);
  isLoadingProducts.value = false;

  return allNodes;
}

// Start fetching on component setup
const {data, pending, error, refresh, status} = await useAsyncData(
  cacheKey,
  async () => {
    const products = await fetchAllProductsInBatches();
    return {
      products: {
        found: productCount.value,
        nodes: products,
      },
    };
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

      // Helper to validate cached data has enough products
      const isValidCache = (cachedData: any) => {
        const cachedCount = cachedData?.products?.nodes?.length || 0;
        const expectedCount = productCount.value;
        // If we expect more than 100 products but cache only has ~100, it's stale
        if (expectedCount > 150 && cachedCount < expectedCount * 0.9) {
          console.log(`⚠️ Stale cache detected: has ${cachedCount} but expected ~${expectedCount}`);
          return false;
        }
        return cachedCount > 0;
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

  // Fallback to the initial productCount ref
  return productCount.value;
});

// Set products when data becomes available from useAsyncData
watch(
  () => productsInCategory.value,
  (products) => {
    if (products && products.length > 0) {
      console.log(`📦 Setting ${products.length} products for display from initial fetch`);
      setProducts(products); // This sets the base list of products for the category

      // Update productCount if we got more products than expected (from cache)
      if (products.length > productCount.value) {
        productCount.value = products.length;
      }
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
    <!-- Loading State: Show when pending or when error with no data yet -->
    <div v-if="(pending || isLoadingProducts) && productsInCategory.length === 0" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading products...</p>
        <p v-if="loadingProgress > 0 && loadingProgress < 100" class="mt-2 text-sm text-gray-400">
          {{ loadingProgress }}% loaded ({{ allLoadedProducts.length }} of {{ productCount }} products)
        </p>
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
