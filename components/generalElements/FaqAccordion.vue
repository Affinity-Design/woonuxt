<script>
export default {
  name: "FaqAccordion",
  data() {
    return {
      faqItems: [
        {
          question: "How do PSP Rewards work?",
          answer:
            "ProSkaters Place offers 10% back in PSP Rewards for every dollar spent (account required). For every $1 spent on product cost, you earn 10c back in rewards towards future purchases. Rewards never expire and can be used immediately to pay for up to half (50%) of the product cost on your next order. Rewards are not available on Clearance items and some low-margin items. In case of a return for refund, rewards will be deducted accordingly.",
          isOpen: false,
        },
        {
          question: "Do you ship to my country?",
          answer:
            "We ship worldwide to more than 50 countries. Shipping options and costs are automatically shown at Checkout. If you don't see a shipping option listed, please email customerservice@proskatersplace.com for assistance.",
          isOpen: false,
        },
        {
          question: "What if I received a wrong item?",
          answer:
            "We apologize for any inconvenience. Please email customerservice@proskatersplace.com immediately with a photo of the item/s and label as evidence. Our team will guide you through the process to rectify the mistake.",
          isOpen: false,
        },
        {
          question: "What is your return and exchange policy?",
          answer:
            "We offer FREE return shipping for exchanges on items over $100 (excluding Clearance items) for US/Canadian clients. Contact us within 60 days of purchase. Items must be brand-new, unused, clean, and in original packaging. Custom and special order products are not eligible for returns or exchanges. For more details, check our full policies page.",
          isOpen: false,
        },
        {
          question: "How do I track the status of my order?",
          answer:
            "You'll receive an email confirmation within minutes of placing your order. We typically have a 1-2 business day processing time, in addition to the estimated shipping timeframe. Once shipped, you'll receive an automatic email with tracking information.",
          isOpen: false,
        },
        {
          question: "Can I change or cancel my order?",
          answer:
            "To change or cancel an order, email customerservice@proskatersplace.com immediately. We cannot cancel orders that have already been shipped. For adding items to an existing order, email us with details and we'll send a manual invoice for the additional payment.",
          isOpen: false,
        },
        {
          question: "How do I change my shipping address?",
          answer:
            "If you notice an incorrect shipping address after placing an order, email customerservice@proskatersplace.com immediately. We cannot change the address once the order has been shipped. In such cases, contact the courier's Customer Service directly to request pickup at a nearby location.",
          isOpen: false,
        },
        {
          question: "How long does it take to receive my order?",
          answer:
            "We typically have a 1-2 business day processing time, plus the estimated shipping timeframe. If you have a specific deadline, mention it in the order notes or email us. We don't ship on weekends and holidays.",
          isOpen: false,
        },
        {
          question: "How can I get assistance?",
          answer:
            "The best way to contact us is via email at customerservice@proskatersplace.com or by completing the Contact Form on our website. We strive to respond promptly and are committed to assisting you to the best of our abilities.",
          isOpen: false,
        },
      ],
    };
  },
  methods: {
    toggleAnswer(index) {
      this.faqItems[index].isOpen = !this.faqItems[index].isOpen;
    },
  },
  mounted() {
    this.addSchemaMarkup();
  },
  methods: {
    toggleAnswer(index) {
      this.faqItems[index].isOpen = !this.faqItems[index].isOpen;
    },
    addSchemaMarkup() {
      const schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.innerHTML = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: this.faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
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
        <span class="toggle-icon">{{ item.isOpen ? "-" : "+" }}</span>
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
