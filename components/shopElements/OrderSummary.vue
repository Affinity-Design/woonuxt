<script setup>
const { cart, isUpdatingCart } = useCart();

// Helper function to sanitize price strings and fix &nbsp; issues
const formatPrice = (priceString) => {
  if (!priceString) return "$0.00 CAD";

  // First, check if it's a zero amount with &nbsp;
  if (priceString.includes("$0.00&nbsp;CAD")) {
    return "$0.00 CAD";
  }

  // If it's just a price with &nbsp;, replace it with a regular space
  return priceString.replace(/&nbsp;/g, " ");
};

// For values that need the + prefix on positive amounts
const formatShipping = (priceString) => {
  if (!priceString) return "$0.00 CAD";

  // Check if it's a zero amount
  if (priceString.includes("$0.00")) {
    return "$0.00 CAD";
  }

  const isPositive =
    !priceString.includes("-") &&
    parseFloat(priceString.replace(/[^0-9.-]/g, "")) > 0;
  const formattedPrice = formatPrice(priceString);

  return isPositive ? "+" + formattedPrice : formattedPrice;
};
</script>

<template>
  <aside
    v-if="cart"
    class="bg-white rounded-lg shadow-lg mb-8 w-full min-h-[280px] p-4 sm:p-8 relative md:max-w-md md:top-32 md:sticky"
  >
    <!-- Title -->
    <h2 class="mb-6 text-xl font-semibold leading-none">
      {{ $t("messages.shop.orderSummary") }}
    </h2>
    <!-- Items -->
    <ul class="flex flex-col gap-4 overflow-y-auto">
      <CartCard v-for="item in cart.contents.nodes" :key="item.key" :item />
    </ul>
    <!-- coupon -->
    <AddCoupon class="my-8" />
    <div class="grid gap-1 text-sm font-semibold text-gray-500">
      <!-- sub -->
      <div class="flex justify-between">
        <span>{{ $t("messages.shop.subtotal") }}</span>
        <span class="text-gray-700 tabular-nums">{{
          formatPrice(cart.subtotal)
        }}</span>
      </div>
      <!-- shipping -->
      <div class="flex justify-between">
        <span>{{ $t("messages.general.shipping") }}</span>
        <span class="text-gray-700 tabular-nums">{{
          formatShipping(cart.shippingTotal)
        }}</span>
      </div>
      <!-- tax -->
      <div class="flex justify-between">
        <span>{{ $t("messages.general.tax") }}</span>
        <span class="text-gray-700 tabular-nums">{{
          formatPrice(cart.totalTax)
        }}</span>
      </div>
      <Transition name="scale-y" mode="out-in">
        <div v-if="cart && cart.appliedCoupons" class="flex justify-between">
          <span>{{ $t("messages.shop.discount") }}</span>
          <span class="text-primary tabular-nums">
            - {{ formatPrice(cart.discountTotal) }}
          </span>
        </div>
      </Transition>
      <!-- total -->
      <div class="flex justify-between mt-4">
        <span>{{ $t("messages.shop.total") }}</span>
        <span class="text-lg font-bold text-gray-700 tabular-nums">
          {{ formatPrice(cart.total) }}
        </span>
      </div>
    </div>

    <slot></slot>

    <div
      v-if="isUpdatingCart"
      class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50"
    >
      <LoadingIcon />
    </div>
  </aside>
</template>
