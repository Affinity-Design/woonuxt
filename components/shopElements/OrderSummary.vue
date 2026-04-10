<script setup lang="ts">
import {calculateLifecycleCartPricing, formatCadCurrency} from '~/utils/lifecyclePricing';

const {cart, isUpdatingCart} = useCart();
const {exchangeRate} = useExchangeRate();
const {isShippingAddressComplete} = useCheckout();

const lifecycleCartPricing = computed(() => calculateLifecycleCartPricing(cart.value, exchangeRate.value));
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
        <span class="text-gray-700 tabular-nums">{{ formatCadCurrency(lifecycleCartPricing.subtotal) }}</span>
      </div>
      <!-- Shipping: only show after user enters full address -->
      <div class="flex justify-between">
        <span>{{ $t('messages.general.shipping') }}</span>
        <span v-if="isShippingAddressComplete && isUpdatingCart" class="text-gray-700">
          <LoadingIcon size="16" />
        </span>
        <span v-else-if="isShippingAddressComplete" class="text-gray-700 tabular-nums">
          {{ lifecycleCartPricing.shipping > 0 ? '+ ' : '' }}{{ formatCadCurrency(lifecycleCartPricing.shipping) }}
        </span>
        <span v-else class="text-gray-400 text-xs italic">Enter address for quote</span>
      </div>
      <!-- Tax -->
      <div class="flex justify-between">
        <span>{{ $t('messages.general.tax') }}</span>
        <span class="text-gray-700 tabular-nums">{{ formatCadCurrency(lifecycleCartPricing.tax) }}</span>
      </div>
      <!-- Discount -->
      <Transition name="scale-y" mode="out-in">
        <div v-if="lifecycleCartPricing.discount > 0" class="flex justify-between">
          <span>{{ $t('messages.shop.discount') }}</span>
          <span class="text-primary tabular-nums">- {{ formatCadCurrency(lifecycleCartPricing.discount) }}</span>
        </div>
      </Transition>
      <!-- Total: exclude shipping when no address provided -->
      <div class="flex justify-between mt-4">
        <span>{{ $t('messages.shop.total') }}</span>
        <span class="text-lg font-bold text-gray-700 tabular-nums">
          {{ formatCadCurrency(isShippingAddressComplete ? lifecycleCartPricing.total : lifecycleCartPricing.totalWithoutShipping) }}
        </span>
      </div>
    </div>

    <slot></slot>

    <div v-if="isUpdatingCart" class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50">
      <LoadingIcon />
    </div>
  </aside>
</template>
