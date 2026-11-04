<script setup>
import { formatWooPriceForDisplay, normalizeWooPriceText } from "~/utils/priceConverter";

const { updateShippingMethod } = useCart();
const { formatPrice } = useHelpers();
const { exchangeRate } = useExchangeRate();

// WPGraphQL for eCommerce 1.0+ returns ShippingRate.cost already formatted ("$12.00&nbsp;CAD"), which a
// hard-coded "$" prefix turned into "$$12.00". 0.21.1 sent the bare number ("12.00", null when free), so
// a bare number still gets the store's CAD formatting and only formatted text goes through the canonical
// formatter (shown verbatim; only US$-marked text is converted). No second currency layer either way.
const formatShippingCost = (cost) => {
  const costText = normalizeWooPriceText(cost);
  if (!costText || /^[\d.,\s-]+$/.test(costText)) return formatPrice(costText || 0);
  return formatWooPriceForDisplay(costText, exchangeRate.value ?? null);
};

const props = defineProps({
  options: { type: Array, required: true },
  activeOption: { type: String, required: true },
});

const setActiveOption = async (id) => {
  await updateShippingMethod(id);
};
</script>

<template>
  <div class="grid gap-4 shipping-options">
    <div
      v-for="option in options"
      :key="option.id"
      class="flex items-center justify-between option"
      :class="{ 'active-option': option.id === activeOption }"
      @click="setActiveOption(option.id)"
    >
      <div>
        <div
          class="text-sm leading-tight text-gray-500"
          v-html="option.label"
        ></div>
        <div class="font-semibold text-gray-600">
          {{ formatShippingCost(option.cost) }}
        </div>
      </div>

      <icon
        name="ion:checkmark-circle"
        size="20"
        class="ml-auto text-primary checkmark opacity-0"
      />
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.shipping-options {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

  .option {
    @apply bg-white border rounded-lg text-gray-600 cursor-pointer flex flex-1 text-sm py-3 px-4 gap-2 items-center hover:border-purple-300;

    &.active-option {
      @apply border-primary cursor-default border-opacity-50 shadow-sm pointer-events-none;

      & .checkmark {
        @apply opacity-100;
      }
    }
  }
}
</style>
