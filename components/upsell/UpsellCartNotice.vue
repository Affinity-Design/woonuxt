<script setup lang="ts">
// Cart-drawer / checkout notices: "You added Endless Frames! Add Endless wheels to save 20%"
// (pending, with a CTA to the target listing) and "20% off Endless wheels applied." (applied).
withDefaults(defineProps<{compact?: boolean}>(), {compact: false});

const {cartNotices} = useUpsellOffers();
const {toggleCart, isShowingCart} = useCart();
const {t} = useI18n();

const onCta = (): void => {
  if (isShowingCart.value) toggleCart(false);
};
</script>

<template>
  <div v-if="cartNotices.length" :class="['flex flex-col gap-2', compact ? '' : 'px-6 pt-4 md:px-8']" data-testid="upsell-cart-notices">
    <CartNotice
      v-for="notice in cartNotices"
      :key="`${notice.ruleId}-${notice.kind}`"
      :type="notice.kind === 'applied' ? 'success' : 'info'"
      :icon="notice.kind === 'applied' ? 'ion:pricetags' : 'ion:gift-outline'"
      :message="notice.text">
      <NuxtLink
        v-if="notice.ctaPath"
        :to="notice.ctaPath"
        class="inline-flex items-center rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark"
        @click="onCta">
        {{ t('messages.upsell.shopNow') }}
      </NuxtLink>
    </CartNotice>
  </div>
</template>
