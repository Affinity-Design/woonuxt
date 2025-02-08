<!-- [...slug].vue -->
<template>
  <div class="container">
    <h1>Page Not Found</h1>
    <p>No match for: {{ $route.params.slug.join("/") }}</p>
  </div>
</template>

<script setup>
definePageMeta({
  layout: "default",
  alias: ["/:catchAll(.*)*"],
});
</script>
