<template>
  <section class="container my-16">
    <!-- Static Header -->
    <div class="text-center mb-8 px-4">
      <h2 class="text-3xl font-bold mb-3 text-gray-800">
        ProSkaters Place Canada Reviews
      </h2>
      <div class="flex items-center justify-center text-lg mb-3">
        <span class="font-bold mr-2 text-gray-700">4.6</span>
        <div class="flex items-center mr-2">
          <!-- Loop for 5 stars -->
          <span v-for="s in 5" :key="s" class="text-yellow-400 text-xl">★</span>
        </div>
        <a
          href="https://g.co/kgs/cTNie7W"
          target="_blank"
          rel="noopener"
          class="text-sm text-green-600 hover:text-green-700 underline"
          >522 Google reviews</a
        >
      </div>
      <div class="text-md text-gray-600">Inline Skates Toronto, Ontario</div>
    </div>

    <!-- Carousel -->
    <div class="relative max-w-6xl mx-auto overflow-hidden">
      <div
        class="flex transition-transform duration-500 ease-in-out"
        :style="{
          transform: `translateX(-${currentIndex * (100 / reviews.length)}%)`,
          width: (reviews.length * 100) / 3 + '%',
        }"
      >
        <div
          v-for="(review, idx) in reviews"
          :key="idx"
          class="flex-shrink-0 px-3"
          :style="{ width: 100 / reviews.length + '%' }"
        >
          <div
            class="bg-white rounded-lg p-6 shadow h-full flex flex-col min-h-[280px]"
          >
            <div class="flex items-center justify-center gap-2 mb-3">
              <img
                src="/icons/google.svg"
                alt="Google"
                width="24"
                height="24"
              />
            </div>
            <div class="text-center mb-3">
              <span class="font-semibold text-lg">{{ review.name }}</span>
            </div>
            <div class="flex items-center justify-center gap-1 mb-3">
              <span v-for="i in 5" :key="i" class="text-yellow-400 text-lg">
                {{ i <= review.rating ? "★" : "☆" }}
              </span>
              <span class="ml-2 text-gray-500 text-sm">{{ review.date }}</span>
            </div>
            <p class="text-center text-gray-700 text-sm flex-grow">
              "{{ review.text }}"
            </p>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <button
        class="absolute left-2 top-1/2 -translate-y-1/2 bg-white rounded-full shadow-lg p-3 z-10 hover:bg-gray-50 focus:outline-none"
        @click="prevSlide"
        aria-label="Previous"
      >
        <span class="text-xl">‹</span>
      </button>
      <button
        class="absolute right-2 top-1/2 -translate-y-1/2 bg-white rounded-full shadow-lg p-3 z-10 hover:bg-gray-50 focus:outline-none"
        @click="nextSlide"
        aria-label="Next"
      >
        <span class="text-xl">›</span>
      </button>
    </div>

    <div class="text-center mt-6">
      <a
        href="https://g.co/kgs/cTNie7W"
        target="_blank"
        rel="noopener"
        class="text-primary underline text-sm"
        >Read more reviews on Google</a
      >
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";

const reviews = [
  {
    name: "Zach Anderson",
    rating: 5,
    date: "2 weeks ago",
    text: "I purchased a pair of rollerblades. Shipping was fast and they provided tracking info immediately. They were also helpful when I had to return the skates and exchange for a smaller size. They gave detailed return instructions and there was no issue getting my order through customs. I highly recommend ProSkaters Place!",
  },
  {
    name: "Lorelai Mercy",
    rating: 5,
    date: "1 month ago",
    text: "Great customer service. Contacted via email regarding skates I felt were too small. They guided me as to proper sizing and ultimately when I chose to size up made the process smooth and efficient. Great communication. Highly recommend.",
  },
  {
    name: "Andrew M",
    rating: 5,
    date: "4 weeks ago",
    text: "I recently purchased two sets of Rollerblade wheels from the States. I had some inquiries regarding tax duties. They were quick to respond and explained very clearly. When I was ready to purchase, my bank flagged it as fraudulent but they helped resolve it quickly.",
  },
  {
    name: "Shihab Zaman",
    rating: 5,
    date: "1 month ago",
    text: "Accurate, timely order processing. Super helpful staff. I couldn't be happier with the overall experience with ProSkatersPlace. Thanks @ Marina and team.",
  },
  {
    name: "christ13c",
    rating: 5,
    date: "8 months ago",
    text: "I drive all the way from Pickering when I need anything for my inline skates. They really take their time answering all your questions and give honest advice. Highly recommend.",
  },
  {
    name: "Thomas Brodeur",
    rating: 5,
    date: "2 months ago",
    text: "Awesome online services! I put an order and got it delivered near Montreal in a day. Customer service is very quick as well, I sent them an email and got an answer in less than 10 minutes. Quick and efficient. If I lived closer I'd love to go in store.",
  },
];

const currentIndex = ref(0);
// Ensure maxIndex allows the last 3 items to be shown.
// If currentIndex is at maxIndex, items maxIndex, maxIndex+1, maxIndex+2 are shown.
const maxIndex = computed(() => (reviews.length > 2 ? reviews.length - 3 : 0));

function nextSlide() {
  if (reviews.length <= 3) return; // No sliding if 3 or fewer reviews
  if (currentIndex.value >= maxIndex.value) {
    currentIndex.value = 0; // Loop back to start
  } else {
    currentIndex.value++;
  }
}

function prevSlide() {
  if (reviews.length <= 3) return; // No sliding if 3 or fewer reviews
  if (currentIndex.value <= 0) {
    currentIndex.value = maxIndex.value; // Loop to end
  } else {
    currentIndex.value--;
  }
}

let interval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (reviews.length > 3) {
    interval = setInterval(nextSlide, 4000);
  }
});

onUnmounted(() => {
  if (interval) clearInterval(interval);
});
</script>

<style scoped>
/* Removed the static width for .flex from here */
/* Add any additional component-specific styles if needed */
</style>
