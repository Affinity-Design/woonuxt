<script setup lang="ts">
import {computed} from 'vue';
import {cleanAndExtractPriceInfo, convertToCAD, formatPriceWithCAD} from '~/utils/priceConverter';

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

const {exchangeRate} = useExchangeRate();

const normalizePriceText = (rawPrice: string | null | undefined): string => {
  if (!rawPrice) return '';
  return String(rawPrice)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#36;/g, '$')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, ' - ')
    .replace(/[–—]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
};

const toSingleDisplayValue = (rawPrice: string | null | undefined): string => {
  const normalizedPrice = normalizePriceText(rawPrice).replace(/^from\s+/i, '');
  if (!normalizedPrice) return '';

  if (exchangeRate.value === null) {
    const {numericString} = cleanAndExtractPriceInfo(normalizedPrice);
    return numericString ? `${numericString} CAD` : normalizedPrice;
  }

  const cadNumericString = convertToCAD(normalizedPrice, exchangeRate.value, true);
  if (cadNumericString) return formatPriceWithCAD(cadNumericString);

  const {numericString} = cleanAndExtractPriceInfo(normalizedPrice);
  return numericString ? `${numericString} CAD` : normalizedPrice;
};

const extractRangeDisplayValues = (rawPrice: string | null | undefined): string[] => {
  const normalizedPrice = normalizePriceText(rawPrice).replace(/^from\s+/i, '');
  if (!normalizedPrice) return [];

  const matches = normalizedPrice.match(/(?:US\$|CA\$|\$)?\s*\d+(?:\.\d+)?(?:\s*(?:USD|CAD))?/gi) || [];
  const uniqueValues = Array.from(new Set(matches.map((match) => toSingleDisplayValue(match)).filter(Boolean)));

  return uniqueValues
    .map((value) => {
      const numericValue = parseFloat(value.replace(/[^0-9.]/g, ''));
      return {value, numericValue};
    })
    .filter((entry) => Number.isFinite(entry.numericValue))
    .sort((left, right) => left.numericValue - right.numericValue)
    .map((entry) => entry.value);
};

const variableRangeDisplay = computed(() => {
  if (!props.isVariable || !props.price) return null;

  const rangeValues = extractRangeDisplayValues(props.price);
  if (rangeValues.length < 2) return null;

  if (props.showAsRange) {
    return {
      priceText: `${rangeValues[0].replace(/\s*CAD$/i, '')} - ${rangeValues[rangeValues.length - 1]}`,
      isFrom: false,
    };
  }

  return {
    priceText: rangeValues[0],
    isFrom: true,
  };
});

const rawPriceStringToFormat = computed(() => {
  if (variableRangeDisplay.value) return null;
  if (props.salePrice && String(props.salePrice).trim() !== '') return props.salePrice;
  return props.regularPrice || props.price;
});

const isFromPrice = computed(() => {
  if (variableRangeDisplay.value) return variableRangeDisplay.value.isFrom;
  const rawPrice = rawPriceStringToFormat.value;
  return !!rawPrice && normalizePriceText(rawPrice).toLowerCase().startsWith('from ');
});

const priceValueForTemplate = computed(() => {
  if (variableRangeDisplay.value) return variableRangeDisplay.value.priceText;
  return toSingleDisplayValue(rawPriceStringToFormat.value);
});

const regularPriceValueForTemplate = computed(() => {
  if (!props.showBothPrices || variableRangeDisplay.value) return null;
  if (!props.salePrice || !props.regularPrice || props.salePrice === props.regularPrice) return null;
  return toSingleDisplayValue(props.regularPrice);
});
</script>

<template>
  <div class="product-price">
    <span
      v-if="priceValueForTemplate"
      :class="{
        'text-red-600': showBothPrices && salePrice && regularPrice && salePrice !== regularPrice,
      }">
      <span v-if="isFromPrice">From </span> ${{ priceValueForTemplate }}
    </span>

    <span v-if="regularPriceValueForTemplate" class="ml-2 text-gray-400 line-through font-normal">
      <span v-if="regularPrice && String(regularPrice).trim().toLowerCase().startsWith('from ')">From </span>
      ${{ regularPriceValueForTemplate }}
    </span>

    <span v-else-if="!priceValueForTemplate" class="text-gray-500 text-sm"> &nbsp; </span>
  </div>
</template>

<style scoped>
.product-price span {
  vertical-align: middle;
}
</style>
