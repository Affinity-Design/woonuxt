<script setup>
const {updateItemQuantity} = useCart();
const {addToWishlist} = useWishlist();
const {FALLBACK_IMG} = useHelpers();
const {storeSettings} = useAppConfig();
const {exchangeRate} = useExchangeRate();

const {item} = defineProps({
  item: {type: Object, required: true},
});

const productType = computed(() => (item.variation ? item.variation?.node : item.product?.node));
const productSlug = computed(() => `/product/${decodeURIComponent(item.product.node.slug)}`);
const isLowStock = computed(() => (productType.value.stockQuantity ? productType.value.lowStockAmount >= productType.value.stockQuantity : false));
const imgScr = computed(() => productType.value.image?.cartSourceUrl || productType.value.image?.sourceUrl || item.product.image?.sourceUrl || FALLBACK_IMG);

// Parse raw numeric prices (USD from WooCommerce).
// For variations: rawPrice may not exist in base CartFragment, use price field parsed as fallback.
const rawPrice = computed(() => {
  const val = parseFloat(productType.value.rawPrice);
  if (!isNaN(val)) return val;
  // Fallback: parse the formatted `price` field (e.g. "$29.99" or "<span>$29.99</span>")
  const {numericString} = cleanAndExtractPriceInfo(productType.value.price);
  return parseFloat(numericString);
});
const rawRegular = computed(() => parseFloat(productType.value.rawRegularPrice));
const rawSale = computed(() => parseFloat(productType.value.rawSalePrice));

// Detect sale
const isOnSale = computed(() => {
  if (!isNaN(rawSale.value) && rawSale.value > 0 && !isNaN(rawRegular.value)) {
    return rawSale.value < rawRegular.value;
  }
  if (!isNaN(rawPrice.value) && rawPrice.value > 0 && !isNaN(rawRegular.value) && rawRegular.value > 0) {
    return rawPrice.value < rawRegular.value;
  }
  return !!productType.value.salePrice;
});

// The actual sale price value: rawSalePrice → rawPrice (when on sale)
const currentSaleValue = computed(() => {
  if (!isNaN(rawSale.value) && rawSale.value > 0) return rawSale.value;
  if (isOnSale.value && !isNaN(rawPrice.value) && rawPrice.value > 0) return rawPrice.value;
  return NaN;
});

const salePercentage = computed(() => {
  if (!isOnSale.value || isNaN(rawRegular.value) || isNaN(currentSaleValue.value)) return '';
  return Math.round(((rawRegular.value - currentSaleValue.value) / rawRegular.value) * 100) + '%';
});

// Convert a raw USD price string to CAD display string directly.
// This avoids double-conversion that happens when passing to ProductPrice.
const convertPrice = (rawPrice: string | null | undefined): string => {
  if (!rawPrice) return '';
  if (exchangeRate.value === null) {
    const {numericString} = cleanAndExtractPriceInfo(rawPrice);
    return numericString ? `${numericString} CAD` : '';
  }
  const cadNumeric = convertToCAD(rawPrice, exchangeRate.value, true);
  return cadNumeric ? formatPriceWithCAD(cadNumeric) : '';
};

// Build the raw USD price string to pass through conversion (once).
const salePriceRaw = computed(() => {
  if (!isNaN(currentSaleValue.value)) return '$' + currentSaleValue.value.toFixed(2);
  return productType.value.salePrice || null;
});

const regularPriceRaw = computed(() => {
  if (!isNaN(rawRegular.value) && rawRegular.value > 0) return '$' + rawRegular.value.toFixed(2);
  return productType.value.regularPrice || productType.value.price || null;
});

// Final display strings (converted to CAD once, directly)
const displaySalePrice = computed(() => (isOnSale.value && salePriceRaw.value ? convertPrice(salePriceRaw.value) : ''));
const displayRegularPrice = computed(() => convertPrice(regularPriceRaw.value));

const removeItem = () => {
  updateItemQuantity(item.key, 0);
};

const moveToWishList = () => {
  addToWishlist(item.product.node);
  removeItem();
};
</script>

<template>
  <SwipeCard @remove="removeItem">
    <div v-if="productType" class="flex items-start gap-2 group py-2">
      <!-- Product Image (fixed width) -->
      <NuxtLink :to="productSlug" class="flex-shrink-0">
        <img
          width="64"
          height="64"
          class="w-16 h-16 rounded-md skeleton"
          :src="imgScr"
          :alt="productType.image?.altText || productType.name"
          :title="productType.image?.title || productType.name"
          loading="lazy" />
      </NuxtLink>

      <!-- Product Details with flex-grow -->
      <div class="flex-1 min-w-0 flex flex-col">
        <!-- Product title -->
        <NuxtLink class="leading-tight line-clamp-2 break-words text-sm" :to="productSlug">
          {{ productType.name }}
        </NuxtLink>

        <!-- Price line: sale price ~~regular~~ Save X% -->
        <div class="mt-1 text-xs flex flex-wrap items-center gap-x-2 gap-y-1">
          <span v-if="displaySalePrice" class="text-red-600">${{ displaySalePrice }}</span>
          <span v-if="isOnSale && displayRegularPrice" class="text-gray-400 line-through font-normal">${{ displayRegularPrice }}</span>
          <span v-else-if="displayRegularPrice">${{ displayRegularPrice }}</span>
          <span
            v-if="isOnSale && salePercentage"
            class="text-[10px] border-green-200 leading-none bg-green-100 inline-block p-0.5 rounded text-green-600 border whitespace-nowrap">
            Save {{ salePercentage }}
          </span>
          <span
            v-if="isLowStock"
            class="text-[10px] border-yellow-200 leading-none bg-yellow-100 inline-block p-0.5 rounded text-orange-500 border whitespace-nowrap">
            Low Stock
          </span>
        </div>
      </div>

      <!-- Quantity Controls with fixed width -->
      <div class="flex-shrink-0 inline-flex gap-2 flex-col items-end min-w-[80px]">
        <QuantityInput :item />
        <div class="text-xs text-gray-400 group-hover:text-gray-700 flex leading-none items-center">
          <button v-if="storeSettings.showMoveToWishlist" class="mr-2 pr-2 border-r whitespace-nowrap" @click="moveToWishList" type="button">
            Move to Wishlist
          </button>
          <button
            title="Remove Item"
            aria-label="Remove Item"
            @click="removeItem"
            type="button"
            class="flex items-center gap-1 hover:text-red-500 cursor-pointer">
            <Icon name="ion:trash" class="hidden md:inline-block" size="12" />
          </button>
        </div>
      </div>
    </div>
  </SwipeCard>
</template>

<style lang="postcss" scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
