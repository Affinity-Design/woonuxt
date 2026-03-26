<script setup lang="ts">
import {convertToCAD, formatPriceWithCAD, cleanAndExtractPriceInfo} from '~/utils/priceConverter';

const {cart, toggleCart, isUpdatingCart} = useCart();
const {exchangeRate} = useExchangeRate();

// Parse a WooCommerce price string into a number
const parseWooPrice = (priceStr: string | null | undefined): number => {
  if (!priceStr) return 0;
  let str = String(priceStr);
  str = str.replace(/<[^>]*>/g, '');
  str = str.replace(/&#36;/g, '$');
  str = str.replace(/&nbsp;/g, ' ');
  str = str.replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

// Check if a WooCommerce price string is already in CAD (multicurrency plugin)
const isWooPriceInCAD = (priceStr: string | null | undefined): boolean => {
  if (!priceStr) return false;
  const info = cleanAndExtractPriceInfo(priceStr);
  return info.isCAD;
};

// Cart sidebar shows subtotal only (no shipping — user hasn't entered address yet).
// Computed from subtotal + tax - discount (NOT total - shippingTotal) because
// the backend may include stale shipping in total while reporting shippingTotal as $0.
// Detects if WooCommerce already returns CAD values (multicurrency) to avoid double-conversion.
const formattedCartTotal = computed(() => {
  const subtotalNumeric = parseWooPrice(cart.value?.subtotal);
  const taxNumeric = parseWooPrice(cart.value?.totalTax);
  const discountNumeric = parseWooPrice(cart.value?.discountTotal);
  const totalWithoutShipping = Math.max(0, subtotalNumeric + taxNumeric - discountNumeric);
  if (totalWithoutShipping === 0) return '$0.00 CAD';

  // If WooCommerce prices are already in CAD (multicurrency plugin), don't convert again
  if (isWooPriceInCAD(cart.value?.subtotal)) {
    return '$' + totalWithoutShipping.toFixed(2) + ' CAD';
  }

  // USD prices — convert to CAD
  if (exchangeRate.value) {
    const converted = totalWithoutShipping * exchangeRate.value;
    return '$' + converted.toFixed(2) + ' CAD';
  }

  return `$${totalWithoutShipping.toFixed(2)} CAD`;
});
</script>

<template>
  <div class="fixed top-0 bottom-0 right-0 z-50 flex flex-col w-11/12 max-w-lg overflow-x-hidden bg-white shadow-lg">
    <Icon name="ion:close-outline" class="absolute p-1 rounded-lg shadow-lg top-6 left-6 md:left-8 cursor-pointer" size="34" @click="toggleCart(false)" />
    <EmptyCart v-if="cart && !cart.isEmpty" class="rounded-lg shadow-lg p-1.5 hover:bg-red-400 hover:text-white" />

    <div class="mt-8 text-center">
      {{ $t('messages.shop.cart') }}
      <span v-if="cart?.contents?.productCount"> ({{ cart?.contents?.productCount }}) </span>
    </div>

    <ClientOnly>
      <template v-if="cart && !cart.isEmpty">
        <ul class="flex flex-col flex-1 gap-4 p-6 overflow-y-scroll md:p-8">
          <CartCard v-for="item in cart.contents?.nodes" :key="item.key" :item />
        </ul>
        <div class="px-8 mb-8">
          <NuxtLink
            class="block p-3 text-lg text-center text-white bg-gray-800 rounded-lg shadow-md justify-evenly hover:bg-gray-900"
            to="/checkout"
            @click.prevent="toggleCart()">
            <span class="mx-2">{{ $t('messages.shop.checkout') }}</span>
            <span v-if="isUpdatingCart" class="inline-block h-5 w-24 bg-gray-600 rounded animate-pulse align-middle"></span>
            <span v-else>{{ formattedCartTotal }}</span>
          </NuxtLink>
        </div>
      </template>
      <!-- Empty Cart Message -->
      <EmptyCartMessage v-else-if="cart && cart.isEmpty" />
      <!-- Cart Loading -->
      <div v-else class="flex flex-col items-center justify-center flex-1 mb-20">
        <LoadingIcon />
      </div>
    </ClientOnly>
    <!-- Cart Loading Overlay -->
    <div v-if="isUpdatingCart" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-25">
      <LoadingIcon />
    </div>
  </div>
</template>
