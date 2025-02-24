<script setup lang="ts">
const { cart } = useCart();
const { stripe } = defineProps(["stripe"]);
interface CardElementChangeEvent {
  empty: boolean;
  complete: boolean;
  error?: {
    message: string;
  };
}

const error = ref<string | null>(null);
const isLoading = ref(false);
const isCardComplete = ref(false);

// Compute cart total with error handling
const rawCartTotal = computed(() => {
  try {
    const rawValue = cart.value?.rawTotal;

    if (typeof rawValue === "undefined") return 0;

    const numericValue =
      typeof rawValue === "string"
        ? Number.parseFloat(rawValue)
        : Number(rawValue);

    if (Number.isNaN(numericValue)) return 0;

    return Math.round(numericValue * 100);
  } catch {
    return 0; // Fallback for unexpected errors
  }
});

const emit = defineEmits<{
  (e: "updateElement", elements: any): void;
  (e: "error", error: string): void;
  (
    e: "cardStateChange",
    state: { complete: boolean; error: string | null }
  ): void;
}>();

let elements = null as any;

// Create stripe options as a plain object
const createStripeOptions = () => ({
  mode: "payment",
  currency: "cad",
  amount: rawCartTotal.value,
  appearance: {
    theme: "stripe",
  },
});

const createStripeElements = async () => {
  error.value = null;
  isLoading.value = true;
  isCardComplete.value = false;

  try {
    // Validate stripe initialization
    if (!stripe) {
      throw new Error("Stripe has not been initialized");
    }

    // Validate cart amount
    if (!rawCartTotal.value || rawCartTotal.value <= 0) {
      throw new Error("Invalid cart amount");
    }

    // DEBUG line
    console.log(
      "Creating Stripe elements with options:",
      createStripeOptions()
    );

    // Create elements with plain object options
    const elementsOptions = createStripeOptions();
    elements = stripe.elements(elementsOptions);

    if (!elements) {
      throw new Error("Failed to create Stripe elements");
    }

    const paymentElement = elements.create("card", { hidePostalCode: true });
    if (!paymentElement) {
      throw new Error("Failed to create card element");
    }

    paymentElement.mount("#card-element");

    // Enhanced change event handler
    paymentElement.on("change", (event: CardElementChangeEvent) => {
      isCardComplete.value = event.complete;

      if (event.error) {
        error.value = event.error.message;
      } else {
        error.value = null;
      }

      // Emit card state to parent
      emit("cardStateChange", {
        complete: isCardComplete.value,
        error: error.value,
      });
    });

    // Add blur event handler
    paymentElement.on("blur", () => {
      if (!isCardComplete.value) {
        error.value = "Please complete all card details";
      }
    });

    emit("updateElement", elements);
  } catch (err: any) {
    const errorMessage =
      err?.message || "An error occurred while setting up payment";
    console.error("Stripe setup error:", err);
    error.value = errorMessage;
    emit("error", errorMessage);
  } finally {
    isLoading.value = false;
  }

  // TODO Add method to validate card state
  const validateCard = async (): Promise<boolean> => {
    if (!elements) {
      error.value = "Payment system not initialized";
      return false;
    }
    const cardElement = elements.getElement("card");
    if (!cardElement) {
      error.value = "Card element not found";
      return false;
    }
    if (!isCardComplete.value) {
      error.value = "Please complete all card details";
      return false;
    }
    return true;
  };
};

// Watch for changes in cart total
watch(rawCartTotal, (newValue, oldValue) => {
  if (newValue !== oldValue && newValue > 0) {
    console.log("Cart total changed, updating elements");
    createStripeElements();
  }
});

onMounted(() => {
  createStripeElements();
});

// Cleanup on unmount
onUnmounted(() => {
  if (elements) {
    try {
      const card = elements.getElement("card");
      if (card) {
        card.unmount();
      }
    } catch (err) {
      console.error("Error unmounting Stripe elements:", err);
    }
  }
});
</script>

<template>
  <div>
    <div v-if="isLoading" class="text-center p-4">
      <span class="text-gray-600">Loading payment form...</span>
    </div>

    <div v-else>
      <div
        id="card-element"
        :class="{
          'opacity-50': isLoading,
          'border-red-500': error && !isCardComplete,
          'border-green-500': isCardComplete && !error,
        }"
      >
        <!-- Elements will create form elements here -->
      </div>

      <div v-if="error" class="mt-2 p-2 text-sm text-red-600 bg-red-50 rounded">
        {{ error }}
      </div>

      <div
        v-if="isCardComplete && !error"
        class="mt-2 p-2 text-sm text-green-600 bg-green-50 rounded"
      >
        Card details complete
      </div>
    </div>
  </div>
</template>

<style scoped>
#card-element {
  @apply border rounded-md p-4 transition-all duration-200;
}

#card-element.border-red-500 {
  @apply border-2;
}

#card-element.border-green-500 {
  @apply border-2;
}
</style>
