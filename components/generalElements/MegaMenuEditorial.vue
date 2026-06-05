<script setup lang="ts">
import type { NavEditorial } from '~/data/navigation';

interface Props {
  editorial: NavEditorial;
}
defineProps<Props>();
const emit = defineEmits<{ navigate: [] }>();
</script>

<template>
  <aside class="mega-menu-editorial w-[220px] shrink-0 bg-amber-50/70 rounded-xl p-4 flex flex-col">
    <p class="text-xs uppercase tracking-wider font-semibold text-amber-900 mb-2">
      {{ editorial.label }}
    </p>
    <p class="text-sm text-gray-700 mb-4 leading-relaxed">
      {{ editorial.description }}
    </p>
    <NuxtLink
      :to="editorial.href"
      class="mt-auto inline-flex items-center justify-between gap-2 bg-amber-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-amber-800 transition-colors"
      @click="emit('navigate')">
      <span>{{ editorial.linkLabel }}</span>
      <span aria-hidden="true">→</span>
    </NuxtLink>
  </aside>
</template>
