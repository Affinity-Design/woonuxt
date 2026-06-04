<script setup lang="ts">
const {t} = useI18n();
const {node} = defineProps({
  node: {type: Object, required: true},
});

const {storeSettings} = useAppConfig();

const parsePriceAmount = (priceText: string | number | null | undefined): number | null => {
  if (priceText === null || priceText === undefined) return null;

  const normalizedPriceText = String(priceText)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#36;/g, '$')
    .replace(/&nbsp;/g, ' ')
    .replace(/,/g, '')
    .trim();
  const numericMatch = normalizedPriceText.match(/-?\d+(?:\.\d+)?/);
  if (!numericMatch) return null;

  const priceAmount = Number(numericMatch[0]);
  return Number.isFinite(priceAmount) ? priceAmount : null;
};

const salePercentage = computed((): string => {
  const salePrice = parsePriceAmount(node?.salePrice || node?.rawSalePrice);
  const regularPrice = parsePriceAmount(node?.regularPrice || node?.rawRegularPrice);

  if (salePrice === null || regularPrice === null || regularPrice <= 0 || salePrice >= regularPrice) return '';

  return Math.round(((salePrice - regularPrice) / regularPrice) * 100) + ` %`;
});

const hasSalePrice = computed(() => Boolean(node?.salePrice || node?.rawSalePrice));

const showSaleBadge = computed(() => {
  if (!hasSalePrice.value || storeSettings.saleBadge === 'hidden') return false;
  return storeSettings?.saleBadge !== 'percent' || Boolean(salePercentage.value);
});

const textToDisplay = computed(() => {
  if (storeSettings?.saleBadge === 'percent') return salePercentage.value;
  return t('messages.shop.onSale') ? t('messages.shop.onSale') : 'Sale';
});
</script>

<template>
  <span v-if="showSaleBadge" class="red-badge">{{ textToDisplay }}</span>
</template>

<style lang="postcss" scoped>
.red-badge {
  @apply rounded-md bg-red-400 text-xs text-white tracking-tight px-1.5 leading-6 z-10;
  background: #000 linear-gradient(0deg, #f87171, #f87171);
}
</style>
