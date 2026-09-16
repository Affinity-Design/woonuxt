<script setup lang="ts">
// Product-page upsell banner: "Pair this with any Endless wheels and get 20% off" (trigger side)
// or "Add any Endless frame to get 20% off these" (target side). Matched client-side from the
// cached product's terms + the 5-minute rule cache, so it never depends on the 24h product cache.
import type {ProductUpsellMatch} from '#shared/types/upsell';

const props = defineProps<{product: any}>();
const {rules, loadRules, matchProductOffers} = useUpsellOffers();
const {t} = useI18n();

const isReady = ref(false);
onMounted(async () => {
  await loadRules();
  isReady.value = true;
});

const offers = computed<ProductUpsellMatch[]>(() => (isReady.value && rules.value.length ? matchProductOffers(props.product).slice(0, 2) : []));
</script>

<template>
  <ClientOnly>
    <div v-if="offers.length" class="mb-8 flex flex-col gap-2" data-testid="upsell-product-banner">
      <div
        v-for="offer in offers"
        :key="`${offer.rule.id}-${offer.side}`"
        role="note"
        :class="[
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm',
          offer.side === 'trigger' ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-green-200 bg-green-50 text-green-900',
        ]">
        <span :class="['rounded-full px-2 py-0.5 text-xs font-bold text-white', offer.side === 'trigger' ? 'bg-indigo-600' : 'bg-green-600']">
          {{ offer.rule.discount.display }}
        </span>
        <span class="min-w-[10rem] flex-1">{{ offer.text }}</span>
        <NuxtLink :to="offer.ctaPath" class="whitespace-nowrap font-semibold underline">{{ t('messages.upsell.shopLabel', {label: offer.ctaLabel}) }} →</NuxtLink>
      </div>
    </div>
  </ClientOnly>
</template>
