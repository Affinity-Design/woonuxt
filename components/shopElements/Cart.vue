<script setup lang="ts">
import {computed} from 'vue';
import {convertToCAD, formatPriceWithCAD, cleanAndExtractPriceInfo} from '~/utils/priceConverter';

const {cart, toggleCart, isUpdatingCart} = useCart();
const {exchangeRate} = useExchangeRate();

// Convert cart total from USD to CAD using the exchange rate
// Uses .99 rounding to match product price display (client preference)
const formattedCartTotal = computed(() => {
  const rawTotal = cart.value?.total;
  if (!rawTotal) return '$0.00 CAD';

  // Check for zero amount
  if (rawTotal.includes('$0.00')) {
    return '$0.00 CAD';
  }

  // If exchange rate is not available, show raw price cleaned up
  if (exchangeRate.value === null) {
    const {numericString} = cleanAndExtractPriceInfo(rawTotal);
    return numericString ? `$${numericString} CAD` : '$0.00 CAD';
  }

  // Convert using exchange rate with .99 rounding (matches product price display)
  const cadNumericString = convertToCAD(rawTotal, exchangeRate.value, true);
  if (!cadNumericString) {
    const {numericString} = cleanAndExtractPriceInfo(rawTotal);
    return numericString ? `$${numericString} CAD` : '$0.00 CAD';
  }

  // Format with $ prefix and CAD suffix
  return `$${formatPriceWithCAD(cadNumericString)}`;
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
            <span>{{ formattedCartTotal }}</span>
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
