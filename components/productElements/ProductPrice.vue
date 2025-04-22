<script setup lang="ts">
import { useExchangeRate } from "~/composables/useExchangeRate";
import { convertToCAD, removeCurrencyPrefix } from "~/utils/priceConverter";

interface ProductPriceProps {
  regularPrice?: string | null;
  salePrice?: string | null;
  showAsRange?: boolean;
  isVariable?: boolean;
  showBothPrices?: boolean;
}

const props = defineProps<ProductPriceProps>();
const {
  regularPrice,
  salePrice,
  showAsRange = false,
  isVariable = false,
  showBothPrices = false,
} = props;

// For debugging
if (import.meta.env.DEV) {
  //   console.log("ProductPrice props:", {
  //     regularPrice,
  //     salePrice,
  //     showAsRange,
  //     isVariable,
  //     hasRange: regularPrice?.includes(" - ") || salePrice?.includes(" - "),
  //   });
  // }
}
// Fetch the exchange rate
const { exchangeRate } = useExchangeRate();

// Check if in development environment
const isDev = import.meta.env.DEV;

// Process price format for variable products
const processPriceDisplay = (price: string | null | undefined) => {
  if (!price) return "";

  // For variable products where we don't want to show range
  if (isVariable && !showAsRange) {
    // Check if price is already a range (contains " - ")
    if (price.includes(" - ")) {
      const [minPrice] = price.split(" - ");
      // Always show "From $XX.XX" format for variable products
      return `From ${removeCurrencyPrefix(minPrice || "")}`;
    }

    // Even for single prices, show "From" for variable products
    return `From ${removeCurrencyPrefix(price)}`;
  }

  // For regular products or when explicitly showing range
  return removeCurrencyPrefix(price);
};

// Computed properties for formatted prices
const formattedRegularPrice = computed(() => {
  if (isDev || exchangeRate.value === null) {
    // If in development environment or exchange rate is not available, return the original price
    return processPriceDisplay(regularPrice);
  }
  return convertToCAD(regularPrice, exchangeRate.value);
});

const formattedSalePrice = computed(() => {
  if (isDev || exchangeRate.value === null) {
    // If in development environment or exchange rate is not available, return the original price
    return processPriceDisplay(salePrice);
  }
  return convertToCAD(salePrice, exchangeRate.value);
});
</script>

<template>
  <div class="product-price">
    <div v-if="regularPrice" class="flex font-semibold">
      <!-- When sale price exists, only show it (simplified view) -->
      <template v-if="salePrice && !showBothPrices">
        <span v-html="formattedSalePrice" />
      </template>
      <!-- Traditional view with regular price crossed out when on sale -->
      <template v-else>
        <span
          :class="{ 'text-gray-400 line-through font-normal': salePrice }"
          v-html="formattedRegularPrice"
        />
        <span v-if="salePrice" class="ml-2" v-html="formattedSalePrice" />
      </template>
    </div>
    <div v-if="!exchangeRate && !isDev">Loading exchange rate...</div>
  </div>
</template>
