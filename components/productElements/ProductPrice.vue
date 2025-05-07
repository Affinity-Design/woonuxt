<script setup lang="ts">
import { computed } from "vue";
import { useExchangeRate } from "~/composables/useExchangeRate";
// Import the necessary functions from your updated price converter utility
import {
  convertToCAD,
  formatPriceWithCAD,
  cleanAndExtractPriceInfo,
} from "~/utils/priceConverter";

interface ProductPriceProps {
  regularPrice?: string | null;
  salePrice?: string | null;
  // Removed showAsRange, isVariable, showBothPrices as the logic will be self-contained
  // Add them back if the component *needs* to behave differently based on these,
  // but the core formatting should be consistent.
}

const props = defineProps<ProductPriceProps>();

// Get the reactive exchange rate
const { exchangeRate } = useExchangeRate();

// Determine the price to display (prioritize sale price)
const priceStringToFormat = computed(() => {
  // Use sale price if it exists and is not empty, otherwise use regular price
  if (props.salePrice && String(props.salePrice).trim() !== "") {
    return props.salePrice;
  }
  return props.regularPrice;
});

// Computed property for the final, formatted display price
const formattedDisplayPrice = computed(() => {
  const rawPrice = priceStringToFormat.value; // The raw string (e.g., "$55.99&nbsp;CAD", "60.00")

  if (
    rawPrice === null ||
    rawPrice === undefined ||
    String(rawPrice).trim() === ""
  ) {
    return ""; // Or a placeholder like "N/A" or t('priceUnavailable')
  }

  // --- Fallback Logic (SSR / Exchange Rate NULL) ---
  if (exchangeRate.value === null) {
    // console.warn(`[ProductPrice] Exchange rate is NULL. Displaying basic format for: "${rawPrice}"`);
    // Clean the raw price and get the basic numeric string
    const { numericString } = cleanAndExtractPriceInfo(rawPrice);
    if (numericString) {
      // ONLY prepend '$'. No conversion, no "CAD" suffix yet.
      return `$${numericString}`;
    }
    // If not numeric after cleaning (e.g., "Call for price"), return the cleaned original
    return String(rawPrice)
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // --- Exchange Rate IS Available ---
  // console.log(`[ProductPrice] Exchange rate IS available (${exchangeRate.value}). Converting: "${rawPrice}"`);

  // 1. Convert the raw price string to a CAD numeric string (e.g., "75.99")
  // `convertToCAD` handles internal cleaning via `cleanAndExtractPriceInfo`
  const cadNumericString = convertToCAD(rawPrice, exchangeRate.value);

  if (cadNumericString === "") {
    // console.warn(`[ProductPrice] CAD conversion failed for price: "${rawPrice}". Displaying cleaned original fallback.`);
    const { numericString: cleanedOriginalNumeric } =
      cleanAndExtractPriceInfo(rawPrice);
    if (cleanedOriginalNumeric) {
      return `$${cleanedOriginalNumeric}`; // Basic $ prefix fallback
    }
    return String(rawPrice)
      .replace(/&nbsp;/g, " ")
      .trim(); // Last resort fallback
  }

  // 2. Format the CAD numeric string with "$" and " CAD" suffix
  // `formatPriceWithCAD` handles adding the currency symbol and code correctly.
  return formatPriceWithCAD(cadNumericString);
});

// Computed property for the regular price when showing both (e.g., for strikethrough)
const formattedRegularPriceForDisplay = computed(() => {
  // Only needed if salePrice exists and we want to show regular crossed out
  if (!props.salePrice || !props.regularPrice) return null;

  const rawPrice = props.regularPrice;

  if (exchangeRate.value === null) {
    const { numericString } = cleanAndExtractPriceInfo(rawPrice);
    return numericString
      ? `$${numericString}`
      : String(rawPrice)
          .replace(/&nbsp;/g, " ")
          .trim();
  }

  const cadNumericString = convertToCAD(rawPrice, exchangeRate.value);
  if (cadNumericString === "") {
    const { numericString: cleanedOriginalNumeric } =
      cleanAndExtractPriceInfo(rawPrice);
    return cleanedOriginalNumeric
      ? `$${cleanedOriginalNumeric}`
      : String(rawPrice)
          .replace(/&nbsp;/g, " ")
          .trim();
  }
  // We might not want the " CAD" suffix for the strikethrough price, adjust formatPriceWithCAD if needed
  // or create a simpler formatting function. For now, using the full format.
  return formatPriceWithCAD(cadNumericString);
});
</script>

<template>
  <div class="product-price">
    <span
      v-if="formattedDisplayPrice"
      :class="{
        'text-red-600': salePrice && regularPrice && salePrice !== regularPrice,
      }"
    >
      {{ formattedDisplayPrice }}
    </span>

    <span
      v-if="
        salePrice &&
        regularPrice &&
        salePrice !== regularPrice &&
        formattedRegularPriceForDisplay
      "
      class="ml-2 text-gray-400 line-through font-normal"
    >
      {{ formattedRegularPriceForDisplay }}
    </span>

    <span v-else-if="!formattedDisplayPrice" class="text-gray-500 text-sm">
      &nbsp;
    </span>
  </div>
</template>

<style scoped>
/* Add any specific styling for ProductPrice component here */
.product-price span {
  /* Example: ensure consistent vertical alignment */
  vertical-align: middle;
}
</style>
