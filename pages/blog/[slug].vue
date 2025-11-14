<script setup lang="ts">
const route = useRoute();
const slug = Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug;

// Extract the blog post slug from the full path
const blogSlug = slug.replace(/^blog\//, '');

// Fetch the specific blog post
const {data: post} = await useAsyncData(`blog-post-${blogSlug}`, () => queryContent('blog', blogSlug).findOne());

// Handle 404 for blog posts
if (!post.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Blog post not found',
  });
}

// Canadian SEO Optimization
const {setCanadianSEO} = useCanadianSEO();

const title = post.value.title ?? 'ProSkaters Place Blog';
const desc = post.value.description ?? "Expert skating advice and tips from Toronto's most trusted skate shop.";
const image = post.value.ogImage ?? '/images/Inline-Skates-Toronto.jpg';

setCanadianSEO({
  title: `${title} | ProSkaters Place Canada`,
  description: desc,
  image,
  type: 'article',
});

// Article Structured Data (Schema.org)
const publishedDate = post.value.date ? new Date(post.value.date).toISOString() : new Date().toISOString();
const modifiedDate = post.value.modified ? new Date(post.value.modified).toISOString() : publishedDate;

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description: desc,
        image: image,
        datePublished: publishedDate,
        dateModified: modifiedDate,
        author: {
          '@type': post.value.author === 'ProSkaters Place Team' ? 'Organization' : 'Person',
          name: post.value.author ?? 'ProSkaters Place Team',
          ...(post.value.authorBio && {description: post.value.authorBio}),
        },
        publisher: {
          '@type': 'Organization',
          '@id': 'https://proskatersplace.ca/#organization',
          name: 'ProSkaters Place',
          logo: {
            '@type': 'ImageObject',
            url: 'https://proskatersplace.ca/icon.png',
          },
          address: {
            '@type': 'PostalAddress',
            addressLocality: 'Toronto',
            addressRegion: 'ON',
            addressCountry: 'CA',
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `https://proskatersplace.ca/blog/${blogSlug}`,
        },
        articleSection: post.value.category ?? 'Skating Tips',
        keywords: post.value.tags?.join(', ') ?? '',
        inLanguage: 'en-CA',
        isAccessibleForFree: 'True',
        about: {
          '@type': 'Thing',
          name: 'Inline Skating',
          description: 'Information about inline skating, roller skating, and skating equipment in Canada',
        },
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
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
            name: 'Blog',
            item: 'https://proskatersplace.ca/blog',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: title,
            item: `https://proskatersplace.ca/blog/${blogSlug}`,
          },
        ],
      }),
    },
  ],
});

// Format date helper
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Related posts (same category, exclude current)
const {data: relatedPosts} = await useAsyncData(`related-${blogSlug}`, () =>
  queryContent('blog')
    .where({
      category: post.value?.category,
      _path: {$ne: post.value?._path},
    })
    .limit(3)
    .find(),
);

// Fetch product categories for "Shop by Category" section
const {data: categoriesData} = await useAsyncGql('getProductCategories');
const categoryMapping = [
  {display: 'Inline Skates', slug: 'inline-skates'},
  {display: 'Roller Skates', slug: 'roller-skates'},
  {display: 'Skate Parts', slug: 'replacement-parts'},
  {display: 'Protection Gear', slug: 'protection-gear-and-apparel'},
  {display: 'Skate Tools', slug: 'skate-tools'},
  {display: 'Scooters', slug: 'scooters'},
];

const productCategories = computed(() => {
  if (!categoriesData.value?.productCategories?.nodes) return [];

  const categoriesMap = new Map(categoriesData.value.productCategories.nodes.map((cat: ProductCategory) => [cat.slug, cat]));

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
</script>

<template>
  <div v-if="post" class="min-h-screen" style="background-color: #1a1a1a">
    <!-- Hero Section -->
    <div class="relative">
      <div v-if="post.image" class="relative h-96 overflow-hidden">
        <NuxtImg :src="post.image" :alt="post.title" class="w-full h-full object-cover" width="1200" height="600" loading="eager" />
        <div class="absolute inset-0 bg-black bg-opacity-40"></div>
      </div>

      <!-- Article Header -->
      <div class="container mx-auto px-4 py-12" :class="post.image ? 'relative -mt-32 z-10' : ''">
        <div class="max-w-4xl mx-auto">
          <div v-if="post.category" class="mb-4">
            <span class="inline-block bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              {{ post.category }}
            </span>
          </div>

          <h1 class="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            {{ post.title }}
          </h1>

          <div class="flex items-center text-gray-300 mb-6">
            <span v-if="post.author" class="mr-4"> By {{ post.author }} </span>
            <span v-if="post.date">
              {{ formatDate(post.date) }}
            </span>
          </div>

          <p v-if="post.description" class="text-xl text-gray-200 leading-relaxed">
            {{ post.description }}
          </p>
        </div>
      </div>
    </div>

    <!-- Article Content -->
    <div class="container mx-auto px-4 pb-16">
      <div class="max-w-4xl mx-auto">
        <article class="prose prose-lg prose-invert max-w-none">
          <ContentRenderer :value="post" />
        </article>

        <!-- Author Bio - Enhanced for Canadian SEO -->
        <div v-if="post.authorBio || post.author" class="mt-12 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {{ (post.author || 'P')[0].toUpperCase() }}
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-white font-bold text-lg mb-2">About {{ post.author || 'the Author' }}</h3>
              <p class="text-gray-300 mb-3">
                {{
                  post.authorBio || `Expert skating advice from Canada's most trusted inline skate specialists in Toronto. Serving Canadian skaters since 1995.`
                }}
              </p>
              <div class="flex flex-wrap gap-2 text-sm text-gray-400">
                <span class="flex items-center gap-1">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clip-rule="evenodd" />
                  </svg>
                  Toronto, ON, Canada
                </span>
                <span class="flex items-center gap-1">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                  ProSkaters Place Team
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="post.tags && post.tags.length" class="mt-8">
          <h3 class="text-white font-semibold mb-4">Article Tags</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="tag in post.tags" :key="tag" class="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm hover:bg-gray-600 transition-colors">
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Shop by Category Section -->
        <div
          v-if="productCategories && productCategories.length"
          class="mt-12 p-6 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border border-gray-700">
          <div class="text-center mb-6">
            <h3 class="text-2xl font-bold text-white mb-2">Shop by Category</h3>
            <p class="text-gray-300">Discover our premium selection of skating equipment and gear</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <CategoryCard
              v-for="(category, i) in productCategories"
              :key="category.slug"
              :node="{
                ...category,
                name: category.displayName,
              }"
              :image-loading="'lazy'"
              class="transform hover:scale-105 transition-transform duration-200" />
          </div>
          <div class="text-center mt-6">
            <NuxtLink
              to="/categories"
              class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              View All Categories
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </NuxtLink>
          </div>
        </div>

        <!-- Related Posts -->
        <div v-if="relatedPosts && relatedPosts.length" class="mt-16">
          <h3 class="text-2xl font-bold text-white mb-8">Related Articles</h3>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <NuxtLink
              v-for="relatedPost in relatedPosts"
              :key="relatedPost._path"
              :to="relatedPost._path"
              class="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-700 transition-colors">
              <div v-if="relatedPost.image" class="h-48 overflow-hidden">
                <NuxtImg :src="relatedPost.image" :alt="relatedPost.title" class="w-full h-full object-cover" width="400" height="200" />
              </div>
              <div class="p-6">
                <h4 class="text-white font-semibold mb-2 line-clamp-2">
                  {{ relatedPost.title }}
                </h4>
                <p v-if="relatedPost.description" class="text-gray-400 text-sm line-clamp-3">
                  {{ relatedPost.description }}
                </p>
                <div class="mt-4 text-blue-400 text-sm">Read more →</div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Back to Blog -->
        <div class="mt-12 text-center">
          <NuxtLink to="/blog" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"> ← Back to Blog </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.prose h1,
.prose h2,
.prose h3,
.prose h4,
.prose h5,
.prose h6 {
  @apply text-white;
}

.prose p,
.prose li {
  @apply text-gray-300;
}

.prose a {
  @apply text-blue-400 hover:text-blue-300;
}

.prose strong {
  @apply text-white;
}

.prose code {
  @apply bg-gray-800 text-gray-200 px-1 py-0.5 rounded;
}

.prose pre {
  @apply bg-gray-900 border border-gray-700;
}

.prose blockquote {
  @apply border-l-blue-500 text-gray-300;
}
</style>
