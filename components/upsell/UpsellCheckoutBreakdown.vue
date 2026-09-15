<script setup lang="ts">
// Checkout order-summary breakdown: which lines got the upsell discount and how much.
// Each line's subtotal and total are run through the summary's own formatPrice first and only
// then subtracted (the same "sum the displayed values" approach as totalWithoutShipping in
// OrderSummary.vue), so the row matches the Discount total whether WooCommerce returned USD or
// already-converted CAD. Subtracting raw values and converting the difference double-converted
// CAD input ($9.99 shown against a $7.00 discount).
import {formatPriceWithCAD} from '~/utils/priceConverter';

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
    const shownSubtotal = node ? parseWooPrice(props.formatPrice(node.subtotal)) : 0;
    const shownTotal = node ? parseWooPrice(props.formatPrice(node.total)) : 0;
    const diff = Math.max(0, shownSubtotal - shownTotal);
    return {
      key: `${discount.cartItemKey}-${discount.couponCode}`,
      name: node?.variation?.node?.name || node?.product?.node?.name || '',
      label: ruleById(discount.ruleId)?.discount.display || discount.label,
      amount: diff > 0 ? '$' + formatPriceWithCAD(diff.toFixed(2)) : null,
    };
  }),
);
</script>

<template>
  <Transition name="scale-y" mode="out-in">
    <div
      v-if="rows.length"
      class="my-1 flex flex-col gap-1 rounded-md border border-green-100 bg-green-50 px-2 py-1.5 text-xs font-normal"
      data-testid="upsell-checkout-breakdown">
      <div class="text-[11px] font-semibold uppercase tracking-wide text-green-700">{{ t('messages.upsell.bundleSavings') }}</div>
      <div v-for="row in rows" :key="row.key" class="flex items-baseline justify-between gap-3 text-green-800">
        <span class="min-w-0 truncate" :title="`${row.label} — ${row.name}`">{{ row.label }} — {{ row.name }}</span>
        <span v-if="row.amount" class="shrink-0 whitespace-nowrap tabular-nums">- {{ row.amount }}</span>
      </div>
    </div>
  </Transition>
</template>
