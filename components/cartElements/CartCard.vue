<script setup>
const {updateItemQuantity} = useCart();
const {addToWishlist} = useWishlist();
const {FALLBACK_IMG} = useHelpers();
const {storeSettings} = useAppConfig();

const {item} = defineProps({
  item: {type: Object, required: true},
});

const productType = computed(() => (item.variation ? item.variation?.node : item.product?.node));
const productSlug = computed(() => `/product/${decodeURIComponent(item.product.node.slug)}`);
const isLowStock = computed(() => (productType.value.stockQuantity ? productType.value.lowStockAmount >= productType.value.stockQuantity : false));
const imgScr = computed(() => productType.value.image?.cartSourceUrl || productType.value.image?.sourceUrl || item.product.image?.sourceUrl || FALLBACK_IMG);
const regularPrice = computed(() => parseFloat(productType.value.rawRegularPrice));
const salePrice = computed(() => parseFloat(productType.value.rawSalePrice));
const salePercentage = computed(() => Math.round(((regularPrice.value - salePrice.value) / regularPrice.value) * 100) + '%');

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
        <div class="flex flex-wrap gap-x-2 gap-y-1 items-start text-sm">
          <!-- Product title with text wrapping -->
          <NuxtLink class="leading-tight line-clamp-2 break-words" :to="productSlug">
            {{ productType.name }}
          </NuxtLink>

          <!-- Sale tag -->
          <span
            v-if="productType.salePrice"
            class="text-[10px] border-green-200 leading-none bg-green-100 inline-block p-0.5 rounded text-green-600 border whitespace-nowrap">
            Save {{ salePercentage }}
          </span>

          <!-- Low stock tag -->
          <span
            v-if="isLowStock"
            class="text-[10px] border-yellow-200 leading-none bg-yellow-100 inline-block p-0.5 rounded text-orange-500 border whitespace-nowrap">
            Low Stock
          </span>
        </div>

        <!-- Price with margin top for separation -->
        <ProductPrice class="mt-1 text-xs" :sale-price="productType.salePrice" :regular-price="productType.regularPrice" />
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
