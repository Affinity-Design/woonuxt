<script setup lang="ts">
// Checkout order-summary breakdown: which lines got the upsell discount and how much.
// Amounts are derived from the cart lines we already display (subtotal − total, then the
// same formatPrice pipeline as the summary) so they always match the totals on screen.
const props = defineProps<{formatPrice: (value: string | null | undefined) => string}>();

const {cart} = useCart();
const {lineItemDiscounts, ruleById} = useUpsellOffers();
const {t} = useI18n();

const parseWooPrice = (priceStr: string | null | undefined): number => {
  if (!priceStr) return 0;
  const cleaned = String(priceStr)
    .replace(/<[^>]*>/g, '')
    .replace(/&#36;/g, '$')
    .replace(/&nbsp;/g, ' ')
    .replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
};

const rows = computed(() =>
  lineItemDiscounts.value.map((discount) => {
    const node: any = (cart.value?.contents?.nodes || []).find((item: any) => item.key === discount.cartItemKey);
    const diff = node ? Math.max(0, parseWooPrice(node.subtotal) - parseWooPrice(node.total)) : 0;
    return {
      key: `${discount.cartItemKey}-${discount.couponCode}`,
      name: node?.variation?.node?.name || node?.product?.node?.name || '',
      label: ruleById(discount.ruleId)?.discount.display || discount.label,
      amount: diff > 0 ? props.formatPrice(`$${diff.toFixed(2)}`) : null,
    };
  }),
);
</script>

<template>
  <Transition name="scale-y" mode="out-in">
    <div v-if="rows.length" class="my-1 flex flex-col gap-1 rounded-md border border-green-100 bg-green-50 px-2 py-1.5" data-testid="upsell-checkout-breakdown">
      <div class="text-[11px] font-semibold uppercase tracking-wide text-green-700">{{ t('messages.upsell.bundleSavings') }}</div>
      <div v-for="row in rows" :key="row.key" class="flex justify-between gap-2 text-xs font-normal text-green-800">
        <span class="truncate">{{ row.label }} — {{ row.name }}</span>
        <span v-if="row.amount" class="whitespace-nowrap tabular-nums">− {{ row.amount }}</span>
      </div>
    </div>
  </Transition>
</template>
