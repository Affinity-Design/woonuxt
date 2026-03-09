<script setup lang="ts">
import {convertToCAD, formatPriceWithCAD} from '~/utils/priceConverter';

const {cart, isUpdatingCart} = useCart();
const {exchangeRate} = useExchangeRate();
const {customer} = useAuth();

// Only show shipping when the user has entered a postal code
const hasShippingAddress = computed(() => {
  const postcode = customer.value?.billing?.postcode;
  return postcode && String(postcode).trim().length > 0;
});

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
  let cleaned = String(priceString).replace(/&nbsp;/g, ' ').replace(/US\$/gi, '$').trim();
  if (!cleaned.includes('CAD')) cleaned += ' CAD';
  return cleaned;
};

// Total without shipping — for when user hasn't entered address yet
const totalWithoutShipping = computed(() => {
  const rawTotal = cart.value?.rawTotal;
  const totalNumeric = rawTotal ? parseFloat(String(rawTotal)) : parseWooPrice(cart.value?.total);
  if (isNaN(totalNumeric) || totalNumeric === 0) return '$0.00';
  const shippingNumeric = parseWooPrice(cart.value?.shippingTotal);
  const adjusted = Math.max(0, totalNumeric - shippingNumeric);
  return '$' + adjusted.toFixed(2);
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
      <!-- Shipping: only show after user enters postal code -->
      <div class="flex justify-between">
        <span>{{ $t('messages.general.shipping') }}</span>
        <span v-if="hasShippingAddress" class="text-gray-700 tabular-nums">
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
          {{ hasShippingAddress ? formatPrice(cart.total) : formatPrice(totalWithoutShipping) }}
        </span>
      </div>
    </div>

    <slot></slot>

    <div v-if="isUpdatingCart" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50">
      <LoadingIcon />
    </div>
  </aside>
</template>
