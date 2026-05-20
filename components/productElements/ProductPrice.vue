<script setup lang="ts">
import {computed} from 'vue';

interface ProductPriceProps {
  price?: string | null;
  regularPrice?: string | null;
  salePrice?: string | null;
  isVariable?: boolean;
  showAsRange?: boolean;
  showBothPrices?: boolean;
}

const props = withDefaults(defineProps<ProductPriceProps>(), {
  price: null,
  regularPrice: null,
  salePrice: null,
  isVariable: false,
  showAsRange: false,
  showBothPrices: true,
});

const normalizeWooPriceText = (rawPrice: string | null | undefined): string => {
  if (!rawPrice) return '';

  return String(rawPrice)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#36;/g, '$')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, ' - ')
    .replace(/[\u2013\u2014]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
};

const removeFromPrefix = (priceText: string): string => priceText.replace(/^from\s+/i, '').trim();

const hasFromPrefix = (rawPrice: string | null | undefined): boolean => normalizeWooPriceText(rawPrice).toLowerCase().startsWith('from ');

const displayPriceText = (rawPrice: string | null | undefined): string => removeFromPrefix(normalizeWooPriceText(rawPrice));

const splitPriceRange = (rawPrice: string | null | undefined): string[] => {
  const priceText = displayPriceText(rawPrice);
  if (!priceText) return [];

  return priceText
    .split(/\s+-\s+/)
    .map((rangePart) => rangePart.trim())
    .filter(Boolean);
};

const variableRangeDisplay = computed(() => {
  if (!props.isVariable || !props.price) return null;

  const rangeParts = splitPriceRange(props.price);
  if (rangeParts.length < 2) return null;

  if (props.showAsRange) {
    return {
      priceText: rangeParts.join(' - '),
      isFrom: false,
    };
  }

  return {
    priceText: rangeParts[0],
    isFrom: true,
  };
});

const hasDistinctSalePrice = computed(() => {
  const salePrice = displayPriceText(props.salePrice);
  const regularPrice = displayPriceText(props.regularPrice);
  return !!salePrice && !!regularPrice && salePrice !== regularPrice;
});

const rawPriceStringToDisplay = computed(() => {
  if (variableRangeDisplay.value) return null;
  if (!props.showBothPrices && props.price && String(props.price).trim() !== '') return props.price;
  if (props.salePrice && String(props.salePrice).trim() !== '') return props.salePrice;
  return props.regularPrice || props.price;
});

const isFromPrice = computed(() => {
  if (variableRangeDisplay.value) return variableRangeDisplay.value.isFrom;
  return hasFromPrefix(rawPriceStringToDisplay.value);
});

const priceValueForTemplate = computed(() => {
  if (variableRangeDisplay.value) return variableRangeDisplay.value.priceText;
  return displayPriceText(rawPriceStringToDisplay.value);
});

const regularPriceValueForTemplate = computed(() => {
  if (!props.showBothPrices || variableRangeDisplay.value || !hasDistinctSalePrice.value) return null;
  return displayPriceText(props.regularPrice);
});
</script>

<template>
  <div class="product-price">
    <span
      v-if="priceValueForTemplate"
      :class="{
        'text-red-600': hasDistinctSalePrice,
      }">
      <span v-if="isFromPrice">From </span>{{ priceValueForTemplate }}
    </span>

    <span v-if="regularPriceValueForTemplate" class="ml-2 text-gray-400 line-through font-normal">
      <span v-if="regularPrice && String(regularPrice).trim().toLowerCase().startsWith('from ')">From </span>
      {{ regularPriceValueForTemplate }}
    </span>

    <span v-else-if="!priceValueForTemplate" class="text-gray-500 text-sm"> &nbsp; </span>
  </div>
</template>

<style scoped>
.product-price span {
  vertical-align: middle;
}
</style>
