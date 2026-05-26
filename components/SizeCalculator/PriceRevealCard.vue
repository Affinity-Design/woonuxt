<script setup lang="ts">
import {computed} from 'vue';
import type {CalculatorProduct} from '~/composables/useCalculatorProducts';

const props = defineProps<{
  product: CalculatorProduct;
}>();

const emit = defineEmits<{
  click: [slug: string];
}>();

const storefront = useStorefrontSelection();
const {resolveHref} = useCalculatorProductLinks();

const productUrl = computed(() => resolveHref(props.product, storefront.choice.value));
</script>

<template>
  <article class="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-sm">
    <div class="aspect-square overflow-hidden bg-zinc-100">
      <NuxtImg
        v-if="product.image?.sourceUrl"
        :src="product.image.sourceUrl"
        :alt="product.image.altText || product.name"
        class="h-full w-full object-cover transition duration-300 hover:scale-105"
        loading="lazy" />
      <div v-else class="flex h-full items-center justify-center">
        <Icon name="ion:image-outline" class="h-10 w-10 text-zinc-300" />
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-3 p-4">
      <h3 class="flex-1 text-sm font-bold leading-5 text-zinc-900">{{ product.name }}</h3>

      <a
        v-if="productUrl"
        :href="productUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-black text-white transition hover:bg-emerald-800 active:scale-95"
        @click="emit('click', product.slug)">
        <Icon name="ion:pricetag-outline" class="h-4 w-4 shrink-0" />
        See price
      </a>
    </div>
  </article>
</template>
