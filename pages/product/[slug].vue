<script lang="ts" setup>
import {
  StockStatusEnum,
  ProductTypesEnum,
  type AddToCartInput,
  type Variation,
  type VariationAttribute,
  type ProductAttribute as WooProductAttribute, // Import ProductAttribute type
  type TermNode, // Import TermNode type
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

console.log(`[[slug].vue] Initializing for product slug: ${slug}`);

// Define a more specific type for product attributes if available from #woo or locally
interface ProductAttributeWithTerms extends WooProductAttribute {
  terms?: {
    nodes: TermNode[];
  } | null;
  options: string[]; // Ensure options is explicitly part of the type
}

const { data, pending, error, refresh } = await useAsyncData(
  cacheKey,
  async () => {
    console.log(
      `[[slug].vue] useAsyncData: Fetching product data for slug: ${slug}`
    );
    // @ts-ignore
    const result = await GqlGetProduct({ slug });
    if (!result?.product) {
      console.error(
        `[[slug].vue] useAsyncData: Product not found for slug: ${slug}`
      );
      // @ts-ignore
      throw new Error(t("messages.shop.productNotFound", "Product not found"));
    }
    console.log(
      `[[slug].vue] useAsyncData: Product data fetched successfully for slug: ${slug}`
    );
    // Log the entire product object once fetched
    // console.log('[[slug].vue] Full fetched product data:', JSON.parse(JSON.stringify(result.product)));
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

  if (exchangeRate.value === null) {
    const { numericString, originalHadSymbol } =
      cleanAndExtractPriceInfo(rawPriceToConsider);
    if (numericString) {
      return originalHadSymbol || numericString.startsWith("$")
        ? `$${numericString.replace(/^\$/, "")}`
        : `$${numericString}`;
    }
    return String(rawPriceToConsider)
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  const cadNumericString = convertToCAD(rawPriceToConsider, exchangeRate.value);

  if (cadNumericString === "") {
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
  return formatPriceWithCAD(cadNumericString);
};

const displayPrice = computed(() => {
  if (!product.value) return ""; // Or some placeholder
  let priceString = "";
  if (activeVariation.value) {
    priceString = getFormattedPriceDisplay(
      activeVariation.value.salePrice,
      activeVariation.value.regularPrice
    );
  } else {
    priceString = getFormattedPriceDisplay(
      product.value.salePrice,
      product.value.regularPrice
    );
  }
  // Ensure $ is prepended if not already, and handle cases where price might be text like "Price unavailable"
  if (
    typeof priceString === "string" &&
    !priceString.includes(
      t("messages.shop.priceUnavailable", "Price unavailable")
    ) &&
    !priceString.trim().startsWith("$")
  ) {
    return `$${priceString}`;
  }
  return priceString;
});

const quantity = ref<number>(1);
const activeVariation = ref<Variation | null>(null);
const variationAttributes = ref<VariationAttribute[]>([]);
const forceTreatAsSimple = ref(false);
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
    productId: product.value?.databaseId,
    quantity: quantity.value,
  };
  if (activeVariation.value?.databaseId) {
    input.variationId = activeVariation.value.databaseId;
  }
  return input;
});

const stockStatus = computed(() => {
  // console.log("[[slug].vue] Computing stockStatus...");
  if (isVariableProduct.value && activeVariation.value) {
    // console.log("[[slug].vue] Variable product with activeVariation. Stock status from activeVariation:", activeVariation.value.stockStatus);
    return activeVariation.value.stockStatus &&
      String(activeVariation.value.stockStatus).trim() !== ""
      ? activeVariation.value.stockStatus
      : StockStatusEnum.OUT_OF_STOCK;
  }
  if (isVariableProduct.value && !activeVariation.value) {
    // console.log("[[slug].vue] Variable product, but NO activeVariation. Defaulting to OUT_OF_STOCK for overall status.");
    return StockStatusEnum.OUT_OF_STOCK;
  }
  // console.log("[[slug].vue] Simple or other product type. Stock status from product.value:", product.value?.stockStatus);
  return product.value?.stockStatus || StockStatusEnum.OUT_OF_STOCK;
});

const isOutOfStock = (status: string | undefined | null): boolean => {
  if (!status) {
    return true;
  }
  const norm = (s: string) =>
    String(s)
      .toUpperCase()
      .replace(/[\s_-]/g, "");
  const normalizedStatus = norm(status);
  const normalizedOutOfStock = norm(StockStatusEnum.OUT_OF_STOCK);
  return normalizedStatus === normalizedOutOfStock;
};

const disabledAddToCart = computed(() => {
  const currentStockStatus = stockStatus.value;
  if (forceTreatAsSimple.value && !isOutOfStock(currentStockStatus))
    return isUpdatingCart.value;
  if (isVariableProduct.value) {
    return (
      !activeVariation.value ||
      isOutOfStock(currentStockStatus) ||
      isUpdatingCart.value
    );
  }
  return isOutOfStock(currentStockStatus) || isUpdatingCart.value;
});

const updateSelectedVariations = (
  variationsFromChild: { name: string; value: string }[]
) => {
  // console.log('[[slug].vue] updateSelectedVariations CALLED. Attributes from child:', JSON.parse(JSON.stringify(variationsFromChild)));
  variationAttributes.value = variationsFromChild;

  if (
    !product.value?.variations?.nodes ||
    !variationsFromChild ||
    variationsFromChild.length === 0
  ) {
    activeVariation.value = null;
    return;
  }

  attrValues.value = variationsFromChild.map((el) => ({
    attributeName: getExactAttributeName(el.name),
    attributeValue: el.value,
  }));
  // console.log('[[slug].vue] updateSelectedVariations: Mapped attrValues for validation:', JSON.parse(JSON.stringify(attrValues.value)));

  try {
    let matchingVariationNode: Variation | null = null;
    // console.log(`[[slug].vue] updateSelectedVariations: Searching for match in ${product.value.variations.nodes.length} variations.`);

    for (const variationNode of product.value.variations.nodes) {
      if (
        !variationNode.attributes?.nodes ||
        variationNode.attributes.nodes.length !== variationsFromChild.length
      ) {
        continue;
      }

      const allAttributesMatch = variationsFromChild.every(
        (selectedAttrFromChild) => {
          const normalizedSelectedAttrName = getExactAttributeName(
            selectedAttrFromChild.name
          ).toLowerCase();
          return variationNode.attributes!.nodes.some((variationAttrNode) => {
            if (!variationAttrNode.name || !variationAttrNode.value)
              return false;
            const normalizedVariationNodeAttrName = getExactAttributeName(
              variationAttrNode.name
            ).toLowerCase();
            const nameMatch =
              normalizedSelectedAttrName === normalizedVariationNodeAttrName;
            if (!nameMatch) return false;
            const valueMatch =
              variationAttrNode.value.toLowerCase() ===
              selectedAttrFromChild.value.toLowerCase();
            return valueMatch;
          });
        }
      );

      if (allAttributesMatch) {
        // console.log(`[[slug].vue] updateSelectedVariations: ALL ATTRIBUTES MATCHED for variation ID: ${variationNode.databaseId}, Stock: ${variationNode.stockStatus}`);
        matchingVariationNode = variationNode;
        break;
      }
    }

    // if (matchingVariationNode) {
    //   console.log('[[slug].vue] updateSelectedVariations: Setting activeVariation:', JSON.parse(JSON.stringify(matchingVariationNode)));
    // } else {
    //   console.log('[[slug].vue] updateSelectedVariations: NO MATCHING VARIATION FOUND. Setting activeVariation to null.');
    // }
    activeVariation.value = matchingVariationNode;
  } catch (e) {
    console.error("[[slug].vue] Error in updateSelectedVariations:", e);
    activeVariation.value = null;
  }
};

const getExactAttributeName = (attributeInput: string): string => {
  if (!product.value?.attributes?.nodes) return attributeInput;
  const match = (
    product.value.attributes.nodes as ProductAttributeWithTerms[]
  ).find((attr) => {
    if (!attr.name) return false;
    const inpLower = attributeInput.toLowerCase();
    const attrNameLower = attr.name.toLowerCase();
    return (
      attrNameLower === inpLower ||
      attrNameLower === `pa_${inpLower}` ||
      (inpLower.startsWith("pa_") && attrNameLower === inpLower.substring(3))
    );
  });
  return match?.name || attributeInput;
};

const handleAddToCart = async () => {
  // @ts-ignore
  if (!validateForm()) return;
  try {
    // console.log('[[slug].vue] handleAddToCart: Adding to cart with input:', JSON.parse(JSON.stringify(selectProductInput.value)));
    await addToCart(selectProductInput.value);
  } catch (e) {
    console.error("[[slug].vue] Add to cart error:", e);
  }
};

const validateForm = (): boolean => {
  if (isVariableProduct.value && !activeVariation.value) {
    if (
      attrValues.value?.length > 0 &&
      product.value?.attributes?.nodes.length === attrValues.value.length
    ) {
      // @ts-ignore
      if (
        confirm(
          t(
            "messages.shop.noMatchingVariation",
            "No exact match for the selected options. Do you want to add the main product to the cart if possible?"
          )
        )
      ) {
        forceTreatAsSimple.value = true;
        return true;
      }
      return false;
    } else {
      // @ts-ignore
      alert(
        t(
          "messages.shop.pleaseSelectVariation",
          "Please select options for all attributes."
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
  // console.log("[[slug].vue] mergeLiveStockStatus: Merging live stock status:", payload);
  payload.variations?.nodes?.forEach((vp, i) => {
    if (product.value?.variations?.nodes[i]) {
      // console.log(`[[slug].vue] mergeLiveStockStatus: Updating variation index ${i} stock to ${vp.stockStatus}`);
      product.value.variations.nodes[i].stockStatus = vp.stockStatus;
    }
  });
  if (payload.stockStatus !== undefined) {
    // console.log(`[[slug].vue] mergeLiveStockStatus: Updating main product stock to ${payload.stockStatus}`);
    product.value.stockStatus = payload.stockStatus;
  }
  if (nuxtApp.payload?.data?.[cacheKey] && product.value) {
    nuxtApp.payload.data[cacheKey] = JSON.parse(JSON.stringify(product.value));
  }
  if (nuxtApp.static?.data?.[cacheKey] && product.value) {
    nuxtApp.static.data[cacheKey] = JSON.parse(JSON.stringify(product.value));
  }
};

onMounted(async () => {
  // console.log('[[slug].vue] Component mounted.');
  if (product.value) {
    // console.log('[[slug].vue] onMounted: Product data exists. Attempting to fetch live stock status.');
    // @ts-ignore
    try {
      const { product: sp } = await GqlGetStockStatus({ slug });
      if (sp) {
        // console.log('[[slug].vue] onMounted: Live stock status fetched:', sp);
        mergeLiveStockStatus(sp);
      } else {
        // console.log('[[slug].vue] onMounted: No live stock status data returned from GqlGetStockStatus.');
      }
    } catch (e: any) {
      console.error(
        `[[slug].vue] onMounted: Error GqlGetStockStatus:`,
        e?.gqlErrors?.[0]?.message || e
      );
    }
  } else {
    // console.log('[[slug].vue] onMounted: No product data available yet for live stock status fetch.');
  }
  if (exchangeRate.value === null) {
    // console.log('[[slug].vue] onMounted: Exchange rate is null, refreshing.');
    await refreshExchangeRate();
  }
});

watch(
  () => product.value,
  (np) => {
    if (np) {
      useHead({
        title: np.name || "Product",
        meta: [
          {
            name: "description",
            content: np.shortDescription || np.description || "Product details",
          },
        ],
      });
    } else {
      useHead({ title: "Product not found" });
    }
  },
  { immediate: true }
);

watch(
  activeVariation,
  (newActiveVariation) => {
    // console.log('[[slug].vue] Watcher: activeVariation changed. New value:', JSON.parse(JSON.stringify(newActiveVariation)));
    // console.log('[[slug].vue] Watcher: Corresponding computed stockStatus is now:', stockStatus.value);
  },
  { deep: true }
);
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
            placeholder
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
                  isVariableProduct &&
                  product.attributes &&
                  product.variations?.nodes?.length
                "
                class="mt-4 mb-8"
                :attributes="product.attributes.nodes"
                :defaultAttributes="product.defaultAttributes"
                :variations="product.variations.nodes"
                @attrs-changed="updateSelectedVariations"
              />
              <div
                v-else-if="
                  isVariableProduct &&
                  (!product.attributes || !product.variations?.nodes?.length)
                "
                class="mt-4 mb-8 text-sm text-gray-500"
              >
                {{
                  t(
                    "messages.shop.noVariationsRequired",
                    "This product has no selectable options."
                  )
                }}
              </div>

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
