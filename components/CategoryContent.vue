<template>
  <div class="category-content max-w-none prose-h2:mt-0">
    <!-- Top Description (Above Products - For SEO) -->
    <div v-if="topDescription" class="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
      <div v-html="topDescription"></div>
    </div>

    <!-- Featured Benefits (Trust Signals) -->
    <div v-if="benefits && benefits.length > 0" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div v-for="(benefit, index) in benefits" :key="index" class="flex flex-col items-center text-center p-4 bg-white rounded-lg shadow-sm">
        <Icon :name="benefit.icon" class="w-8 h-8 text-primary mb-2" />
        <h3 class="text-sm font-semibold mb-1">{{ benefit.title }}</h3>
        <p class="text-xs text-gray-600">{{ benefit.description }}</p>
      </div>
    </div>

    <!-- Subcategories (Internal Linking) -->
    <div v-if="subcategories && subcategories.length > 0" class="mb-8">
      <h2 class="text-xl font-bold mb-4">Shop by Category</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <NuxtLink
          v-for="sub in subcategories"
          :key="sub.slug"
          :to="`/product-category/${sub.slug}`"
          class="block p-4 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all">
          <h3 class="font-semibold text-sm mb-1">{{ sub.name }}</h3>
          <p class="text-xs text-gray-500">{{ sub.count }} products</p>
        </NuxtLink>
      </div>
    </div>

    <!-- Bottom Description (Below Products - Additional Content) -->
    <div v-if="bottomDescription" class="mt-12 mb-8">
      <div v-html="bottomDescription" class="text-gray-700"></div>
    </div>

    <!-- Category FAQ -->
    <div v-if="faqs && faqs.length > 0" class="mt-12 mb-8">
      <h2 class="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
      <div class="space-y-4">
        <details v-for="(faq, index) in faqs" :key="index" class="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
          <summary class="font-semibold text-gray-900 cursor-pointer">{{ faq.question }}</summary>
          <p class="mt-3 text-gray-700">{{ faq.answer }}</p>
        </details>
      </div>
    </div>

    <!-- Buying Guide CTA -->
    <div v-if="buyingGuide" class="mt-12 bg-primary bg-opacity-10 p-6 rounded-lg border-2 border-primary">
      <h2 class="text-xl font-bold mb-2">{{ buyingGuide.title }}</h2>
      <p class="text-gray-700 mb-4">{{ buyingGuide.description }}</p>
      <NuxtLink :to="buyingGuide.link" class="inline-block px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
        {{ buyingGuide.linkText }}
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Benefit {
  icon: string;
  title: string;
  description: string;
}

interface Subcategory {
  name: string;
  slug: string;
  count: number;
}

interface FAQ {
  question: string;
  answer: string;
}

interface BuyingGuide {
  title: string;
  description: string;
  link: string;
  linkText: string;
}

interface Props {
  topDescription?: string;
  bottomDescription?: string;
  benefits?: Benefit[];
  subcategories?: Subcategory[];
  faqs?: FAQ[];
  buyingGuide?: BuyingGuide;
}

defineProps<Props>();
</script>

<style scoped>
details summary {
  list-style: none;
}
details summary::-webkit-details-marker {
  display: none;
}
details[open] summary {
  margin-bottom: 0.75rem;
}
</style>
