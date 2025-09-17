<!-- components/shopElements/HelcimCard.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";

const emit = defineEmits([
  "ready",
  "error",
  "payment-success",
  "payment-failed",
  "payment-complete",
  "checkout-requested",
]);

const checkoutToken = ref("");
const secretToken = ref("");
const paymentComplete = ref(false);
const paymentError = ref<string | null>(null);
const isInitializing = ref(true);
const transactionData = ref<any>(null);

const props = defineProps({
  amount: {
    type: Number,
    required: true,
    // Amount should be in dollars (e.g., 2.24), not cents
  },
  currency: {
    type: String,
    default: "CAD",
  },
});

// Computed property for display amount
// Amount prop is now in dollars, so display directly
const displayAmount = computed(() => {
  console.log(`[DEBUG HelcimCard] Display amount calculation:`, {
    propsAmount: props.amount,
    displayAmount: props.amount.toFixed(2),
  });
  return props.amount.toFixed(2);
});

// Computed property for API amount - send dollars directly to server
const apiAmount = computed(() => {
  console.log(`[DEBUG HelcimCard] API amount calculation:`, {
    propsAmountDollars: props.amount,
    sendingDollarsToServer: props.amount,
  });
  return props.amount; // Send dollars directly, no conversion needed
});

// Initialize Helcim payment
const initializePayment = async () => {
  try {
    isInitializing.value = true;
    paymentError.value = null;

    // Reset payment completion state when re-initializing
    paymentComplete.value = false;
    transactionData.value = null;

    console.log(
      `[HelcimCard] Initializing payment for ${props.currency} $${displayAmount.value}`
    );
    console.log(`[HelcimCard] Props amount:`, props.amount);
    console.log(`[HelcimCard] Display amount:`, displayAmount.value);
    console.log(`[HelcimCard] API amount (cents):`, apiAmount.value);

    const response = (await $fetch("/api/helcim", {
      method: "POST",
      body: {
        action: "initialize",
        amount: apiAmount.value, // Use computed property that ensures cents
        currency: props.currency,
      },
    })) as {
      success: boolean;
      checkoutToken?: string;
      secretToken?: string;
      error?: { message: string };
    };

    if (response.success) {
      checkoutToken.value = response.checkoutToken || "";
      secretToken.value = response.secretToken || "";

      console.log("[HelcimCard] Payment initialized successfully");

      // Load Helcim script after successful initialization
      await loadHelcimScript();
      emit("ready");
    } else {
      throw new Error(
        response.error?.message || "Failed to initialize Helcim payment"
      );
    }
  } catch (error: any) {
    console.error("[HelcimCard] Initialization error:", error);
    paymentError.value = error.message;
    emit("error", error.message);
  } finally {
    isInitializing.value = false;
  }
};

const loadHelcimScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if script already exists
    if (document.getElementById("helcim-pay-script")) {
      setupEventListeners();
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = "helcim-pay-script";
    script.type = "text/javascript";
    script.src = "https://secure.helcim.app/helcim-pay/services/start.js";

    script.onload = () => {
      console.log("[HelcimCard] Helcim script loaded successfully");
      setupEventListeners();
      resolve();
    };

    script.onerror = () => {
      console.error("[HelcimCard] Failed to load Helcim script");
      reject(new Error("Failed to load Helcim payment script"));
    };

    document.head.appendChild(script);
  });
};

const setupEventListeners = () => {
  if (!checkoutToken.value) return;

  const helcimPayJsIdentifierKey = "helcim-pay-js-" + checkoutToken.value;

  const messageHandler = (event: MessageEvent) => {
    if (event.data.eventName === helcimPayJsIdentifierKey) {
      console.log("[HelcimCard] Received event:", event.data.eventStatus);

      switch (event.data.eventStatus) {
        case "SUCCESS":
          handlePaymentSuccess(event.data.eventMessage);
          break;
        case "ABORTED":
          handlePaymentFailed(event.data.eventMessage);
          break;
        case "HIDE":
          console.log("[HelcimCard] Payment modal closed by user");
          // Ensure proper cleanup when modal is closed
          removeHelcimIframe();
          break;
        default:
          console.log(
            "[HelcimCard] Unknown event status:",
            event.data.eventStatus
          );
      }
    }
  };

  window.addEventListener("message", messageHandler);

  // Store the handler for cleanup
  (window as any)._helcimMessageHandler = messageHandler;
};

const handlePaymentSuccess = (eventMessage: any) => {
  try {
    console.log("[HelcimCard] Payment successful:", eventMessage);

    // Parse the transaction data
    const parsedData =
      typeof eventMessage === "string"
        ? JSON.parse(eventMessage)
        : eventMessage;
    transactionData.value = parsedData;

    paymentComplete.value = true;
    paymentError.value = null;

    emit("payment-success", parsedData);
    emit("payment-complete", {
      success: true,
      transactionData: parsedData,
      secretToken: secretToken.value,
    });

    // Remove the iframe after successful payment
    removeHelcimIframe();
  } catch (error) {
    console.error("[HelcimCard] Error processing successful payment:", error);
    handlePaymentFailed("Error processing payment data");
  }
};

const handlePaymentFailed = (eventMessage: any) => {
  console.error("[HelcimCard] Payment failed:", eventMessage);

  paymentError.value =
    typeof eventMessage === "string" ? eventMessage : "Payment failed";
  paymentComplete.value = false;

  emit("payment-failed", eventMessage);
  emit("payment-complete", {
    success: false,
    error: paymentError.value,
  });

  // Remove the iframe after failed payment
  removeHelcimIframe();
};

const processPayment = () => {
  if (!checkoutToken.value) {
    paymentError.value = "Payment not initialized";
    emit("error", paymentError.value);
    return;
  }

  if (!(window as any).appendHelcimPayIframe) {
    paymentError.value = "Helcim payment script not loaded";
    emit("error", paymentError.value);
    return;
  }

  console.log("[HelcimCard] Opening payment modal");
  paymentError.value = null;

  try {
    (window as any).appendHelcimPayIframe(checkoutToken.value, true); // allowExit = true
  } catch (error) {
    console.error("[HelcimCard] Error opening payment modal:", error);
    paymentError.value = "Failed to open payment form";
    emit("error", paymentError.value);
  }
};

const handleCompleteCheckout = () => {
  console.log("[HelcimCard] Complete checkout button clicked");
  emit("checkout-requested");
};

const removeHelcimIframe = () => {
  try {
    console.log("[HelcimCard] Removing Helcim iframe and overlays...");

    // Use Helcim's built-in removal function if available
    if ((window as any).removeHelcimPayIframe) {
      (window as any).removeHelcimPayIframe();
    }

    // Fallback: manually remove all Helcim-related elements
    const elementsToRemove = [
      "helcimPayIframe",
      "helcim-pay-iframe",
      "helcim-iframe",
      "helcim-overlay",
      "helcim-modal",
      "helcim-backdrop",
    ];

    elementsToRemove.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        console.log(`[HelcimCard] Removing element: ${id}`);
        element.remove();
      }
    });

    // Remove any elements with Helcim-related classes
    const helcimElements = document.querySelectorAll(
      '[class*="helcim"], [id*="helcim"]'
    );
    helcimElements.forEach((element) => {
      if (element.tagName === "IFRAME" || element.tagName === "DIV") {
        console.log(`[HelcimCard] Removing Helcim element:`, element);
        element.remove();
      }
    });

    // Remove any high z-index overlays that might be blocking the page
    const allElements = document.querySelectorAll("*");
    allElements.forEach((element) => {
      const styles = window.getComputedStyle(element);
      const zIndex = parseInt(styles.zIndex);

      // Remove elements with very high z-index that might be modal overlays
      if (
        zIndex > 9999 &&
        (element.tagName === "DIV" || element.tagName === "IFRAME")
      ) {
        // Check if it's likely a Helcim overlay by checking size and position
        const rect = element.getBoundingClientRect();
        if (
          rect.width > window.innerWidth * 0.8 &&
          rect.height > window.innerHeight * 0.8
        ) {
          console.log(`[HelcimCard] Removing high z-index overlay:`, element);
          element.remove();
        }
      }
    });

    // Restore body scroll if it was disabled
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    console.log("[HelcimCard] Cleanup completed");
  } catch (error) {
    console.error("[HelcimCard] Error removing iframe:", error);
  }
};

// Expose methods and properties for parent component
defineExpose({
  processPayment,
  isPaymentComplete: () => paymentComplete.value,
  getTransactionData: () => transactionData.value,
  getSecretToken: () => secretToken.value,
  getTransactionId: () => transactionData.value?.data?.transactionId || null,
  isReady: () => !!checkoutToken.value && !isInitializing.value,
  cleanup: removeHelcimIframe, // Expose cleanup function for manual cleanup
});

onMounted(() => {
  initializePayment();
});

// Watch for amount changes and re-initialize
watch(
  () => props.amount,
  (newAmount, oldAmount) => {
    if (newAmount !== oldAmount && newAmount > 0) {
      console.log(
        `[HelcimCard] Amount changed from ${oldAmount} to ${newAmount} cents, re-initializing...`
      );
      initializePayment();
    }
  }
);

onUnmounted(() => {
  console.log("[HelcimCard] Component unmounting - cleaning up...");

  // Clean up event listeners
  if ((window as any)._helcimMessageHandler) {
    window.removeEventListener(
      "message",
      (window as any)._helcimMessageHandler
    );
    delete (window as any)._helcimMessageHandler;
  }

  // Remove iframe and overlays if still present
  removeHelcimIframe();
});
</script>

<template>
  <div class="helcim-payment-container">
    <!-- Error Display -->
    <div v-if="paymentError" class="error-message mb-4">
      <div class="flex items-center gap-2">
        <Icon name="ion:alert-circle" size="20" class="text-red-600" />
        <span>{{ paymentError }}</span>
      </div>
    </div>

    <!-- Initializing State -->
    <div v-else-if="isInitializing" class="loading-state">
      <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <div class="animate-spin">
          <Icon name="ion:refresh" size="20" class="text-gray-600" />
        </div>
        <span class="text-gray-600">Initializing secure payment...</span>
      </div>
    </div>

    <!-- Payment Complete State -->
    <div v-else-if="paymentComplete" class="payment-complete">
      <div
        class="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200"
      >
        <Icon name="ion:checkmark-circle" size="24" class="text-green-600" />
        <div>
          <div class="font-medium text-green-800">Payment Successful</div>
          <div class="text-sm text-green-600">
            Transaction ID: {{ transactionData?.data?.transactionId }}
          </div>
        </div>
      </div>
    </div>

    <!-- Ready to Pay State -->
    <div v-else class="payment-ready">
      <div
        class="payment-info mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-blue-800">Secure Payment</div>
            <div class="text-sm text-blue-600">
              Amount: {{ currency }} ${{ displayAmount }}
            </div>
          </div>
          <Icon name="ion:shield-checkmark" size="24" class="text-blue-600" />
        </div>
      </div>

      <button
        @click="handleCompleteCheckout"
        class="helcim-pay-button w-full"
        :disabled="isInitializing || !checkoutToken"
      >
        <Icon name="ion:card" size="20" class="mr-2" />
        Complete Purchase
      </button>

      <div class="payment-security mt-3 text-center">
        <div
          class="text-xs text-gray-500 flex items-center justify-center gap-1"
        >
          <Icon name="ion:lock-closed" size="12" />
          Secured by Helcim • PCI Compliant
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.helcim-pay-button {
  background-color: var(--primary-color, #3b82f6);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
}

.helcim-pay-button:hover {
  background-color: var(--primary-color-dark, #2563eb);
}

.helcim-pay-button:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

.error-message {
  color: #dc2626;
  font-size: 0.875rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.loading-state {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.payment-complete {
  transition: all 0.3s;
}

.payment-ready {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.payment-info {
  transition: all 0.2s;
}

.payment-security {
  opacity: 0.75;
  transition: opacity 0.2s;
}

.payment-security:hover {
  opacity: 1;
}
</style>
