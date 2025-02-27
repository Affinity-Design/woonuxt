<script setup lang="ts">
import { StockStatusEnum } from "#woo";

const props = defineProps({
  stockStatus: { type: String, required: false },
});

// Helper functions to compare stock status values
const compareStatus = (status: string | undefined, enumValue: string) => {
  if (!status) return false;

  // Normalize both strings for comparison (remove spaces, lowercase)
  const normalizedStatus = status.toLowerCase().replace(/[\s_-]/g, "");
  const normalizedEnum = enumValue.toLowerCase().replace(/[\s_-]/g, "");

  return (
    normalizedStatus === normalizedEnum ||
    normalizedStatus.includes(normalizedEnum) ||
    normalizedEnum.includes(normalizedStatus)
  );
};

const isInStock = (status: string | undefined) =>
  compareStatus(status, StockStatusEnum.IN_STOCK);

const isOutOfStock = (status: string | undefined) =>
  compareStatus(status, StockStatusEnum.OUT_OF_STOCK);

const isOnBackorder = (status: string | undefined) =>
  compareStatus(status, StockStatusEnum.ON_BACKORDER);
</script>

<template>
  <span v-if="isInStock(stockStatus)" class="text-green-600">{{
    $t("messages.shop.inStock")
  }}</span>
  <span v-else-if="isOutOfStock(stockStatus)" class="text-red-600"
    >{{ $t("messages.shop.outOfStock") }}
  </span>
  <span v-else-if="isOnBackorder(stockStatus)" class="text-yellow-600">{{
    $t("messages.shop.onBackorder")
  }}</span>
  <span v-else class="text-gray-600">
    {{ stockStatus || "Loading" }}
  </span>
</template>
