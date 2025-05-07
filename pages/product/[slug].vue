<script lang="ts" setup>
import {
  StockStatusEnum,
  ProductTypesEnum,
  type AddToCartInput,
  type Variation,
  type VariationAttribute,
} from "#woo"; // Assuming Variation types come from #woo
import { defineAsyncComponent, computed, ref, onMounted, watch } from "vue";
import {
  useRoute,
  useNuxtApp,
  useAppConfig,
  useCart,
  useI18n,
  useHead,
  useAsyncData,
} from "#imports"; // Ensure all imports are from #imports or vue
import { useHelpers } from "~/composables/useHelpers"; // Assuming this is a local composable
import { useExchangeRate } from "~/composables/useExchangeRate"; // Import your exchange rate composable
import { convertToCAD, formatPriceWithCAD } from "~/utils/priceConverter"; // Import your price conversion utilities

const PulseLoader = defineAsyncComponent(
  () => import("vue-spinner/src/PulseLoader.vue")
);

// Core setup and imports
const route = useRoute();
const { storeSettings } = useAppConfig();
const { arraysEqual, formatArray, checkForVariationTypeOfAny } = useHelpers();
const { addToCart, isUpdatingCart } = useCart();
const { t } = useI18n();
const slug = route.params.slug as string;
const nuxtApp = useNuxtApp();

// --- Exchange Rate ---
const {
  exchangeRate,
  lastUpdated: exchangeRateLastUpdated,
  refresh: refreshExchangeRate,
} = useExchangeRate();

// Create a consistent cache key based on the slug
const cacheKey = `product-${slug}`;
console.log(`🔑 Using product cache key: ${cacheKey}`);

const { data, pending, error, refresh } = await useAsyncData(
  cacheKey,
  async () => {
    console.log(`🔄 Fetching product: ${slug}`);
    // @ts-ignore GqlGetProduct is globally available via nuxt-graphql-client
    const result = await GqlGetProduct({ slug });
    if (!result?.product) {
      // @ts-ignore
      throw new Error(t("messages.shop.productNotFound", "Product not found"));
    }
    console.log(`✅ Fetched product: ${result.product.name}`);
    return result.product;
  },
  {
    server: true,
    lazy: false,
    immediate: true,
    watch: [],
    transform: (product) => product,
    getCachedData: (key) => {
      console.log(`🔍 Checking for cached data with key: ${key}`);
      const payloadData = nuxtApp.payload?.data?.[key];
      if (payloadData) {
        console.log(`💰 Found cached product in payload for ${key}`);
        return payloadData;
      }
      const staticData = nuxtApp.static?.data?.[key];
      if (staticData) {
        console.log(`📘 Found cached product in static data for ${key}`);
        return staticData;
      }
      console.log(`❌ No cached data found for ${key}`);
      return undefined;
    },
  }
);

const product = computed(() => data.value);

// --- Price Formatting Logic ---
const getFormattedPrice = (
  priceValue: string | null | undefined,
  regularPriceValue?: string | null | undefined
) => {
  if (!priceValue && !regularPriceValue) return ""; // No price to format

  // Determine the price to use (sale price if available, otherwise regular)
  const priceToShow = priceValue || regularPriceValue;
  if (!priceToShow) return "";

  // Ensure price is a string and take the first one if comma-separated
  let singlePrice = String(priceToShow);
  if (singlePrice.includes(",")) {
    singlePrice = singlePrice.split(",")[0].trim();
  }

  if (exchangeRate.value === null) {
    console.warn(
      `[${slug}.vue] Exchange rate not yet available. Price for "${singlePrice}" will not be converted or fully formatted yet.`
    );
    // Return raw price or a placeholder if exchange rate is not ready, especially on server/initial load
    return singlePrice.startsWith("$") ? singlePrice : `$${singlePrice}`; // Basic $ prefix
  }

  // Convert to CAD using your utility
  const convertedPrice = convertToCAD(singlePrice, exchangeRate.value);
  if (!convertedPrice) return `$${singlePrice}`; // Fallback if conversion fails

  // Format with $ and CAD suffix using your utility
  return formatPriceWithCAD(convertedPrice);
};

const displayPrice = computed(() => {
  if (!product.value) return "";
  if (activeVariation.value) {
    return getFormattedPrice(
      activeVariation.value.salePrice,
      activeVariation.value.regularPrice
    );
  }
  return getFormattedPrice(product.value.salePrice, product.value.regularPrice);
});

// Product setup vars
const quantity = ref<number>(1);
const activeVariation = ref<Variation | null>(null);
const variationAttributes = ref<VariationAttribute[]>([]); // Renamed from 'variation' to avoid conflict
const forceTreatAsSimple = ref(false);
const selectedAttributes = ref<any[]>([]); // Consider defining a more specific type

// Product type computing
const indexOfTypeAny = computed<number[]>(() =>
  product.value ? checkForVariationTypeOfAny(product.value) : []
);
const attrValues = ref<any[]>(); // Consider defining a type
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
const selectProductInput = computed<AddToCartInput>(() => {
  const input: AddToCartInput = {
    productId: type.value?.databaseId,
    quantity: quantity.value,
  };
  if (activeVariation.value?.databaseId) {
    input.variationId = activeVariation.value.databaseId;
    // If you need to pass variation attributes
    // input.variation = activeVariation.value.attributes?.nodes.map(attr => ({ attributeName: attr.name, attributeValue: attr.value }));
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

const isOutOfStock = (status: string | undefined | null): boolean => {
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
const updateSelectedVariations = (
  variationsFromComponent: { name: string; value: string }[]
) => {
  if (
    !product.value?.variations?.nodes ||
    !variationsFromComponent ||
    variationsFromComponent.length === 0
  ) {
    activeVariation.value = null; // Clear active variation if no selection or no variations
    return;
  }

  attrValues.value = variationsFromComponent.map((el) => {
    return {
      attributeName: getExactAttributeName(el.name),
      attributeValue: el.value,
    };
  });

  try {
    let matchingVariationNode = null;
    for (const variationNode of product.value.variations.nodes) {
      if (!variationNode.attributes?.nodes) continue;

      // Check if the number of attributes matches
      if (
        variationNode.attributes.nodes.length !== variationsFromComponent.length
      )
        continue;

      const allAttributesMatch = variationsFromComponent.every(
        (selectedAttr) => {
          const selectedAttrNameLower = selectedAttr.name.toLowerCase();
          return variationNode.attributes!.nodes.some((varAttr) => {
            if (!varAttr.name || !varAttr.value) return false;
            const varAttrNameLower = varAttr.name.toLowerCase();
            const attributeNameMatch =
              selectedAttrNameLower === varAttrNameLower ||
              `pa_${selectedAttrNameLower}` === varAttrNameLower ||
              selectedAttrNameLower === varAttrNameLower.replace(/^pa_/, "");
            if (!attributeNameMatch) return false;

            const isSizeAttribute =
              selectedAttrNameLower.includes("size") ||
              varAttrNameLower.includes("size");
            if (isSizeAttribute) {
              return matchSizeValues(selectedAttr.value, varAttr.value);
            }
            return (
              selectedAttr.value.toLowerCase() === varAttr.value.toLowerCase()
            );
          });
        }
      );

      if (allAttributesMatch) {
        matchingVariationNode = variationNode;
        break;
      }
    }
    activeVariation.value = matchingVariationNode;
    variationAttributes.value = variationsFromComponent; // Store the selected attributes
  } catch (error) {
    console.error("Error in updateSelectedVariations:", error);
    activeVariation.value = null;
  }
};

const getExactAttributeName = (attributeInput: string): string => {
  if (!product.value?.attributes?.nodes) return attributeInput;
  const matchingAttribute = product.value.attributes.nodes.find((attr) => {
    if (!attr.name) return false;
    const inputName = attributeInput.toLowerCase();
    const attrName = attr.name.toLowerCase();
    return (
      inputName === attrName ||
      inputName === attrName.replace(/^pa_/, "") || // pa_size -> size
      `pa_${inputName}` === attrName // size -> pa_size
    );
  });
  return matchingAttribute?.name || attributeInput;
};

const matchSizeValues = (
  selectedValue: string,
  variationValue: string
): boolean => {
  if (!selectedValue || !variationValue) return false;
  const selected = selectedValue.toLowerCase().trim();
  const variation = variationValue.toLowerCase().trim();
  if (selected === variation) return true;

  const extractSizeNumbers = (val: string) => val.match(/\d+(\.\d+)?/g) || [];
  const selectedNums = extractSizeNumbers(selected);
  const variationNums = extractSizeNumbers(variation);

  return selectedNums.some(
    (num) =>
      variationNums.includes(num) ||
      variationNums.includes(num.replace(".", ""))
  );
};

const handleAddToCart = async () => {
  if (!validateForm()) return;
  try {
    // @ts-ignore addToCart is globally available
    await addToCart(selectProductInput.value);
    // Handle success (e.g., show notification)
  } catch (e) {
    console.error("Add to cart error:", e);
    // Handle error (e.g., show notification)
  }
};

const validateForm = (): boolean => {
  if (isVariableProduct.value && !activeVariation.value) {
    if (
      attrValues.value &&
      attrValues.value.length > 0 &&
      product.value?.attributes?.nodes.length === attrValues.value.length
    ) {
      selectedAttributes.value = [...attrValues.value];
      // @ts-ignore
      const confirmMessage = t(
        "messages.shop.noMatchingVariation",
        "We couldn't find an exact match for your selection. Continue with these options?"
      );
      if (confirm(confirmMessage)) {
        forceTreatAsSimple.value = true;
        return true;
      }
      return false;
    } else {
      // @ts-ignore
      alert(
        t(
          "messages.shop.pleaseSelectVariation",
          "Please select product options before adding to cart"
        )
      );
      return false;
    }
  }
  return true;
};

const mergeLiveStockStatus = (payload: {
  stockStatus?: string | null;
  variations?: { nodes: { stockStatus?: string | null }[] } | null;
}) => {
  if (!product.value) return;
  console.log(`🔄 Updating stock status for ${product.value.name}`);

  payload.variations?.nodes?.forEach((variationPayload, index) => {
    if (product.value?.variations?.nodes[index]) {
      product.value.variations.nodes[index].stockStatus =
        variationPayload.stockStatus;
    }
  });

  if (payload.stockStatus !== undefined) {
    product.value.stockStatus = payload.stockStatus;
  }
  console.log(`✅ Stock status updated: Main=${product.value.stockStatus}`);

  if (nuxtApp.payload?.data?.[cacheKey] && product.value) {
    nuxtApp.payload.data[cacheKey] = { ...product.value };
  }
};

onMounted(async () => {
  if (product.value) {
    console.log(`🔄 Checking live stock status for ${product.value.name}`);
    try {
      // @ts-ignore GqlGetStockStatus is globally available
      const { product: stockProduct } = await GqlGetStockStatus({ slug });
      if (stockProduct) {
        mergeLiveStockStatus(stockProduct);
      } else {
        console.log(`⚠️ No stock data received from API`);
      }
    } catch (err: any) {
      const errorMessage = err?.gqlErrors?.[0]?.message;
      console.error(`❌ Error fetching stock status:`, errorMessage || err);
    }
  } else {
    console.log(`⚠️ Cannot check stock - product data not available on mount`);
  }
  // Attempt to refresh exchange rate on client mount if needed
  if (exchangeRate.value === null) {
    console.log(
      `[${slug}.vue] Exchange rate is null on mount, attempting refresh.`
    );
    await refreshExchangeRate();
  }
});

watch(
  () => product.value,
  (newProduct) => {
    if (newProduct) {
      useHead({
        title: newProduct.name || "Product",
        meta: [
          {
            name: "description",
            content:
              newProduct.shortDescription ||
              newProduct.description ||
              "Product details",
          },
        ],
      });
    } else {
      useHead({ title: "Product not found" }); // Fallback title
    }
  },
  { immediate: true }
);

// Watch for exchange rate changes to potentially re-compute prices if they were displayed with placeholders
watch(exchangeRate, (newRate, oldRate) => {
  if (newRate !== null && oldRate === null) {
    console.log(
      `[${slug}.vue] Exchange rate became available: ${newRate}. Prices might re-render.`
    );
    // The `displayPrice` computed property will automatically update.
  }
});
</script>

<template>
  <div>
    <div v-if="pending" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">Loading product...</p>
      </div>
    </div>

    <div v-else-if="error" class="container my-12 text-center">
      <div class="text-red-500 mb-4">
        {{
          error.message ||
          t("messages.shop.productLoadError", "Error loading product.")
        }}
      </div>
      <button @click="refresh" class="px-4 py-2 bg-primary text-white rounded">
        {{ t("messages.general.retry", "Retry") }}
      </button>
    </div>

    <main v-else-if="product" class="container relative py-6 xl:max-w-7xl">
      <div>
        <Breadcrumb
          :product="product"
          class="mb-6"
          v-if="storeSettings.showBreadcrumbOnSingleProduct"
        />
        <div
          class="flex flex-col gap-10 md:flex-row md:justify-between lg:gap-24"
        >
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
            width="600"
            height="600"
          />
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
              <div class="text-xl font-semibold">
                <span v-if="displayPrice">{{ displayPrice }}</span>
                <span v-else-if="product.price && exchangeRate === null">
                  {{
                    product.price.includes(",")
                      ? `$${product.price.split(",")[0].trim()}`
                      : `$${product.price}`
                  }}
                </span>
                <span v-else-if="!product.price && !activeVariation?.price">
                  {{ t("messages.shop.priceUnavailable", "Price unavailable") }}
                </span>
              </div>
            </div>

            <div class="grid gap-2 my-8 text-sm empty:hidden">
              <div v-if="!isExternalProduct" class="flex items-center gap-2">
                <span class="text-gray-400"
                  >{{ t("messages.shop.availability", "Availability") }}:</span
                >
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
                  >{{ t("messages.shop.sku", "SKU") }}:</span
                >
                <span>{{ product.sku || "N/A" }}</span>
              </div>
            </div>

            <div
              class="mb-8 font-light prose"
              v-html="product.shortDescription || product.description"
            />
            <hr />

            <form @submit.prevent="handleAddToCart">
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
                  v-model.number="quantity"
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

            <div
              v-if="
                storeSettings.showProductCategoriesOnSingleProduct &&
                product.productCategories?.nodes?.length
              "
            >
              <div class="grid gap-2 my-8 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-gray-400"
                    >{{ t("messages.shop.category", 2, { count: 2 }) }}:</span
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
            <div class="flex flex-wrap gap-4">
              <WishlistButton :product="product" />
              <ShareButton :product="product" />
            </div>
          </div>
        </div>
        <div v-if="product.description || product.reviews" class="my-32">
          <ProductTabs :product="product" />
        </div>
        <div
          class="my-32"
          v-if="
            product.related?.nodes?.length && storeSettings.showRelatedProducts
          "
        >
          <div class="mb-4 text-xl font-semibold">
            {{ t("messages.shop.youMayLike", "You may also like...") }}
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
