<script lang="ts" setup>
import { computed, onMounted } from "vue"; // Added onMounted for client-side logging

// Define ProductCategory type (adjust based on your actual structure if different)
interface ProductCategory {
  slug: string;
  name: string;
  // Add other properties like image, id, etc., that your CategoryCard might need
  [key: string]: any; // Allows for other properties
}

const { data, error } = await useAsyncGql("getProductCategories");

// Log raw data and error from GraphQL query
console.log(
  '[DEBUG] Raw data from useAsyncGql("getProductCategories"):',
  data.value
);
if (error.value) {
  console.error(
    '[DEBUG] Error from useAsyncGql("getProductCategories"):',
    error.value
  );
}

// Mapping of desired categories to their exact slugs from the data
const categoryMapping = [
  { display: "Inline Skates", slug: "inline-skates" },
  { display: "Roller Skates", slug: "roller-skates" },
  { display: "Skate Parts", slug: "replacement-parts" },
  { display: "Skate Tools", slug: "skate-tools" },
  { display: "Protection Gear", slug: "protection-gear-and-apparel" },
  { display: "Backpacks, Bags & Carriers", slug: "backpacks-bags-carriers" },
  { display: "Scooters", slug: "scooters" },
  {
    display: "Skateboards and Longboards",
    slug: "skateboards-and-longboards", // The problematic category
  },
  { display: "Alpine Skis", slug: "alpine-skis" },
  { display: "Alpine Poles", slug: "alpine-poles" },
  { display: "Cross-Country Skis", slug: "cross-country-skis" },
  { display: "Nordic Poles", slug: "cross-country-poles" },
];

console.log("[DEBUG] categoryMapping defined:", categoryMapping);

// Filter and sort categories based on the desired slugs and order
const productCategories = computed(() => {
  console.log("[DEBUG] Computing productCategories...");

  if (
    !data.value ||
    !data.value.productCategories ||
    !data.value.productCategories.nodes
  ) {
    console.error(
      "[DEBUG] productCategories.nodes is not available in data:",
      data.value
    );
    return [];
  }

  console.log(
    "[DEBUG] data.value.productCategories.nodes:",
    data.value.productCategories.nodes
  );

  const categoriesMap = new Map(
    data.value.productCategories.nodes.map((cat: ProductCategory) => [
      cat.slug,
      cat,
    ])
  );

  console.log("[DEBUG] Constructed categoriesMap:", categoriesMap);

  // Specifically check the problematic slug
  const skateboardCategoryDataFromMap = categoriesMap.get(
    "skateboards-and-longboards"
  );
  console.log(
    '[DEBUG] Data for "skateboards-and-longboards" from categoriesMap:',
    skateboardCategoryDataFromMap
  );
  if (!skateboardCategoryDataFromMap) {
    console.warn(
      '[DEBUG] WARN: "skateboards-and-longboards" slug NOT FOUND in categoriesMap.'
    );
  }

  const result = categoryMapping
    .map((categoryToMap) => {
      const categoryData = categoriesMap.get(categoryToMap.slug);
      if (!categoryData) {
        console.warn(
          `[DEBUG] WARN: No data found in categoriesMap for slug: "${categoryToMap.slug}" (Display: "${categoryToMap.display}")`
        );
        return undefined;
      }
      return {
        ...categoryData,
        displayName: categoryToMap.display, // Use the display name from your mapping
      };
    })
    .filter(
      (category): category is ProductCategory & { displayName: string } => {
        // Type guard
        if (category === undefined) {
          console.log("[DEBUG] Filtering out an undefined category.");
          return false;
        }
        return true;
      }
    );

  console.log(
    "[DEBUG] Final processed productCategories for template:",
    result
  );
  return result;
});

// Log computed value when it changes or on mount (client-side)
onMounted(() => {
  console.log(
    "[DEBUG] productCategories value on client mount:",
    productCategories.value
  );
});

useHead({
  title: `Categories`,
  meta: [{ name: "description", content: "Our Product Categories" }],
  link: [{ rel: "canonical", href: "https://proskatersplace.ca/categories" }],
});
</script>

<template>
  <main class="container">
    <div
      v-if="productCategories && productCategories.length"
      class="grid grid-cols-2 gap-4 my-6 md:grid-cols-3 lg:gap-8 xl:grid-cols-4"
    >
      <CategoryCard
        v-for="(category, i) in productCategories"
        :key="category.slug"
        :node="{
          ...category, // Spread all properties from the processed category object
          name: category.displayName, // Explicitly pass displayName as name
        }"
        :image-loading="i <= 2 ? 'eager' : 'lazy'"
      />
    </div>

    <div v-else class="text-center text-gray-500 py-12">
      No categories found. Please check your category setup and GraphQL data.
      <p class="mt-4">
        Expected categories based on mapping:
        <span class="block">{{
          categoryMapping.map((c) => c.display).join(", ")
        }}</span>
      </p>
      <p class="mt-2">
        Corresponding slugs in mapping:
        <span class="block">{{
          categoryMapping.map((c) => c.slug).join(", ")
        }}</span>
      </p>
      <p
        v-if="data && data.productCategories && data.productCategories.nodes"
        class="mt-2"
      >
        Slugs received from GraphQL:
        <span class="block">{{
          data.productCategories.nodes
            .map((c: ProductCategory) => c.slug)
            .join(", ")
        }}</span>
      </p>
      <p
        v-else-if="
          !data || !data.productCategories || !data.productCategories.nodes
        "
        class="mt-2 text-red-500"
      >
        No category nodes received from GraphQL. Check data source.
      </p>
    </div>
  </main>
</template>
