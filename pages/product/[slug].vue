<script lang="ts" setup>
import { StockStatusEnum, ProductTypesEnum, type AddToCartInput } from "#woo";

// Core setup and imports
const route = useRoute();
const { storeSettings } = useAppConfig();
const { arraysEqual, formatArray, checkForVariationTypeOfAny } = useHelpers();
const { addToCart, isUpdatingCart } = useCart();
const { t } = useI18n();
const slug = route.params.slug as string;

console.log(`🔄 Starting to fetch product data for slug: ${slug}`);

// Use Nuxt's built-in caching mechanism
const {
  data: productData,
  pending,
  error,
  refresh,
} = await useAsyncData(
  `product-${slug}`,
  async () => {
    // Check Nuxt's payload cache first
    const nuxtApp = useNuxtApp();
    const cachedPayload = nuxtApp.payload?.data?.[`product-${slug}`];

    if (cachedPayload) {
      console.log("📦 Using payload cached data!");
      return cachedPayload;
    }

    console.log("🔄 No cache found, fetching from GraphQL");

    // Fallback to GraphQL query
    const { data } = await useAsyncGql("getProduct", { slug });

    if (!data.value?.product) {
      throw new Error(t("messages.shop.productNotFound"));
    }

    return data.value.product;
  },
  {
    getCachedData: (key) => {
      // Check for existing data before making any request
      console.log(`🔍 Checking for cached data with key: ${key}`);
      const nuxtApp = useNuxtApp();
      const existingData = nuxtApp.payload?.data?.[key];
      if (existingData) {
        console.log("💰 Found cached data in payload!");
      }
      return existingData;
    },
  }
);

// Log caching status
onMounted(() => {
  if (!pending.value && productData.value) {
    console.log(
      `🚀 Product rendered from ${process.client ? "client" : "server"} side`
    );
    console.log(`🏆 Product name: ${productData.value.name}`);
    console.log(`💾 Using cached data: ${!pending.value && !error.value}`);
  }
});

// Handle navigation/loading states
const product = computed(() => {
  if (productData.value) {
    console.log(
      `📦 Product data available for component: ${productData.value.name}`
    );
    return productData.value;
  }
  console.log(`⏳ Product data not yet available`);
  return null;
});

const quantity = ref<number>(1);
const activeVariation = ref<Variation | null>(null);
const variation = ref<VariationAttribute[]>([]);
const forceTreatAsSimple = ref(false);
const selectedAttributes = ref([]);

// Product type computing
const indexOfTypeAny = computed<number[]>(() =>
  product.value ? checkForVariationTypeOfAny(product.value) : []
);
const attrValues = ref();
const isSimpleProduct = computed<boolean>(
  () => product.value?.type === ProductTypesEnum.SIMPLE
);
const isVariableProduct = computed<boolean>(
  () => product.value?.type === ProductTypesEnum.VARIABLE
);
const isExternalProduct = computed<boolean>(
  () => product.value?.type === ProductTypesEnum.EXTERNAL
);
const type = computed(() => activeVariation.value || product.value);

// Selection and product helpers
const selectProductInput = computed<any>(() => {
  const input = {
    productId: type.value?.databaseId,
    quantity: quantity.value,
  };
  if (activeVariation.value) {
    input.variationId = activeVariation.value.databaseId;
  }
  return input;
});

// Stock status computing
const stockStatus = computed(() => {
  if (isVariableProduct.value && activeVariation.value) {
    return activeVariation.value.stockStatus || StockStatusEnum.OUT_OF_STOCK;
  }
  return (
    product.value?.stockStatus ||
    type.value?.stockStatus ||
    StockStatusEnum.OUT_OF_STOCK
  );
});

const isOutOfStock = (status) => {
  if (!status) return true;
  const normalizedStatus = status.toLowerCase().replace(/[\s_-]/g, "");
  const normalizedEnum = StockStatusEnum.OUT_OF_STOCK.toLowerCase().replace(
    /[\s_-]/g,
    ""
  );
  return (
    normalizedStatus === normalizedEnum ||
    normalizedStatus.includes(normalizedEnum) ||
    normalizedEnum.includes(normalizedStatus)
  );
};

const disabledAddToCart = computed(() => {
  if (forceTreatAsSimple.value && !isOutOfStock(stockStatus.value)) {
    return isUpdatingCart.value;
  }
  if (isVariableProduct.value) {
    return (
      !type.value ||
      isOutOfStock(stockStatus.value) ||
      (!forceTreatAsSimple.value && !activeVariation.value) ||
      isUpdatingCart.value
    );
  }
  return !type.value || isOutOfStock(stockStatus.value) || isUpdatingCart.value;
});

// Update variations function
const updateSelectedVariations = (variations) => {
  if (!product.value?.variations || !variations || variations.length === 0)
    return;

  attrValues.value = variations.map((el) => {
    return {
      attributeName: getExactAttributeName(el.name),
      attributeValue: el.value,
    };
  });

  try {
    let matchingVariation = null;
    if (product.value.variations?.nodes) {
      for (const variation of product.value.variations.nodes) {
        if (!variation.attributes || !variation.attributes.nodes) continue;
        const allAttributesMatch = variations.every((selectedAttr) => {
          const matchingAttr = variation.attributes.nodes.find((varAttr) => {
            const selectedName = selectedAttr.name.toLowerCase();
            const varName = (varAttr.name || "").toLowerCase();
            return (
              selectedName === varName ||
              `pa_${selectedName}` === varName ||
              selectedName === varName.replace("pa_", "")
            );
          });
          if (!matchingAttr) return false;
          const isSizeAttribute =
            selectedAttr.name.toLowerCase().includes("size") ||
            matchingAttr.name.toLowerCase().includes("size");
          if (isSizeAttribute) {
            return matchSizeValues(selectedAttr.value, matchingAttr.value);
          }
          return selectedAttr.value === matchingAttr.value;
        });
        if (allAttributesMatch) {
          matchingVariation = variation;
          break;
        }
      }
    }
    activeVariation.value = matchingVariation;
    variation.value = variations;
  } catch (error) {
    console.error("Error in updateSelectedVariations:", error);
  }
};

// Other helper functions from your original component
const getExactAttributeName = (attributeInput) => {
  if (!product.value?.attributes?.nodes) return attributeInput;
  const matchingAttribute = product.value.attributes.nodes.find((attr) => {
    const inputName = attributeInput.toLowerCase();
    const attrName = (attr.name || "").toLowerCase();
    return (
      inputName === attrName ||
      inputName === attrName.replace("pa_", "") ||
      "pa_" + inputName === attrName
    );
  });
  return matchingAttribute ? matchingAttribute.name : attributeInput;
};

const matchSizeValues = (selectedValue, variationValue) => {
  if (!selectedValue || !variationValue) return false;
  const selected = selectedValue.toLowerCase();
  const variation = variationValue.toLowerCase();
  if (selected === variation) return true;
  const extractSizeNumbers = (val) => {
    const matches = val.match(/\d+(\.\d+)?/g);
    return matches || [];
  };
  const selectedNums = extractSizeNumbers(selected);
  const variationNums = extractSizeNumbers(variation);
  return selectedNums.some(
    (num) =>
      variationNums.includes(num) ||
      variationNums.includes(num.replace(".", ""))
  );
};

const validateForm = () => {
  if (isVariableProduct.value && !activeVariation.value) {
    if (attrValues.value && attrValues.value.length > 0) {
      selectedAttributes.value = [...attrValues.value];
      const confirmMessage =
        t("messages.shop.noMatchingVariation") ||
        "We couldn't find an exact match for your selection. Continue with these options?";
      if (confirm(confirmMessage)) {
        forceTreatAsSimple.value = true;
        return true;
      }
      return false;
    } else {
      alert(
        t("messages.shop.pleaseSelectVariation") ||
          "Please select product options before adding to cart"
      );
      return false;
    }
  }
  return true;
};

// Stock status update functionality
const mergeLiveStockStatus = (payload) => {
  if (!product.value) return;

  console.log(`🔄 Updating stock status for ${product.value.name}`);

  payload.variations?.nodes?.forEach((variation, index) => {
    if (product.value?.variations?.nodes[index]) {
      product.value.variations.nodes[index].stockStatus = variation.stockStatus;
    }
  });

  product.value.stockStatus = payload.stockStatus ?? product.value.stockStatus;
  console.log(`✅ Stock status updated: ${product.value.stockStatus}`);
};

// Check for live stock status after load
onMounted(async () => {
  if (product.value) {
    console.log(`🔄 Checking live stock status for ${product.value.name}`);
    try {
      const { product: stockProduct } = await GqlGetStockStatus({ slug });
      if (stockProduct) {
        mergeLiveStockStatus(stockProduct);
      } else {
        console.log(`⚠️ No stock data received from API`);
      }
    } catch (error) {
      const errorMessage = error?.gqlErrors?.[0]?.message;
      console.error(`❌ Error fetching stock status:`, errorMessage || error);
    }
  } else {
    console.log(`⚠️ Cannot check stock - product data not available`);
  }
});
</script>

<template>
  <div>
    <!-- Show loading state -->
    <div
      v-if="pending"
      class="container flex items-center justify-center min-h-screen"
    >
      <div class="text-center">
        <LoadingIcon size="48" />
        <p class="mt-4 text-gray-500">Loading product...</p>
      </div>
    </div>

    <!-- Show error state -->
    <div v-else-if="error" class="container my-12 text-center">
      <div class="text-red-500 mb-4">
        {{ error.message || t("messages.shop.productLoadError") }}
      </div>
      <button @click="refresh" class="px-4 py-2 bg-primary text-white rounded">
        {{ t("messages.general.retry") }}
      </button>
    </div>

    <!-- Show product content -->
    <main v-else-if="product" class="container relative py-6 xl:max-w-7xl">
      <div v-if="product">
        <!-- <SEOHead :info="product" /> -->
        <Breadcrumb
          :product
          class="mb-6"
          v-if="storeSettings.showBreadcrumbOnSingleProduct"
        />
        <!-- Product Top -->
        <div
          class="flex flex-col gap-10 md:flex-row md:justify-between lg:gap-24"
        >
          <!-- left Col Product -->
          <ProductImageGallery
            v-if="product.image"
            class="relative flex-1"
            :main-image="product.image"
            :gallery="product.galleryImages!"
            :node="type"
            :activeVariation="activeVariation || {}"
          />
          <NuxtImg
            v-else
            class="relative flex-1 skeleton"
            src="/images/placeholder.jpg"
            :alt="product?.name || 'Product'"
          />
          <!-- Right Col Product -->
          <div class="lg:max-w-md xl:max-w-lg md:py-2 w-full">
            <div class="flex justify-between mb-4">
              <div class="flex-1">
                <h1
                  class="flex flex-wrap items-center gap-2 mb-2 text-2xl font-sesmibold"
                >
                  {{ product.name }}
                </h1>
                <StarRating
                  :rating="product.averageRating || 0"
                  :count="product.reviewCount || 0"
                  v-if="storeSettings.showReviews"
                />
              </div>
              <ProductPrice
                class="text-xl"
                v-if="activeVariation"
                :sale-price="activeVariation.salePrice"
                :regular-price="activeVariation.regularPrice"
              />
              <ProductPrice
                v-else
                class="text-xl"
                :sale-price="product.salePrice"
                :regular-price="product.regularPrice"
                :is-variable="isVariableProduct"
                :show-as-range="isVariableProduct && !activeVariation"
              />
            </div>

            <div class="grid gap-2 my-8 text-sm empty:hidden">
              <div v-if="!isExternalProduct" class="flex items-center gap-2">
                <span class="text-gray-400"
                  >{{ $t("messages.shop.availability") }}:
                </span>
                <!-- TODO -->

                <StockStatus
                  :stockStatus="stockStatus"
                  @updated="mergeLiveStockStatus"
                />
              </div>
              <div
                class="flex items-center gap-2"
                v-if="storeSettings.showSKU && product.sku"
              >
                <span class="text-gray-400"
                  >{{ $t("messages.shop.sku") }}:
                </span>
                <span>{{ product.sku || "N/A" }}</span>
              </div>
            </div>

            <div
              class="mb-8 font-light prose"
              v-html="product.shortDescription || product.description"
            />

            <hr />
            <!-- Selectors -->
            <form
              @submit.prevent="validateForm() && addToCart(selectProductInput)"
            >
              <AttributeSelections
                v-if="
                  isVariableProduct && product.attributes && product.variations
                "
                class="mt-4 mb-8"
                :attributes="product.attributes.nodes"
                :defaultAttributes="product.defaultAttributes"
                :variations="product.variations.nodes"
                @attrs-changed="updateSelectedVariations"
              />
              <div
                v-if="isVariableProduct || isSimpleProduct"
                class="fixed bottom-0 left-0 z-10 flex items-center w-full gap-4 p-4 mt-12 bg-white md:static md:bg-transparent bg-opacity-90 md:p-0"
              >
                <input
                  v-model="quantity"
                  type="number"
                  min="1"
                  aria-label="Quantity"
                  class="bg-white border rounded-lg flex text-left p-2.5 w-20 gap-4 items-center justify-center focus:outline-none"
                />
                <AddToCartButton
                  class="flex-1 w-full md:max-w-xs"
                  :disabled="disabledAddToCart"
                  :class="{ loading: isUpdatingCart }"
                />
              </div>
              <a
                v-if="isExternalProduct && product.externalUrl"
                :href="product.externalUrl"
                target="_blank"
                class="rounded-lg flex font-bold bg-gray-800 text-white text-center min-w-[150px] p-2.5 gap-4 items-center justify-center focus:outline-none"
              >
                {{ product?.buttonText || "View product" }}
              </a>
            </form>
            <!-- Categories -->
            <div
              v-if="
                storeSettings.showProductCategoriesOnSingleProduct &&
                product.productCategories
              "
            >
              <div class="grid gap-2 my-8 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-gray-400"
                    >{{ $t("messages.shop.category", 2) }}:</span
                  >
                  <div class="product-categories">
                    <NuxtLink
                      v-for="category in product.productCategories.nodes"
                      :key="category.databaseId"
                      :to="`/product-category/${decodeURIComponent(category?.slug || '')}`"
                      class="hover:text-primary"
                      :title="category.name"
                      >{{ category.name }}<span class="comma">, </span>
                    </NuxtLink>
                  </div>
                </div>
              </div>
              <hr />
            </div>
            <!-- share / wish -->
            <div class="flex flex-wrap gap-4">
              <WishlistButton :product />
              <ShareButton :product />
            </div>
          </div>
        </div>
        <!-- Description -->
        <div v-if="product.description || product.reviews" class="my-32">
          <ProductTabs :product />
        </div>
        <!-- You may like -->
        <div
          class="my-32"
          v-if="product.related && storeSettings.showRelatedProducts"
        >
          <div class="mb-4 text-xl font-semibold">
            {{ $t("messages.shop.youMayLike") }}
          </div>
          <ProductRow
            :products="product.related.nodes"
            class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.product-categories > a:last-child .comma {
  display: none;
}

input[type="number"]::-webkit-inner-spin-button {
  opacity: 1;
}
</style>
