<script setup lang="ts">
interface Props {
  slug: string;
  image: string;
  imageAlt: string;
  headline: string;
  label: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ navigate: [] }>();

const headlineLines = computed(() => props.headline.split('\n'));
const href = computed(() => `/product-category/${props.slug}`);
</script>

<template>
  <div class="mega-menu-featured w-[240px] shrink-0">
    <NuxtLink :to="href" class="block group" @click="emit('navigate')">
      <div class="relative overflow-hidden rounded-xl bg-gray-100 aspect-[3/4]">
        <NuxtImg
          :src="image"
          :alt="imageAlt"
          width="240"
          height="320"
          loading="lazy"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div class="absolute inset-x-0 bottom-0 p-4 text-white">
          <p class="text-xs uppercase tracking-wider opacity-90 mb-1">{{ label }}</p>
          <h3 class="text-xl font-semibold leading-tight">
            <span v-for="(line, i) in headlineLines" :key="i" class="block">{{ line }}</span>
          </h3>
        </div>
      </div>
      <div class="flex items-center justify-between mt-3 text-sm font-medium text-gray-900 group-hover:text-amber-700 transition-colors">
        <span>Shop All {{ label }}</span>
        <span aria-hidden="true" class="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </NuxtLink>
  </div>
</template>
