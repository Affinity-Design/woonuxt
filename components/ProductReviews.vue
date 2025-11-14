<script setup lang="ts">
/**
 * Product Reviews Rich Snippets Component
 *
 * Displays product reviews with Schema.org Review structured data
 * Supports:
 * - WooCommerce reviews integration
 * - Individual review rich snippets
 * - Aggregate rating display
 * - Star rating visualization
 */

interface Review {
  id?: string | number;
  rating: number;
  author: string;
  date: string;
  content: string;
  verified?: boolean;
}

interface Props {
  product: any;
  reviews?: Review[];
  maxDisplay?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxDisplay: 5,
});

// Extract reviews from WooCommerce product or use provided reviews
const reviewsList = computed(() => {
  if (props.reviews && props.reviews.length > 0) {
    return props.reviews.slice(0, props.maxDisplay);
  }

  // Extract from WooCommerce GraphQL structure
  if (props.product?.reviews?.nodes && props.product.reviews.nodes.length > 0) {
    return props.product.reviews.nodes.slice(0, props.maxDisplay).map((review: any) => ({
      id: review.databaseId || review.id,
      rating: review.rating || 5,
      author: review.author?.node?.name || 'Anonymous',
      date: review.date,
      content: stripHtml(review.content || ''),
      verified: review.verified || false,
    }));
  }

  return [];
});

const averageRating = computed(() => {
  return props.product?.averageRating || 0;
});

const totalReviews = computed(() => {
  return props.product?.reviewCount || reviewsList.value.length;
});

const hasReviews = computed(() => {
  return reviewsList.value.length > 0 || totalReviews.value > 0;
});

// Format date for display
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Strip HTML from review content
const stripHtml = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
};

// Generate star rating display
const getStarRating = (rating: number) => {
  return {
    full: Math.floor(rating),
    half: rating % 1 >= 0.5 ? 1 : 0,
    empty: Math.floor(5 - rating - (rating % 1 >= 0.5 ? 0.5 : 0)),
  };
};
</script>

<template>
  <div v-if="hasReviews" class="product-reviews">
    <!-- Aggregate Rating Summary -->
    <div class="reviews-summary mb-8 p-6 bg-gray-50 rounded-lg">
      <div class="flex items-center gap-4">
        <div class="text-center">
          <div class="text-5xl font-bold text-gray-900">{{ averageRating.toFixed(1) }}</div>
          <div class="flex items-center justify-center mt-2 mb-1">
            <StarRating :rating="averageRating" :show-count="false" class="text-xl" />
          </div>
          <div class="text-sm text-gray-600">{{ totalReviews }} {{ totalReviews === 1 ? 'review' : 'reviews' }}</div>
        </div>

        <div class="flex-1 ml-6">
          <div class="space-y-2">
            <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="flex items-center gap-2">
              <span class="text-sm text-gray-600 w-12">{{ star }} star</span>
              <div class="flex-1 bg-gray-200 rounded-full h-2">
                <div class="bg-yellow-400 h-2 rounded-full" :style="{width: '0%'}" />
                <!-- Calculate actual distribution if data available -->
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Individual Reviews -->
    <div v-if="reviewsList.length > 0" class="reviews-list space-y-6">
      <h3 class="text-xl font-semibold mb-4">Customer Reviews</h3>

      <div v-for="review in reviewsList" :key="review.id" class="review-item pb-6 border-b border-gray-200 last:border-b-0">
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="flex items-center gap-3">
              <StarRating :rating="review.rating" :show-count="false" class="text-base" />
              <span v-if="review.verified" class="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">Verified Purchase</span>
            </div>
            <div class="mt-2">
              <span class="font-semibold text-gray-900">{{ review.author }}</span>
              <span class="text-sm text-gray-500 ml-2">{{ formatDate(review.date) }}</span>
            </div>
          </div>
        </div>

        <div class="text-gray-700 leading-relaxed">
          {{ review.content }}
        </div>
      </div>
    </div>

    <!-- Call to Action -->
    <div class="mt-8 text-center">
      <button class="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">Write a Review</button>
    </div>

    <!-- Schema.org structured data is handled by useProductRichSnippets in parent component -->
  </div>
</template>

<style scoped>
.review-item:last-child {
  padding-bottom: 0;
}
</style>
