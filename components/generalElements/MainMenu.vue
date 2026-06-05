<script setup lang="ts">
import { navigation, saleNavItem, auxNavItems } from '~/data/navigation';

const { wishlistLink } = useAuth();
const route = useRoute();
const { activeIndex, scheduleOpen, openImmediate, scheduleClose, closeNow } = useMegaMenu();

// Slugs we hide from the desktop top nav (still reachable via /categories,
// the mobile drawer, and direct URLs).
const DESKTOP_HIDDEN_SLUGS = new Set<string>(['scooters', 'skateboards-and-longboards']);

const desktopNavigation = computed(() =>
  navigation
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !DESKTOP_HIDDEN_SLUGS.has(item.slug)),
);

// Highlight a top-level item when the current route belongs to its category tree
function isTopLevelActive(slug: string): boolean {
  return route.path === `/product-category/${slug}` || route.path.startsWith(`/product-category/${slug}/`);
}

function isAuxActive(href: string): boolean {
  if (href === '/') return route.path === '/';
  return route.path.startsWith(href);
}

function onTriggerKeyDown(e: KeyboardEvent, index: number) {
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openImmediate(index);
  }
}
</script>

<template>
  <nav aria-label="Site navigation">
    <!-- Desktop: top-level mega-menu triggers -->
    <ul class="hidden md:flex items-center gap-1">
      <li
        v-for="{ item, index } in desktopNavigation"
        :key="item.slug"
        class="relative"
        @mouseenter="scheduleOpen(index)"
        @mouseleave="scheduleClose">
        <NuxtLink
          :to="`/product-category/${item.slug}`"
          :aria-haspopup="true"
          :aria-expanded="activeIndex === index"
          :class="[
            'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
            isTopLevelActive(item.slug) || activeIndex === index ? 'text-gray-900' : 'text-gray-700 hover:text-gray-900',
          ]"
          @focus="openImmediate(index)"
          @keydown="onTriggerKeyDown($event, index)">
          {{ item.label }}
        </NuxtLink>
        <!-- Animated underline indicator -->
        <span
          aria-hidden="true"
          :class="[
            'pointer-events-none absolute left-3 right-3 -bottom-0.5 h-0.5 bg-amber-700 origin-left transition-transform duration-200',
            isTopLevelActive(item.slug) || activeIndex === index ? 'scale-x-100' : 'scale-x-0',
          ]" />
      </li>
      <!-- Static links — no mega panel. Hovering these closes any open panel. -->
      <li @mouseenter="closeNow">
        <NuxtLink
          to="/categories"
          :class="[
            'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
            isAuxActive('/categories') ? 'text-gray-900 bg-gray-100' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50',
          ]">
          All Categories
        </NuxtLink>
      </li>
      <li @mouseenter="closeNow">
        <NuxtLink
          to="/contact"
          :class="[
            'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
            isAuxActive('/contact') ? 'text-gray-900 bg-gray-100' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50',
          ]">
          Contact
        </NuxtLink>
      </li>
      <li class="ml-2 pl-2 border-l border-gray-200" @mouseenter="closeNow">
        <NuxtLink
          :to="saleNavItem.href"
          :class="[
            'inline-flex items-center px-3 py-2 text-sm font-semibold rounded-md transition-colors',
            isTopLevelActive(saleNavItem.slug) ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50',
          ]">
          {{ saleNavItem.label }}
        </NuxtLink>
      </li>
    </ul>

    <!-- Mobile fallback: simple flat list, used inside the base layer's MobileMenu drawer
         until Phase 3 ships the new bottom-bar + multi-level drawer. -->
    <ul class="md:hidden flex flex-col gap-1">
      <li v-for="item in navigation" :key="`m-${item.slug}`">
        <NuxtLink
          :to="`/product-category/${item.slug}`"
          :class="[
            'block px-3 py-2 rounded-lg font-medium transition-colors',
            isTopLevelActive(item.slug) ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
          ]">
          {{ item.label }}
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          :to="saleNavItem.href"
          :class="[
            'block px-3 py-2 rounded-lg font-semibold transition-colors',
            isTopLevelActive(saleNavItem.slug) ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50',
          ]">
          {{ saleNavItem.label }}
        </NuxtLink>
      </li>
      <li v-for="aux in auxNavItems" :key="`a-${aux.href}`">
        <NuxtLink
          :to="aux.href"
          :class="[
            'block px-3 py-2 rounded-lg font-medium transition-colors',
            isAuxActive(aux.href) ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
          ]">
          {{ aux.label }}
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          :to="wishlistLink"
          :prefetch="false"
          :class="[
            'block px-3 py-2 rounded-lg font-medium transition-colors',
            isAuxActive(wishlistLink) ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
          ]">
          Wishlist
        </NuxtLink>
      </li>
      <li>
        <NuxtLink
          to="/my-account"
          :prefetch="false"
          :class="[
            'block px-3 py-2 rounded-lg font-medium transition-colors',
            isAuxActive('/my-account') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
          ]">
          My Account
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
