<script lang="ts" setup>
import { ProductsOrderByEnum } from "#woo";
const { siteName, description, shortDescription, siteImage } = useAppConfig();

// Get Gatagories all
const { data } = await useAsyncGql("getProductCategories");
const categoryMapping = [
  { display: "Inline Skates", slug: "inline-skates" },
  { display: "Roller Skates", slug: "roller-skates" },
  { display: "Skate Parts", slug: "replacement-parts" },
  { display: "Skate Tools", slug: "skate-tools" },
  { display: "Protection Gear", slug: "protection-gear-and-apparel" },
  { display: "Scooters", slug: "scooters" },
];
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

// Get products for new
const { data: newProductsData } = await useAsyncGql("getProducts", {
  first: 5,
  orderby: ProductsOrderByEnum.DATE,
});
const newProducts = newProductsData.value.products?.nodes || [];

// Get products for clearance
const { data: clearanceProductsData } = await useAsyncGql("getProducts", {
  first: 5,
  slug: "clearance-items",
});
const clearanceProducts = clearanceProductsData.value.products?.nodes || [];

// Get products for POP
const { data: productData } = await useAsyncGql("getProducts", {
  first: 5,
  orderby: ProductsOrderByEnum.POPULARITY,
});
const popularProducts = productData.value.products?.nodes || [];

const title = `ProskatersPlace - Inline Skates, Roller Skates, Skate Parts & Tools Canada`;
const desc = `Experience the thrill of gliding on wheels or carving through snow with ProSkaters Place, Canada's top online retailer for all your skating and skiing needs. We offer an unparalleled selection of high-quality inline skates, rollerblades, roller skates, quad skates, scooters, skateboards, and both alpine and cross-country ski equipment.`;

useSeoMeta({
  title: title,
  ogTitle: title,
  description: desc,
  ogDescription: desc,
  ogImage: `/images/Inline-Skates-Toronto.webp`,
  twitterCard: `summary_large_image`,
  canonical: 'https://proskatersplace.ca',
  ogUrl: 'https://proskatersplace.ca',
  ogSiteName: 'ProSkaters Place Canada',
  ogType: 'website',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1',
  // Add additional meta tags
  keywords: 'inline skates, roller skates, skate parts, Toronto, Canada, roller derby, fitness skating',
  author: 'ProSkaters Place Canada',
  viewport: 'width=device-width, initial-scale=1',
  'theme-color': '#ffffff',
  // Open Graph additional
  ogLocale: 'en_CA',
  // Twitter additional
  twitterTitle: title,
  twitterDescription: desc,
  twitterImage: `/images/Inline-Skates-Toronto.webp`,
})
</script>

<template>
  <main>
    <HeroBanner />
    <!-- <div
      class="container flex flex-wrap items-center justify-center my-16 text-center gap-x-8 gap-y-4 brand lg:justify-between"
    >
      <img
        src="/images/logoipsum-211.svg"
        alt="Brand 1"
        width="132"
        height="35"
      />
      <img
        src="/images/logoipsum-221.svg"
        alt="Brand 2"
        width="119"
        height="30"
      />
      <img
        src="/images/logoipsum-225.svg"
        alt="Brand 3"
        width="49"
        height="48"
      />
      <img
        src="/images/logoipsum-280.svg"
        alt="Brand 4"
        width="78"
        height="30"
      />
      <img
        src="/images/logoipsum-284.svg"
        alt="Brand 5"
        width="70"
        height="44"
      />
      <img
        src="/images/logoipsum-215.svg"
        alt="Brand 6"
        width="132"
        height="40"
      />
    </div> -->
    <!-- Catagories -->
    <section class="container my-16">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">
          {{ $t("messages.shop.shopByCategory") }}
        </h2>
        <NuxtLink class="text-primary" to="/categories">{{
          $t("messages.general.viewAll")
        }}</NuxtLink>
      </div>
      <div
        class="grid justify-center grid-cols-2 gap-4 mt-8 md:grid-cols-3 lg:grid-cols-6"
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
    </section>
    <!-- Benifits -->
    <section class="container grid gap-4 my-24 md:grid-cols-2 lg:grid-cols-4">
      <div class="flex items-center gap-8 p-8 bg-white rounded-lg">
        <img
          src="/icons/box.svg"
          width="60"
          height="60"
          alt="Free Shipping"
          loading="lazy"
        />
        <div>
          <h3 class="text-xl font-semibold">Free Shipping</h3>
          <p class="text-sm">Free shipping over $99</p>
        </div>
      </div>
      <div class="flex items-center gap-8 p-8 bg-white rounded-lg">
        <img
          src="/icons/moneyback.svg"
          width="60"
          height="60"
          alt="Money Back"
          loading="lazy"
        />
        <div>
          <h3 class="text-xl font-semibold">Peace of Mind</h3>
          <p class="text-sm">Money back guarantee</p>
        </div>
      </div>
      <div class="flex items-center gap-8 p-8 bg-white rounded-lg">
        <img
          src="/icons/secure.svg"
          width="60"
          height="60"
          alt="Secure Payment"
          loading="lazy"
        />
        <div>
          <h3 class="text-xl font-semibold">100% Secure</h3>
          <p class="text-sm">Payments are safe with us.</p>
        </div>
      </div>
      <div class="flex items-center gap-8 p-8 bg-white rounded-lg">
        <img
          src="/icons/support.svg"
          width="60"
          height="60"
          alt="Support 24/7"
          loading="lazy"
        />
        <div>
          <h3 class="text-xl font-semibold">Support 24/7</h3>
          <p class="text-sm">24/7 Online support</p>
        </div>
      </div>
    </section>
    <!-- New -->
    <section class="container my-16" v-if="newProducts">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">New Products</h2>
        <NuxtLink class="text-primary" to="/products">{{
          $t("messages.general.viewAll")
        }}</NuxtLink>
      </div>
      <ProductRow
        :products="newProducts"
        class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-8"
      />
    </section>
    <!-- Clearance -->
    <section class="container my-16" v-if="clearanceProducts">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">Clearance Products</h2>
        <NuxtLink class="text-primary" to="/catagories">{{
          $t("messages.general.viewAll")
        }}</NuxtLink>
      </div>
      <ProductRow
        :products="clearanceProducts"
        class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-8"
      />
    </section>
    <!-- Popular -->
    <section class="container my-16" v-if="popularProducts">
      <div class="flex items-end justify-between">
        <h2 class="text-lg font-semibold md:text-2xl">Popular Items</h2>
        <NuxtLink class="text-primary" to="/products">{{
          $t("messages.general.viewAll")
        }}</NuxtLink>
      </div>
      <ProductRow
        :products="popularProducts"
        class="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-8"
      />
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
