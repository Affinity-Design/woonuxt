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
      status: {
        submitting: false,
        success: false,
        error: null,
      },
    };
  },
  methods: {
    async submitForm() {
      try {
        // Set submitting state
        this.status.submitting = true;
        this.status.error = null;

        // Send form data to the API
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.form),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to send message");
        }

        // Success state
        this.status.success = true;

        // Reset form after submission
        this.form = { name: "", email: "", message: "" };
      } catch (error) {
        console.error("Error submitting form:", error);
        this.status.error =
          error.message || "An error occurred while sending your message";
      } finally {
        this.status.submitting = false;

        // Auto-clear success message after 5 seconds
        if (this.status.success) {
          setTimeout(() => {
            this.status.success = false;
          }, 5000);
        }
      }
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

      <!-- Right column: Contact Form test-->
      <div class="w-full md:w-1/2">
        <h2 class="text-2xl font-semibold mb-4">Contact Us</h2>

        <!-- Success message -->
        <div
          v-if="status.success"
          class="mb-4 p-3 bg-green-100 text-green-800 rounded"
        >
          Your message has been sent successfully! We'll get back to you soon.
        </div>

        <!-- Error message -->
        <div
          v-if="status.error"
          class="mb-4 p-3 bg-red-100 text-red-800 rounded"
        >
          {{ status.error }}
        </div>

        <form @submit.prevent="submitForm" class="space-y-4">
          <div>
            <label for="name" class="block mb-1">Name</label>
            <input
              type="text"
              id="name"
              v-model="form.name"
              required
              class="w-full p-2 border rounded"
              :disabled="status.submitting"
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
              :disabled="status.submitting"
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
              :disabled="status.submitting"
            ></textarea>
          </div>
          <button
            type="submit"
            class="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark"
            :disabled="status.submitting"
          >
            <span v-if="status.submitting">Sending...</span>
            <span v-else>Send Message</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Add any additional styles here */
</style>
