<script setup lang="ts">
await navigateTo('/my-account?tab=orders', {redirectCode: 302, replace: true});
</script>

<template>
  <main class="container min-h-[60vh] py-16 text-center">
    <h1 class="text-2xl font-semibold">Opening your orders…</h1>
    <p class="mt-3 text-gray-600">If the page does not open automatically, use the link below.</p>
    <NuxtLink class="mt-6 inline-block font-semibold text-primary underline" to="/my-account?tab=orders">View my orders</NuxtLink>
  </main>
</template>
