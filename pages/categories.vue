<script lang="ts" setup>
const { data } = await useAsyncGql("getProductCategories");

// Mapping of desired categories to their exact slugs from the data
const categoryMapping = [
  { display: "Inline Skates", slug: "inline-skates" },
  { display: "Roller Skates", slug: "roller-skates" },
  // { display: "Inline Skating", slug: "inline-skating" },
  // { display: "Roller Skating", slug: "roller-skating" },
  { display: "Skate Parts", slug: "replacement-parts" },
  { display: "Skate Tools", slug: "skate-tools" },
  { display: "Protection & Apparel", slug: "protection-gear-and-apparel" },
  { display: "Backpacks, Bags & Carriers", slug: "backpacks-bags-carriers" },
  { display: "Scooters", slug: "scooters" },
  // { display: "Electric Scooters", slug: "trick-scooters" },
  { display: "Skateboards & Longboards", slug: "skaterboards-and-longboards" },
  // { display: "E-Boards", slug: "e-boards" },
  { display: "Alpine Skis", slug: "alpine-skis" },
  { display: "Apline Poles", slug: "alpine-poles" },
  { display: "Cross-Country Skis", slug: "cross-country-skis" },
  { display: "Nordic Poles", slug: "cross-country-poles" },
];

// Filter and sort categories based on the desired slugs and order
const productCategories = computed(() => {
  const categoriesMap = new Map(
    data.value.productCategories?.nodes.map((cat: ProductCategory) => [
      cat.slug,
      cat,
    ])
  );

  return categoryMapping
    .map((category) => {
      const categoryData = categoriesMap.get(category.slug);
      return categoryData
        ? {
            ...categoryData,
            displayName: category.display,
          }
        : undefined;
    })
    .filter((category) => category !== undefined);
});

useHead({
  title: `Categories`,
  meta: [{ name: "description", content: "Our Product Categories" }],
  link: [{ rel: "canonical", href: "https://proskatersplace.ca/categories" }],
});
</script>

<template>
  <main class="container">
    <!-- TODO add SEO breacrumns etc -->
    <!-- <h1 class="text-2xl font-semibold mb-6">Our Categories</h1> -->
    <div
      v-if="productCategories.length"
      class="grid grid-cols-2 gap-4 my-6 md:grid-cols-3 lg:gap-8 xl:grid-cols-4"
    >
      <CategoryCard
        v-for="(category, i) in productCategories"
        :key="category.slug"
        :node="{
          ...category,
          name: category.displayName,
        }"
        :image-loading="i <= 2 ? 'eager' : 'lazy'"
      />
    </div>

    <div v-else class="text-center text-gray-500 py-12">
      No categories found. Please check your category setup.
      <p class="mt-4">
        Expected categories:
        <span class="block">{{
          categoryMapping.map((c) => c.display).join(", ")
        }}</span>
      </p>
      <p class="mt-2">
        Actual Slugs:
        <span class="block">{{
          categoryMapping.map((c) => c.slug).join(", ")
        }}</span>
      </p>
    </div>
  </main>
</template>
