<script setup lang="ts">
const {updateItemQuantity, isUpdatingCart} = useCart();
const {addToWishlist} = useWishlist();
const {FALLBACK_IMG} = useHelpers();
const {storeSettings} = useAppConfig();
const {exchangeRate} = useExchangeRate();
const {backorderItems, clearanceItems} = useCartNotices();

const {item} = defineProps({
  item: {type: Object, required: true},
});

const productType = computed(() => (item.variation ? item.variation?.node : item.product?.node));
const productSlug = computed(() => `/product/${decodeURIComponent(item.product.node.slug)}`);
const isLowStock = computed(() => (productType.value.stockQuantity ? productType.value.lowStockAmount >= productType.value.stockQuantity : false));
const isBackorder = computed(() => backorderItems.value.some((bi) => bi.key === item.key));
const isClearance = computed(() => clearanceItems.value.some((ci) => ci.key === item.key));
const imgScr = computed(() => productType.value.image?.cartSourceUrl || productType.value.image?.sourceUrl || item.product.image?.sourceUrl || FALLBACK_IMG);

// Mirror the product page's getFormattedPriceDisplay() exactly.
// Takes a WooCommerce formatted price string (e.g. "$28.99", "<span>$49.99</span>")
// and converts USD → CAD using the same logic as pages/product/[slug].vue
const formatCartPrice = (priceStr: string | null | undefined): string => {
  if (!priceStr || String(priceStr).trim() === '') return '';

  if (exchangeRate.value === null) {
    const {numericString} = cleanAndExtractPriceInfo(priceStr);
    return numericString ? `${numericString} CAD` : '';
  }

  // convertToCAD with roundTo99=false — same as product page
  const cadNumeric = convertToCAD(priceStr, exchangeRate.value);
  if (cadNumeric === '') {
    const {numericString} = cleanAndExtractPriceInfo(priceStr);
    return numericString ? `${numericString} CAD` : '';
  }
  return formatPriceWithCAD(cadNumeric);
};

// Use the same fields the product page uses: salePrice, regularPrice, price
const isOnSale = computed(() => {
  const sp = productType.value.salePrice;
  const rp = productType.value.regularPrice;
  return !!(sp && rp && sp !== rp);
});

// Main display price: salePrice if on sale, otherwise regularPrice or price
const displayPrice = computed(() => {
  if (isOnSale.value) return formatCartPrice(productType.value.salePrice);
  return formatCartPrice(productType.value.regularPrice || productType.value.price);
});

// Strikethrough regular price (only when on sale)
const displayRegularPrice = computed(() => {
  if (!isOnSale.value) return '';
  return formatCartPrice(productType.value.regularPrice);
});

// Sale percentage from raw numeric values when available
const salePercentage = computed(() => {
  if (!isOnSale.value) return '';
  const {numericString: saleNum} = cleanAndExtractPriceInfo(productType.value.salePrice);
  const {numericString: regNum} = cleanAndExtractPriceInfo(productType.value.regularPrice);
  const sale = parseFloat(saleNum);
  const reg = parseFloat(regNum);
  if (isNaN(sale) || isNaN(reg) || reg === 0) return '';
  return Math.round(((reg - sale) / reg) * 100) + '%';
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
          <template v-if="isUpdatingCart">
            <span class="inline-block h-3 w-16 bg-gray-200 rounded animate-pulse"></span>
            <span class="inline-block h-3 w-10 bg-gray-200 rounded animate-pulse"></span>
          </template>
          <template v-else>
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
            <span
              v-if="isBackorder"
              class="text-[10px] border-yellow-300 leading-none bg-yellow-50 inline-block p-0.5 rounded text-yellow-700 border whitespace-nowrap">
              On Backorder
            </span>
            <span
              v-if="isClearance"
              class="text-[10px] border-red-200 leading-none bg-red-50 inline-block p-0.5 rounded text-red-600 border whitespace-nowrap">
              Non-refundable
            </span>
          </template>
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
