<script>
import FaqAccordion from "./components/generalElements/FaqAccordion.vue";

export default {
  components: {
    FaqAccordion,
  },
  data() {
    return {
      form: {
        name: "",
        email: "",
        message: "",
      },
    };
  },
  methods: {
    submitForm() {
      // Handle form submission here
      console.log("Form submitted:", this.form);
      // Reset form after submission
      this.form = { name: "", email: "", message: "" };
    },
  },
};
</script>

<template>
  <div class="container my-8">
    <h1 class="mb-8 text-3xl font-semibold text-primary">Contact & FAQ</h1>
    <div class="flex flex-col md:flex-row gap-8">
      <!-- Left column: FAQ -->
      <div class="w-full md:w-1/2">
        <h2 class="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
        <FaqAccordion />
      </div>

      <!-- Right column: Contact Form -->
      <div class="w-full md:w-1/2">
        <h2 class="text-2xl font-semibold mb-4">Contact Us</h2>
        <form @submit.prevent="submitForm" class="space-y-4">
          <div>
            <label for="name" class="block mb-1">Name</label>
            <input
              type="text"
              id="name"
              v-model="form.name"
              required
              class="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label for="email" class="block mb-1">Email</label>
            <input
              type="email"
              id="email"
              v-model="form.email"
              required
              class="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label for="message" class="block mb-1">Message</label>
            <textarea
              id="message"
              v-model="form.message"
              required
              class="w-full p-2 border rounded"
              rows="4"
            ></textarea>
          </div>
          <button
            type="submit"
            class="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark"
          >
            Send Message
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Add any additional styles here */
</style>
