<script setup lang="ts">
const props = defineProps({
  slug: String,
  count: Number,
});

const route = useRoute();
const { productsPerPage } = useHelpers();
const { products } = useProducts();

// Get current page from URL query parameter (default to 1 if not present)
const currentPage = ref(parseInt(route.query.page as string) || 1);

// Watch for route query changes and update the current page
watch(
  () => route.query.page,
  (newPage) => {
    currentPage.value = parseInt(newPage as string) || 1;
  }
);

// Filter products based on current page
const productsToShow = computed(() => {
  const startIndex = (currentPage.value - 1) * productsPerPage;
  const endIndex = currentPage.value * productsPerPage;
  return products.value.slice(startIndex, endIndex);
});
</script>

<template>
  <Transition name="fade" mode="out-in">
    <section v-if="!!products.length" class="relative w-full">
      <TransitionGroup
        name="shrink"
        tag="div"
        mode="in-out"
        class="product-grid"
      >
        <ProductCard
          v-for="(node, i) in productsToShow"
          :key="node.databaseId || node.id || i"
          :node="node"
          :index="i"
        />
      </TransitionGroup>
      <Pagination :count="props.count" :slug="props.slug" />
    </section>
    <NoProductsFound v-else />
  </Transition>
</template>

<style lang="postcss" scoped>
.product-grid {
  @apply my-4 min-h-[600px] grid transition-all gap-8 lg:my-8;

  grid-template-columns: repeat(2, 1fr);
}
.product-grid:empty {
  display: none;
}

@media (min-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  }
}

.shrink-move {
  transition: all 400ms;
}

.shrink-leave-active {
  transition: transform 300ms;
  position: absolute;
  opacity: 0;
}

.shrink-enter-active {
  transition:
    opacity 400ms ease-out 200ms,
    transform 400ms ease-out;
  will-change: opacity, transform;
}

.shrink-enter,
.shrink-leave-to,
.shrink-enter-from {
  opacity: 0;
  transform: scale(0.75) translateY(25%);
}
</style>
