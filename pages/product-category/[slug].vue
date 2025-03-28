<script setup lang="ts">
// Top level composables
const route = useRoute();
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const { storeSettings } = useAppConfig();
const { isQueryEmpty } = useHelpers();

// Slug from route params
const slug = route.params.slug;

// Initialize base products data
const products = ref([]);
const categoryName = computed(() => {
  return typeof slug === "string" ? slug.replace(/-/g, " ") : "";
});

// Direct API call instead of nested composables
const {
  data: categoryData,
  pending,
  error,
  refresh,
} = await useAsyncData(
  `category-${slug}`,
  async () => {
    try {
      const { data } = await useAsyncGql("getProducts", { slug });
      return {
        products: data.value?.products?.nodes || [],
        categoryName: typeof slug === "string" ? slug.replace(/-/g, " ") : "",
        hasProducts: Boolean(data.value?.products?.nodes?.length),
      };
    } catch (err) {
      console.error("Error fetching category data:", err);
      return {
        products: [],
        categoryName: typeof slug === "string" ? slug.replace(/-/g, " ") : "",
        hasProducts: false,
        error: err.message || "Failed to fetch category data",
      };
    }
  },
  {
    server: true,
    watch: [() => route.params.slug],
    default: () => ({
      products: [],
      categoryName: typeof slug === "string" ? slug.replace(/-/g, " ") : "",
      hasProducts: false,
    }),
  }
);

// Get the products functions we need
const { setProducts, updateProductList } = useProducts();

// Update products when data changes
watch(
  categoryData,
  (newData) => {
    if (newData?.products?.length) {
      products.value = newData.products;
      setProducts(newData.products);
      isLoading.value = false;
    } else if (!pending.value) {
      isLoading.value = false;
    }
  },
  { immediate: true }
);

// Handle errors
watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError.message || "Failed to load category products";
    isLoading.value = false;
  }
});

// Apply filters on client-side only
onMounted(() => {
  if (!isQueryEmpty.value && products.value?.length) {
    updateProductList();
  }
});

// Retry loading functionality
function retryLoading() {
  isLoading.value = true;
  errorMessage.value = null;
  refresh();
}

// Set page metadata
const pageTitle = computed(() => `${categoryName.value} - Products`);

const pageDescription = computed(
  () => `Browse our selection of ${categoryName.value} products.`
);

// Get origin for canonical URL
const origin = process.server
  ? useRequestURL().origin
  : typeof window !== "undefined"
    ? window.location.origin
    : "";

const canonicalUrl = computed(() => `${origin}/product-category/${slug}`);

// Set page metadata
useHead({
  title: pageTitle,
  meta: [
    {
      name: "description",
      content: pageDescription,
    },
  ],
  link: [
    {
      rel: "canonical",
      href: canonicalUrl,
    },
  ],
});
</script>

<template>
  <div>
    <!-- Header for category -->
    <div class="container mt-8 mb-4">
      <h1 class="text-2xl font-semibold capitalize">
        {{ categoryName }}
      </h1>
    </div>

    <!-- Use v-if/v-else-if/v-else pattern correctly -->
    <div v-if="pending || isLoading" class="container py-12">
      <ClientOnly>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="i in 8"
            :key="i"
            class="bg-gray-100 rounded-lg h-80 animate-pulse"
          ></div>
        </div>
      </ClientOnly>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMessage || error" class="container py-12 text-center">
      <p class="text-red-600 mb-4">
        {{ errorMessage || "There was an error loading products." }}
      </p>
      <button
        @click="retryLoading"
        class="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
      >
        Retry
      </button>
    </div>

    <!-- Products found - check products array safely -->
    <div
      v-else-if="products && products.length > 0"
      class="container flex flex-col md:flex-row items-start gap-8 md:gap-16"
    >
      <!-- Filters - Client-side only to prevent hydration issues -->
      <ClientOnly>
        <Filters
          v-if="storeSettings.showFilters"
          class="md:w-64 w-full"
          :hide-categories="true"
        />
      </ClientOnly>

      <!-- Products section -->
      <div class="flex-1 w-full">
        <!-- Controls row -->
        <div class="flex items-center justify-between w-full gap-4 mb-6">
          <ClientOnly>
            <ProductResultCount />
            <OrderByDropdown
              v-if="storeSettings.showOrderByDropdown"
              class="hidden md:inline-flex"
            />
            <ShowFilterTrigger
              v-if="storeSettings.showFilters"
              class="md:hidden"
            />
          </ClientOnly>
        </div>

        <!-- Product grid -->
        <ClientOnly>
          <ProductGrid />
          <template #fallback>
            <!-- Static grid for initial render/SEO -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div
                v-for="product in products.slice(0, 8) || []"
                :key="product.id"
                class="border rounded-lg p-4 bg-white"
              >
                <NuxtLink :to="`/product/${product.slug}`">
                  <div class="aspect-square bg-gray-100 rounded-md mb-3">
                    <NuxtImg
                      v-if="product.image?.sourceUrl"
                      :src="product.image.sourceUrl"
                      :alt="product.name"
                      :title="product.name"
                      loading="lazy"
                      class="w-full h-full object-contain"
                    />
                  </div>
                  <h3 class="text-sm font-medium line-clamp-2">
                    {{ product.name }}
                  </h3>
                  <div class="mt-2">
                    <ProductPrice
                      :regular-price="product.regularPrice"
                      :sale-price="product.salePrice"
                    />
                  </div>
                </NuxtLink>
              </div>
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- No products found -->
    <NoProductsFound v-else class="container py-12">
      No products found in this category.
      <button @click="retryLoading" class="mt-4 text-primary underline">
        Refresh
      </button>
    </NoProductsFound>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
