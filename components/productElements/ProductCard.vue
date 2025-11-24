<script setup lang="ts">
const route = useRoute();
const {storeSettings} = useAppConfig();
const props = defineProps({
  node: {type: Object as PropType<Product>, required: true},
  index: {type: Number, default: 1},
});

// Use consistent dimensions for a perfect square (1:1 aspect ratio)
const imgWidth = 300;
const imgHeight = 300;

// example: ?filter=pa_color[green,blue],pa_size[large]
const filterQuery = ref(route.query?.filter as string);
const paColor = ref(filterQuery.value?.split('pa_color[')[1]?.split(']')[0]?.split(',') || []);

// watch filterQuery
watch(
  () => route.query,
  () => {
    filterQuery.value = route.query.filter as string;
    paColor.value = filterQuery.value?.split('pa_color[')[1]?.split(']')[0]?.split(',') || [];
  },
);

const mainImage = computed<string>(() => props.node?.image?.producCardSourceUrl || props.node?.image?.sourceUrl || '/images/placeholder.jpg');

const imagetoDisplay = computed<string>(() => {
  if (paColor.value.length) {
    const activeColorImage = props.node?.variations?.nodes.filter((variation) => {
      const hasMatchingAttributes = variation.attributes?.nodes.some((attribute) => paColor.value.some((color) => attribute?.value?.includes(color)));
      const hasMatchingSlug = paColor.value.some((color) => variation.slug?.includes(color));
      return hasMatchingAttributes || hasMatchingSlug;
    });
    if (activeColorImage?.length) return activeColorImage[0]?.image?.producCardSourceUrl || activeColorImage[0]?.image?.sourceUrl || mainImage.value;
  }
  return mainImage.value;
});

// Check if product is variable - ensure case insensitive comparison
const isVariableProduct = computed(() => {
  // Check for 'VARIABLE' type case-insensitive to handle different API responses
  return props.node?.type?.toUpperCase() === 'VARIABLE';
});
</script>

<template>
  <div class="relative group overflow-hidden">
    <NuxtLink v-if="node.slug" :to="`/product/${decodeURIComponent(node.slug)}`" :title="node.name">
      <SaleBadge :node class="absolute top-2 right-2 z-10" />
      <div class="relative w-full pt-[100%] overflow-hidden bg-white rounded-lg">
        <!-- The pt-[100%] creates a perfect square aspect ratio container -->
        <img
          v-if="imagetoDisplay"
          :width="imgWidth"
          :height="imgWidth"
          :src="imagetoDisplay"
          :alt="node.image?.altText || node.name || 'Product image'"
          :title="node.image?.title || node.name"
          :loading="index <= 3 ? 'eager' : 'lazy'"
          class="absolute top-0 left-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" />
      </div>
    </NuxtLink>
    <div class="p-2">
      <NuxtLink v-if="node.slug" :to="`/product/${decodeURIComponent(node.slug)}`" :title="node.name">
        <h2 class="mb-2 font-semibold leading-tight text-gray-900 group-hover:text-primary transition-colors">
          {{ node.name }}
        </h2>
      </NuxtLink>
      <ProductPrice
        class="text-sm"
        :sale-price="node.salePrice"
        :regular-price="node.regularPrice"
        :is-variable="isVariableProduct"
        :show-as-range="false"
        :show-both-prices="false" />
      <div class="p-1"></div>
      <StarRating v-if="storeSettings.showReviews" :rating="node.averageRating" :count="node.reviewCount" />
    </div>
  </div>
</template>
