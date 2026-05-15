<script>
const contactFaqItems = [
  {
    question: 'When can I shop in store?',
    answer: 'In-store shopping is available Wednesday 2-7pm and Saturday 12-7pm. Online shopping is open 24/7.',
    isOpen: false,
  },
  {
    question: 'When can I pick up an online order?',
    answer: 'Order pickup is available Monday, Tuesday, Thursday, and Friday 12-4pm, Wednesday 12-7pm, and Saturday 12-7pm. Pickup is closed Sunday.',
    isOpen: false,
  },
  {
    question: 'How long has ProSkaters Place been in business?',
    answer: 'ProSkaters Place has been serving skaters since 2011 from our Toronto-area skate shop and online store.',
    isOpen: false,
  },
  {
    question: 'What skate brands do you carry?',
    answer:
      'We carry Rollerblade, K2 Skates, Powerslide, Seba, FR Skates, Moxi, Riedell, Impala, Rio Roller, Chaya, and more across inline skates, roller skates, protective gear, parts, and accessories.',
    isOpen: false,
  },
  {
    question: 'Do you ship across Canada?',
    answer: 'Yes. Shipping options and costs are shown at checkout, and orders over the free-shipping threshold qualify for free shipping across Canada.',
    isOpen: false,
  },
  {
    question: 'What is your return and exchange policy?',
    answer:
      'We offer returns and exchanges on eligible regular-priced items within the posted policy window. Items must be brand-new, unused, clean, and in original packaging. Clearance, custom, and special-order products may not be eligible.',
    isOpen: false,
  },
  {
    question: 'How do I track the status of my order?',
    answer: 'You will receive an email confirmation after placing your order. Once your order ships, you will receive tracking information by email.',
    isOpen: false,
  },
  {
    question: 'How can I get assistance?',
    answer:
      'Use the contact form on this page or call the shop at (416) 739-2929. Our team can help with sizing, product selection, order pickup, and general skate questions.',
    isOpen: false,
  },
];

export default {
  name: 'FaqAccordion',
  data() {
    return {
      faqItems: contactFaqItems.map((item) => ({...item})),
    };
  },
  mounted() {
    this.addSchemaMarkup();
  },
  methods: {
    toggleAnswer(index) {
      this.faqItems[index].isOpen = !this.faqItems[index].isOpen;
    },
    addSchemaMarkup() {
      const existingSchema = document.getElementById('contact-faq-schema');
      if (existingSchema) existingSchema.remove();

      const schemaScript = document.createElement('script');
      schemaScript.id = 'contact-faq-schema';
      schemaScript.type = 'application/ld+json';
      schemaScript.innerHTML = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: this.faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      });
      document.head.appendChild(schemaScript);
    },
  },
};
</script>

<template>
  <div class="faq-accordion">
    <div v-for="(item, index) in faqItems" :key="index" class="faq-item">
      <div class="question" @click="toggleAnswer(index)">
        {{ item.question }}
        <span class="toggle-icon">{{ item.isOpen ? '-' : '+' }}</span>
      </div>

      <div v-show="item.isOpen" class="answer">
        {{ item.answer }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.faq-accordion {
  max-width: 500px;
}
.faq-item {
  border-bottom: 1px solid #eee;
}
.question {
  padding-bottom: 15px;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
}
.answer {
  padding: 15px;
  background-color: #f9f9f9;
}
.toggle-icon {
  font-size: 18px;
}
</style>
