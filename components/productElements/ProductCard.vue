<script setup lang="ts">
const route = useRoute();
const { storeSettings } = useAppConfig();
const props = defineProps({
  node: { type: Object as PropType<Product>, required: true },
  index: { type: Number, default: 1 },
});

// Use consistent dimensions for a perfect square (1:1 aspect ratio)
const imgWidth = 300;
const imgHeight = 300;

// example: ?filter=pa_color[green,blue],pa_size[large]
const filterQuery = ref(route.query?.filter as string);
const paColor = ref(
  filterQuery.value?.split("pa_color[")[1]?.split("]")[0]?.split(",") || []
);

// watch filterQuery
watch(
  () => route.query,
  () => {
    filterQuery.value = route.query.filter as string;
    paColor.value =
      filterQuery.value?.split("pa_color[")[1]?.split("]")[0]?.split(",") || [];
  }
);

const mainImage = computed<string>(
  () =>
    props.node?.image?.producCardSourceUrl ||
    props.node?.image?.sourceUrl ||
    "/images/placeholder.jpg"
);

const imagetoDisplay = computed<string>(() => {
  if (paColor.value.length) {
    const activeColorImage = props.node?.variations?.nodes.filter(
      (variation) => {
        const hasMatchingAttributes = variation.attributes?.nodes.some(
          (attribute) =>
            paColor.value.some((color) => attribute?.value?.includes(color))
        );
        const hasMatchingSlug = paColor.value.some((color) =>
          variation.slug?.includes(color)
        );
        return hasMatchingAttributes || hasMatchingSlug;
      }
    );
    if (activeColorImage?.length)
      return (
        activeColorImage[0]?.image?.producCardSourceUrl ||
        activeColorImage[0]?.image?.sourceUrl ||
        mainImage.value
      );
  }
  return mainImage.value;
});

// Check if product is variable - ensure case insensitive comparison
const isVariableProduct = computed(() => {
  // Check for 'VARIABLE' type case-insensitive to handle different API responses
  return props.node?.type?.toUpperCase() === "VARIABLE";
});
</script>

<template>
  <div class="relative group">
    <NuxtLink
      v-if="node.slug"
      :to="`/product/${decodeURIComponent(node.slug)}`"
      :title="node.name"
    >
      <SaleBadge :node class="absolute top-2 right-2" />
      <div class="relative w-full pt-[100%] overflow-hidden rounded-lg">
        <!-- The pt-[100%] creates a perfect square aspect ratio container -->
        <NuxtImg
          v-if="imagetoDisplay"
          :width="imgWidth"
          :height="imgWidth"
          :src="imagetoDisplay"
          :alt="node.image?.altText || node.name || 'Product image'"
          :title="node.image?.title || node.name"
          :loading="index <= 3 ? 'eager' : 'lazy'"
          :sizes="`sm:${imgWidth / 2}px md:${imgWidth}px`"
          class="absolute top-0 left-0 w-full h-full object-cover object-center"
          placeholder
          placeholder-class="blur-xl"
        />
      </div>
    </NuxtLink>
    <div class="p-2">
      <StarRating
        v-if="storeSettings.showReviews"
        :rating="node.averageRating"
        :count="node.reviewCount"
      />
      <NuxtLink
        v-if="node.slug"
        :to="`/product/${decodeURIComponent(node.slug)}`"
        :title="node.name"
      >
        <h2 class="mb-2 font-light leading-tight group-hover:text-primary">
          {{ node.name }}
        </h2>
      </NuxtLink>
      <ProductPrice
        class="text-sm"
        :sale-price="node.salePrice"
        :regular-price="node.regularPrice"
        :is-variable="isVariableProduct"
        :show-as-range="false"
        :show-both-prices="false"
      />
    </div>
  </div>
</template>
