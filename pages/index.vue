<script lang="ts" setup>
import {ProductsOrderByEnum} from '#woo';

// Canadian SEO Optimization
const {setCanadianSEO} = useCanadianSEO();

setCanadianSEO({
  title: 'Best Roller Skates & Inline Skates Canada | ProSkaters Place Toronto',
  description: 'Shop Canada\'s #1 roller skates & inline skates store. ⭐ 1000+ models ⭐ Free shipping $99+ ⭐ Expert fitting ⭐ Toronto-based. Inline skates, quad roller skates, protective gear & more!',
  image: '/images/Inline-Skates-Toronto.jpg',
  type: 'website',
});

// Organization & WebSite structured data
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': 'https://proskatersplace.ca/#organization',
        name: 'ProSkaters Place',
        url: 'https://proskatersplace.ca',
        logo: 'https://proskatersplace.ca/icon.png',
        description: 'Canada\'s most trusted online skate shop specializing in inline skates, roller skates, protective gear, and skating accessories. Serving Toronto and all of Canada since 1995.',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '3600 Langstaff Road',
          addressLocality: 'Etobicoke',
          addressRegion: 'ON',
          postalCode: 'M9W 5S4',
          addressCountry: 'CA',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+1-416-739-2929',
          contactType: 'Customer Service',
          areaServed: 'CA',
          availableLanguage: ['en', 'fr'],
        },
        sameAs: [
          'https://www.facebook.com/proskatersplace',
          'https://www.instagram.com/proskatersplace',
        ],
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': 'https://proskatersplace.ca/#website',
        url: 'https://proskatersplace.ca',
        name: 'ProSkaters Place',
        description: 'Canada\'s premier online destination for roller skates, inline skates, and skating equipment',
        publisher: {
          '@id': 'https://proskatersplace.ca/#organization',
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://proskatersplace.ca/search?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      }),
    },
  ],
});

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

// Homepage FAQs
const homepageFAQs = [
  {
    question: 'What types of roller skates and inline skates do you sell?',
    answer: 'We carry a comprehensive selection of inline skates (rollerblades), quad roller skates, speed skates, recreational skates, fitness skates, aggressive skates, artistic roller skates, and roller derby skates. Top brands include Rollerblade, K2, Bauer, Powerslide, Moxi, Riedell, and Sure-Grip.',
  },
  {
    question: 'Do you ship roller skates across Canada?',
    answer: 'Yes! We offer free shipping on orders over $99 to all Canadian provinces and territories. Orders within the Greater Toronto Area (GTA) qualify for same-day shipping. We ship from our Toronto warehouse for fast delivery across Ontario, Quebec, British Columbia, Alberta, and beyond.',
  },
  {
    question: 'How do I choose the right size for inline skates or roller skates?',
    answer: 'Most skates fit true to your regular shoe size, but sizing varies by brand. Check our detailed sizing charts on each product page. Measure your feet in centimeters and compare to the brand\'s sizing guide. For first-time buyers, we recommend contacting our expert staff for personalized fitting advice to ensure comfort and prevent injuries.',
  },
  {
    question: 'What protective gear do I need for roller skating?',
    answer: 'We strongly recommend wearing a helmet, knee pads, elbow pads, and wrist guards - especially for beginners. Our protective gear collection includes certified safety equipment from top brands. A complete protection set typically costs $60-$150 and significantly reduces injury risk according to the Consumer Product Safety Commission.',
  },
  {
    question: 'Can I return or exchange roller skates if they don\'t fit?',
    answer: 'Yes! We offer hassle-free returns and exchanges on regular-priced items within 30 days of purchase. Skates must be unused (indoor try-on only, not used outside) with original packaging. Clearance and sale items may have different return policies - check the product page for details.',
  },
  {
    question: 'Do you have a physical store in Toronto?',
    answer: 'Yes! Our Toronto showroom is located at 3600 Langstaff Road in Etobicoke. Visit us for in-person fitting, expert advice, and to see our full selection. Store hours: Mon-Fri 12-4pm, Wed 12-7pm, Sat 2-7pm. We also serve customers online across Canada 24/7.',
  },
  {
    question: 'What brands of roller skates and inline skates do you carry?',
    answer: 'We stock premium brands including Rollerblade, K2 Skates, Bauer, Powerslide, FR Skates, Moxi, Riedell, Sure-Grip, Impala, Rio Roller, Chaya, and more. Whether you need recreational skates, performance inline skates, or artistic quad skates, we have trusted brands for every skating style.',
  },
  {
    question: 'Are roller skates suitable for adults or just kids?',
    answer: 'Both! We carry extensive selections for adults and children. Adult roller skating has surged in popularity for fitness, recreation, and roller derby. Our adult skates range from beginner-friendly recreational models to high-performance speed and aggressive skates. We also have kids\' skates with adjustable sizing to grow with your child.',
  },
];
</script>

<template>
  <main>
    <!-- SEO H1 Section (Hidden but indexed) -->
    <div class="sr-only">
      <h1>Best Roller Skates and Inline Skates Canada | ProSkaters Place Toronto Online Skate Shop</h1>
    </div>
    
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
    <section class="relative text-white my-16 sm:my-24 h-[400px] sm:h-[500px] md:h-[550px] overflow-hidden">
      <!-- Optimized background image -->
      <img
        src="/images/inline-skates.jpg"
        alt="Inline Skates Toronto"
        class="absolute inset-0 w-full h-full object-cover object-bottom"
        width="1920"
        height="550"
        loading="lazy" />
      <!-- Overlay for better text readability -->
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30"></div>

      <div class="container mx-auto relative z-10 flex flex-col justify-center items-start h-full px-6 py-12 lg:px-8">
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
    <section class="relative text-white my-16 sm:my-24 h-[400px] sm:h-[500px] md:h-[550px] overflow-hidden">
      <!-- Optimized background image -->
      <img
        src="/images/roller-skates.jpg"
        alt="Roller Skates Toronto"
        class="absolute inset-0 w-full h-full object-cover object-bottom"
        width="1920"
        height="550"
        loading="lazy" />
      <!-- Overlay for better text readability -->
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30"></div>

      <div class="container mx-auto relative z-10 flex flex-col justify-center items-start h-full px-6 py-12 lg:px-8">
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

    <!-- Homepage FAQs Section -->
    <section class="container my-16 py-12 bg-gray-50 rounded-lg">
      <div class="max-w-4xl mx-auto px-6">
        <h2 class="text-2xl md:text-3xl font-bold text-center text-primary mb-3">Frequently Asked Questions</h2>
        <p class="text-center text-gray-600 mb-10">Everything you need to know about buying roller skates and inline skates in Canada</p>
        
        <div class="space-y-4">
          <details v-for="(faq, index) in homepageFAQs" :key="index" class="bg-white rounded-lg shadow-md group">
            <summary class="flex justify-between items-center p-5 cursor-pointer list-none font-semibold text-gray-800 hover:text-primary transition-colors">
              <span class="flex-1 pr-4">{{ faq.question }}</span>
              <Icon name="mdi:chevron-down" class="w-6 h-6 text-primary transition-transform group-open:rotate-180" />
            </summary>
            <div class="px-5 pb-5 pt-2 text-gray-700 leading-relaxed border-t border-gray-100">
              {{ faq.answer }}
            </div>
          </details>
        </div>

        <div class="mt-10 text-center">
          <p class="text-gray-600 mb-4">Still have questions? We're here to help!</p>
          <NuxtLink 
            to="/contact"
            class="inline-flex items-center bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors shadow-md">
            <Icon name="mdi:email-outline" class="w-5 h-5 mr-2" />
            Contact Our Experts
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- SEO Content Section -->
    <section class="container my-16 py-12">
      <div class="max-w-5xl mx-auto prose prose-lg">
        <h2 class="text-2xl md:text-3xl font-bold text-primary mb-6">Canada's Premier Roller Skates & Inline Skates Store</h2>
        
        <p class="text-gray-700 leading-relaxed mb-4">
          Welcome to <strong>ProSkaters Place</strong> - Canada's most trusted destination for roller skates, inline skates, and skating equipment since 1995. Based in Toronto, Ontario, we serve skaters across Canada with an unmatched selection of over 1,000 models from world-renowned brands including Rollerblade, K2, Bauer, Powerslide, Moxi, Riedell, and Sure-Grip.
        </p>

        <h3 class="text-xl font-bold text-gray-900 mt-8 mb-4">Shop Inline Skates & Roller Skates Online in Canada</h3>
        <p class="text-gray-700 leading-relaxed mb-4">
          Whether you're searching for <NuxtLink to="/product-category/inline-skates" class="text-primary hover:underline">inline skates</NuxtLink> (also known as rollerblades) for fitness and speed, or classic <NuxtLink to="/product-category/roller-skates" class="text-primary hover:underline">quad roller skates</NuxtLink> for artistic skating and roller derby, we have the perfect skates for your needs. Our extensive inventory includes recreational skates for beginners, high-performance speed skates for experienced athletes, and everything in between.
        </p>

        <h3 class="text-xl font-bold text-gray-900 mt-8 mb-4">Why Choose ProSkaters Place?</h3>
        <ul class="space-y-2 text-gray-700 mb-4">
          <li class="flex items-start">
            <Icon name="mdi:check-circle" class="w-6 h-6 text-green-600 mr-2 mt-1 flex-shrink-0" />
            <span><strong>Free Shipping:</strong> Complimentary shipping on all orders over $99 across Canada</span>
          </li>
          <li class="flex items-start">
            <Icon name="mdi:check-circle" class="w-6 h-6 text-green-600 mr-2 mt-1 flex-shrink-0" />
            <span><strong>Expert Advice:</strong> Our knowledgeable team includes experienced skaters who provide personalized recommendations</span>
          </li>
          <li class="flex items-start">
            <Icon name="mdi:check-circle" class="w-6 h-6 text-green-600 mr-2 mt-1 flex-shrink-0" />
            <span><strong>Fast Delivery:</strong> Same-day shipping available for Greater Toronto Area customers</span>
          </li>
          <li class="flex items-start">
            <Icon name="mdi:check-circle" class="w-6 h-6 text-green-600 mr-2 mt-1 flex-shrink-0" />
            <span><strong>Hassle-Free Returns:</strong> 30-day return policy on regular-priced items ensures satisfaction</span>
          </li>
          <li class="flex items-start">
            <Icon name="mdi:check-circle" class="w-6 h-6 text-green-600 mr-2 mt-1 flex-shrink-0" />
            <span><strong>Toronto Showroom:</strong> Visit our Etobicoke location for in-person fitting and product demos</span>
          </li>
        </ul>

        <h3 class="text-xl font-bold text-gray-900 mt-8 mb-4">Complete Skating Equipment & Accessories</h3>
        <p class="text-gray-700 leading-relaxed mb-4">
          Beyond skates, we stock everything you need for a safe and enjoyable skating experience. Browse our comprehensive selection of <NuxtLink to="/product-category/protection-gear-and-apparel" class="text-primary hover:underline">protective gear</NuxtLink> including certified helmets, knee pads, elbow pads, and wrist guards. We also carry <NuxtLink to="/product-category/replacement-parts" class="text-primary hover:underline">replacement parts</NuxtLink> like wheels, bearings, brake pads, and laces to keep your skates performing at their best.
        </p>

        <h3 class="text-xl font-bold text-gray-900 mt-8 mb-4">Trusted by Canadian Skaters Since 1995</h3>
        <p class="text-gray-700 leading-relaxed mb-4">
          With decades of experience serving the Canadian skating community, ProSkaters Place has earned a reputation for quality products, competitive pricing, and exceptional customer service. Our customers in Toronto, Vancouver, Montreal, Calgary, Ottawa, and every corner of Canada trust us for authentic products, expert guidance, and reliable shipping.
        </p>

        <p class="text-gray-700 leading-relaxed">
          <strong>Ready to start skating?</strong> Explore our collections of <NuxtLink to="/product-category/inline-skates" class="text-primary hover:underline">inline skates</NuxtLink> and <NuxtLink to="/product-category/roller-skates" class="text-primary hover:underline">roller skates</NuxtLink>, or <NuxtLink to="/contact" class="text-primary hover:underline">contact our team</NuxtLink> for personalized recommendations. Happy skating! 🛼
        </p>
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
