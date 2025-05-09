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

// Get current page from URL query parameter (default to 1 if not present)
const currentPage = computed(() => {
  const pageParam = route.query.page;
  return pageParam ? parseInt(pageParam as string) : 1;
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

const goToPrevPage = () => {
  if (!isFirstPage.value) {
    navigateToPage(currentPage.value - 1);
  }
};

const goToNextPage = () => {
  if (!isLastPage.value) {
    navigateToPage(currentPage.value + 1);
  }
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
      <!-- PREV -->
      <button
        @click="goToPrevPage"
        class="prev"
        :disabled="isFirstPage"
        :class="{ 'cursor-not-allowed': isFirstPage }"
        :aria-disabled="isFirstPage"
        aria-label="Previous"
      >
        <Icon name="ion:chevron-back-outline" size="20" class="w-5 h-5" />
      </button>

      <!-- First page button with ellipsis -->
      <template v-if="showFirstPageButton">
        <button
          @click="navigateToPage(1)"
          :aria-current="1 === currentPage ? 'page' : undefined"
          class="page-number"
        >
          1
        </button>
        <span v-if="pageRange[0] > 2" class="ellipsis">...</span>
      </template>

      <!-- NUMBERS -->
      <button
        v-for="pageNumber in pageRange"
        :key="pageNumber"
        @click="navigateToPage(pageNumber)"
        :aria-current="pageNumber === currentPage ? 'page' : undefined"
        class="page-number"
      >
        {{ pageNumber }}
      </button>

      <!-- Last page button with ellipsis -->
      <template v-if="showLastPageButton">
        <span
          v-if="pageRange[pageRange.length - 1] < numberOfPages - 1"
          class="ellipsis"
          >...</span
        >
        <button
          @click="navigateToPage(numberOfPages)"
          :aria-current="numberOfPages === currentPage ? 'page' : undefined"
          class="page-number"
        >
          {{ numberOfPages }}
        </button>
      </template>

      <!-- NEXT -->
      <button
        @click="goToNextPage"
        class="next"
        :disabled="isLastPage"
        :class="{ 'cursor-not-allowed': isLastPage }"
        :aria-disabled="isLastPage"
        aria-label="Next"
      >
        <Icon name="ion:chevron-forward-outline" size="20" class="w-5 h-5" />
      </button>
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
