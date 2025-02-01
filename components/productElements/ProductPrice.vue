<script setup lang="ts">
interface ProductPriceProps {
  regularPrice?: string | null;
  salePrice?: string | null;
}

const { regularPrice, salePrice } = defineProps<ProductPriceProps>();

// Utility function to remove 'CA' prefix
const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  return price.replace(/^CA\$/, "$");
};

// Computed properties for formatted prices
const formattedRegularPrice = computed(() =>
  removeCurrencyPrefix(regularPrice)
);
const formattedSalePrice = computed(() => removeCurrencyPrefix(salePrice));
</script>

<template>
  <div v-if="regularPrice" class="flex font-semibold">
    <span
      :class="{ 'text-gray-400 line-through font-normal': salePrice }"
      v-html="formattedRegularPrice"
    />
    <span v-if="salePrice" class="ml-2" v-html="formattedSalePrice" />
  </div>
</template>
