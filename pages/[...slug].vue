<script setup lang="ts">
const route = useRoute();
const slug = Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug;

// Check if this might be a blog post without the /blog/ prefix
const possibleBlogSlugs = ['best-inline-skates-2025', 'roller-skating-toronto-guide', 'skate-maintenance-winter'];

// If it's a known blog post slug without /blog/ prefix, redirect
if (possibleBlogSlugs.includes(slug)) {
  await navigateTo(`/blog/${slug}`, {
    redirectCode: 301,
    external: false,
  });
}

// Try to find a blog post with this slug first (for catch-all cases)
const {data: post} = await useAsyncData(`blog-check-${slug}`, () =>
  queryContent('blog')
    .where({_path: {$contains: slug}})
    .findOne()
    .catch(() => null),
);

const isBlogPost = !!post.value;

// If it's a blog post, redirect to proper blog URL
if (isBlogPost && !slug.startsWith('blog/')) {
  await navigateTo(`/blog/${slug}`, {
    redirectCode: 301,
    external: false,
  });
}

// If not a blog post, show 404
throw createError({
  statusCode: 404,
  statusMessage: 'Page not found',
});

definePageMeta({
  layout: 'default',
  alias: ['/:catchAll(.*)*'],
});
</script>

<template>
  <div class="container mx-auto px-4 py-16 text-center">
    <h1 class="text-4xl font-bold text-white mb-4">Page Not Found</h1>
    <p class="text-gray-400 mb-8">The page "{{ Array.isArray($route.params.slug) ? $route.params.slug.join('/') : $route.params.slug }}" could not be found.</p>
    <NuxtLink to="/" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"> Return Home </NuxtLink>
  </div>
</template>
