<script setup lang="ts">
const categoryMapping = [
  {
    name: 'Inline Skates',
    slug: 'inline-skates',
    imageFilename: 'Inline-Skates.jpeg',
  },
  {
    name: 'Roller Skates',
    slug: 'roller-skates',
    imageFilename: 'Roller-Skates.jpeg',
  },
  {
    name: 'Skate Parts',
    slug: 'replacement-parts',
    imageFilename: 'Skate-Parts.jpeg',
  },
  {
    name: 'Skate Tools',
    slug: 'skate-tools',
    imageFilename: 'Skate-Tools.jpeg',
  },
  {
    name: 'Protection Gear',
    slug: 'protection-gear-and-apparel',
    imageFilename: 'Protection-Gear.jpeg',
  },
  {
    name: 'Backpacks, Bags & Carriers',
    slug: 'backpacks-bags-carriers',
    imageFilename: 'Backpacks-Bags-and-Carriers.jpeg',
  },
  {name: 'Scooters', slug: 'scooters', imageFilename: 'Scooters.jpeg'},
  {
    name: 'Skateboards and Longboards',
    slug: 'skateboards-and-longboards',
    imageFilename: 'Skateboards-and-longboards.jpeg',
  },
  {
    name: 'Alpine Skis',
    slug: 'alpine-skis',
    imageFilename: 'Alpine-Skis.jpeg',
  },
  {
    name: 'Alpine Poles',
    slug: 'alpine-poles',
    imageFilename: 'Alpine-Poles.jpeg',
  },
  {
    name: 'Cross-Country Skis',
    slug: 'cross-country-skis',
    imageFilename: 'Cross-Country-Skis.jpeg',
  },
  {
    name: 'Nordic Poles',
    slug: 'cross-country-poles',
    imageFilename: 'Nordic-Poles.jpeg',
  },
];
</script>

<template>
  <section class="py-8" id="all-categories">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Explore All Categories</h2>
      <NuxtLink to="/categories#all-categories" class="text-primary hover:underline text-sm font-medium"> View Full List </NuxtLink>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      <CategoryCard v-for="category in categoryMapping" :key="category.slug" :node="category" />
    </div>
  </section>
</template>
