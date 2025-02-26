<!-- components/StripeCard.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRuntimeConfig } from "#app";

const props = defineProps({
  onReady: {
    type: Function,
    default: () => {},
  },
  onError: {
    type: Function,
    default: () => {},
  },
});

const emit = defineEmits(["ready", "error", "cardChange"]);

// Elements state
const cardElement = ref(null);
const cardComplete = ref(false);
const cardError = ref<string | null>(null);
const stripeLoaded = ref(false);
const stripe = ref(null);

const cardErrorClasses = "mt-1 text-sm text-red-500";
const cardElementClasses =
  "bg-white border rounded-md outline-none border-gray-300 shadow-sm w-full py-4 px-4";

// Riff to get the stripe key
const config = useRuntimeConfig();
const stripeKey = config.public?.stripePublishableKey;

// Load Stripe.js dynamically
onMounted(async () => {
  if (!stripeKey) {
    cardError.value = "Stripe publishable key is missing";
    emit("error", cardError.value);
    return;
  }

  try {
    // Check if Stripe is already loaded
    if (window.Stripe) {
      initializeStripe();
    } else {
      // Load Stripe.js
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = initializeStripe;
      script.onerror = () => {
        cardError.value = "Failed to load Stripe.js";
        emit("error", cardError.value);
      };
      document.head.appendChild(script);
    }
  } catch (error) {
    cardError.value = "Error loading Stripe: " + error.message;
    emit("error", cardError.value);
  }
});

// Clean up resources
onUnmounted(() => {
  if (cardElement.value) {
    cardElement.value.unmount();
    cardElement.value = null;
  }
});

// Initialize Stripe and create card element
function initializeStripe() {
  try {
    stripe.value = window.Stripe(stripeKey);
    const elements = stripe.value.elements();

    // Create card element
    cardElement.value = elements.create("card", {
      hidePostalCode: true,
      style: {
        base: {
          color: "#32325d",
          fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
          fontSmoothing: "antialiased",
          fontSize: "16px",
          "::placeholder": {
            color: "#aab7c4",
          },
        },
        invalid: {
          color: "#fa755a",
          iconColor: "#fa755a",
        },
      },
    });

    // Mount card element
    cardElement.value.mount("#card-element");

    // Listen for changes
    cardElement.value.on("change", (event) => {
      cardComplete.value = event.complete;
      cardError.value = event.error ? event.error.message : null;

      emit("cardChange", {
        complete: event.complete,
        error: event.error,
        value: event.value,
      });
    });

    stripeLoaded.value = true;
    emit("ready", { stripe: stripe.value, elements });

    if (props.onReady) {
      props.onReady({ stripe: stripe.value, elements });
    }
  } catch (error) {
    cardError.value = "Error initializing Stripe: " + error.message;
    emit("error", cardError.value);

    if (props.onError) {
      props.onError(error);
    }
  }
}

// Expose methods to parent component
defineExpose({
  getStripe: () => stripe.value,
  getCardElement: () => cardElement.value,
  isCardComplete: () => cardComplete.value,
  getCardError: () => cardError.value,
});
</script>

<template>
  <div class="stripe-card-container">
    <div id="card-element" :class="cardElementClasses"></div>

    <div v-if="cardError" :class="cardErrorClasses">
      {{ cardError }}
    </div>

    <div v-if="!stripeLoaded" class="mt-2 text-sm text-gray-500">
      Loading payment form...
    </div>
  </div>
</template>
