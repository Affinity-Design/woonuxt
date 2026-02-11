<script setup lang="ts">
// Canadian SEO setup
const { setCanadianSEO } = useCanadianSEO();

// SEO & Meta
const title = "Skating Tips & Guides | ProSkaters Place Canada Blog";
const desc =
  "Expert skating advice, product reviews, and tips from Canada's most trusted skate shop. Learn from the pros and improve your skating game across Ontario and beyond.";

// Set Canadian-specific SEO
setCanadianSEO({
  title,
  description: desc,
  image: "/images/Inline-Skates-Toronto.jpg",
  type: "website",
});

// Content queries
const { data: posts } = await useAsyncData("blog-posts", () =>
  queryContent("blog").sort({ date: -1 }).find()
);

// Category filtering
const categories = computed(() =>
  Array.from(
    new Set(posts.value?.map((p) => p.category).filter(Boolean))
  ).sort()
);

const activeCategory = ref("All");

const filteredPosts = computed(() => {
  if (!posts.value) return [];

  return activeCategory.value === "All"
    ? posts.value
    : posts.value.filter((p) => p.category === activeCategory.value);
});

// Format date helper
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
</script>

<template>
  <div class="min-h-screen" style="background-color: #1a1a1a">
    <!-- Main Container -->
    <div
      class="mx-auto"
      style="max-width: 1320px; padding: clamp(24px, 5vw, 64px)"
    >
      <!-- Header Section -->
      <header class="mb-12">
        <div class="flex items-end justify-between mb-12">
          <h1
            class="text-white font-bold tracking-tight"
            style="
              font-size: clamp(48px, 6vw, 88px);
              letter-spacing: -0.02em;
              line-height: 1.1;
            "
          >
            Toronto Inline Skate Tips
          </h1>
          <NuxtLink
            to="/"
            class="text-white hover:underline font-medium"
            style="font-size: 0.875rem"
          >
            Back to Shop
          </NuxtLink>
        </div>
      </header>

      <!-- Posts Grid Container -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <!-- Category Filters -->
        <div class="col-span-full flex flex-wrap gap-2 mb-4">
          <button
            v-for="category in ['All', ...categories]"
            :key="category"
            @click="activeCategory = category"
            :class="[
              'px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200',
              'hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white',
              activeCategory === category
                ? 'bg-white text-black'
                : 'bg-gray-800 text-white border border-gray-600',
            ]"
            style="border-radius: 24px; padding: 4px 12px"
          >
            {{ category }}
          </button>
        </div>
        <!-- Posts -->
        <NuxtLink
          v-for="post in filteredPosts"
          :key="post._path"
          :to="post._path"
          class="group block transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-2xl overflow-hidden bg-white"
          style="box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)"
        >
          <!-- Post Image -->
          <div class="aspect-square bg-gray-100 overflow-hidden rounded-t-lg">
            <NuxtImg
              v-if="post.image"
              :src="post.image"
              :alt="post.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div
              v-else
              class="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center"
            >
              <Icon name="ion:image-outline" class="text-gray-400 text-4xl" />
            </div>
          </div>

          <!-- Post Content -->
          <div class="p-6">
            <!-- Meta Row -->
            <div class="flex items-center gap-2 mb-3">
              <!-- Category Chip -->
              <span
                v-if="post.category"
                class="inline-block px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full"
              >
                {{ post.category }}
              </span>

              <!-- Date Label -->
              <span
                class="inline-block px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-full"
              >
                {{ formatDate(post.date) }}
              </span>
            </div>

            <!-- Title -->
            <h2
              class="text-xl font-semibold text-black group-hover:underline line-clamp-2"
            >
              {{ post.title }}
            </h2>

            <!-- Description -->
            <p
              v-if="post.description"
              class="mt-2 text-gray-600 text-sm line-clamp-2"
            >
              {{ post.description }}
            </p>
          </div>
        </NuxtLink>

        <!-- Empty State -->
        <div
          v-if="filteredPosts.length === 0"
          class="col-span-full text-center py-16"
        >
          <Icon
            name="ion:document-text-outline"
            class="text-gray-300 text-6xl mb-4"
          />
          <p class="text-gray-300 text-lg">No posts found in this category.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Mobile Responsive Overrides */
@media (max-width: 768px) {
  .min-h-screen > div {
    padding: 16px !important;
  }

  h1 {
    font-size: clamp(32px, 8vw, 52px) !important;
  }

  .grid {
    grid-template-columns: 1fr !important;
    gap: 24px !important;
  }

  .aspect-square {
    aspect-ratio: 4/3 !important;
  }
}

/* Line clamp utilities */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
