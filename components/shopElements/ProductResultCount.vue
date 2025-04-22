<script setup lang="ts">
const route = useRoute();
const { products } = useProducts();
const { productsPerPage } = useHelpers();

// Use computed property for page to make it reactive to route changes
const currentPage = computed(() => parseInt(route.query.page as string) || 1);

// Computed properties for display values
const startItem = computed(() => (currentPage.value - 1) * productsPerPage + 1);
const endItem = computed(() =>
  Math.min(currentPage.value * productsPerPage, products.value.length)
);
const totalItems = computed(() => products.value.length);
</script>

<template>
  <div class="text-sm font-light" v-if="totalItems !== 0">
    <span>{{ $t("messages.shop.productResultCount.showing") + " " }}</span>
    <span class="font-normal">{{ startItem + " " }}</span>
    <span>{{ $t("messages.shop.productResultCount.to") + " " }}</span>
    <span class="font-normal">{{ endItem + " " }}</span>
    (<span>{{ $t("messages.shop.productResultCount.of") + " " }}</span>
    <span class="font-normal">{{ totalItems }}</span
    >)
  </div>
</template>
