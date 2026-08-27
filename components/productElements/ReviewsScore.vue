<script setup lang="ts">
import {getSafeErrorLogDetails} from '~/utils/publicErrorMessages.mjs';

interface ProductReview {
  rating: number;
}

interface ProductReviews {
  averageRating: number;
  edges: ProductReview[];
}

const props = withDefaults(
  defineProps<{
    reviews: ProductReviews;
    productId?: number | null;
    size?: number;
  }>(),
  {
    productId: null,
    size: 21,
  },
);

const ratingBreakdown = computed(() => {
  const ratings = [0, 0, 0, 0, 0];
  props.reviews.edges.forEach((review) => {
    if (review.rating >= 1 && review.rating <= 5) ratings[review.rating - 1] += 1;
  });

  const total = ratings.reduce((sum, count) => sum + count, 0);
  return ratings
    .map((count, index) => ({
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      rating: index + 1,
    }))
    .reverse();
});

const isReviewFormVisible = ref(false);
const hoveredRating = ref(0);
const rating = ref(0);
const reviewContent = ref('');
const authorEmail = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const isPending = ref(false);

const addComment = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  const productId = props.productId;
  if (!productId) {
    errorMessage.value = 'We could not identify this product. Please refresh the page and try again.';
    return;
  }

  try {
    isPending.value = true;
    await GqlWriteReview({
      commentOn: productId,
      author: authorEmail.value.split('@')[0],
      content: reviewContent.value,
      rating: rating.value,
      authorEmail: authorEmail.value,
    });
    successMessage.value = 'Thank you. Your review is awaiting approval.';
    setTimeout(() => {
      successMessage.value = '';
      isReviewFormVisible.value = false;
    }, 4000);
  } catch (error) {
    console.error('Review submission failed:', getSafeErrorLogDetails(error));
    errorMessage.value = 'We could not submit your review. Please check the form and try again.';
    setTimeout(() => {
      errorMessage.value = '';
    }, 5000);
  } finally {
    isPending.value = false;
  }
};
</script>

<template>
  <div>
    <h4 v-if="reviews.edges.length" class="font-semibold text-2xl text-gray-900">{{ $t('messages.shop.customerReviews') }}</h4>
    <h4 v-else class="font-semibold text-2xl text-gray-900">{{ $t('messages.shop.noReviews') }}</h4>

    <div v-if="reviews.edges.length" class="my-2">
      <StarRating :rating="reviews.averageRating" :hide-count="true" class="text-sm mr-2" />
      <span class="text-sm"> {{ $t('messages.general.basedOn') }} {{ reviews.edges.length }} {{ $t('messages.shop.reviews') }}</span>
    </div>

    <div class="my-4 rating-bars">
      <div v-for="ratingItem in ratingBreakdown" :key="ratingItem.rating" class="flex gap-4 items-center">
        <div class="flex text-sm gap-1 items-center">
          {{ ratingItem.rating }}
          <Icon class="text-yellow-400" name="ion:star" />
        </div>
        <div class="flex-1 relative">
          <div class="rounded-full bg-gray-200 h-2.5 w-full"></div>
          <div class="rounded-full bg-yellow-400 h-2.5 top-0 left-0 absolute" :style="{width: ratingItem.percentage + '%'}"></div>
        </div>
      </div>
    </div>

    <div class="mt-10 text-xl mb-2 text-gray-900">Share your thoughts</div>
    <div class="text-sm mb-4">If you have used this product, we would love to hear about your experience.</div>
    <button class="border rounded-lg text-center w-full p-2" type="button" @click="isReviewFormVisible = !isReviewFormVisible">
      {{ isReviewFormVisible ? $t('messages.shop.close') : $t('messages.shop.writeReview') }}
    </button>

    <Transition name="scale-y">
      <form v-if="isReviewFormVisible" class="review-form" @submit.prevent="addComment">
        <div class="w-full text-gray-500">
          <div class="p-5 mt-3 grid gap-2 border rounded-lg">
            <div class="block text-center mb-1.5">
              <label class="text-center text-sm block relative m-auto">{{ $t('messages.shop.rateReview') }} <span class="text-red-500">*</span></label>
              <div class="gap-1 flex justify-center mt-2 relative">
                <label
                  v-for="ratingOption in 5"
                  :key="ratingOption"
                  class="grid p-1 rounded"
                  :class="rating < ratingOption && ratingOption > hoveredRating ? 'unselected-rating' : 'selected-rating'"
                  @mouseover="hoveredRating = ratingOption"
                  @mouseout="hoveredRating = 0">
                  <input
                    v-model="rating"
                    type="radio"
                    class="overflow-hidden appearance-none opacity-0 absolute"
                    name="rating"
                    :value="ratingOption"
                    required />
                  <Icon name="ion:star" :size="String(size)" />
                </label>
              </div>
            </div>

            <div class="w-full col-span-full">
              <label for="review-content" class="text-sm mb-0.5">{{ $t('messages.shop.rateContent') }} <span class="text-red-500">*</span></label>
              <textarea id="review-content" v-model="reviewContent" class="w-full" placeholder="Great quality" required></textarea>
            </div>

            <div class="w-full col-span-full">
              <label for="review-author-email" class="text-sm mb-0.5">{{ $t('messages.shop.rateEmail') }} <span class="text-red-500">*</span></label>
              <input
                id="review-author-email"
                v-model="authorEmail"
                class="w-full"
                placeholder="example@example.com"
                type="email"
                autocomplete="email"
                required />
            </div>

            <Transition name="scale-y" mode="out-in">
              <div v-if="errorMessage" class="my-4 text-sm text-red-500">{{ errorMessage }}</div>
            </Transition>
            <Transition name="scale-y" mode="out-in">
              <div v-if="successMessage" class="my-4 text-sm text-green-500">{{ successMessage }}</div>
            </Transition>

            <div class="w-full col-span-full text-center mt-3">
              <button
                class="flex gap-4 justify-center items-center transition font-semibold rounded-md w-full p-2 bg-amber-300 text-amber-900 hover:bg-amber-400"
                type="submit">
                <LoadingIcon v-if="isPending" stroke="4" size="16" color="#78350F" />
                <span>{{ $t('messages.shop.submit') }}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </Transition>
  </div>
</template>

<style lang="postcss" scoped>
.unselected-rating {
  @apply bg-white shadow-sm text-gray-300 border border-gray-300;
  transition: 0.15s ease-in-out;
}

.selected-rating {
  @apply text-amber-400 bg-amber-50 border border-amber-400;
  transition: 0.15s ease-in-out;
  box-shadow: 0 0 4px 0 rgb(249 191 59 / 21%);
}

.review-form input,
.review-form textarea {
  @apply bg-white border rounded-md outline-none border-gray-300 shadow-sm w-full py-2 px-4;
}
</style>
