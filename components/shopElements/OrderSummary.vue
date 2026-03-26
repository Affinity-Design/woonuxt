<script setup lang="ts">
import {convertToCAD, formatPriceWithCAD, cleanAndExtractPriceInfo} from '~/utils/priceConverter';

const {cart, isUpdatingCart} = useCart();
const {exchangeRate} = useExchangeRate();
const {isShippingAddressComplete} = useCheckout();

// Parse a WooCommerce price string (may contain HTML) into a number
const parseWooPrice = (priceStr: string | null | undefined): number => {
  if (!priceStr) return 0;
  let str = String(priceStr);
  str = str.replace(/<[^>]*>/g, '');
  str = str.replace(/&#36;/g, '$');
  str = str.replace(/&nbsp;/g, ' ');
  str = str.replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

// Convert a WooCommerce price string to formatted CAD display string
const formatPrice = (priceString: string | null | undefined): string => {
  if (!priceString) return '$0.00 CAD';
  const numericCheck = parseWooPrice(priceString);
  if (numericCheck === 0) return '$0.00 CAD';

  if (exchangeRate.value) {
    const cadNumericString = convertToCAD(priceString, exchangeRate.value, true);
    if (cadNumericString) {
      return '$' + formatPriceWithCAD(cadNumericString);
    }
  }

  // Fallback: clean up and add CAD label
  let cleaned = String(priceString)
    .replace(/&nbsp;/g, ' ')
    .replace(/US\$/gi, '$')
    .trim();
  if (!cleaned.includes('CAD')) cleaned += ' CAD';
  return cleaned;
};

// Total without shipping — for when user hasn't entered address yet.
// Sums the DISPLAYED values (after formatPrice conversion) to guarantee
// the total always equals subtotal + tax - discount as shown on screen.
// This avoids double-conversion when WooCommerce returns CAD prices (multicurrency).
const totalWithoutShipping = computed(() => {
  // Parse the already-formatted CAD display values for each line
  const subtotalCAD = parseWooPrice(formatPrice(cart.value?.subtotal));
  const taxCAD = parseWooPrice(formatPrice(cart.value?.totalTax));
  const discountCAD = parseWooPrice(formatPrice(cart.value?.discountTotal));
  const result = Math.max(0, subtotalCAD + taxCAD - discountCAD);
  if (result === 0) return '$0.00 CAD';
  return '$' + result.toFixed(2) + ' CAD';
});
</script>

<template>
  <aside v-if="cart" class="bg-white rounded-lg shadow-lg mb-8 w-full min-h-[280px] p-4 sm:p-8 relative md:max-w-md md:top-32 md:sticky">
    <!-- Title -->
    <h2 class="mb-6 text-xl font-semibold leading-none">
      {{ $t('messages.shop.orderSummary') }}
    </h2>
    <!-- Items -->
    <ul class="flex flex-col gap-4 overflow-y-auto">
      <CartCard v-for="item in cart.contents.nodes" :key="item.key" :item />
    </ul>
    <!-- coupon -->
    <AddCoupon class="my-8" />
    <div class="grid gap-1 text-sm font-semibold text-gray-500">
      <!-- Subtotal -->
      <div class="flex justify-between">
        <span>{{ $t('messages.shop.subtotal') }}</span>
        <span class="text-gray-700 tabular-nums">{{ formatPrice(cart.subtotal) }}</span>
      </div>
      <!-- Shipping: only show after user enters full address -->
      <div class="flex justify-between">
        <span>{{ $t('messages.general.shipping') }}</span>
        <span v-if="isShippingAddressComplete && isUpdatingCart" class="text-gray-700">
          <LoadingIcon size="16" />
        </span>
        <span v-else-if="isShippingAddressComplete" class="text-gray-700 tabular-nums">
          {{ parseWooPrice(cart.shippingTotal) > 0 ? '+ ' : '' }}{{ formatPrice(cart.shippingTotal) }}
        </span>
        <span v-else class="text-gray-400 text-xs italic">Enter address for quote</span>
      </div>
      <!-- Tax -->
      <div class="flex justify-between">
        <span>{{ $t('messages.general.tax') }}</span>
        <span class="text-gray-700 tabular-nums">{{ formatPrice(cart.totalTax) }}</span>
      </div>
      <!-- Discount -->
      <Transition name="scale-y" mode="out-in">
        <div v-if="cart && cart.appliedCoupons" class="flex justify-between">
          <span>{{ $t('messages.shop.discount') }}</span>
          <span class="text-primary tabular-nums">- {{ formatPrice(cart.discountTotal) }}</span>
        </div>
      </Transition>
      <!-- Total: exclude shipping when no address provided -->
      <div class="flex justify-between mt-4">
        <span>{{ $t('messages.shop.total') }}</span>
        <span class="text-lg font-bold text-gray-700 tabular-nums">
          {{ isShippingAddressComplete ? formatPrice(cart.total) : totalWithoutShipping }}
        </span>
      </div>
    </div>

    <slot></slot>

    <div v-if="isUpdatingCart" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50">
      <LoadingIcon />
    </div>
  </aside>
</template>
