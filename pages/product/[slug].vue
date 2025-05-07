<script lang="ts" setup>
import {
  StockStatusEnum,
  ProductTypesEnum,
  type AddToCartInput,
  type Variation,
  type VariationAttribute,
} from "#woo";
import { defineAsyncComponent, computed, ref, onMounted, watch } from "vue";
import {
  useRoute,
  useNuxtApp,
  useAppConfig,
  useCart,
  useI18n,
  useHead,
  useAsyncData,
} from "#imports";
import { useHelpers } from "~/composables/useHelpers";
import { useExchangeRate } from "~/composables/useExchangeRate";
// Import from the updated priceConverter.ts
import {
  convertToCAD,
  formatPriceWithCAD,
  cleanAndExtractPriceInfo,
} from "~/utils/priceConverter"; // Added cleanAndExtractPriceInfo for fallback

const PulseLoader = defineAsyncComponent(
  () => import("vue-spinner/src/PulseLoader.vue")
);

const route = useRoute();
const { storeSettings } = useAppConfig();
const { arraysEqual, formatArray, checkForVariationTypeOfAny } = useHelpers();
const { addToCart, isUpdatingCart } = useCart();
const { t } = useI18n();
const slug = route.params.slug as string;
const nuxtApp = useNuxtApp();

const { exchangeRate, refresh: refreshExchangeRate } = useExchangeRate();

const cacheKey = `product-${slug}`;

const { data, pending, error, refresh } = await useAsyncData(
  cacheKey,
  async () => {
    // @ts-ignore
    const result = await GqlGetProduct({ slug });
    if (!result?.product) {
      // @ts-ignore
      throw new Error(t("messages.shop.productNotFound", "Product not found"));
    }
    return result.product;
  },
  {
    server: true,
    lazy: false,
    immediate: true,
    watch: [],
    transform: (p) => p,
    getCachedData: (key) => {
      const pD = nuxtApp.payload?.data?.[key];
      if (pD) return pD;
      const sD = nuxtApp.static?.data?.[key];
      if (sD) return sD;
      return undefined;
    },
  }
);

const product = computed(() => data.value);

// --- Updated Price Formatting Logic ---
const getFormattedPriceDisplay = (
  priceValue?: string | null,
  regularPriceValue?: string | null
) => {
  const rawPriceToConsider = priceValue || regularPriceValue;

  if (
    rawPriceToConsider === null ||
    rawPriceToConsider === undefined ||
    String(rawPriceToConsider).trim() === ""
  ) {
    // @ts-ignore
    return t("messages.shop.priceUnavailable", "Price unavailable");
  }

  // If exchange rate is not yet available, show a cleaned, basic version of the price.
  if (exchangeRate.value === null) {
    console.warn(
      `[${slug}.vue] Exchange rate not available for price: "${rawPriceToConsider}". Displaying basic pre-conversion format.`
    );
    // Use cleanAndExtractPriceInfo to get a somewhat clean numeric string and original symbol presence
    const { numericString, originalHadSymbol } =
      cleanAndExtractPriceInfo(rawPriceToConsider);
    if (numericString) {
      return originalHadSymbol || numericString.startsWith("$")
        ? `$${numericString.replace(/^\$/, "")}`
        : `$${numericString}`;
    }
    // If cleaning results in nothing numeric, return the original (it might be "Call for price")
    return String(rawPriceToConsider)
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // Exchange rate IS available.
  // 1. Convert to CAD (this function now handles cleaning and returns a numeric string like "75.99" or "75.99 - 85.99")
  const cadNumericString = convertToCAD(rawPriceToConsider, exchangeRate.value);

  if (cadNumericString === "") {
    console.warn(
      `[${slug}.vue] CAD conversion returned empty for price: "${rawPriceToConsider}". Displaying cleaned original.`
    );
    // Fallback to a cleaned version of the original price if conversion fails
    const {
      numericString: cleanedOriginalNumeric,
      originalHadSymbol: cleanedHadSymbol,
    } = cleanAndExtractPriceInfo(rawPriceToConsider);
    if (cleanedOriginalNumeric) {
      return cleanedHadSymbol || cleanedOriginalNumeric.startsWith("$")
        ? `$${cleanedOriginalNumeric.replace(/^\$/, "")}`
        : `$${cleanedOriginalNumeric}`;
    }
    return String(rawPriceToConsider)
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // 2. Format with "$" and " CAD"
  return formatPriceWithCAD(cadNumericString);
};

const displayPrice = computed(() => {
  if (!product.value) return ""; // Or some placeholder
  if (activeVariation.value) {
    return getFormattedPriceDisplay(
      activeVariation.value.salePrice,
      activeVariation.value.regularPrice
    );
  }
  return getFormattedPriceDisplay(
    product.value.salePrice,
    product.value.regularPrice
  );
});

const quantity = ref<number>(1);
const activeVariation = ref<Variation | null>(null);
const variationAttributes = ref<VariationAttribute[]>([]);
const forceTreatAsSimple = ref(false);
const selectedAttributes = ref<any[]>([]);
const indexOfTypeAny = computed<number[]>(() =>
  product.value ? checkForVariationTypeOfAny(product.value) : []
);
const attrValues = ref<any[]>();
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

const selectProductInput = computed<AddToCartInput>(() => {
  const input: AddToCartInput = {
    productId: type.value?.databaseId,
    quantity: quantity.value,
  };
  if (activeVariation.value?.databaseId)
    input.variationId = activeVariation.value.databaseId;
  return input;
});

const stockStatus = computed(() => {
  if (isVariableProduct.value && activeVariation.value)
    return activeVariation.value.stockStatus || StockStatusEnum.OUT_OF_STOCK;
  return (
    product.value?.stockStatus ||
    type.value?.stockStatus ||
    StockStatusEnum.OUT_OF_STOCK
  );
});

const isOutOfStock = (status: string | undefined | null): boolean => {
  if (!status) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  return (
    norm(status) === norm(StockStatusEnum.OUT_OF_STOCK) ||
    norm(status).includes(norm(StockStatusEnum.OUT_OF_STOCK)) ||
    norm(StockStatusEnum.OUT_OF_STOCK).includes(norm(status))
  );
};

const disabledAddToCart = computed(() => {
  if (forceTreatAsSimple.value && !isOutOfStock(stockStatus.value))
    return isUpdatingCart.value;
  if (isVariableProduct.value)
    return (
      !type.value ||
      isOutOfStock(stockStatus.value) ||
      (!forceTreatAsSimple.value && !activeVariation.value) ||
      isUpdatingCart.value
    );
  return !type.value || isOutOfStock(stockStatus.value) || isUpdatingCart.value;
});

const updateSelectedVariations = (
  variationsFromComponent: { name: string; value: string }[]
) => {
  if (
    !product.value?.variations?.nodes ||
    !variationsFromComponent ||
    variationsFromComponent.length === 0
  ) {
    activeVariation.value = null;
    return;
  }
  attrValues.value = variationsFromComponent.map((el) => ({
    attributeName: getExactAttributeName(el.name),
    attributeValue: el.value,
  }));
  try {
    let matchingVariationNode = null;
    for (const variationNode of product.value.variations.nodes) {
      if (
        !variationNode.attributes?.nodes ||
        variationNode.attributes.nodes.length !== variationsFromComponent.length
      )
        continue;
      const allAttributesMatch = variationsFromComponent.every(
        (selectedAttr) => {
          const selNameLower = selectedAttr.name.toLowerCase();
          return variationNode.attributes!.nodes.some((varAttr) => {
            if (!varAttr.name || !varAttr.value) return false;
            const varNameLower = varAttr.name.toLowerCase();
            const nameMatch =
              selNameLower === varNameLower ||
              `pa_${selNameLower}` === varNameLower ||
              selNameLower === varNameLower.replace(/^pa_/, "");
            if (!nameMatch) return false;
            const isSize =
              selNameLower.includes("size") || varNameLower.includes("size");
            return isSize
              ? matchSizeValues(selectedAttr.value, varAttr.value)
              : selectedAttr.value.toLowerCase() ===
                  varAttr.value.toLowerCase();
          });
        }
      );
      if (allAttributesMatch) {
        matchingVariationNode = variationNode;
        break;
      }
    }
    activeVariation.value = matchingVariationNode;
    variationAttributes.value = variationsFromComponent;
  } catch (e) {
    console.error("Error in updateSelectedVariations:", e);
    activeVariation.value = null;
  }
};

const getExactAttributeName = (attributeInput: string): string => {
  if (!product.value?.attributes?.nodes) return attributeInput;
  const match = product.value.attributes.nodes.find((attr) => {
    if (!attr.name) return false;
    const inp = attributeInput.toLowerCase(),
      att = attr.name.toLowerCase();
    return (
      inp === att || inp === att.replace(/^pa_/, "") || `pa_${inp}` === att
    );
  });
  return match?.name || attributeInput;
};

const matchSizeValues = (
  selectedValue: string,
  variationValue: string
): boolean => {
  if (!selectedValue || !variationValue) return false;
  const sel = selectedValue.toLowerCase().trim(),
    vVal = variationValue.toLowerCase().trim();
  if (sel === vVal) return true;
  const ext = (s: string) => s.match(/\d+(\.\d+)?/g) || [];
  return ext(sel).some(
    (n) => ext(vVal).includes(n) || ext(vVal).includes(n.replace(".", ""))
  );
};

const handleAddToCart = async () => {
  // @ts-ignore
  if (!validateForm()) return;
  try {
    await addToCart(selectProductInput.value);
  } catch (e) {
    console.error("Add to cart error:", e);
  }
};

const validateForm = (): boolean => {
  if (isVariableProduct.value && !activeVariation.value) {
    // @ts-ignore
    if (
      attrValues.value?.length > 0 &&
      product.value?.attributes?.nodes.length === attrValues.value.length
    ) {
      selectedAttributes.value = [...attrValues.value]; // @ts-ignore
      if (
        confirm(
          t("messages.shop.noMatchingVariation", "No exact match. Continue?")
        )
      ) {
        forceTreatAsSimple.value = true;
        return true;
      }
      return false;
    } else {
      // @ts-ignore
      alert(t("messages.shop.pleaseSelectVariation", "Please select options."));
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
  payload.variations?.nodes?.forEach((vp, i) => {
    if (product.value?.variations?.nodes[i])
      product.value.variations.nodes[i].stockStatus = vp.stockStatus;
  });
  if (payload.stockStatus !== undefined)
    product.value.stockStatus = payload.stockStatus;
  if (nuxtApp.payload?.data?.[cacheKey] && product.value)
    nuxtApp.payload.data[cacheKey] = { ...product.value };
};

onMounted(async () => {
  if (product.value) {
    // @ts-ignore
    try {
      const { product: sp } = await GqlGetStockStatus({ slug });
      if (sp) mergeLiveStockStatus(sp);
    } catch (e: any) {
      console.error(
        `Error GqlGetStockStatus:`,
        e?.gqlErrors?.[0]?.message || e
      );
    }
  }
  if (exchangeRate.value === null) await refreshExchangeRate();
});

watch(
  () => product.value,
  (np) => {
    if (np)
      useHead({
        title: np.name || "Product",
        meta: [
          {
            name: "description",
            content: np.shortDescription || np.description || "Product details",
          },
        ],
      });
    else useHead({ title: "Product not found" });
  },
  { immediate: true }
);

watch(exchangeRate, (newRate, oldRate) => {
  // console.log(`[${slug}.vue] Exchange rate changed from ${oldRate} to ${newRate}. DisplayPrice will recompute.`);
});
</script>

<template>
  <div>
    <div v-if="pending" class="flex justify-center items-center min-h-screen">
      <div class="text-center">
        <PulseLoader :loading="true" :color="'#38bdf8'" :size="'15px'" />
        <p class="mt-4 text-gray-500">
          {{ t("messages.shop.loadingProduct", "Loading product...") }}
        </p>
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
              <div class="text-xl font-semibold" v-if="displayPrice">
                <span>{{ displayPrice }}</span>
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
                {{
                  product?.buttonText ||
                  t("messages.shop.viewProduct", "View product")
                }}
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
                    >{{
                      t(
                        "messages.shop.category",
                        product.productCategories.nodes.length,
                        { count: product.productCategories.nodes.length }
                      )
                    }}:</span
                  >
                  <div class="product-categories">
                    <NuxtLink
                      v-for="category in product.productCategories.nodes"
                      :key="category.databaseId"
                      :to="`/product-category/${decodeURIComponent(category?.slug || '')}`"
                      class="hover:text-primary"
                      :title="category.name"
                      >{{ category.name
                      }}<span class="comma">, </span></NuxtLink
                    >
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
