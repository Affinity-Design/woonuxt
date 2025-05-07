<script setup lang="ts">
import { computed } from "vue";
import { useExchangeRate } from "~/composables/useExchangeRate";
// Import from the updated price converter utility (price_converter_ts_no_dollar version)
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

// Determine the raw price string to use (prioritize sale price)
const rawPriceStringToFormat = computed(() => {
  if (props.salePrice && String(props.salePrice).trim() !== "")
    return props.salePrice;
  return props.regularPrice;
});

// Check if the raw price string indicates a "From" price
const isFromPrice = computed(() => {
  const rawPrice = rawPriceStringToFormat.value;
  return rawPrice && String(rawPrice).trim().toLowerCase().startsWith("from ");
});

// Extracts the core price part (removes "From " if present) for conversion/formatting
const corePriceStringToFormat = computed(() => {
  const rawPrice = rawPriceStringToFormat.value;
  if (!rawPrice) return null;
  let priceStr = String(rawPrice).trim();
  if (priceStr.toLowerCase().startsWith("from ")) {
    // Remove "From " prefix, case-insensitive
    priceStr = priceStr.substring(5).trim();
  }
  return priceStr; // This might be "$XX.XX" or "XX.XX" etc.
});

// --- Computed property for the numeric/formatted value part (WITHOUT 'From ' or '$') ---
// This will return like "55.99" (fallback) or "70.99 CAD" (converted)
const priceValueForTemplate = computed(() => {
  const corePrice = corePriceStringToFormat.value; // Use the price string without "From "

  if (
    corePrice === null ||
    corePrice === undefined ||
    String(corePrice).trim() === ""
  ) {
    return ""; // Return empty string if no price
  }

  // --- Fallback Logic (SSR / Exchange Rate NULL) ---
  if (exchangeRate.value === null) {
    const { numericString } = cleanAndExtractPriceInfo(corePrice);
    // Return JUST the numeric string (e.g., "55.99") or the cleaned original if not numeric
    return (
      numericString ||
      String(corePrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }

  // --- Exchange Rate IS Available ---
  // Pass the core price (without "From ") to convertToCAD
  const cadNumericString = convertToCAD(corePrice, exchangeRate.value); // Returns "70.99" or ""
  if (cadNumericString === "") {
    const { numericString: cleanedOriginalNumeric } =
      cleanAndExtractPriceInfo(corePrice);
    // Return JUST the numeric string fallback
    return (
      cleanedOriginalNumeric ||
      String(corePrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }

  // Format to "XX.YY CAD" (no leading '$') using the version from price_converter_ts_no_dollar
  return formatPriceWithCAD(cadNumericString);
});

// --- Computed property for the regular price (strikethrough) value part (WITHOUT 'From ' or '$') ---
const regularPriceValueForTemplate = computed(() => {
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

  // Check and remove "From " prefix if present for the regular price as well
  let coreRegularPrice = String(rawPrice).trim();
  if (coreRegularPrice.toLowerCase().startsWith("from ")) {
    coreRegularPrice = coreRegularPrice.substring(5).trim();
  }

  // --- Fallback Logic (SSR / Exchange Rate NULL) ---
  if (exchangeRate.value === null) {
    const { numericString } = cleanAndExtractPriceInfo(coreRegularPrice);
    // Return JUST the numeric string
    return (
      numericString ||
      String(coreRegularPrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }

  // --- Exchange Rate IS Available ---
  const cadNumericString = convertToCAD(coreRegularPrice, exchangeRate.value); // Returns "XX.YY" or ""
  if (cadNumericString === "") {
    const { numericString: cleanedOriginalNumeric } =
      cleanAndExtractPriceInfo(coreRegularPrice);
    // Return JUST the numeric string fallback
    return (
      cleanedOriginalNumeric ||
      String(coreRegularPrice)
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }
  // Format to "XX.YY CAD" (no leading '$')
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
      <span v-if="isFromPrice">From </span> ${{ priceValueForTemplate }}
    </span>

    <span
      v-if="regularPriceValueForTemplate"
      class="ml-2 text-gray-400 line-through font-normal"
    >
      <span
        v-if="
          regularPrice &&
          String(regularPrice).trim().toLowerCase().startsWith('from ')
        "
        >From
      </span>
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
