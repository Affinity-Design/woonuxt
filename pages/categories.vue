<script lang="ts" setup>
import {computed, onMounted} from 'vue';

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
const {data, error: gqlError} = await useAsyncGql('getProductCategories');

if (gqlError.value) {
  console.error('[DEBUG V3] Error fetching category data (e.g., from GraphQL/CMS):', JSON.parse(JSON.stringify(gqlError.value)));
} else {
  console.log('[DEBUG V3] Raw category data (e.g., from GraphQL/CMS):', JSON.parse(JSON.stringify(data.value)));
}

// Defines the desired categories, their display names, slugs, and specific image filenames if needed.
const categoryMapping = [
  {
    display: 'Inline Skates',
    slug: 'inline-skates',
    imageFilename: 'Inline-Skates.jpeg',
  }, // Example: ensure consistency
  {
    display: 'Roller Skates',
    slug: 'roller-skates',
    imageFilename: 'Roller-Skates.jpeg',
  },
  {
    display: 'Skate Parts',
    slug: 'replacement-parts',
    imageFilename: 'Skate-Parts.jpeg',
  },
  {
    display: 'Skate Tools',
    slug: 'skate-tools',
    imageFilename: 'Skate-Tools.jpeg',
  },
  {
    display: 'Protection Gear',
    slug: 'protection-gear-and-apparel',
    imageFilename: 'Protection-Gear.jpeg',
  }, // Adjust filename as needed
  {
    display: 'Backpacks, Bags & Carriers',
    slug: 'backpacks-bags-carriers',
    imageFilename: 'Backpacks-Bags-and-Carriers.jpeg', // Fixed to match actual file
  },
  {display: 'Scooters', slug: 'scooters', imageFilename: 'Scooters.jpeg'},
  {
    display: 'Skateboards and Longboards',
    slug: 'skateboards-and-longboards',
    imageFilename: 'Skateboards-and-longboards.jpeg', // Fixed case to match actual file
  },
  {
    display: 'Alpine Skis',
    slug: 'alpine-skis',
    imageFilename: 'Alpine-Skis.jpeg',
  },
  {
    display: 'Alpine Poles',
    slug: 'alpine-poles',
    imageFilename: 'Alpine-Poles.jpeg',
  },
  {
    display: 'Cross-Country Skis',
    slug: 'cross-country-skis',
    imageFilename: 'Cross-Country-Skis.jpeg',
  },
  {
    display: 'Nordic Poles',
    slug: 'cross-country-poles',
    imageFilename: 'Nordic-Poles.jpeg',
  },
];

const pillCategories = [
  {name: 'New Arrivals', slug: 'new-arrivals'},
  {name: 'Frames', slug: 'inline-frames'},
  {name: 'Inline Skate Wheels', slug: 'inline-skate-wheels'},
  {name: 'Winter Sports', slug: 'winter-sports'},
  {name: 'Clearance', slug: 'clearance-items'},
  {name: 'Accessories', slug: 'accessories'},
];

// Computed property to process and prepare categories for the template
const allNodes = computed(() => data.value?.productCategories?.nodes || []);

const productCategories = computed((): ProductCategoryProcessed[] => {
  console.log('[DEBUG V3] Computing productCategories...');

  // Use category data from GraphQL/CMS if available, otherwise expect it to be handled by mapping alone
  const nodesFromDataSource: ProductCategoryFromGraphQL[] = allNodes.value;

  if (!nodesFromDataSource.length && data.value) {
    // data.value exists but nodes are empty or not found
    console.warn('[DEBUG V3] productCategories.nodes not found or empty in data from CMS/GraphQL. Proceeding with mapping only for slugs/displayNames.');
  }

  const categoriesMap = new Map(nodesFromDataSource.map((cat: ProductCategoryFromGraphQL) => [cat.slug, cat]));

  const result = categoryMapping
    .map((categoryToMap) => {
      const categoryDataFromSource = categoriesMap.get(categoryToMap.slug);

      if (!categoryDataFromSource && nodesFromDataSource.length > 0) {
        // Only warn if we expected data from the source but didn't find it for a mapped slug
        console.warn(`[DEBUG V3] WARN: No data found in CMS/GraphQL for slug: "${categoryToMap.slug}" (Display: "${categoryToMap.display}")`);
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
      if (categoryToMap.slug === 'skateboards-and-longboards') {
        console.log('[DEBUG V3] Preparing data for "Skateboards and Longboards":', JSON.parse(JSON.stringify(processedCategory)));
      }

      return processedCategory as ProductCategoryProcessed;
    })
    .filter((category): category is ProductCategoryProcessed => {
      // Ensure category is not undefined and has a slug (basic validity)
      if (!category || !category.slug) {
        console.warn('[DEBUG V3] Filtering out an invalid category object:', category);
        return false;
      }
      // Filter out empty categories if data is available
      if (category.count !== undefined && category.count === 0) {
        return false;
      }
      return true;
    });

  console.log('[DEBUG V3] Final processed productCategories for template:', JSON.parse(JSON.stringify(result)));
  return result;
});

const otherCategories = computed(() => {
  const highlightedSlugs = categoryMapping.map((c) => c.slug);
  return allNodes.value.filter((n: any) => !highlightedSlugs.includes(n.slug) && n.count > 0).sort((a: any, b: any) => a.name.localeCompare(b.name));
});

// Canadian SEO Optimization
const {setCanadianSEO} = useCanadianSEO();

setCanadianSEO({
  title: 'Shop All Categories | Skates, Scooters & Gear | ProSkaters Place Canada',
  description:
    "Browse all skating product categories at ProSkaters Place. ⭐ Inline skates, roller skates, protective gear, scooters & more. ⭐ Free shipping $99+ ⭐ Toronto-based. Shop Canada's #1 skate shop.",
  image: '/images/Inline-Skates-Toronto.jpg',
  type: 'website',
});

// CollectionPage Structured Data with ItemList
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Product Categories',
        description: 'Browse all skating product categories including inline skates, roller skates, protective gear, scooters, and skating accessories',
        url: 'https://proskatersplace.ca/categories',
        inLanguage: 'en-CA',
        isPartOf: {
          '@id': 'https://proskatersplace.ca/#website',
        },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: 'https://proskatersplace.ca',
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Categories',
              item: 'https://proskatersplace.ca/categories',
            },
          ],
        },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: categoryMapping.length,
          itemListElement: categoryMapping.map((cat, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: cat.display,
            url: `https://proskatersplace.ca/product-category/${cat.slug}`,
            description: `Shop ${cat.display.toLowerCase()} at ProSkaters Place Canada`,
          })),
        },
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': 'https://proskatersplace.ca/categories#webpage',
        url: 'https://proskatersplace.ca/categories',
        name: 'Shop All Categories - ProSkaters Place Canada',
        description: 'Browse our complete selection of skating categories',
        inLanguage: 'en-CA',
        isPartOf: {
          '@id': 'https://proskatersplace.ca/#website',
        },
        about: {
          '@type': 'Thing',
          name: 'Skating Equipment',
          description: 'Categories of skating equipment and accessories available in Canada',
        },
        publisher: {
          '@id': 'https://proskatersplace.ca/#organization',
        },
      }),
    },
  ],
});

onMounted(() => {
  console.log('[DEBUG V3] productCategories value on client mount:', JSON.parse(JSON.stringify(productCategories.value)));
});
</script>

<template>
  <main class="min-h-screen" style="background-color: #1a1a1a">
    <!-- Main Container -->
    <div class="mx-auto" style="max-width: 1320px; padding: clamp(24px, 5vw, 64px)">
      <!-- Header Section -->
      <header class="mb-12">
        <div class="flex items-end justify-between mb-8">
          <h1 class="text-white font-bold tracking-tight" style="font-size: clamp(48px, 6vw, 88px); letter-spacing: -0.02em; line-height: 1.1">
            Featured Categories
          </h1>
          <a href="#all-categories" class="text-white hover:underline font-medium" style="font-size: 0.875rem"> All Categories </a>
        </div>

        <!-- Category Pills -->
        <div class="flex flex-wrap gap-2 mb-4">
          <NuxtLink
            v-for="pill in pillCategories"
            :key="pill.slug"
            :to="`/product-category/${pill.slug}`"
            class="px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 bg-gray-800 text-white border border-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white"
            style="border-radius: 24px; padding: 4px 12px">
            {{ pill.name }}
          </NuxtLink>
        </div>
      </header>

      <!-- Categories Grid -->
      <div v-if="productCategories && productCategories.length" class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-8 xl:grid-cols-4">
        <CategoryCard
          v-for="(category, i) in productCategories"
          :key="category.slug"
          :node="{
            ...category,
            name: category.displayName,
          }"
          :image-loading="i <= 2 ? 'eager' : 'lazy'" />
      </div>

      <div v-else class="text-center text-gray-300 py-12 bg-gray-800 rounded-lg">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 class="text-xl font-semibold mb-2">No Categories Found</h3>
        <p class="text-gray-400 mb-4">We're currently updating our product categories.</p>
        <p class="text-sm text-gray-500">Expected categories: {{ categoryMapping.map((c) => c.display).join(', ') }}</p>
      </div>

      <!-- Info Section -->
      <div class="mt-16">
        <h2 class="text-3xl font-bold text-white text-center mb-8">Why Shop at ProSkaters Place Canada?</h2>
        <div class="grid md:grid-cols-3 gap-8">
          <div class="text-center">
            <div class="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-white mb-2">Expert Selection</h3>
            <p class="text-gray-300">Curated collection of premium skating equipment from top brands worldwide</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-white mb-2">Expert Advice</h3>
            <p class="text-gray-300">Toronto-based team with decades of skating experience to help you choose</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-white mb-2">Fast Shipping</h3>
            <p class="text-gray-300">Free shipping on orders $99+ across Canada with fast delivery</p>
          </div>
        </div>
      </div>

      <!-- More Categories Section -->
      <div v-if="otherCategories.length" id="all-categories" class="mt-16">
        <h2 class="text-2xl font-bold text-white mb-6">More Categories</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <NuxtLink
            v-for="cat in otherCategories"
            :key="cat.slug"
            :to="`/product-category/${cat.slug}`"
            class="bg-gray-800 p-4 rounded hover:bg-gray-700 transition-colors flex flex-col justify-between h-full">
            <div class="font-semibold text-white mb-2">{{ cat.name }}</div>
            <div class="text-sm text-gray-400">{{ cat.count }} products</div>
          </NuxtLink>
        </div>
      </div>

      <!-- SEO Content Section -->
      <div class="mt-16">
        <div class="bg-gray-800 rounded-lg p-8">
          <h2 class="text-2xl font-bold text-white mb-4">Shop Skating Equipment Categories in Canada</h2>
          <div class="prose prose-invert max-w-none">
            <p class="text-gray-300 mb-4">
              ProSkaters Place is Canada's premier online destination for skating equipment and accessories. Based in Toronto, Ontario, we've been serving
              Canadian skaters since 1995 with expert product selection, competitive pricing, and exceptional customer service.
            </p>
            <p class="text-gray-300 mb-4">Browse our comprehensive categories to find exactly what you need:</p>
            <ul class="text-gray-300 space-y-2 mb-4">
              <li><strong class="text-white">Inline Skates:</strong> Recreational, fitness, aggressive, and speed skates from top brands</li>
              <li><strong class="text-white">Roller Skates:</strong> Quad skates, artistic, derby, and recreational roller skates</li>
              <li><strong class="text-white">Protection Gear:</strong> Helmets, pads, wrist guards, and safety equipment</li>
              <li><strong class="text-white">Skate Parts:</strong> Wheels, bearings, frames, and replacement components</li>
              <li><strong class="text-white">Accessories:</strong> Tools, bags, apparel, and skating essentials</li>
            </ul>
            <p class="text-gray-300">
              All products ship across Canada with free shipping on orders over $99. Our Toronto-based experts are available to help you choose the perfect
              equipment for your skating needs.
            </p>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
