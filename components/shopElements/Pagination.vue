<script setup lang="ts">
const props = defineProps({
  slug: String,
  count: {
    type: Number,
    default: 0,
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

      <!-- NUMBERS -->
      <button
        v-for="pageNumber in numberOfPages"
        :key="pageNumber"
        @click="navigateToPage(pageNumber)"
        :aria-current="pageNumber === currentPage ? 'page' : undefined"
        class="page-number"
      >
        {{ pageNumber }}
      </button>

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
.page-number {
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

.page-number[aria-current="page"] {
  @apply bg-primary border-primary border bg-opacity-10 text-primary z-10;
}
</style>
