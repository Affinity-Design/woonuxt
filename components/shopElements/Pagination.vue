<script setup lang="ts">
const props = defineProps({
  slug: String,
  count: {
    type: Number,
    default: 0,
  },
  // Maximum number of page buttons to show at once
  maxVisibleButtons: {
    type: Number,
    default: 10, // Show at most 10 page buttons at a time
  },
});

const route = useRoute();
const router = useRouter();
const { productsPerPage } = useHelpers();

// Get current page from URL query parameter (default to 1 if not present).
// Hardened: this value now builds real hrefs, so a junk ?page=abc must not be
// able to emit a crawlable ?page=NaN link.
const currentPage = computed(() => {
  const pageParam = route.query.page;
  const raw = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsed = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
});

// Calculate total number of pages
const numberOfPages = computed<number>(() =>
  Math.ceil(props.count / productsPerPage)
);

// Calculate the range of page numbers to display
const pageRange = computed(() => {
  const maxVisibleButtons = props.maxVisibleButtons;

  // If we have fewer pages than the max visible buttons, show them all
  if (numberOfPages.value <= maxVisibleButtons) {
    return Array.from({ length: numberOfPages.value }, (_, i) => i + 1);
  }

  // Calculate start and end of page range
  let start = Math.max(
    currentPage.value - Math.floor(maxVisibleButtons / 2),
    1
  );
  let end = start + maxVisibleButtons - 1;

  // Adjust if end is beyond the last page
  if (end > numberOfPages.value) {
    end = numberOfPages.value;
    start = Math.max(end - maxVisibleButtons + 1, 1);
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});

// Real URL for a given page. Pagination used to render <button> elements with
// no href, so crawlers saw a dead end and the ~5/6 of products beyond page 1 had
// no path from their category (2026-07-23 audit). Page 1 drops ?page entirely so
// it points at the clean canonical URL. Active filter params are preserved.
const pageHref = (pageNumber: number): string => {
  const query: Record<string, any> = {...route.query};
  if (pageNumber <= 1) delete query.page;
  else query.page = String(pageNumber);
  return router.resolve({path: route.path, query}).href;
};

// Client-side navigation handlers
const navigateToPage = (pageNumber: number) => {
  // Update URL without refreshing page
  router.push(
    {
      query: {
        ...route.query,
        page: pageNumber.toString(),
      },
    },
    { shallow: true }
  );
};

// Keep SPA navigation for plain left-clicks, but let modifier-clicks and
// middle-clicks behave like real links (new tab, etc.).
const onPageClick = (event: MouseEvent, pageNumber: number) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  navigateToPage(pageNumber);
};

// Check if we're on the first page
const isFirstPage = computed(() => currentPage.value === 1);

// Check if we're on the last page
const isLastPage = computed(() => currentPage.value >= numberOfPages.value);

// Should we show first page button
const showFirstPageButton = computed(() => pageRange.value[0] > 1);

// Should we show last page button
const showLastPageButton = computed(
  () => pageRange.value[pageRange.value.length - 1] < numberOfPages.value
);
</script>

<template>
  <div class="flex justify-center mt-8 mb-16 col-span-full tabular-nums">
    <!-- Pagination -->
    <nav
      v-if="numberOfPages > 1"
      class="inline-flex self-end -space-x-px rounded-md shadow-sm isolate"
      aria-label="Pagination"
    >
      <!-- PREV — a disabled control must not be a crawlable link, so it renders
           as a <span> on page 1 (an <a> without href is not a link anyway). -->
      <span v-if="isFirstPage" class="prev cursor-not-allowed" aria-disabled="true" aria-label="Previous">
        <Icon name="ion:chevron-back-outline" size="20" class="w-5 h-5" />
      </span>
      <a
        v-else
        :href="pageHref(currentPage - 1)"
        @click="onPageClick($event, currentPage - 1)"
        class="prev"
        rel="prev"
        aria-label="Previous"
      >
        <Icon name="ion:chevron-back-outline" size="20" class="w-5 h-5" />
      </a>

      <!-- First page link with ellipsis -->
      <template v-if="showFirstPageButton">
        <a
          :href="pageHref(1)"
          @click="onPageClick($event, 1)"
          :aria-current="1 === currentPage ? 'page' : undefined"
          class="page-number"
        >
          1
        </a>
        <span v-if="pageRange[0] > 2" class="ellipsis">...</span>
      </template>

      <!-- NUMBERS -->
      <a
        v-for="pageNumber in pageRange"
        :key="pageNumber"
        :href="pageHref(pageNumber)"
        @click="onPageClick($event, pageNumber)"
        :aria-current="pageNumber === currentPage ? 'page' : undefined"
        class="page-number"
      >
        {{ pageNumber }}
      </a>

      <!-- Last page link with ellipsis -->
      <template v-if="showLastPageButton">
        <span
          v-if="pageRange[pageRange.length - 1] < numberOfPages - 1"
          class="ellipsis"
          >...</span
        >
        <a
          :href="pageHref(numberOfPages)"
          @click="onPageClick($event, numberOfPages)"
          :aria-current="numberOfPages === currentPage ? 'page' : undefined"
          class="page-number"
        >
          {{ numberOfPages }}
        </a>
      </template>

      <!-- NEXT -->
      <span v-if="isLastPage" class="next cursor-not-allowed" aria-disabled="true" aria-label="Next">
        <Icon name="ion:chevron-forward-outline" size="20" class="w-5 h-5" />
      </span>
      <a
        v-else
        :href="pageHref(currentPage + 1)"
        @click="onPageClick($event, currentPage + 1)"
        class="next"
        rel="next"
        aria-label="Next"
      >
        <Icon name="ion:chevron-forward-outline" size="20" class="w-5 h-5" />
      </a>
    </nav>
  </div>
</template>

<style lang="postcss" scoped>
.prev,
.next,
.page-number,
.ellipsis {
  @apply bg-white border font-medium border-gray-300 text-sm p-2 text-gray-500 relative inline-flex items-center hover:bg-gray-50 focus:z-10;
}

.prev {
  @apply rounded-l-md;
}

.next {
  @apply rounded-r-md;
}

.page-number {
  @apply px-3;
}

.ellipsis {
  @apply px-3 cursor-default hover:bg-white;
}

.page-number[aria-current="page"] {
  @apply bg-primary border-primary border bg-opacity-10 text-primary z-10;
}
</style>
