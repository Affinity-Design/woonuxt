<script setup lang="ts">
const runtimeConfig = useRuntimeConfig();
const img = useImage();

const logoUrl =
  runtimeConfig?.public?.LOGO && typeof runtimeConfig.public.LOGO === "string"
    ? img(runtimeConfig.public.LOGO)
    : null;
const faviconUrl = "/logo.svg";
</script>

<template>
  <NuxtLink to="/" class="inline-flex items-center gap-2">
    <img v-if="logoUrl" :src="logoUrl" alt="Logo" class="object-contain h-10" />
    <div v-else class="flex items-center gap-2 text-lg font-bold">
      <img :src="faviconUrl" alt="Logo" width="150" height="150" />
      <!-- <span>{{ siteName }}</span> -->
    </div>
  </NuxtLink>
</template>
