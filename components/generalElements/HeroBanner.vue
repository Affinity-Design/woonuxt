<script setup>
import heroSlides from '~/data/custom/hero-banner.json';
import {ref, onMounted, onUnmounted} from 'vue';

const currentSlideIndex = ref(0);
const direction = ref('next');
let intervalId;

const nextSlide = () => {
  direction.value = 'next';
  currentSlideIndex.value = (currentSlideIndex.value + 1) % heroSlides.length;
};

const prevSlide = () => {
  direction.value = 'prev';
  currentSlideIndex.value = (currentSlideIndex.value - 1 + heroSlides.length) % heroSlides.length;
};

const startAutoRotate = () => {
  stopAutoRotate();
  intervalId = setInterval(nextSlide, 8000);
};

const stopAutoRotate = () => {
  if (intervalId) clearInterval(intervalId);
};

onMounted(() => {
  startAutoRotate();
});

onUnmounted(() => {
  stopAutoRotate();
});
</script>

<template>
  <div class="relative mx-auto h-[550px] md:h-[600px] lg:h-[560px] xl:h-[640px] group" @mouseenter="stopAutoRotate" @mouseleave="startAutoRotate">
    <!-- Video Background -->
    <video class="absolute inset-0 w-full h-full object-cover" src="/videos/Inline-Skates-Canada.mp4" autoplay loop muted playsinline preload="auto"></video>

    <!-- Black Overlay -->
    <div class="absolute inset-0 bg-black opacity-60"></div>

    <!-- Navigation Arrows -->
    <button
      @click="prevSlide"
      class="absolute left-4 bottom-4 md:top-1/2 md:bottom-auto md:-translate-y-1/2 z-20 text-white/70 hover:text-white transition-all p-2 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 duration-300 hover:scale-110"
      aria-label="Previous Slide">
      <Icon name="heroicons:chevron-left" class="w-8 h-8 md:w-10 md:h-10" />
    </button>
    <button
      @click="nextSlide"
      class="absolute right-4 bottom-4 md:top-1/2 md:bottom-auto md:-translate-y-1/2 z-20 text-white/70 hover:text-white transition-all p-2 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 duration-300 hover:scale-110"
      aria-label="Next Slide">
      <Icon name="heroicons:chevron-right" class="w-8 h-8 md:w-10 md:h-10" />
    </button>

    <!-- Text Content -->
    <div class="container relative z-10 h-full flex flex-col items-start justify-center text-white px-6 overflow-hidden">
      <Transition :name="direction === 'next' ? 'slide-left' : 'slide-right'" mode="out-in">
        <div :key="currentSlideIndex" class="w-full flex flex-col items-start">
          <h1 class="text-2xl font-bold md:mb-4 md:text-4xl lg:text-6xl text-shadow animate-stagger-1">
            {{ heroSlides[currentSlideIndex].title }}
          </h1>
          <h2 class="text-lg font-bold max-w-md mb-6 lg:text-3xl text-shadow animate-stagger-2">
            {{ heroSlides[currentSlideIndex].subtitle }}
          </h2>
          <div class="max-w-lg mb-8 text-md font-light lg:max-w-lg text-balance text-shadow animate-stagger-3">
            <p>
              {{ heroSlides[currentSlideIndex].text }}
            </p>
          </div>
          <NuxtLink
            class="px-8 py-3 font-bold text-gray-900 bg-white rounded-xl shadow-md hover:bg-gray-100 focus:bg-gray-100 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-black/50 animate-stagger-4"
            :to="heroSlides[currentSlideIndex].buttonLink"
            >{{ heroSlides[currentSlideIndex].buttonText }}</NuxtLink
          >
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.text-shadow {
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
}

/* Slide Transitions */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.5s ease-in-out;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* Staggered Animations */
.animate-stagger-1 {
  animation: fadeInUp 0.6s ease-out 0.1s both;
}
.animate-stagger-2 {
  animation: fadeInUp 0.6s ease-out 0.2s both;
}
.animate-stagger-3 {
  animation: fadeInUp 0.6s ease-out 0.3s both;
}
.animate-stagger-4 {
  animation: fadeInUp 0.6s ease-out 0.4s both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
