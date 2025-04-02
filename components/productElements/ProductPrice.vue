<script setup lang="ts">
import { useExchangeRate } from "~/composables/useExchangeRate";
import { convertToCAD, removeCurrencyPrefix } from "~/utils/priceConverter";

interface ProductPriceProps {
  regularPrice?: string | null;
  salePrice?: string | null;
  showAsRange?: boolean;
  isVariable?: boolean;
}

const {
  regularPrice,
  salePrice,
  showAsRange = false,
  isVariable = false,
} = defineProps<ProductPriceProps>();

// Fetch the exchange rate
const { exchangeRate } = useExchangeRate();

// Check if in development environment
const isDev = import.meta.env.DEV;

// Process price format for variable products
const processPriceDisplay = (price: string | null | undefined) => {
  if (!price) return "";

  // Check if price is already a range (contains " - ")
  if (price.includes(" - ")) {
    const [minPrice] = price.split(" - ");
    // For variable products, show "From $XX.XX" format
    if (isVariable && !showAsRange) {
      return `From ${removeCurrencyPrefix(minPrice || "")}`;
    }
  }

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
      <span
        :class="{ 'text-gray-400 line-through font-normal': salePrice }"
        v-html="formattedRegularPrice"
      />
      <span v-if="salePrice" class="ml-2" v-html="formattedSalePrice" />
    </div>
    <div v-if="!exchangeRate && !isDev">Loading exchange rate...</div>
  </div>
</template>
