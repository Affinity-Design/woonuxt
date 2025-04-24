<script setup lang="ts">
const route = useRoute();
const { products } = useProducts();
const { productsPerPage } = useHelpers();

// Add a computed property to check if products is ready
const productsReady = computed(() => !!products.value);

// Use computed property for page to make it reactive to route changes
const currentPage = computed(() => parseInt(route.query.page as string) || 1);

// Computed properties for display values with defensive checks
const totalItems = computed(() => products.value?.length || 0);

const startItem = computed(() =>
  totalItems.value > 0 ? (currentPage.value - 1) * productsPerPage + 1 : 0
);

const endItem = computed(() =>
  totalItems.value > 0
    ? Math.min(currentPage.value * productsPerPage, totalItems.value)
    : 0
);
</script>

<template>
  <div class="text-sm font-light" v-if="productsReady && totalItems > 0">
    <span>{{ $t("messages.shop.productResultCount.showing") + " " }}</span>
    <span class="font-normal">{{ startItem + " " }}</span>
    <span>{{ $t("messages.shop.productResultCount.to") + " " }}</span>
    <span class="font-normal">{{ endItem + " " }}</span>
    (<span>{{ $t("messages.shop.productResultCount.of") + " " }}</span>
    <span class="font-normal">{{ totalItems }}</span
    >)
  </div>
</template>
