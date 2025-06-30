<script lang="ts" setup>
import { computed, onMounted } from "vue";

// Define ProductCategory type
interface ProductCategoryFromGraphQL {
  slug: string;
  name: string; // This is the name from GraphQL/CMS
  id?: string;
  databaseId?: number;
  count?: number;
  // Other properties from your GraphQL/CMS data source
  [key: string]: any;
}

interface ProductCategoryProcessed extends ProductCategoryFromGraphQL {
  displayName: string; // The name to be displayed on the card
  imageFilename?: string; // Explicit filename for the category image
}

// Attempt to fetch category data from a data source (e.g., CMS via GraphQL)
// This data (like name, slug, count) is still used, but not for image URLs directly.
const { data, error: gqlError } = await useAsyncGql("getProductCategories");

if (gqlError.value) {
  console.error(
    "[DEBUG V3] Error fetching category data (e.g., from GraphQL/CMS):",
    JSON.parse(JSON.stringify(gqlError.value))
  );
} else {
  console.log(
    "[DEBUG V3] Raw category data (e.g., from GraphQL/CMS):",
    JSON.parse(JSON.stringify(data.value))
  );
}

// Defines the desired categories, their display names, slugs, and specific image filenames if needed.
const categoryMapping = [
  {
    display: "Inline Skates",
    slug: "inline-skates",
    imageFilename: "Inline-Skates.jpeg",
  }, // Example: ensure consistency
  {
    display: "Roller Skates",
    slug: "roller-skates",
    imageFilename: "Roller-Skates.jpeg",
  },
  {
    display: "Skate Parts",
    slug: "replacement-parts",
    imageFilename: "Skate-Parts.jpeg",
  },
  {
    display: "Skate Tools",
    slug: "skate-tools",
    imageFilename: "Skate-Tools.jpeg",
  },
  {
    display: "Protection Gear",
    slug: "protection-gear-and-apparel",
    imageFilename: "Protection-Gear.jpeg",
  }, // Adjust filename as needed
  {
    display: "Backpacks, Bags & Carriers",
    slug: "backpacks-bags-carriers",
    imageFilename: "Backpacks-Bags-and-Carriers.jpeg", // Fixed to match actual file
  },
  { display: "Scooters", slug: "scooters", imageFilename: "Scooters.jpeg" },
  {
    display: "Skateboards and Longboards",
    slug: "skateboards-and-longboards",
    imageFilename: "Skateboards-and-longboards.jpeg", // Fixed case to match actual file
  },
  {
    display: "Alpine Skis",
    slug: "alpine-skis",
    imageFilename: "Alpine-Skis.jpeg",
  },
  {
    display: "Alpine Poles",
    slug: "alpine-poles",
    imageFilename: "Alpine-Poles.jpeg",
  },
  {
    display: "Cross-Country Skis",
    slug: "cross-country-skis",
    imageFilename: "Cross-Country-Skis.jpeg",
  },
  {
    display: "Nordic Poles",
    slug: "cross-country-poles",
    imageFilename: "Nordic-Poles.jpeg",
  },
];

// Computed property to process and prepare categories for the template
const productCategories = computed((): ProductCategoryProcessed[] => {
  console.log("[DEBUG V3] Computing productCategories...");

  // Use category data from GraphQL/CMS if available, otherwise expect it to be handled by mapping alone
  const nodesFromDataSource: ProductCategoryFromGraphQL[] =
    data.value?.productCategories?.nodes || [];

  if (!nodesFromDataSource.length && data.value) {
    // data.value exists but nodes are empty or not found
    console.warn(
      "[DEBUG V3] productCategories.nodes not found or empty in data from CMS/GraphQL. Proceeding with mapping only for slugs/displayNames."
    );
  }

  const categoriesMap = new Map(
    nodesFromDataSource.map((cat: ProductCategoryFromGraphQL) => [
      cat.slug,
      cat,
    ])
  );

  const result = categoryMapping
    .map((categoryToMap) => {
      const categoryDataFromSource = categoriesMap.get(categoryToMap.slug);

      if (!categoryDataFromSource && nodesFromDataSource.length > 0) {
        // Only warn if we expected data from the source but didn't find it for a mapped slug
        console.warn(
          `[DEBUG V3] WARN: No data found in CMS/GraphQL for slug: "${categoryToMap.slug}" (Display: "${categoryToMap.display}")`
        );
      }

      // Base object with data from mapping (slug, displayName, imageFilename)
      let processedCategory: Partial<ProductCategoryProcessed> = {
        slug: categoryToMap.slug,
        displayName: categoryToMap.display,
        imageFilename: categoryToMap.imageFilename, // Use the explicitly defined filename
        name: categoryToMap.display, // Default name to displayName if no source data
      };

      // If data exists from the source (CMS/GraphQL), spread it,
      // allowing mapped properties (like displayName) to take precedence if needed,
      // and ensuring our imageFilename is preserved.
      if (categoryDataFromSource) {
        processedCategory = {
          ...categoryDataFromSource, // Data from CMS (e.g., count, original name, id)
          ...processedCategory, // Our mapped values, including imageFilename and displayName
        };
      } else {
        // If no data from source, ensure essential fields like 'name' (for keying or alt text) are set.
        // 'slug' and 'displayName' are already set from categoryToMap.
        // No 'count' or 'id' would be available here.
      }

      // For the problematic category, log what's being prepared
      if (categoryToMap.slug === "skateboards-and-longboards") {
        console.log(
          '[DEBUG V3] Preparing data for "Skateboards and Longboards":',
          JSON.parse(JSON.stringify(processedCategory))
        );
      }

      return processedCategory as ProductCategoryProcessed;
    })
    .filter((category): category is ProductCategoryProcessed => {
      // Ensure category is not undefined and has a slug (basic validity)
      if (!category || !category.slug) {
        console.warn(
          "[DEBUG V3] Filtering out an invalid category object:",
          category
        );
        return false;
      }
      return true;
    });

  console.log(
    "[DEBUG V3] Final processed productCategories for template:",
    JSON.parse(JSON.stringify(result))
  );
  return result;
});

onMounted(() => {
  console.log(
    "[DEBUG V3] productCategories value on client mount:",
    JSON.parse(JSON.stringify(productCategories.value))
  );
  const skateboardCat = productCategories.value.find(
    (cat) => cat.slug === "skateboards-and-longboards"
  );
  if (skateboardCat) {
    console.warn(`[DEBUG V3] ADVICE FOR CategoryCard.vue:
      For the category "${skateboardCat.displayName}", this script now provides 'node.imageFilename = "${skateboardCat.imageFilename}"'.
      CategoryCard.vue has been updated to use this 'node.imageFilename' when available.
      The image path will be: '/images/${skateboardCat.imageFilename}'.
      This ensures the exact filename "${skateboardCat.imageFilename}" is used, respecting its capitalization.
      The 'name' prop passed to CategoryCard for its label is '${skateboardCat.displayName}'.
      The original name from CMS/GraphQL for this slug (if available) was '${data.value?.productCategories?.nodes.find((cat: ProductCategoryFromGraphQL) => cat.slug === "skateboards-and-longboards")?.name || "N/A"}'.`);
  }
  console.warn(
    "[DEBUG V3] ADVICE: In your browser's developer tools (Elements tab), inspect the 'Skateboards and Longboards' card. Find its `<img>` tag. What is its `src` attribute? Does the URL look correct (including case)? Check the Network tab for 404 errors for that image URL if it's still not loading after updating CategoryCard.vue."
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
          ...category,
          name: category.displayName,
        }"
        :image-loading="i <= 2 ? 'eager' : 'lazy'"
      />
    </div>

    <div v-else class="text-center text-gray-500 py-12">
      No categories found. Please check your category setup and data source.
      <p class="mt-4">
        Expected categories based on mapping:
        <span class="block">{{
          categoryMapping.map((c) => c.display).join(", ")
        }}</span>
      </p>
      <p class="mt-2">
        Corresponding slugs and image filenames in mapping:
        <span class="block" v-for="c in categoryMapping" :key="c.slug">
          {{ c.slug }} -> {{ c.imageFilename || "(default behavior)" }}
        </span>
      </p>
      <p
        v-if="data && data.productCategories && data.productCategories.nodes"
        class="mt-2"
      >
        Slugs received from CMS/GraphQL:
        <span class="block">{{
          data.productCategories.nodes
            .map((c: ProductCategoryFromGraphQL) => c.slug)
            .join(", ")
        }}</span>
      </p>
      <p
        v-else-if="gqlError || (!data?.productCategories?.nodes && data)"
        class="mt-2 text-red-500"
      >
        Could not reliably load category details from the data source.
      </p>
    </div>
  </main>
</template>
