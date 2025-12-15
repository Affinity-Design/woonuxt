<script setup lang="ts">
// Import required composables
import {computed, ref, onMounted, onUnmounted} from 'vue';

const route = useRoute();
const slug = Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug;

// Fetch the post content
const {data: post} = await useAsyncData(`blog-${slug}`, () =>
  queryContent('blog')
    .where({_path: {$contains: slug}})
    .findOne(),
);

// Handle 404
if (!post.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Blog post not found',
  });
}

// Canadian SEO setup
const {setCanadianSEO} = useCanadianSEO();

// SEO Meta with Canadian optimization
const title = post.value.title ?? 'ProSkaters Place Blog';
const desc = post.value.description ?? "Expert skating advice and tips from Toronto's most trusted skate shop.";
const image = post.value.ogImage ?? '/images/Inline-Skates-Toronto.jpg';

// Set Canadian-specific SEO
setCanadianSEO({
  title,
  description: desc,
  image,
  type: 'article',
});

// Structured data for article
const articleStructuredData = {
  title: post.value.title,
  description: post.value.description,
  image: post.value.ogImage,
  author: post.value.author,
  authorBio: post.value.authorBio,
  datePublished: post.value.date,
  dateModified: post.value.dateModified || post.value.date,
  url: route.path,
  category: post.value.category,
  tags: post.value.tags,
};

// Structured data for author (Person schema)
const authorStructuredData = {
  name: post.value.author,
  bio: post.value.authorBio,
};

// Format date
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Calculate reading time
const readingTime = computed(() => {
  if (!post.value?.body) return 0;
  const text = JSON.stringify(post.value.body);
  const wordCount = text.split(/\s+/).length;
  const wordsPerMinute = 200;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Reading progress tracking
const readingProgress = ref(0);
const updateReadingProgress = () => {
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight - windowHeight;
  const scrolled = window.scrollY;
  const progress = (scrolled / documentHeight) * 100;
  readingProgress.value = Math.min(100, Math.max(0, progress));
};

// Setup reading progress on client side only
if (process.client) {
  onMounted(() => {
    window.addEventListener('scroll', updateReadingProgress);
    updateReadingProgress();
  });

  onUnmounted(() => {
    window.removeEventListener('scroll', updateReadingProgress);
  });
}

// Related posts (same category, exclude current)
const {data: relatedPosts} = await useAsyncData(`related-${slug}`, () =>
  queryContent('blog')
    .where({
      category: post.value?.category,
      _path: {$ne: post.value?._path},
    })
    .sort({date: -1})
    .limit(3)
    .find(),
);

// Get one recommended post for the recommendation card
const recommendedPost = computed(() => {
  return relatedPosts.value?.[0] || null;
});

// Extract headings for table of contents
const headings = computed(() => {
  if (!post.value?.body?.children) return [];

  const extractedHeadings: any[] = [];

  const processNode = (node: any) => {
    if (node.tag && ['h2', 'h3'].includes(node.tag)) {
      // Get the heading text
      const headingText = node.children?.[0]?.value || '';

      // Use the same ID generation logic as Nuxt Content
      const id =
        node.props?.id ||
        headingText
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/^-+|-+$/g, '');

      extractedHeadings.push({
        id,
        tag: node.tag,
        text: headingText,
        level: node.tag === 'h2' ? 2 : 3,
      });
    }

    // Recursively process children
    if (node.children) {
      node.children.forEach(processNode);
    }
  };

  post.value.body.children.forEach(processNode);
  return extractedHeadings;
});

// Static product categories for Shop by Category section
const productCategories = [
  {
    displayName: 'Inline Skates',
    slug: 'inline-skates',
    image: '/images/inline-skates.jpg',
  },
  {
    displayName: 'Roller Skates',
    slug: 'roller-skates',
    image: '/images/roller-skates.jpg',
  },
  {
    displayName: 'Protective Helmets',
    slug: 'protective-helmets',
    image: '/images/Protective-Helmets.jpeg',
  },
  {
    displayName: 'Skate Wheels',
    slug: 'skate-wheels',
    image: '/images/Skate-Wheels.jpeg',
  },
  {
    displayName: 'Protection Gear & Apparel',
    slug: 'protection-gear-and-apparel',
    image: '/images/Protection-Gear-and-Apparel.jpeg',
  },
  {
    displayName: 'Replacement Parts',
    slug: 'replacement-parts',
    image: '/images/Replacement-Parts.jpeg',
  },
];
</script>

<template>
  <!-- SEO Structured Data -->
  <SEOStructuredData type="Article" :data="articleStructuredData" />
  <SEOStructuredData v-if="post.author" type="Person" :data="authorStructuredData" />

  <!-- Reading Progress Bar -->
  <div class="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-200">
    <div class="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-150 ease-out" :style="{width: `${readingProgress}%`}"></div>
  </div>

  <div class="min-h-screen" style="background-color: #f3f4f6">
    <!-- Navigation Breadcrumb -->
    <div class="bg-white">
      <div class="container mx-auto px-4 py-6">
        <nav class="flex items-center space-x-2 text-sm text-gray-600">
          <NuxtLink to="/" class="hover:text-gray-900">Home</NuxtLink>
          <span>/</span>
          <NuxtLink to="/blog" class="hover:text-gray-900">Blog</NuxtLink>
          <span>/</span>
          <span class="text-gray-900">{{ post.title }}</span>
        </nav>
      </div>
    </div>

    <!-- Main Content Container -->
    <div class="w-full px-4 lg:px-8 py-8 lg:py-16">
      <!-- Two Column Layout: Article + Right Sidebar -->
      <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
        <!-- Main Article (3/4 width on desktop) -->
        <article class="lg:col-span-3">
          <!-- White Surface Card -->
          <div class="bg-white rounded-xl overflow-hidden" style="box-shadow: 0 3px 18px rgba(0, 0, 0, 0.08); padding: 32px 48px">
            <!-- Article Header (Centered) -->
            <header class="text-center mb-12">
              <!-- Category & Date & Reading Time -->
              <div class="flex items-center justify-center gap-3 mb-6 flex-wrap">
                <span v-if="post.category" class="inline-block px-4 py-1 text-sm font-medium text-gray-600 rounded-full" style="background-color: #eef2f7">
                  {{ post.category }}
                </span>
                <time :datetime="post.date" class="text-gray-500 text-sm">
                  {{ formatDate(post.date) }}
                </time>
                <span class="inline-flex items-center gap-1 text-gray-500 text-sm">
                  <Icon name="ion:time-outline" class="text-gray-400" />
                  <span>{{ readingTime }} min read</span>
                </span>
              </div>

              <!-- Title (Reduced size by 50%) -->
              <h1 class="font-bold text-black leading-tight mb-6" style="font-size: clamp(24px, 3vw, 44px); letter-spacing: -0.02em; line-height: 1.25">
                {{ post.title }}
              </h1>

              <!-- Description -->
              <p v-if="post.description" class="text-lg text-gray-600 leading-relaxed max-w-3xl mx-auto">
                {{ post.description }}
              </p>

              <!-- Tags -->
              <div v-if="post.tags && post.tags.length" class="flex flex-wrap gap-3 justify-center mt-8">
                <span v-for="tag in post.tags" :key="tag" class="inline-block px-4 py-1 text-sm text-gray-600 rounded-full" style="background-color: #eef2f7">
                  {{ tag }}
                </span>
              </div>
            </header>

            <!-- Hero Image -->
            <div v-if="post.image" class="mb-12 rounded-lg overflow-hidden">
              <NuxtImg :src="post.image" :alt="post.title" class="w-full object-cover" style="aspect-ratio: 16/9" loading="eager" />
            </div>

            <!-- Content -->
            <div class="prose prose-lg max-w-none article-content mb-12">
              <ContentRenderer :value="post" />
            </div>

            <!-- Social Share Section -->
            <div class="mb-8 pb-8 border-b border-gray-200">
              <div class="flex items-center justify-between flex-wrap gap-4">
                <h4 class="text-sm font-semibold text-gray-900">Share this article:</h4>
                <div class="flex items-center gap-3">
                  <!-- Twitter/X -->
                  <a
                    :href="`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent('https://proskatersplace.ca' + route.path)}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-blue-500 hover:text-white transition-colors"
                    aria-label="Share on Twitter">
                    <Icon name="ion:logo-twitter" class="text-lg" />
                  </a>
                  <!-- Facebook -->
                  <a
                    :href="`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://proskatersplace.ca' + route.path)}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-blue-600 hover:text-white transition-colors"
                    aria-label="Share on Facebook">
                    <Icon name="ion:logo-facebook" class="text-lg" />
                  </a>
                  <!-- LinkedIn -->
                  <a
                    :href="`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent('https://proskatersplace.ca' + route.path)}&title=${encodeURIComponent(post.title)}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-blue-700 hover:text-white transition-colors"
                    aria-label="Share on LinkedIn">
                    <Icon name="ion:logo-linkedin" class="text-lg" />
                  </a>
                  <!-- Copy Link -->
                  <button
                    @click="copyLink"
                    class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-green-500 hover:text-white transition-colors"
                    aria-label="Copy link">
                    <Icon name="ion:link-outline" class="text-lg" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Tags Section -->
            <div v-if="post.tags && post.tags.length" class="flex flex-wrap gap-3 mb-12 pb-8 border-b border-gray-200">
              <span class="text-sm font-semibold text-gray-900 mr-2">Tags:</span>
              <span
                v-for="tag in post.tags"
                :key="tag"
                class="inline-block px-4 py-2 text-sm text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                style="background-color: #eef2f7">
                {{ tag }}
              </span>
            </div>

            <!-- Shop by Category Section -->
            <section class="mb-12">
              <div class="flex items-end justify-between mb-8">
                <h3 class="text-lg font-semibold md:text-2xl">Shop by Category</h3>
                <NuxtLink class="text-primary hover:underline text-sm" to="/categories"> View All </NuxtLink>
              </div>
              <div class="grid justify-center grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
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

            <!-- Recommended Article Card -->
            <div v-if="recommendedPost" class="mb-12">
              <h3 class="text-lg font-semibold text-gray-900 mb-4">You Might Also Like</h3>
              <NuxtLink
                :to="recommendedPost._path.replace('/blog/', '/')"
                class="group block transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-2xl overflow-hidden border border-gray-200"
                style="box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)">
                <div class="flex flex-col md:flex-row">
                  <!-- Post Image -->
                  <div class="w-full md:w-1/3 aspect-video md:aspect-square bg-gray-100 overflow-hidden">
                    <NuxtImg
                      v-if="recommendedPost.image"
                      :src="recommendedPost.image"
                      :alt="recommendedPost.title"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy" />
                    <div v-else class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <Icon name="ion:image-outline" class="text-gray-400 text-4xl" />
                    </div>
                  </div>

                  <!-- Post Content -->
                  <div class="flex-1 p-6">
                    <!-- Meta Row -->
                    <div class="flex items-center gap-2 mb-3">
                      <!-- Category Chip -->
                      <span v-if="recommendedPost.category" class="inline-block px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                        {{ recommendedPost.category }}
                      </span>

                      <!-- Date Label -->
                      <span class="inline-block px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-full">
                        {{ formatDate(recommendedPost.date) }}
                      </span>
                    </div>

                    <!-- Title -->
                    <h4 class="text-xl font-semibold text-black group-hover:underline line-clamp-2 mb-2">
                      {{ recommendedPost.title }}
                    </h4>

                    <!-- Description -->
                    <p v-if="recommendedPost.description" class="text-gray-600 text-sm line-clamp-2">
                      {{ recommendedPost.description }}
                    </p>
                  </div>
                </div>
              </NuxtLink>
            </div>

            <!-- Author Info - Enhanced for Canadian SEO -->
            <div v-if="post.author" class="p-8 rounded-lg border border-gray-200" style="background-color: #f9fafb">
              <h3 class="text-lg font-semibold text-gray-900 mb-6">About the Author</h3>
              <div class="flex items-start space-x-4">
                <div class="flex-shrink-0">
                  <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-md">
                    <Icon name="ion:person" class="text-white text-2xl" />
                  </div>
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900 text-lg mb-2">
                    {{ post.author }}
                  </h4>
                  <p v-if="post.authorBio" class="text-gray-600 mb-3 leading-relaxed">
                    {{ post.authorBio }}
                  </p>
                  <div class="flex flex-wrap gap-2 text-sm text-gray-500">
                    <span class="inline-flex items-center gap-1">
                      <Icon name="ion:location" class="text-blue-600" />
                      <span>Toronto, Ontario, Canada</span>
                    </span>
                    <span class="inline-flex items-center gap-1">
                      <Icon name="ion:checkmark-circle" class="text-green-600" />
                      <span>Skating Expert</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- Right Sidebar (1/4 width on desktop) -->
        <aside class="lg:col-span-1">
          <!-- Table of Contents - Desktop Only -->
          <div class="hidden lg:block">
            <div class="sticky bg-white rounded-xl p-6" style="top: 120px; box-shadow: 0 3px 18px rgba(0, 0, 0, 0.08)">
              <nav v-if="headings.length" class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Table of Contents</h3>
                <ul class="space-y-3">
                  <li v-for="heading in headings" :key="heading.id">
                    <a
                      :href="`#${heading.id}`"
                      :class="['block text-sm text-gray-600 hover:text-blue-600 transition-colors', heading.level === 3 ? 'ml-4' : '']">
                      {{ heading.text }}
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <!-- Related Posts -->
    <section v-if="relatedPosts && relatedPosts.length > 1" class="py-16">
      <div class="max-w-7xl mx-auto px-4 lg:px-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-8">More Related Articles</h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <NuxtLink
            v-for="relatedPost in relatedPosts.slice(1)"
            :key="relatedPost._path"
            :to="relatedPost._path.replace('/blog/', '/')"
            class="group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            <div class="aspect-video bg-gray-100 overflow-hidden">
              <NuxtImg
                v-if="relatedPost.image"
                :src="relatedPost.image"
                :alt="relatedPost.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy" />
              <div v-else class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <Icon name="ion:image-outline" class="text-gray-400 text-2xl" />
              </div>
            </div>

            <div class="p-4">
              <h3 class="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                {{ relatedPost.title }}
              </h3>
              <p v-if="relatedPost.description" class="text-gray-600 text-sm mt-2 line-clamp-2">
                {{ relatedPost.description }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="bg-gray-900 text-white py-16">
      <div class="container mx-auto px-4 text-center max-w-3xl">
        <h2 class="text-3xl font-bold mb-4">Ready to Get Skating?</h2>
        <p class="text-gray-300 text-lg mb-8">Browse our selection of premium inline skates, roller skates, and accessories.</p>
        <NuxtLink to="/categories" class="inline-block px-8 py-4 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
          Shop Now
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Mobile Responsive Overrides */
@media (max-width: 1024px) {
  .grid-cols-4 {
    grid-template-columns: 1fr !important;
  }

  h1 {
    text-align: left !important;
  }

  header {
    text-align: left !important;
    margin-bottom: 32px !important;
  }

  .aspect-ratio-16-9 {
    aspect-ratio: 4/3 !important;
  }
}

/* Line clamp utilities */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Article Content Styling */
.article-content {
  max-width: 72ch;
  font-family: Inter, Helvetica, Arial, sans-serif;
  line-height: 1.6;
}

.article-content :where(h1, h2, h3, h4):not(:where([class~='not-prose'] *)) {
  color: #000000;
  font-weight: 700;
  line-height: 1.25;
}

.article-content :where(h2):not(:where([class~='not-prose'] *)) {
  font-size: 1.875rem;
  margin-top: 48px;
  margin-bottom: 24px;
}

.article-content :where(h3):not(:where([class~='not-prose'] *)) {
  font-size: 1.25rem;
  margin-top: 32px;
  margin-bottom: 16px;
}

.article-content :where(p):not(:where([class~='not-prose'] *)) {
  margin-bottom: 24px;
  color: #000000;
}

.article-content :where(ul, ol):not(:where([class~='not-prose'] *)) {
  margin-bottom: 24px;
  padding-left: 20px;
}

.article-content :where(img):not(:where([class~='not-prose'] *)) {
  border-radius: 8px;
  margin: 32px 0;
}

.article-content :where(blockquote):not(:where([class~='not-prose'] *)) {
  border-left: 4px solid #2563eb;
  padding: 12px 24px;
  margin: 32px 0;
  font-style: italic;
  color: #4b5563;
  background-color: #f9fafb;
  border-radius: 6px;
}

.article-content :where(code):not(:where([class~='not-prose'] *)) {
  background-color: #f9fafb;
  font-family: SFMono-Regular, monospace;
  font-size: 0.9375rem;
  padding: 2px 6px;
  border-radius: 4px;
}

.article-content :where(pre):not(:where([class~='not-prose'] *)) {
  background-color: #f9fafb;
  font-family: SFMono-Regular, monospace;
  font-size: 0.9375rem;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 24px 0;
}

.article-content :where(a):not(:where([class~='not-prose'] *)) {
  color: #2563eb;
  text-decoration: none;
}

.article-content :where(a):not(:where([class~='not-prose'] *)):hover {
  text-decoration: underline;
}
</style>
