<script setup lang="ts">
import { navigation, saleNavItem, auxNavItems } from '~/data/navigation';

const { isOpen, level, direction, categoryIndex, groupIndex, close, goCategory, goGroup, back } = useMobileNav();
const { wishlistLink } = useAuth();
const runtimeConfig = useRuntimeConfig();
const freeShipThreshold = runtimeConfig.public.freeShippingThreshold;

const activeCategory = computed(() =>
  categoryIndex.value !== null ? navigation[categoryIndex.value] || null : null,
);
const activeGroup = computed(() =>
  activeCategory.value && groupIndex.value !== null ? activeCategory.value.groups[groupIndex.value] || null : null,
);

const transitionName = computed(() => (direction.value === 'forward' ? 'mn-forward' : 'mn-back'));

const headerTitle = computed(() => {
  if (level.value === 2 && activeGroup.value) return activeGroup.value.groupTitle;
  if (level.value === 1 && activeCategory.value) return activeCategory.value.label;
  return 'Menu';
});

function onScrimClick() {
  close();
}

// Escape key closes drawer
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault();
    close();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <!-- Scrim -->
      <Transition name="mn-fade">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[59] bg-black/50 md:hidden"
          aria-hidden="true"
          @click="onScrimClick" />
      </Transition>

      <!-- Drawer -->
      <Transition name="mn-drawer">
        <aside
          v-if="isOpen"
          id="mobile-nav-drawer"
          class="mobile-nav-drawer fixed inset-y-0 left-0 z-[60] flex flex-col bg-white shadow-2xl md:hidden"
          role="dialog"
          aria-modal="true"
          :aria-label="`Site navigation, ${headerTitle}`">
          <!-- Top bar -->
          <header class="flex items-center justify-between gap-2 h-14 px-3 border-b border-gray-100 shrink-0">
            <button
              type="button"
              :aria-label="level === 0 ? 'Close menu' : 'Back'"
              class="w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
              @click="back">
              <svg v-if="level === 0" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <p class="flex-1 text-center text-base font-semibold text-gray-900 truncate">{{ headerTitle }}</p>
            <button
              v-if="level !== 0"
              type="button"
              aria-label="Close menu"
              class="w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
              @click="close">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div v-else class="w-11" aria-hidden="true" />
          </header>

          <!-- Level content -->
          <div class="relative flex-1 overflow-hidden">
            <Transition :name="transitionName" mode="out-in">
              <!-- Level 0: Root -->
              <div v-if="level === 0" key="root" class="absolute inset-0 overflow-y-auto">
                <ul class="py-2">
                  <li v-for="(item, index) in navigation" :key="item.slug">
                    <button
                      type="button"
                      class="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left text-gray-900 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      @click="goCategory(index)">
                      <span class="font-medium">{{ item.label }}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </li>
                </ul>
                <div class="border-t border-gray-100 my-1" />
                <ul>
                  <li>
                    <NuxtLink
                      :to="saleNavItem.href"
                      class="flex items-center justify-between gap-3 px-4 py-3.5 font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      @click="close">
                      <span>{{ saleNavItem.label }}</span>
                      <span class="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-red-100">Save</span>
                    </NuxtLink>
                  </li>
                  <li v-for="aux in auxNavItems" :key="aux.href">
                    <NuxtLink
                      :to="aux.href"
                      class="block px-4 py-3.5 text-gray-700 hover:bg-gray-50 transition-colors"
                      @click="close">
                      {{ aux.label }}
                    </NuxtLink>
                  </li>
                  <li>
                    <NuxtLink :to="wishlistLink" :prefetch="false" class="block px-4 py-3.5 text-gray-700 hover:bg-gray-50 transition-colors" @click="close">
                      Wishlist
                    </NuxtLink>
                  </li>
                  <li>
                    <NuxtLink to="/my-account" :prefetch="false" class="block px-4 py-3.5 text-gray-700 hover:bg-gray-50 transition-colors" @click="close">
                      My Account
                    </NuxtLink>
                  </li>
                </ul>
                <div class="mt-auto border-t border-gray-100 px-4 py-3 text-xs text-center text-gray-500">
                  Free shipping over ${{ freeShipThreshold }}
                </div>
              </div>

              <!-- Level 1: Category -->
              <div v-else-if="level === 1 && activeCategory" key="category" class="absolute inset-0 overflow-y-auto">
                <NuxtLink
                  :to="`/product-category/${activeCategory.slug}`"
                  class="relative block aspect-[16/7] overflow-hidden"
                  @click="close">
                  <NuxtImg
                    :src="activeCategory.image"
                    :alt="activeCategory.imageAlt"
                    width="380"
                    height="170"
                    loading="lazy"
                    class="absolute inset-0 w-full h-full object-cover" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
                    <p class="text-lg font-semibold leading-tight">{{ activeCategory.label }}</p>
                    <span class="text-sm font-medium underline-offset-2 underline">Shop all →</span>
                  </div>
                </NuxtLink>
                <ul class="py-2">
                  <li v-for="(group, gi) in activeCategory.groups" :key="group.groupTitle">
                    <button
                      type="button"
                      class="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left text-gray-900 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50 transition-colors"
                      @click="goGroup(gi)">
                      <span class="font-medium">{{ group.groupTitle }}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </li>
                </ul>
                <div v-if="activeCategory.editorial" class="mx-4 my-4 p-4 rounded-xl bg-amber-50">
                  <p class="text-xs uppercase tracking-wider font-semibold text-amber-900 mb-1">
                    {{ activeCategory.editorial.label }}
                  </p>
                  <p class="text-sm text-gray-700 mb-3 leading-relaxed">{{ activeCategory.editorial.description }}</p>
                  <NuxtLink
                    :to="activeCategory.editorial.href"
                    class="inline-flex items-center gap-2 text-sm font-medium text-amber-800"
                    @click="close">
                    <span>{{ activeCategory.editorial.linkLabel }}</span>
                    <span aria-hidden="true">→</span>
                  </NuxtLink>
                </div>
              </div>

              <!-- Level 2: Group -->
              <div v-else-if="level === 2 && activeGroup" key="group" class="absolute inset-0 overflow-y-auto">
                <ul>
                  <li v-for="item in activeGroup.items" :key="item.href ?? item.slug">
                    <NuxtLink
                      :to="item.href ?? `/product-category/${item.slug}`"
                      class="flex items-center justify-between gap-3 px-4 py-3 text-gray-900 hover:bg-gray-50 border-b border-gray-50 transition-colors"
                      @click="close">
                      <span class="flex items-center gap-2">
                        <span>{{ item.label }}</span>
                        <span
                          v-if="item.badge"
                          :class="[
                            'inline-flex items-center text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded',
                            item.badge === 'new' && 'bg-emerald-100 text-emerald-700',
                            item.badge === 'sale' && 'bg-red-100 text-red-700',
                            item.badge === 'hot' && 'bg-amber-100 text-amber-800',
                          ]">
                          {{ item.badge }}
                        </span>
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.mobile-nav-drawer {
  width: min(85vw, 380px);
  max-width: 380px;
}

/* Drawer slide */
.mn-drawer-enter-active,
.mn-drawer-leave-active {
  transition: transform 280ms ease-out;
}
.mn-drawer-enter-from,
.mn-drawer-leave-to {
  transform: translateX(-100%);
}

/* Scrim fade */
.mn-fade-enter-active,
.mn-fade-leave-active {
  transition: opacity 200ms ease;
}
.mn-fade-enter-from,
.mn-fade-leave-to {
  opacity: 0;
}

/* Level slide — drilling in */
.mn-forward-enter-active,
.mn-forward-leave-active,
.mn-back-enter-active,
.mn-back-leave-active {
  transition: transform 260ms ease-out, opacity 260ms ease-out;
}
.mn-forward-enter-from {
  transform: translateX(100%);
  opacity: 0.5;
}
.mn-forward-leave-to {
  transform: translateX(-100%);
  opacity: 0.5;
}
/* Level slide — stepping back */
.mn-back-enter-from {
  transform: translateX(-100%);
  opacity: 0.5;
}
.mn-back-leave-to {
  transform: translateX(100%);
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .mn-drawer-enter-active,
  .mn-drawer-leave-active,
  .mn-fade-enter-active,
  .mn-fade-leave-active,
  .mn-forward-enter-active,
  .mn-forward-leave-active,
  .mn-back-enter-active,
  .mn-back-leave-active {
    transition: none !important;
  }
}
</style>
