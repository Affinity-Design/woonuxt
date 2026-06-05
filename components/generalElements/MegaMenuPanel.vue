<script setup lang="ts">
import { navigation } from '~/data/navigation';

const { activeIndex, cancelClose, scheduleClose, closeNow } = useMegaMenu();
const route = useRoute();

const activeNav = computed(() => (activeIndex.value === null ? null : navigation[activeIndex.value] || null));

// Close panel on route change so a clicked link tears down the panel
watch(
  () => route.fullPath,
  () => {
    closeNow();
  },
);

// Close on Escape — focus return is handled by the trigger's tabindex
function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && activeIndex.value !== null) {
    closeNow();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKey);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey);
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-100 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-1">
    <div
      v-if="activeNav"
      class="mega-menu-panel absolute top-full left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)]"
      role="menu"
      :aria-label="`${activeNav.label} menu`"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose">
      <div class="container py-6">
        <div class="flex gap-6 items-stretch">
          <MegaMenuFeatured
            :slug="activeNav.slug"
            :image="activeNav.image"
            :image-alt="activeNav.imageAlt"
            :headline="activeNav.headline"
            :label="activeNav.label"
            @navigate="closeNow" />
          <div class="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-6">
            <MegaMenuColumn v-for="group in activeNav.groups" :key="group.groupTitle" :group="group" @navigate="closeNow" />
          </div>
          <MegaMenuEditorial v-if="activeNav.editorial" :editorial="activeNav.editorial" @navigate="closeNow" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mega-menu-panel {
  max-height: calc(100vh - var(--header-height, 64px));
  overflow-y: auto;
}

@media (prefers-reduced-motion: reduce) {
  .mega-menu-panel {
    transition: none !important;
  }
}
</style>
