<script setup lang="ts">
import { computed } from "vue";
import { useExchangeRate } from "~/composables/useExchangeRate";
// Import from the updated price converter utility (price_converter_ts_no_dollar)
import {
  convertToCAD,
  formatPriceWithCAD,
  cleanAndExtractPriceInfo,
} from "~/utils/priceConverter";

interface ProductPriceProps {
  regularPrice?: string | null;
  salePrice?: string | null;
}

const props = defineProps<ProductPriceProps>();
const { exchangeRate } = useExchangeRate();

const priceStringToFormat = computed(() => {
  // Prioritize sale price if it exists and is not empty
  if (props.salePrice && String(props.salePrice).trim() !== "") {
    return props.salePrice;
  }
  // Otherwise, use regular price
  return props.regularPrice;
});

// Computed property for the final display string *without* the leading '$'
// This will be like "55.99" (fallback) or "70.99 CAD" (converted)
const priceValueForTemplate = computed(() => {
  const rawPrice = priceStringToFormat.value;
  if (
    rawPrice === null ||
    rawPrice === undefined ||
    String(rawPrice).trim() === ""
  ) {
    return ""; // Return empty string if no price
  }

  // --- Fallback Logic (SSR / Exchange Rate NULL) ---
  if (exchangeRate.value === null) {
    const { numericString } = cleanAndExtractPriceInfo(rawPrice);
    // Return JUST the numeric string (e.g., "55.99") or the cleaned original if not numeric
    return (
      numericString ||
      String(rawPrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }

  // --- Exchange Rate IS Available ---
  const cadNumericString = convertToCAD(rawPrice, exchangeRate.value);
  if (cadNumericString === "") {
    // Fallback if conversion fails
    const { numericString: cleanedOriginalNumeric } =
      cleanAndExtractPriceInfo(rawPrice);
    return (
      cleanedOriginalNumeric ||
      String(rawPrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }

  // Format to "XX.YY CAD" (or "XX.YY - ZZ.ZZ CAD") using the updated utility
  // This version of formatPriceWithCAD (from price_converter_ts_no_dollar) does NOT add '$'
  return formatPriceWithCAD(cadNumericString);
});

// Computed property for the regular price when showing both (strikethrough) *without* leading '$'
const regularPriceValueForTemplate = computed(() => {
  // Only needed if salePrice exists and we want to show regular crossed out
  if (
    !props.salePrice ||
    !props.regularPrice ||
    props.salePrice === props.regularPrice
  )
    return null;

  const rawPrice = props.regularPrice;
  if (
    rawPrice === null ||
    rawPrice === undefined ||
    String(rawPrice).trim() === ""
  )
    return null;

  if (exchangeRate.value === null) {
    const { numericString } = cleanAndExtractPriceInfo(rawPrice);
    // Return JUST the numeric string or cleaned original
    return (
      numericString ||
      String(rawPrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }

  const cadNumericString = convertToCAD(rawPrice, exchangeRate.value);
  if (cadNumericString === "") {
    const { numericString: cleanedOriginalNumeric } =
      cleanAndExtractPriceInfo(rawPrice);
    return (
      cleanedOriginalNumeric ||
      String(rawPrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }
  // Format to "XX.YY CAD" using the updated utility (no leading '$')
  return formatPriceWithCAD(cadNumericString);
});
</script>

<template>
  <div class="product-price">
    <span
      v-if="priceValueForTemplate"
      :class="{
        'text-red-600': salePrice && regularPrice && salePrice !== regularPrice,
      }"
    >
      ${{ priceValueForTemplate }}
    </span>

    <span
      v-if="regularPriceValueForTemplate"
      class="ml-2 text-gray-400 line-through font-normal"
    >
      ${{ regularPriceValueForTemplate }}
    </span>

    <span v-else-if="!priceValueForTemplate" class="text-gray-500 text-sm">
      &nbsp;
    </span>
  </div>
</template>

<style scoped>
.product-price span {
  vertical-align: middle;
}
</style>
