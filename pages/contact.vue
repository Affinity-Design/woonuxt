<script setup lang="ts">
import VueTurnstile from "vue-turnstile";
import FaqAccordion from "./components/generalElements/FaqAccordion.vue";

const turnstileToken = ref<string>("");
const turnstileError = ref<string>("");
const turnstileMounted = ref(false);
const turnstileSiteKey = useRuntimeConfig();

const form = ref({
  name: "",
  email: "",
  message: "",
});

const status = ref({
  submitting: false,
  success: false,
  error: null,
});

const verifyTurnstile = async () => {
  turnstileError.value = "";
  if (!turnstileToken.value) {
    turnstileError.value = "Please complete the security check";
    return false;
  }
  return true;
};

async function submitForm() {
  try {
    // Verify Turnstile token
    if (!(await verifyTurnstile())) return;

    // Set submitting state
    status.value.submitting = true;
    status.value.error = null;

    console.log("Submitting form...");

    // Send form data to the API
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form.value,
        turnstileToken: turnstileToken.value,
      }),
    });

    const result = await response.json();
    console.log("Form submission response:", result);

    if (!response.ok) {
      const errorMsg = result.error || "Failed to send message";
      console.error("Form submission error:", errorMsg, result);
      throw new Error(errorMsg);
    }

    // Success state
    status.value.success = true;
    console.log("Form submitted successfully");

    // Reset form after submission
    form.value = { name: "", email: "", message: "" };
    turnstileToken.value = "";

    // Reset Turnstile
    if (window.turnstile) {
      window.turnstile.reset();
    }
  } catch (error) {
    console.error("Error submitting form:", error);
    status.value.error =
      error.message || "An error occurred while sending your message";
    turnstileToken.value = "";

    // Reset Turnstile
    if (window.turnstile) {
      window.turnstile.reset();
    }
  } finally {
    status.value.submitting = false;

    // Auto-clear success message after 5 seconds
    if (status.value.success) {
      setTimeout(() => {
        status.value.success = false;
      }, 5000);
    }
  }
}
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

          <!-- Turnstile widget using VueTurnstile -->
          <div class="my-4">
            <ClientOnly>
              <VueTurnstile
                :site-key="turnstileSiteKey.public.turnstyleSiteKey"
                v-model="turnstileToken"
                @verify="
                  () => {
                    turnstileMounted = true;
                    if (!turnstileToken) console.error('No token after mount');
                  }
                "
                @error="
                  () => {
                    turnstileError = 'Security check failed - please try again';
                  }
                "
                :reset-interval="30000"
              />
              <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
                {{ turnstileError }}
              </div>
            </ClientOnly>
          </div>

          <button
            type="submit"
            class="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark"
            :disabled="status.submitting || !turnstileToken"
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
