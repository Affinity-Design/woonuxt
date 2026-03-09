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

// Helper: parse a WooCommerce price string (may contain HTML entities) to a number
const parseWooPrice = (str: string | null | undefined): number => {
  if (!str) return NaN;
  let s = String(str).replace(/<[^>]*>/g, '').replace(/&#36;/g, '$').replace(/&nbsp;/g, ' ').replace(/[^0-9.-]/g, '');
  return parseFloat(s);
};

// Convert a raw USD price string to CAD display string (XX.XX CAD)
const convertPrice = (rawPrice: string | null | undefined): string => {
  if (!rawPrice) return '';
  if (exchangeRate.value === null) {
    const {numericString} = cleanAndExtractPriceInfo(rawPrice);
    return numericString ? `${numericString} CAD` : '';
  }
  const cadNumeric = convertToCAD(rawPrice, exchangeRate.value, true);
  return cadNumeric ? formatPriceWithCAD(cadNumeric) : '';
};

// Use the cart line item's subtotal as the authoritative price source.
// WooCommerce calculates this correctly regardless of currency/session context.
// item.subtotal = price × quantity (before tax), so unit price = subtotal / quantity.
const unitPrice = computed(() => {
  const subtotalNum = parseWooPrice(item.subtotal);
  const qty = item.quantity || 1;
  if (!isNaN(subtotalNum) && subtotalNum > 0) {
    return (subtotalNum / qty).toFixed(2);
  }
  return '';
});

// Display price: convert the unit price (from subtotal) to CAD
const displayPrice = computed(() => {
  if (unitPrice.value) return convertPrice('$' + unitPrice.value);
  return '';
});

// Detect sale: compare unit price against raw regular price
const rawRegular = computed(() => parseFloat(productType.value.rawRegularPrice));
const isOnSale = computed(() => {
  const unit = parseFloat(unitPrice.value);
  if (!isNaN(unit) && !isNaN(rawRegular.value) && rawRegular.value > 0) {
    return unit < rawRegular.value;
  }
  return !!productType.value.salePrice;
});

// Regular price display (strikethrough when on sale)
const displayRegularPrice = computed(() => {
  if (!isOnSale.value) return '';
  if (!isNaN(rawRegular.value) && rawRegular.value > 0) {
    return convertPrice('$' + rawRegular.value.toFixed(2));
  }
  return '';
});

// Sale percentage
const salePercentage = computed(() => {
  const unit = parseFloat(unitPrice.value);
  if (!isOnSale.value || isNaN(rawRegular.value) || isNaN(unit)) return '';
  return Math.round(((rawRegular.value - unit) / rawRegular.value) * 100) + '%';
});

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
          <span :class="{'text-red-600': isOnSale}">${{ displayPrice }}</span>
          <span v-if="isOnSale && displayRegularPrice" class="text-gray-400 line-through font-normal">${{ displayRegularPrice }}</span>
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
