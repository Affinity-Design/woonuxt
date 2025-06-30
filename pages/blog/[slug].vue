<script setup lang="ts">
const route = useRoute();
const slug = Array.isArray(route.params.slug) 
  ? route.params.slug.join("/") 
  : route.params.slug;

// Extract the blog post slug from the full path
const blogSlug = slug.replace(/^blog\//, '');

// Fetch the specific blog post
const { data: post } = await useAsyncData(`blog-post-${blogSlug}`, () =>
  queryContent("blog", blogSlug).findOne()
);

// Handle 404 for blog posts
if (!post.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Blog post not found",
  });
}

// SEO Meta for the blog post
const title = post.value.title ?? "ProSkaters Place Blog";
const desc = post.value.description ?? "Expert skating advice and tips from Toronto's most trusted skate shop.";
const image = post.value.ogImage ?? "/images/Inline-Skates-Toronto.jpg";
const canonicalUrl = `https://proskatersplace.ca/blog/${blogSlug}`;

useSeoMeta({
  title,
  ogTitle: title,
  description: desc,
  ogDescription: desc,
  ogImage: image,
  twitterCard: "summary_large_image",
  ogUrl: canonicalUrl,
  twitterImage: image,
});

useHead({
  link: [
    { rel: "canonical", href: canonicalUrl }
  ]
});

// Format date helper
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long", 
    day: "numeric",
  });
};

// Related posts (same category, exclude current)
const { data: relatedPosts } = await useAsyncData(`related-${blogSlug}`, () =>
  queryContent("blog")
    .where({ 
      category: post.value?.category,
      _path: { $ne: post.value?._path }
    })
    .limit(3)
    .find()
);
</script>

<template>
  <div v-if="post" class="min-h-screen" style="background-color: #1a1a1a">
    <!-- Hero Section -->
    <div class="relative">
      <div v-if="post.image" class="relative h-96 overflow-hidden">
        <NuxtImg
          :src="post.image"
          :alt="post.title"
          class="w-full h-full object-cover"
          width="1200"
          height="600"
          loading="eager"
        />
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
            <span v-if="post.author" class="mr-4">
              By {{ post.author }}
            </span>
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
        
        <!-- Author Bio -->
        <div v-if="post.authorBio" class="mt-12 p-6 bg-gray-800 rounded-lg">
          <h3 class="text-white font-semibold mb-2">About the Author</h3>
          <p class="text-gray-300">{{ post.authorBio }}</p>
        </div>
        
        <!-- Tags -->
        <div v-if="post.tags && post.tags.length" class="mt-8">
          <h3 class="text-white font-semibold mb-4">Tags</h3>
          <div class="flex flex-wrap gap-2">
            <span 
              v-for="tag in post.tags" 
              :key="tag"
              class="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm"
            >
              {{ tag }}
            </span>
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
              class="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-700 transition-colors"
            >
              <div v-if="relatedPost.image" class="h-48 overflow-hidden">
                <NuxtImg
                  :src="relatedPost.image"
                  :alt="relatedPost.title"
                  class="w-full h-full object-cover"
                  width="400"
                  height="200"
                />
              </div>
              <div class="p-6">
                <h4 class="text-white font-semibold mb-2 line-clamp-2">
                  {{ relatedPost.title }}
                </h4>
                <p v-if="relatedPost.description" class="text-gray-400 text-sm line-clamp-3">
                  {{ relatedPost.description }}
                </p>
                <div class="mt-4 text-blue-400 text-sm">
                  Read more →
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
        
        <!-- Back to Blog -->
        <div class="mt-12 text-center">
          <NuxtLink 
            to="/blog"
            class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            ← Back to Blog
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
  @apply text-white;
}

.prose p, .prose li {
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
