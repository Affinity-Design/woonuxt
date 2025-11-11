<script lang="ts" setup>
import {ProductsOrderByEnum} from '#woo';

// Get Gatagories all
const {data} = await useAsyncGql('getProductCategories');
const categoryMapping = [
  {display: 'Inline Skates', slug: 'inline-skates'},
  {display: 'Roller Skates', slug: 'roller-skates'},
  {display: 'Skate Parts', slug: 'replacement-parts'},
  {display: 'Skate Tools', slug: 'skate-tools'},
  {display: 'Protection Gear', slug: 'protection-gear-and-apparel'},
  {display: 'Scooters', slug: 'scooters'},
];
const productCategories = computed(() => {
  const categoriesMap = new Map(data.value.productCategories?.nodes.map((cat: ProductCategory) => [cat.slug, cat]));

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

// Get products for new
const {data: newProductsData} = await useAsyncGql('getProducts', {
  first: 5,
  orderby: ProductsOrderByEnum.DATE,
});
const newProducts = newProductsData.value.products?.nodes || [];

// Get products for clearance
const {data: clearanceProductsData} = await useAsyncGql('getProducts', {
  first: 5,
  slug: 'clearance-items',
});
const clearanceProducts = clearanceProductsData.value.products?.nodes || [];

// Get products for POP
const {data: productData} = await useAsyncGql('getProducts', {
  first: 5,
  orderby: ProductsOrderByEnum.POPULARITY,
});
const popularProducts = productData.value.products?.nodes || [];

// Get latest 6 blog posts
const {data: latestPosts} = await useAsyncData('latest-blog-posts', () => queryContent('blog').sort({date: -1}).limit(6).find());

const title = `ProSkaters Place - Canada's Most Trusted Skate Shop`;
const desc = `#1 Inline Skates, Roller Skates, Skate Parts & Tools in Canada. ProSkaters Place, Canada's top online retailer for all your skating and skiing needs. Unparalleled selection of high-quality inline skates, rollerblades, roller skates, quad skates, scooters, skateboards, and both alpine and cross-country ski equipment.`;

useSeoMeta({
  title: title,
  ogTitle: title,
  description: desc,
  ogDescription: desc,
  ogImage: `/images/Inline-Skates-Toronto.jpg`,
  twitterCard: `summary_large_image`,
});
</script>

<template>
  <main>
    <HeroBanner />
    <!-- Catagories -->
    <section class="container my-16">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">
          {{ $t('messages.shop.shopByCategory') }}
        </h2>
        <NuxtLink class="text-primary" to="/categories">{{ $t('messages.general.viewAll') }}</NuxtLink>
      </div>
      <div class="grid justify-center grid-cols-2 gap-4 mt-8 md:grid-cols-3 lg:grid-cols-6">
        <CategoryCard
          v-for="(category, i) in productCategories"
          :key="category.slug"
          :node="{
            ...category,
            name: category.displayName,
          }"
          :image-loading="i <= 2 ? 'eager' : 'lazy'" />
      </div>
    </section>
    <!-- Benefits -->
    <section class="py-16 sm:py-10 my-16 sm:my-18">
      <div class="container mx-auto">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 text-center">
          <div class="flex flex-col items-center">
            <img src="/icons/box.svg" width="48" height="48" alt="Free Expedited Shipping" loading="lazy" class="mb-4 h-12 w-12" />
            <h3 class="text-lg font-semibold uppercase tracking-wider text-gray-700">Free Shipping</h3>
            <h6>*On Orders Over $99*</h6>
          </div>

          <div class="flex flex-col items-center">
            <img src="/icons/moneyback.svg" width="48" height="48" alt="30-Day Returns & Hassle-Free Exchanges" loading="lazy" class="mb-4 h-12 w-12" />
            <h3 class="text-lg font-semibold uppercase tracking-wider text-gray-700">Hassle-Free Exchanges</h3>
            <h6>*On Regular Priced Items*</h6>
          </div>

          <div class="flex flex-col items-center">
            <img src="/icons/secure.svg" width="48" height="48" alt="Advice from Experts" loading="lazy" class="mb-4 h-12 w-12" />
            <h3 class="text-lg font-semibold uppercase tracking-wider text-gray-700">Same Day Shipping</h3>
            <h6>*In the GTA Region*</h6>
          </div>

          <div class="flex flex-col items-center">
            <img src="/icons/support.svg" width="48" height="48" alt="Proudly Canadian" loading="lazy" class="mb-4 h-12 w-12" />
            <h3 class="text-lg font-semibold uppercase tracking-wider text-gray-700">100% Canadian</h3>
            <h6>*Toronto Based Owned & Operated*</h6>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Product Section - Inline Skates -->
    <section class="relative bg-cover bg-bottom text-white my-16 sm:my-24" :style="{backgroundImage: `url('/images/inline-skates.jpg')`}">
      <!-- Overlay for better text readability -->
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30"></div>

      <div class="container mx-auto relative z-10 flex flex-col justify-center items-start h-[400px] sm:h-[500px] md:h-[550px] px-6 py-12 lg:px-8">
        <div class="max-w-xl">
          <h2 class="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-5">Best Inline Skates Toronto</h2>
          <p class="text-base sm:text-lg text-gray-200 mb-6 sm:mb-8 leading-relaxed">
            Discover Toronto's top selection of inline skates. Perfect for fitness, commuting, or fun, find your ideal pair with expert advice and fast local
            shipping.
          </p>
          <NuxtLink
            to="/product-category/inline-skates"
            class="inline-block px-8 py-3 sm:px-10 sm:py-4 text-sm sm:text-base font-bold text-gray-900 bg-white rounded-lg shadow-md hover:bg-gray-100 focus:bg-gray-100 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-black/50">
            Shop Inline Skates
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- New -->
    <section class="container my-16" v-if="newProducts">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">New Products</h2>
        <NuxtLink class="text-primary" to="/products">{{ $t('messages.general.viewAll') }}</NuxtLink>
      </div>
      <ProductRow :products="newProducts" class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-8" />
    </section>
    <!-- Clearance -->
    <section class="container my-16" v-if="clearanceProducts">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">Clearance Products</h2>
        <NuxtLink class="text-primary" to="/categories">{{ $t('messages.general.viewAll') }}</NuxtLink>
      </div>
      <ProductRow :products="clearanceProducts" class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-8" />
    </section>
    <!-- Popular -->
    <section class="container my-16" v-if="popularProducts">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">Popular Items</h2>
        <NuxtLink class="text-primary" to="/products">{{ $t('messages.general.viewAll') }}</NuxtLink>
      </div>
      <ProductRow :products="popularProducts" class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-8" />
    </section>

    <!-- Featured Product Section - Roller Skates -->
    <section class="relative bg-cover bg-bottom text-white my-16 sm:my-24" :style="{backgroundImage: `url('/images/roller-skates.jpg')`}">
      <!-- Overlay for better text readability -->
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30"></div>

      <div class="container mx-auto relative z-10 flex flex-col justify-center items-start h-[400px] sm:h-[500px] md:h-[550px] px-6 py-12 lg:px-8">
        <div class="max-w-xl">
          <h2 class="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-5">Best Roller Skates Toronto</h2>
          <p class="text-base sm:text-lg text-gray-200 mb-6 sm:mb-8 leading-relaxed">
            Explore Toronto's finest collection of roller skates and quad skates. Whether for dancing, cruising, or derby, find your perfect fit with us.
          </p>
          <NuxtLink
            to="/product-category/roller-skates"
            class="inline-block px-8 py-3 sm:px-10 sm:py-4 text-sm sm:text-base font-bold text-gray-900 bg-white rounded-lg shadow-md hover:bg-gray-100 focus:bg-gray-100 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-black/50">
            Shop Roller Skates
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- REviews -->
    <GoogleReviewRotator />

    <!-- Blog Section -->
    <section class="container my-16">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">Latest Skating Tips</h2>
        <NuxtLink class="text-primary" to="/blog">{{ $t('messages.general.viewAll') }}</NuxtLink>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <BlogPostCard v-for="post in latestPosts" :key="post._path" :post="post" />
      </div>
    </section>
  </main>
</template>

<style scoped>
.brand img {
  max-height: min(8vw, 120px);
  object-fit: contain;
  object-position: center;
}
</style>
