<script setup lang="ts">
const route = useRoute();
const slug = Array.isArray(route.params.slug)
  ? route.params.slug.join("/")
  : route.params.slug;

// Try to find a blog post with this slug first
const { data: post } = await useAsyncData(`blog-check-${slug}`, () =>
  queryContent("blog")
    .where({ _path: { $contains: slug } })
    .findOne()
    .catch(() => null)
);

const isBlogPost = !!post.value;

// If not a blog post, show 404
if (!isBlogPost) {
  throw createError({
    statusCode: 404,
    statusMessage: "Page not found",
  });
}

definePageMeta({
  layout: "default",
  alias: ["/:catchAll(.*)*"],
});
</script>

<template>
  <BlogPost v-if="isBlogPost" />
  <div v-else class="container">
    <h1>Page Not Found</h1>
    <p>
      No match for:
      {{
        Array.isArray($route.params.slug)
          ? $route.params.slug.join("/")
          : $route.params.slug
      }}
    </p>
  </div>
</template>
