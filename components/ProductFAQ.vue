<script setup lang="ts">
/**
 * Product FAQ Component
 *
 * Displays frequently asked questions for products with:
 * - Collapsible accordion UI
 * - Automatic FAQ generation based on product category
 * - Custom FAQ override support
 * - Schema.org FAQPage structured data (handled by parent)
 */

interface FAQItem {
  question: string;
  answer: string;
}

interface Props {
  product: any;
  customFAQs?: FAQItem[];
  maxItems?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxItems: 6,
});

const {getDefaultFAQs} = useProductRichSnippets();

// Use custom FAQs if provided, otherwise generate defaults
const faqItems = computed(() => {
  if (props.customFAQs && props.customFAQs.length > 0) {
    return props.customFAQs.slice(0, props.maxItems);
  }
  return getDefaultFAQs(props.product).slice(0, props.maxItems);
});

// Track which FAQ items are expanded
const expandedItems = ref<Set<number>>(new Set());

const toggleItem = (index: number) => {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index);
  } else {
    expandedItems.value.add(index);
  }
};

const isExpanded = (index: number) => expandedItems.value.has(index);
</script>

<template>
  <div v-if="faqItems.length > 0" class="product-faq">
    <h2 class="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>

    <div class="faq-list space-y-4">
      <div v-for="(item, index) in faqItems" :key="index" class="faq-item border border-gray-200 rounded-lg overflow-hidden">
        <button
          @click="toggleItem(index)"
          class="w-full flex items-center justify-between p-4 text-left bg-white hover:bg-gray-50 transition-colors"
          :aria-expanded="isExpanded(index)"
          :aria-controls="`faq-answer-${index}`">
          <span class="font-medium text-gray-900 pr-4">{{ item.question }}</span>
          <svg
            class="w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200"
            :class="{'rotate-180': isExpanded(index)}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div
          v-show="isExpanded(index)"
          :id="`faq-answer-${index}`"
          class="faq-answer px-4 pb-4 text-gray-700 bg-gray-50 border-t border-gray-200"
          v-html="item.answer" />
      </div>
    </div>

    <!-- Schema.org structured data is handled by useProductRichSnippets in parent component -->
  </div>
</template>

<style scoped>
.faq-answer {
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.rotate-180 {
  transform: rotate(180deg);
}
</style>
