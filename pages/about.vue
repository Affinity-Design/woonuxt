<script lang="ts" setup>
const businessStartYear = 2011;
const brandSearchLinks = [
  {name: 'Rollerblade', to: '/search?q=Rollerblade'},
  {name: 'K2 Skates', to: '/search?q=K2%20Skates'},
  {name: 'Powerslide', to: '/search?q=Powerslide'},
  {name: 'Seba', to: '/search?q=Seba'},
  {name: 'FR Skates', to: '/search?q=FR%20Skates'},
  {name: 'Moxi', to: '/search?q=Moxi'},
  {name: 'Riedell', to: '/search?q=Riedell'},
  {name: 'Impala', to: '/search?q=Impala'},
  {name: 'Rio Roller', to: '/search?q=Rio%20Roller'},
  {name: 'Chaya', to: '/search?q=Chaya'},
];
const brandSeparator = (index: number, total: number) => {
  if (index === total - 1) return '.';
  return index === total - 2 ? ', and ' : ', ';
};
const {setCanadianSEO} = useCanadianSEO();

setCanadianSEO({
  title: 'About ProSkaters Place | Toronto Skate Shop Since 2011',
  description:
    'Learn about ProSkaters Place, a Toronto-area skate shop serving Canadian inline skaters and roller skaters since 2011 with expert fitting, premium brands, and online shipping.',
  image: '/images/blog/posted/canadas-premier-roller-skates-store.jpg',
  type: 'website',
});

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        '@id': 'https://proskatersplace.ca/about#webpage',
        url: 'https://proskatersplace.ca/about',
        name: 'About ProSkaters Place',
        inLanguage: 'en-CA',
        isPartOf: {
          '@id': 'https://proskatersplace.ca/#website',
        },
        about: {
          '@type': 'LocalBusiness',
          '@id': 'https://proskatersplace.ca/#business',
          name: 'ProSkaters Place Skate and Ski Shop',
          foundingDate: String(businessStartYear),
          address: {
            '@type': 'PostalAddress',
            streetAddress: '110 Galaxy Blvd',
            addressLocality: 'Etobicoke',
            addressRegion: 'ON',
            postalCode: 'M9W 4Y6',
            addressCountry: 'CA',
          },
        },
      }),
    },
  ],
});
</script>

<template>
  <main>
    <section class="relative overflow-hidden bg-gray-950 text-white">
      <img
        src="/images/blog/posted/canadas-premier-roller-skates-store.jpg"
        alt="ProSkaters Place skate shop in Toronto"
        class="absolute inset-0 h-full w-full object-cover opacity-45"
        width="1200"
        height="800"
        loading="eager" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/30"></div>
      <div class="container relative z-10 py-20 md:py-28">
        <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Toronto skate shop</p>
        <h1 class="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">About ProSkaters Place</h1>
        <p class="mt-6 max-w-2xl text-lg leading-relaxed text-gray-100">
          ProSkaters Place has served Canadian skaters since {{ businessStartYear }}, helping riders find the right inline skates, roller skates, protective
          gear, parts, and accessories for the way they skate.
        </p>
      </div>
    </section>

    <section class="container py-16">
      <div class="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-start">
        <div class="space-y-6 text-lg leading-relaxed text-gray-700">
          <h2 class="text-3xl font-bold text-primary">Built Around Better Skate Advice</h2>
          <p>
            We are based in Etobicoke and work with skaters across Toronto, the GTA, Ontario, and the rest of Canada. Our team focuses on fit, intended use, and
            long-term comfort so beginners, fitness skaters, urban skaters, derby skaters, and returning skaters can choose equipment with more confidence.
          </p>
          <p>
            Our lineup includes
            <template v-for="(brand, index) in brandSearchLinks" :key="brand.name">
              <NuxtLink :to="brand.to" class="font-semibold text-primary hover:underline">{{ brand.name }}</NuxtLink
              ><span>{{ brandSeparator(index, brandSearchLinks.length) }}</span>
            </template>
            We keep the brand list focused on what we actually carry, then pair that selection with sizing help, parts guidance, and support after the order.
          </p>
          <p>Visit us at 110 Galaxy Blvd for in-store shopping during posted shopping hours, use order pickup for online orders, or shop online any time.</p>
          <div class="flex flex-col gap-3 sm:flex-row">
            <NuxtLink
              to="/categories"
              class="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 font-semibold text-white shadow hover:bg-primary-dark">
              Shop Categories
            </NuxtLink>
            <NuxtLink
              to="/contact"
              class="inline-flex items-center justify-center rounded-lg border border-primary px-6 py-3 font-semibold text-primary hover:bg-primary hover:text-white">
              Contact the Shop
            </NuxtLink>
          </div>
        </div>

        <aside class="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h2 class="text-2xl font-bold text-gray-900">What We Focus On</h2>
          <ul class="mt-5 space-y-4 text-gray-700">
            <li class="flex gap-3">
              <Icon name="mdi:check-circle" class="mt-1 h-5 w-5 flex-shrink-0 text-green-600" />
              <span>Inline skates, roller skates, protective gear, wheels, bearings, parts, and skate tools.</span>
            </li>
            <li class="flex gap-3">
              <Icon name="mdi:check-circle" class="mt-1 h-5 w-5 flex-shrink-0 text-green-600" />
              <span>Practical fitting help for adults, kids, recreational skaters, fitness skaters, and performance-focused riders.</span>
            </li>
            <li class="flex gap-3">
              <Icon name="mdi:check-circle" class="mt-1 h-5 w-5 flex-shrink-0 text-green-600" />
              <span>Canadian ordering, pickup, and shipping support from a Toronto-area shop.</span>
            </li>
          </ul>
        </aside>
      </div>
    </section>
  </main>
</template>
