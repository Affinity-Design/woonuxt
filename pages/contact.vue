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
        turnstileToken: "",
      },
      status: {
        submitting: false,
        success: false,
        error: null,
      },
      turnstileWidgetId: null,
    };
  },
  mounted() {
    // Initialize Turnstile when component is mounted
    this.initTurnstile();
  },
  unmounted() {
    // Clean up Turnstile widget if it exists
    if (this.turnstileWidgetId) {
      window.turnstile?.remove(this.turnstileWidgetId);
    }
  },
  methods: {
    initTurnstile() {
      // Wait for Turnstile to be loaded
      if (window.turnstile) {
        const config = useRuntimeConfig();
        const siteKey = config.public.turnstile.siteKey;

        // Render the Turnstile widget
        this.turnstileWidgetId = window.turnstile.render(
          "#turnstile-container",
          {
            sitekey: siteKey,
            callback: (token) => {
              this.form.turnstileToken = token;
            },
            "expired-callback": () => {
              this.form.turnstileToken = "";
            },
          }
        );
      } else {
        // If Turnstile is not loaded yet, try again in a moment
        setTimeout(() => this.initTurnstile(), 500);
      }
    },
    resetTurnstile() {
      if (window.turnstile && this.turnstileWidgetId) {
        window.turnstile.reset(this.turnstileWidgetId);
        this.form.turnstileToken = "";
      }
    },
    async submitForm() {
      try {
        // Check if Turnstile token is available
        if (!this.form.turnstileToken) {
          this.status.error = "Please complete the CAPTCHA verification";
          return;
        }

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
        this.form = { name: "", email: "", message: "", turnstileToken: "" };
        this.resetTurnstile();
      } catch (error) {
        console.error("Error submitting form:", error);
        this.status.error =
          error.message || "An error occurred while sending your message";
        this.resetTurnstile();
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

      <!-- Right column: Contact Form -->
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

          <!-- Turnstile widget container -->
          <div class="mb-4">
            <div id="turnstile-container"></div>
            <div
              v-if="!form.turnstileToken && status.error"
              class="mt-1 text-red-500 text-sm"
            >
              Please verify that you're not a robot
            </div>
          </div>

          <button
            type="submit"
            class="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark"
            :disabled="status.submitting || !form.turnstileToken"
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
