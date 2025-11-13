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
if (!isBlogPost) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
  });
}

definePageMeta({
  layout: 'default',
  alias: ['/:catchAll(.*)*'],
});
</script>

<template>
  <BlogPost v-if="isBlogPost" />
  <div v-else class="container">
    <h1>Page Not Found</h1>
    <p>
      No match for:
      {{ Array.isArray($route.params.slug) ? $route.params.slug.join('/') : $route.params.slug }}
    </p>
  </div>
</template>
