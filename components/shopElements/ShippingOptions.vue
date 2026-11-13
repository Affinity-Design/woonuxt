<script setup>
import { formatWooPriceForDisplay, normalizeWooPriceText } from "~/utils/priceConverter";
import { isPickupRate, sortRatesPickupLast } from "#shared/utils/shippingRateDefaults.mjs";

const { chooseShippingMethod, applyDeliveryDefault, isUpdatingCart, isApplyingDeliveryDefault, shopperChosePickup } = useCart();
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

// Woo preselects "Store Pickup" (first in every Canadian zone), so a shopper who skips this step would get no
// delivery. useCart's applyDeliveryDefault switches to the cheapest delivery rate (pickup is listed last); a shopper
// who clicks pickup keeps it. payNow also awaits applyDeliveryDefault, so payment never runs on the pickup total.
const displayedOptions = computed(() => sortRatesPickupLast(props.options));

const setActiveOption = async (id) => {
  await chooseShippingMethod(id);
};

// A pickup that the system (not the shopper) chose stays clickable, so a shopper who wants pickup can claim it.
const isUnclaimedPickup = (option) => option.id === props.activeOption && isPickupRate(option) && !shopperChosePickup.value;

watch(
  () => [props.options.map((option) => option.id).join("|"), props.activeOption, isUpdatingCart.value],
  () => {
    // Wait out address updates (the watcher re-runs when they finish) and let a running switch report its own result.
    if (isUpdatingCart.value || isApplyingDeliveryDefault.value) return;
    applyDeliveryDefault().catch((error) => {
      console.warn("[ShippingOptions] Could not switch the default from pickup to delivery", error);
      useToast().error("We couldn't select a delivery option. Please choose a shipping option.");
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="grid gap-4 shipping-options">
    <div
      v-for="option in displayedOptions"
      :key="option.id"
      class="flex items-center justify-between option"
      :class="{ 'active-option': option.id === activeOption, 'unclaimed-pickup': isUnclaimedPickup(option) }"
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

      &.unclaimed-pickup {
        @apply cursor-pointer pointer-events-auto;
      }
    }
  }
}
</style>
