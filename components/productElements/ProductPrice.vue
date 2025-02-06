<script setup lang="ts">
import { useExchangeRate } from "~/composables/useExchangeRate";
import { convertToCAD, removeCurrencyPrefix } from "~/utils/priceConverter";

interface ProductPriceProps {
  regularPrice?: string | null;
  salePrice?: string | null;
}

const { regularPrice, salePrice } = defineProps<ProductPriceProps>();

// Fetch the exchange rate
const { exchangeRate } = useExchangeRate();

// Check if in development environment
const isDev = import.meta.env.DEV;

// Computed properties for formatted prices
const formattedRegularPrice = computed(() => {
  if (isDev || exchangeRate.value === null) {
    // If in development environment or exchange rate is not available, return the original price
    return removeCurrencyPrefix(regularPrice || "");
  }
  return convertToCAD(regularPrice, exchangeRate.value);
});

const formattedSalePrice = computed(() => {
  if (isDev || exchangeRate.value === null) {
    // If in development environment or exchange rate is not available, return the original price
    return removeCurrencyPrefix(salePrice || "");
  }
  return convertToCAD(salePrice, exchangeRate.value);
});
</script>

<template>
  <div v-if="regularPrice" class="flex font-semibold">
    <span
      :class="{ 'text-gray-400 line-through font-normal': salePrice }"
      v-html="formattedRegularPrice"
    />
    <span v-if="salePrice" class="ml-2" v-html="formattedSalePrice" />
  </div>
  <div v-if="!exchangeRate && !isDev">Loading exchange rate...</div>
</template>
