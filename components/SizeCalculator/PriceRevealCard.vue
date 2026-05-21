<script setup lang="ts">
import {computed} from 'vue';
import type {CalculatorProduct} from '~/composables/useCalculatorProducts';

const props = defineProps<{
  product: CalculatorProduct;
  storeBaseUrl: string;
  regionLoading: boolean;
}>();

const emit = defineEmits<{
  click: [slug: string];
}>();

const productUrl = computed(() => `${props.storeBaseUrl}/product/${props.product.slug}`);
</script>

<template>
  <article class="grid overflow-hidden rounded-lg border border-zinc-200 bg-white">
    <div class="aspect-square bg-zinc-100">
      <NuxtImg
        v-if="product.image?.sourceUrl"
        :src="product.image.sourceUrl"
        :alt="product.image.altText || product.name"
        class="h-full w-full object-cover"
        loading="lazy" />
      <div v-else class="flex h-full items-center justify-center text-sm font-bold text-zinc-500">No image</div>
    </div>

    <div class="grid gap-4 p-4">
      <h3 class="min-h-12 text-base font-black leading-6 text-zinc-950">{{ product.name }}</h3>

      <a
        v-if="!regionLoading"
        :href="productUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-800"
        @click="emit('click', product.slug)">
        <Icon name="ion:pricetag-outline" class="h-5 w-5" />
        Click to find price
      </a>

      <button
        v-else
        type="button"
        disabled
        class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-200 px-4 py-2 text-sm font-black text-zinc-600">
        <Icon name="ion:location-outline" class="h-5 w-5" />
        Detecting region
      </button>
    </div>
  </article>
</template>
