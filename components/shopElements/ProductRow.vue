<script setup>
const props = defineProps({
  products: { type: Array, default: null },
});
</script>

<template>
  <div v-if="products" class="grid gap-8">
    <ProductCard
      v-for="(node, i) in products"
      :key="node.databaseId"
      class="w-full"
      :node="node"
      :index="i"
      :class="{
        hidden: i === products.length - 1,
        'lg:block': i === products.length - 1,
      }"
    />
  </div>
</template>

<style scoped>
/* This ensures consistent spacing and layout for product rows */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem;
}

/* Add support for maintaining aspect ratio in grid layouts */
@supports (aspect-ratio: 1 / 1) {
  .grid > * {
    aspect-ratio: 1 / 1;
  }
}
</style>
