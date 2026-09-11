<script setup lang="ts">
// Per-line marker on cart cards for lines discounted by an auto-applied upsell coupon.
const props = defineProps<{cartItemKey: string}>();
const {discountForLine, ruleById} = useUpsellOffers();
const {t} = useI18n();

const badges = computed(() =>
  discountForLine(props.cartItemKey).map((discount) => ({
    key: `${discount.couponCode}-${discount.ruleId}`,
    text: ruleById(discount.ruleId)?.discount.display || discount.label,
    title: discount.label,
  })),
);
</script>

<template>
  <span
    v-for="badge in badges"
    :key="badge.key"
    :title="badge.title"
    class="inline-block whitespace-nowrap rounded border border-green-200 bg-green-50 p-0.5 text-[10px] leading-none text-green-700">
    {{ t('messages.upsell.bundleBadge', {discount: badge.text}) }}
  </span>
</template>
