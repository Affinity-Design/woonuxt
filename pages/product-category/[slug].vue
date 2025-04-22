<script setup lang="ts">
const { setProducts, updateProductList } = useProducts();
const { isQueryEmpty } = useHelpers();
const { storeSettings } = useAppConfig();
const route = useRoute();
const slug = route.params.slug;

const count = await useAsyncGql("getProductsTotal", { slug });

const { data } = await useAsyncGql("getProducts", {
  slug,
  first:
    slug === "clearance-items"
      ? (count.data.value.products.found = 255)
      : count.data.value.products.found,
});

// TODO update for max products
const productsInCategory = (data.value?.products?.nodes || []) as Product[];
setProducts(productsInCategory);

console.log("data", data.value);
console.log("pageNum", route.query.page);

onMounted(() => {
  if (!isQueryEmpty.value) updateProductList();
});

watch(
  () => route.query,
  () => {
    if (route.name !== "product-category-slug") return;
    updateProductList();
  }
);

useHead({
  title: "Products",
  meta: [{ hid: "description", name: "description", content: "Products" }],
});
</script>

<template>
  <div
    class="container flex items-start gap-16"
    v-if="productsInCategory.length"
  >
    <Filters v-if="storeSettings.showFilters = false" :hide-categories="true" />

    <div class="w-full">
      <div class="flex items-center justify-between w-full gap-4 mt-8 md:gap-8">
        <h1>{{ route.params.slug }}</h1>
        <ProductResultCount />
        <OrderByDropdown
          class="hidden md:inline-flex"
          v-if="storeSettings.showOrderByDropdown = false"
        />
        <ShowFilterTrigger v-if="storeSettings.showFilters" class="md:hidden" />
      </div>
      <ProductGrid :count="count.data.value.products.found" :slug="slug" />
    </div>
  </div>
</template>
