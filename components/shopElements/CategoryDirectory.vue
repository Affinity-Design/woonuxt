<script setup lang="ts">
/**
 * Searchable, nested category directory for the /categories page.
 *
 * Renders the curated taxonomy from `data/navigation.ts` (the same source
 * that drives the desktop mega menu + mobile drawer) as fully-expanded,
 * grouped sections so shoppers can see top-level → deep categories at a
 * glance. A sticky "jump bar" scrolls to each top-level section, and the
 * search box filters the whole catalog live — including long-tail
 * categories not in the curated nav, surfaced under "Other matches".
 *
 * Product counts come from the `getProductCategories` GraphQL nodes the
 * page already fetched (passed in via `categoryNodes`) — no extra query.
 *
 * Dark-themed to match the page; mirrors MegaMenuColumn's icon/badge
 * conventions rather than reusing that light-themed component directly.
 */
import { navigation, saleNavItem, type NavTopLevel, type NavGroup } from '~/data/navigation';

interface CategoryNode {
  slug: string;
  name: string;
  count?: number;
}

const props = defineProps<{
  /** Nodes from getProductCategories — used for counts + long-tail matches. */
  categoryNodes?: CategoryNode[];
}>();

const query = ref('');
const isSearching = computed(() => query.value.trim().length > 0);

// --- Counts -----------------------------------------------------------------
const countBySlug = computed(() => {
  const map = new Map<string, number>();
  for (const node of props.categoryNodes ?? []) {
    if (node?.slug && typeof node.count === 'number') map.set(node.slug, node.count);
  }
  return map;
});
function countFor(slug: string): number | undefined {
  return countBySlug.value.get(slug);
}

// --- Long-tail (categories not represented in the curated nav) ---------------
const coveredSlugs = computed(() => {
  const set = new Set<string>();
  for (const top of navigation) {
    set.add(top.slug);
    for (const group of top.groups) for (const item of group.items) set.add(item.slug);
  }
  set.add(saleNavItem.slug);
  return set;
});

const otherCategories = computed(() =>
  (props.categoryNodes ?? [])
    .filter((n) => n && n.slug && !coveredSlugs.value.has(n.slug) && (n.count ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

// --- Search filtering --------------------------------------------------------
function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q);
}

const filteredNav = computed<NavTopLevel[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return navigation;
  const result: NavTopLevel[] = [];
  for (const top of navigation) {
    const topMatch = matches(top.label, q);
    const groups = top.groups
      .map((group): NavGroup | null => {
        // Keep the whole group when the section or group title matches.
        if (topMatch || matches(group.groupTitle, q)) return group;
        const items = group.items.filter((item) => matches(item.label, q));
        return items.length ? { ...group, items } : null;
      })
      .filter((g): g is NavGroup => g !== null);
    if (groups.length) result.push({ ...top, groups });
  }
  return result;
});

const filteredOther = computed(() => {
  if (!isSearching.value) return [];
  const q = query.value.trim().toLowerCase();
  return otherCategories.value.filter((n) => matches(n.name, q));
});

const hasResults = computed(() => filteredNav.value.length > 0 || filteredOther.value.length > 0);

function clearSearch() {
  query.value = '';
}

// --- Sticky jump bar + scroll-spy -------------------------------------------
const activeSlug = ref<string | null>(navigation[0]?.slug ?? null);
const root = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function scrollToSection(slug: string) {
  const el = document.getElementById(`cat-${slug}`);
  el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function observeSections() {
  if (!observer || !root.value) return;
  observer.disconnect();
  root.value.querySelectorAll<HTMLElement>('[data-cat-section]').forEach((el) => observer!.observe(el));
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slug = (entry.target as HTMLElement).dataset.slug;
          if (slug) activeSlug.value = slug;
        }
      }
    },
    // Offset the top by the sticky header + jump bar so the section landing
    // near the top of the viewport is the one marked active.
    { rootMargin: '-128px 0px -60% 0px', threshold: 0 },
  );
  observeSections();
});

// Re-attach when the rendered section set changes (e.g. after clearing search).
watch(filteredNav, () => nextTick(observeSections));

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const badgeClass: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-700',
  sale: 'bg-red-100 text-red-700',
  hot: 'bg-amber-100 text-amber-800',
};
</script>

<template>
  <section id="all-categories" ref="root" class="scroll-mt-24">
    <h1 class="text-3xl md:text-4xl font-bold text-white mb-6">Browse All Categories</h1>

    <!-- Search -->
    <div class="relative mb-6 max-w-xl">
      <Icon name="ion:search-outline" size="20" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        v-model="query"
        type="text"
        enterkeyhint="search"
        autocomplete="off"
        aria-label="Search categories"
        placeholder="Search categories — wheels, helmets, longboards…"
        class="w-full rounded-full bg-gray-800 border border-gray-700 py-3 pl-11 pr-11 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
      <button
        v-if="isSearching"
        type="button"
        aria-label="Clear search"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
        @click="clearSearch">
        <Icon name="ion:close-circle" size="20" />
      </button>
    </div>

    <!-- Sticky jump bar (only when not searching) -->
    <nav
      v-show="!isSearching"
      aria-label="Jump to category"
      class="no-scrollbar sticky top-16 z-30 mb-8 flex gap-2 overflow-x-auto py-2 bg-[#1a1a1a]/90 backdrop-blur supports-[backdrop-filter]:bg-[#1a1a1a]/75">
      <button
        v-for="top in navigation"
        :key="top.slug"
        type="button"
        :class="[
          'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
          activeSlug === top.slug ? 'bg-amber-500 text-black' : 'bg-gray-800 text-gray-200 hover:bg-gray-700',
        ]"
        @click="scrollToSection(top.slug)">
        {{ top.label }}
      </button>
      <NuxtLink
        :to="saleNavItem.href"
        class="shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap bg-red-600/90 text-white hover:bg-red-600 transition-colors">
        {{ saleNavItem.label }}
      </NuxtLink>
    </nav>

    <!-- No results -->
    <div v-if="isSearching && !hasResults" class="text-center text-gray-300 py-16 bg-gray-800/50 rounded-xl">
      <Icon name="ion:search-outline" size="32" class="mx-auto mb-3 text-gray-500" />
      <p class="text-lg font-semibold mb-1">No categories match “{{ query.trim() }}”</p>
      <p class="text-sm text-gray-400">
        Try a broader term, or
        <button type="button" class="underline hover:text-white" @click="clearSearch">clear the search</button>.
      </p>
    </div>

    <!-- Category sections -->
    <div class="space-y-12">
      <section
        v-for="top in filteredNav"
        :id="`cat-${top.slug}`"
        :key="top.slug"
        data-cat-section
        :data-slug="top.slug"
        class="scroll-mt-32">
        <div class="flex items-center justify-between gap-4 mb-5 pb-3 border-b border-gray-700">
          <h2 class="text-xl font-bold text-white">{{ top.label }}</h2>
          <NuxtLink :to="`/product-category/${top.slug}`" class="shrink-0 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors">
            Shop all<span aria-hidden="true"> →</span>
          </NuxtLink>
        </div>

        <div class="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="group in top.groups" :key="group.groupTitle">
            <h3 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-500/90 mb-3">{{ group.groupTitle }}</h3>
            <ul class="space-y-0.5">
              <li v-for="item in group.items" :key="item.slug">
                <NuxtLink
                  :to="`/product-category/${item.slug}`"
                  class="group/link flex items-center gap-2.5 py-1.5 text-sm text-gray-300 hover:text-white transition-colors">
                  <span
                    v-if="item.icon"
                    class="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0 text-gray-500 group-hover/link:text-amber-400 transition-colors"
                    aria-hidden="true">
                    <Icon :name="item.icon" size="18" />
                  </span>
                  <span>{{ item.label }}</span>
                  <span v-if="countFor(item.slug) != null" class="text-xs text-gray-500">({{ countFor(item.slug) }})</span>
                  <span v-if="item.badge" :class="['inline-flex items-center text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', badgeClass[item.badge]]">
                    {{ item.badge }}
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Long-tail matches (search only) -->
      <section v-if="filteredOther.length" class="scroll-mt-32">
        <div class="mb-5 pb-3 border-b border-gray-700">
          <h2 class="text-xl font-bold text-white">Other matches</h2>
        </div>
        <ul class="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="cat in filteredOther" :key="cat.slug">
            <NuxtLink :to="`/product-category/${cat.slug}`" class="flex items-center gap-2 py-1.5 text-sm text-gray-300 hover:text-white transition-colors">
              <span v-html="cat.name" />
              <span class="text-xs text-gray-500">({{ cat.count }})</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
