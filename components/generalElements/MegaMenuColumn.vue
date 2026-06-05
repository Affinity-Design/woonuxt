<script setup lang="ts">
import type { NavGroup } from '~/data/navigation';

interface Props {
  group: NavGroup;
}
defineProps<Props>();
const emit = defineEmits<{ navigate: [] }>();
</script>

<template>
  <div class="nav-megamenu-column-container-v1 min-w-[160px] flex-1">
    <h4 class="nav-megamenu-column-heading-v1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 mb-3">
      {{ group.groupTitle }}
    </h4>
    <ul class="space-y-0.5">
      <li v-for="item in group.items" :key="item.href ?? item.slug">
        <NuxtLink
          :to="item.href ?? `/product-category/${item.slug}`"
          class="nav-megamenu-link-default-v1 group/link relative flex items-center gap-2.5 py-1.5 text-sm text-gray-700 transition-colors duration-150 ease-out hover:text-gray-900"
          @click="emit('navigate')">
          <span
            v-if="item.icon"
            class="nav-megamenu-link-icon-v1 inline-flex items-center justify-center w-[18px] h-[18px] shrink-0 text-gray-400 transition-[color,transform] duration-200 ease-out group-hover/link:text-amber-700 group-hover/link:scale-110"
            aria-hidden="true">
            <Icon :name="item.icon" size="18" />
          </span>
          <span class="nav-megamenu-link-text-v1 relative inline-block">
            {{ item.label }}
            <span
              aria-hidden="true"
              class="nav-megamenu-link-underline-v1 pointer-events-none absolute left-0 right-0 -bottom-0.5 h-px bg-amber-700 origin-left scale-x-0 transition-transform duration-200 ease-out group-hover/link:scale-x-100" />
          </span>
          <span
            v-if="item.badge"
            :class="[
              'nav-megamenu-link-badge-v1 inline-flex items-center text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded',
              item.badge === 'new' && 'bg-emerald-100 text-emerald-700',
              item.badge === 'sale' && 'bg-red-100 text-red-700',
              item.badge === 'hot' && 'bg-amber-100 text-amber-800',
            ]">
            {{ item.badge }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .nav-megamenu-link-default-v1,
  .nav-megamenu-link-icon-v1,
  .nav-megamenu-link-underline-v1 {
    transition: none !important;
  }
}
</style>
