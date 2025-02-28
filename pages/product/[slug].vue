<script lang="ts" setup>
import { StockStatusEnum, ProductTypesEnum, type AddToCartInput } from "#woo";

const route = useRoute();
const { storeSettings } = useAppConfig();
const { arraysEqual, formatArray, checkForVariationTypeOfAny } = useHelpers();
const { addToCart, isUpdatingCart } = useCart();
const { t } = useI18n();
const slug = route.params.slug as string;

const { data } = await useAsyncGql("getProduct", { slug });
if (!data.value?.product) {
  throw showError({
    statusCode: 404,
    statusMessage: t("messages.shop.productNotFound"),
  });
}
const forceTreatAsSimple = ref(false);
const selectedAttributes = ref([]);
const product = ref<Product>(data?.value?.product);
const quantity = ref<number>(1);
const activeVariation = ref<Variation | null>(null);
const variation = ref<VariationAttribute[]>([]);
const indexOfTypeAny = computed<number[]>(() =>
  checkForVariationTypeOfAny(product.value)
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

const debugProductAttributes = () => {
  console.log("=== DEBUG PRODUCT ATTRIBUTES ===");

  // Log the product type and ID
  console.log(`Product: ${product.value.name}`);
  console.log(`Type: ${product.value.type}`);
  console.log(`ID: ${product.value.databaseId}`);

  // Log the product attributes
  console.log("Product Attributes:", product.value.attributes?.nodes);

  // Log variation attributes
  if (
    product.value.variations?.nodes &&
    product.value.variations.nodes.length > 0
  ) {
    console.log(
      "First Variation Attributes:",
      product.value.variations.nodes[0].attributes?.nodes
    );

    // Log a sample API call for this product
    const variation = product.value.variations.nodes[0];
    console.log("Sample API payload that should work:");
    console.log({
      productId: product.value.databaseId,
      variationId: variation.databaseId,
      quantity: 1,
    });
  }

  console.log("=== END DEBUG ===");
};

// Update the selectProductInput computed property in [slug].vue to better handle variation data
const getExactAttributeName = (attributeInput) => {
  // If the product doesn't have attributes, we can't find the exact name
  if (!product.value?.attributes?.nodes) return attributeInput;

  // Find the matching attribute in the product's attributes
  const matchingAttribute = product.value.attributes.nodes.find((attr) => {
    const inputName = attributeInput.toLowerCase();
    const attrName = (attr.name || "").toLowerCase();

    // Try various ways to match the attribute names
    return (
      inputName === attrName ||
      inputName === attrName.replace("pa_", "") ||
      "pa_" + inputName === attrName
    );
  });

  if (matchingAttribute) {
    // Return the exact name as defined in the product
    return matchingAttribute.name;
  }

  // If no match found, return the original input
  return attributeInput;
};

// Simplify the selectProductInput computed property for better reliability
const selectProductInput = computed<any>(() => {
  const input = {
    productId: type.value?.databaseId,
    quantity: quantity.value,
  };

  // If we have a variation ID, just use that
  if (activeVariation.value) {
    input.variationId = activeVariation.value.databaseId;
  }

  return input;
}) as ComputedRef<AddToCartInput>;

const mergeLiveStockStatus = (payload: Product): void => {
  payload.variations?.nodes?.forEach((variation: Variation, index: number) => {
    if (product.value?.variations?.nodes[index]) {
      return (product.value.variations.nodes[index].stockStatus =
        variation.stockStatus);
    }
  });

  return (product.value.stockStatus =
    payload.stockStatus ?? product.value?.stockStatus);
};

onMounted(async () => {
  setTimeout(debugProductAttributes, 500); //TODO
  try {
    const { product } = await GqlGetStockStatus({ slug });
    if (product) mergeLiveStockStatus(product as Product);
  } catch (error: any) {
    const errorMessage = error?.gqlErrors?.[0].message;
    if (errorMessage) console.error(errorMessage);
  }
});

const matchSizeValues = (selectedValue, variationValue) => {
  if (!selectedValue || !variationValue) return false;

  // Normalize both values to lowercase
  const selected = selectedValue.toLowerCase();
  const variation = variationValue.toLowerCase();

  // Direct match
  if (selected === variation) return true;

  // Extract size numbers to compare (ignoring prefixes)
  // This handles cases like "18-395eu" vs "35-39-40eu"
  const extractSizeNumbers = (val) => {
    // Match all numbers in the string, including decimals
    const matches = val.match(/\d+(\.\d+)?/g);
    return matches || [];
  };

  const selectedNums = extractSizeNumbers(selected);
  const variationNums = extractSizeNumbers(variation);

  // Check if any of the selected numbers appear in the variation
  return selectedNums.some(
    (num) =>
      variationNums.includes(num) ||
      // Also check for decimal point variations (39.5 vs 395)
      variationNums.includes(num.replace(".", ""))
  );
};

// Update the updateSelectedVariations function
const updateSelectedVariations = (variations: VariationAttribute[]): void => {
  if (!product.value.variations || !variations || variations.length === 0)
    return;

  // Create attribute values for cart with EXACT attribute names from the product
  attrValues.value = variations.map((el) => {
    // For each selected attribute, get the exact attribute name from the product
    // This ensures we use the names exactly as WooCommerce expects them
    return {
      attributeName: getExactAttributeName(el.name),
      attributeValue: el.value,
    };
  });

  try {
    // Find a matching variation
    let matchingVariation = null;

    if (product.value.variations?.nodes) {
      // For each variation, check if it matches our selection
      for (const variation of product.value.variations.nodes) {
        if (!variation.attributes || !variation.attributes.nodes) continue;

        // For this variation to match, all selected attributes must match
        const allAttributesMatch = variations.every((selectedAttr) => {
          // Find the matching attribute in this variation
          const matchingAttr = variation.attributes.nodes.find((varAttr) => {
            // Compare attribute names (using normalized versions)
            const selectedName = selectedAttr.name.toLowerCase();
            const varName = (varAttr.name || "").toLowerCase();

            return (
              selectedName === varName ||
              `pa_${selectedName}` === varName ||
              selectedName === varName.replace("pa_", "")
            );
          });

          if (!matchingAttr) return false;

          // Special handling for size attributes
          const isSizeAttribute =
            selectedAttr.name.toLowerCase().includes("size") ||
            matchingAttr.name.toLowerCase().includes("size");

          if (isSizeAttribute) {
            // Use size matching logic
            return matchSizeValues(selectedAttr.value, matchingAttr.value);
          }

          // For other attributes, standard comparison
          return selectedAttr.value === matchingAttr.value;
        });

        if (allAttributesMatch) {
          matchingVariation = variation;
          break;
        }
      }
    }

    // Set the active variation
    activeVariation.value = matchingVariation;
    variation.value = variations;
  } catch (error) {
    console.error("Error in updateSelectedVariations:", error);
  }
};

const stockStatus = computed(() => {
  // Add debugging
  // ;
  // ;
  // ;
  // ;
  // ;

  if (isVariableProduct.value && activeVariation.value) {
    return activeVariation.value.stockStatus || StockStatusEnum.OUT_OF_STOCK;
  }

  // For simple products, prefer product.value.stockStatus over type.value?.stockStatus
  return (
    product.value.stockStatus ||
    type.value?.stockStatus ||
    StockStatusEnum.OUT_OF_STOCK
  );
});

const isOutOfStock = (status: string | undefined) => {
  if (!status) return true; // If no status, assume out of stock for safety

  // Normalize the status string for comparison (remove spaces, lowercase)
  const normalizedStatus = status.toLowerCase().replace(/[\s_-]/g, "");
  const normalizedEnum = StockStatusEnum.OUT_OF_STOCK.toLowerCase().replace(
    /[\s_-]/g,
    ""
  );

  // Check if the status matches OUT_OF_STOCK
  return (
    normalizedStatus === normalizedEnum ||
    normalizedStatus.includes(normalizedEnum) ||
    normalizedEnum.includes(normalizedStatus)
  );
};

const productRequiresVariationSelection = computed(() => {
  // If it's not a variable product, no variations needed
  if (!isVariableProduct.value) {
    return false;
  }

  // Check if there are any variation attributes defined
  const hasVariationAttributes = product.value?.attributes?.nodes?.some(
    (attr) => attr.variation === true
  );

  // Check if there are actual variation options
  const hasVariationOptions = product.value?.variations?.nodes?.length > 0;

  return hasVariationAttributes && hasVariationOptions;
});

const allRequiredVariationsSelected = computed(() => {
  // If it's not a variable product, no variations needed
  if (!isVariableProduct.value) {
    return true;
  }

  // If the product doesn't require variations, return true
  if (!productRequiresVariationSelection.value) {
    return true;
  }

  // Must have an active variation selected
  return !!activeVariation.value;
});

// Update the disabledAddToCart computed property
const disabledAddToCart = computed(() => {
  // If in fallback mode and not out of stock, enable the button
  if (forceTreatAsSimple.value && !isOutOfStock(stockStatus.value)) {
    return isUpdatingCart.value;
  }

  // Regular variable product checks
  if (isVariableProduct.value) {
    return (
      !type.value ||
      isOutOfStock(stockStatus.value) ||
      (productRequiresVariationSelection.value &&
        !allRequiredVariationsSelected.value) ||
      isUpdatingCart.value
    );
  }

  // Simple product checks
  return !type.value || isOutOfStock(stockStatus.value) || isUpdatingCart.value;
});
const validateForm = () => {
  // For variable products where a variation is required but not found
  if (isVariableProduct.value && !activeVariation.value) {
    // Check if we have attributes selected
    if (attrValues.value && attrValues.value.length > 0) {
      // Save the selected attributes for the cart
      selectedAttributes.value = [...attrValues.value];

      // Ask the customer if they want to continue without a specific variation
      const confirmMessage =
        t("messages.shop.noMatchingVariation") ||
        "We couldn't find an exact match for your selection. Continue with these options?";

      if (confirm(confirmMessage)) {
        // Enable fallback mode
        forceTreatAsSimple.value = true;
        return true;
      }

      return false;
    } else {
      // No attributes selected at all
      alert(
        t("messages.shop.pleaseSelectVariation") ||
          "Please select product options before adding to cart"
      );
      return false;
    }
  }

  return true;
};
</script>

<template>
  <main class="container relative py-6 xl:max-w-7xl">
    <div v-if="product">
      <!-- <SEOHead :info="product" /> -->
      <Breadcrumb
        :product
        class="mb-6"
        v-if="storeSettings.showBreadcrumbOnSingleProduct"
      />
      <!-- Product TOp -->
      <div
        class="flex flex-col gap-10 md:flex-row md:justify-between lg:gap-24"
      >
        <!-- left Cal Product -->
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
                {{ type.name }}
              </h1>
              <StarRating
                :rating="product.averageRating || 0"
                :count="product.reviewCount || 0"
                v-if="storeSettings.showReviews"
              />
            </div>
            <ProductPrice
              class="text-xl"
              :sale-price="type.salePrice"
              :regular-price="type.regularPrice"
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
              <span class="text-gray-400">{{ $t("messages.shop.sku") }}: </span>
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
          <!-- Catagories -->
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
</template>

<style scoped>
.product-categories > a:last-child .comma {
  display: none;
}

input[type="number"]::-webkit-inner-spin-button {
  opacity: 1;
}
</style>
