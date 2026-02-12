<!-- components/shopElements/HelcimCard.vue -->
<script setup lang="ts">
import {ref, onMounted, onUnmounted, computed, watch} from 'vue';

const emit = defineEmits(['ready', 'error', 'payment-success', 'payment-failed', 'payment-complete', 'checkout-requested']);

const checkoutToken = ref('');
const secretToken = ref('');
const paymentComplete = ref(false);
const paymentError = ref<string | null>(null);
const isInitializing = ref(true);
const transactionData = ref<any>(null);

// Error classification
const isCardDecline = ref(false); // True = card was declined by issuing bank
const isTechnicalError = ref(false); // True = unexpected/integration error
const rawErrorMessage = ref(''); // Unmodified error from Helcim for debug logs
const debugLogsCopied = ref(false); // Tracks if user copied debug info

// Collect console logs for debug support button
const debugLogs = ref<string[]>([]);
const captureLog = (level: string, ...args: any[]) => {
  const timestamp = new Date().toISOString();
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  debugLogs.value.push(`[${timestamp}] [${level}] ${msg}`);
  // Cap at 200 entries to avoid memory issues
  if (debugLogs.value.length > 200) debugLogs.value.shift();
};

// Type for line items passed to Helcim
interface HelcimLineItem {
  description: string;
  quantity: number;
  price: number;
  sku?: string;
}

// Type for customer info
interface CustomerInfo {
  name?: string;
  email?: string;
  phone?: string;
  billingAddress?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

const props = defineProps({
  amount: {
    type: Number,
    required: true,
    // Amount should be in dollars (e.g., 2.24), not cents
  },
  currency: {
    type: String,
    default: 'CAD',
  },
  // Line items for Helcim invoice (backup for failed WP orders)
  lineItems: {
    type: Array as () => HelcimLineItem[],
    default: () => [],
  },
  // Shipping amount (separate from line items)
  shippingAmount: {
    type: Number,
    default: 0,
  },
  // Shipping method name (e.g., "Flat Rate", "Free Shipping")
  // Added to invoice comments for reference
  shippingMethod: {
    type: String,
    default: '',
  },
  // Tax amount for level 2 processing
  taxAmount: {
    type: Number,
    default: 0,
  },
  // Discount amount if any coupons applied
  discountAmount: {
    type: Number,
    default: 0,
  },
  // Customer information
  customerInfo: {
    type: Object as () => CustomerInfo,
    default: null,
  },
  // Invoice number (optional, will be order ID after creation)
  invoiceNumber: {
    type: String,
    default: '',
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
    isCardDecline.value = false;
    isTechnicalError.value = false;
    rawErrorMessage.value = '';
    debugLogsCopied.value = false;

    // Reset payment completion state when re-initializing
    paymentComplete.value = false;
    transactionData.value = null;

    console.log(`[HelcimCard] Initializing payment for ${props.currency} $${displayAmount.value}`);
    captureLog('INFO', `Initializing payment: ${props.currency} $${displayAmount.value}`);
    console.log(`[HelcimCard] Props amount:`, props.amount);
    console.log(`[HelcimCard] Display amount:`, displayAmount.value);
    console.log(`[HelcimCard] API amount:`, apiAmount.value);
    console.log(`[HelcimCard] Line items:`, props.lineItems?.length || 0);

    // Build request body with line items
    const requestBody: any = {
      action: 'initialize',
      amount: apiAmount.value,
      currency: props.currency,
    };

    // Add line items if provided (creates invoice in Helcim as backup)
    if (props.lineItems && props.lineItems.length > 0) {
      requestBody.lineItems = props.lineItems;
      console.log('[HelcimCard] Including line items in Helcim request:', props.lineItems);
    }

    // Add shipping, tax, discount if provided
    if (props.shippingAmount > 0) {
      requestBody.shippingAmount = props.shippingAmount;
    }
    if (props.taxAmount > 0) {
      requestBody.taxAmount = props.taxAmount;
    }
    if (props.discountAmount > 0) {
      requestBody.discountAmount = props.discountAmount;
    }

    // Add shipping method name for invoice comments
    if (props.shippingMethod) {
      requestBody.shippingMethod = props.shippingMethod;
    }

    // Add customer info if provided
    if (props.customerInfo) {
      requestBody.customerInfo = props.customerInfo;
    }

    // Add invoice number if provided
    if (props.invoiceNumber) {
      requestBody.invoiceNumber = props.invoiceNumber;
    }

    const response = (await $fetch('/api/helcim', {
      method: 'POST',
      body: requestBody,
    })) as {
      success: boolean;
      checkoutToken?: string;
      secretToken?: string;
      error?: {message: string};
    };

    if (response.success) {
      checkoutToken.value = response.checkoutToken || '';
      secretToken.value = response.secretToken || '';

      console.log('[HelcimCard] Payment initialized successfully');
      captureLog('INFO', 'Payment initialized OK, token received');

      // Load Helcim script after successful initialization
      await loadHelcimScript();
      emit('ready', {
        checkoutToken: checkoutToken.value,
        secretToken: secretToken.value,
      });
    } else {
      throw new Error(response.error?.message || 'Failed to initialize Helcim payment');
    }
  } catch (error: any) {
    console.error('[HelcimCard] Initialization error:', error);
    captureLog('ERROR', 'Initialization failed:', error.message);
    paymentError.value = error.message;
    isTechnicalError.value = true;
    emit('error', error.message);
  } finally {
    isInitializing.value = false;
  }
};

const loadHelcimScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if script already exists
    if (document.getElementById('helcim-pay-script')) {
      setupEventListeners();
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = 'helcim-pay-script';
    script.type = 'text/javascript';
    script.src = 'https://secure.helcim.app/helcim-pay/services/start.js';

    script.onload = () => {
      console.log('[HelcimCard] Helcim script loaded successfully');
      setupEventListeners();
      resolve();
    };

    script.onerror = () => {
      console.error('[HelcimCard] Failed to load Helcim script');
      reject(new Error('Failed to load Helcim payment script'));
    };

    document.head.appendChild(script);
  });
};

const setupEventListeners = () => {
  if (!checkoutToken.value) return;

  const helcimPayJsIdentifierKey = 'helcim-pay-js-' + checkoutToken.value;

  const messageHandler = (event: MessageEvent) => {
    if (event.data.eventName === helcimPayJsIdentifierKey) {
      console.log('[HelcimCard] Received event:', event.data.eventStatus);

      switch (event.data.eventStatus) {
        case 'SUCCESS':
          handlePaymentSuccess(event.data.eventMessage);
          break;
        case 'ABORTED':
          handlePaymentFailed(event.data.eventMessage);
          break;
        case 'HIDE':
          console.log('[HelcimCard] Payment modal closed by user');
          // Ensure proper cleanup when modal is closed
          removeHelcimIframe();
          break;
        default:
          console.log('[HelcimCard] Unknown event status:', event.data.eventStatus);
      }
    }
  };

  window.addEventListener('message', messageHandler);

  // Store the handler for cleanup
  (window as any)._helcimMessageHandler = messageHandler;
};

const handlePaymentSuccess = async (eventMessage: any) => {
  try {
    console.log('[HelcimCard] Payment successful - raw event data:', {
      type: typeof eventMessage,
      isString: typeof eventMessage === 'string',
      data: eventMessage,
    });

    // Parse the transaction response according to official Helcim format
    let responseData;
    if (typeof eventMessage === 'string') {
      try {
        responseData = JSON.parse(eventMessage);
      } catch (parseError) {
        console.error('[HelcimCard] Failed to parse event message:', parseError);
        responseData = eventMessage;
      }
    } else {
      responseData = eventMessage;
    }

    console.log('[HelcimCard] Parsed response structure:', {
      keys: Object.keys(responseData || {}),
      hasData: !!responseData?.data,
      hasHash: !!responseData?.hash,
      dataKeys: responseData?.data ? Object.keys(responseData.data) : null,
      hashValue: responseData?.hash,
      sampleFields: {
        transactionId: responseData?.data?.transactionId || responseData?.transactionId,
        amount: responseData?.data?.amount || responseData?.amount,
        status: responseData?.data?.status || responseData?.status,
      },
    });

    // Extract transaction data from the response
    const extractedTransactionData = responseData?.data || responseData;

    console.log('[HelcimCard] Sending to validation:', {
      hasSecretToken: !!secretToken.value,
      responseStructure: {
        keys: Object.keys(responseData || {}),
        hasHash: !!responseData?.hash,
        hasData: !!responseData?.data,
      },
    });

    // Validate the transaction on the server using dedicated endpoint
    const validation = (await $fetch('/api/helcim-validate', {
      method: 'POST',
      body: {
        transactionData: responseData, // Send full response for server to analyze
        secretToken: secretToken.value,
      },
    })) as any;

    console.log('[HelcimCard] Validation response:', validation);

    if (!validation.success || !validation.isValid) {
      console.error('[HelcimCard] Transaction validation failed:', validation);
      const errorMsg = validation.error?.message || validation.note || 'Unknown validation error';
      handlePaymentFailed(`Transaction validation failed: ${errorMsg}`);
      return;
    }

    // Log warning if validation was bypassed
    if (validation.warning) {
      console.warn('[HelcimCard] Validation warning:', validation.warning);
    }

    console.log('[HelcimCard] Transaction validated successfully:', validation);
    transactionData.value = extractedTransactionData;

    // Extract cardToken from Helcim response for refund support
    // Helcim may return cardToken at various levels depending on the response structure
    // Log all possible locations to debug
    console.log('[HelcimCard] Looking for cardToken in response:', {
      'extractedTransactionData.cardToken': extractedTransactionData?.cardToken,
      'extractedTransactionData.data?.cardToken': extractedTransactionData?.data?.cardToken,
      'responseData.cardToken': responseData?.cardToken,
      'responseData.data?.cardToken': responseData?.data?.cardToken,
      'extractedTransactionData.card?.cardToken': extractedTransactionData?.card?.cardToken,
      'responseData.card?.cardToken': responseData?.card?.cardToken,
      // Full structure for debugging
      'extractedTransactionData keys': Object.keys(extractedTransactionData || {}),
      'responseData keys': Object.keys(responseData || {}),
    });

    // Try all possible locations for cardToken
    const cardToken =
      extractedTransactionData?.cardToken ||
      extractedTransactionData?.data?.cardToken ||
      extractedTransactionData?.card?.cardToken ||
      responseData?.cardToken ||
      responseData?.data?.cardToken ||
      responseData?.card?.cardToken ||
      // Sometimes it's nested under the transaction object
      extractedTransactionData?.transaction?.cardToken ||
      responseData?.transaction?.cardToken;

    console.log(
      '[HelcimCard] Extracted cardToken for refund support:',
      cardToken ? `present (${cardToken.substring(0, 8)}...)` : 'MISSING - refunds will fail!',
    );

    paymentComplete.value = true;
    paymentError.value = null;

    emit('payment-success', extractedTransactionData);
    emit('payment-complete', {
      success: true,
      transactionData: extractedTransactionData,
      secretToken: secretToken.value,
      cardToken: cardToken, // Include cardToken for WooCommerce refund support
      isValidated: true,
      validationResult: validation,
    });

    // Remove the iframe after successful payment
    removeHelcimIframe();
  } catch (error) {
    console.error('[HelcimCard] Error processing successful payment:', error);
    handlePaymentFailed('Error processing payment data');
  }
};

const handlePaymentFailed = (eventMessage: any) => {
  const rawError = typeof eventMessage === 'string' ? eventMessage : 'Payment failed';
  rawErrorMessage.value = rawError;
  debugLogsCopied.value = false;

  console.error('[HelcimCard] Payment failed - raw event message:', eventMessage);
  captureLog('ERROR', 'Payment failed - raw:', rawError);
  captureLog('INFO', 'checkoutToken present:', !!checkoutToken.value);
  captureLog('INFO', 'amount:', props.amount, 'currency:', props.currency);
  captureLog('INFO', 'lineItems:', props.lineItems?.length || 0);
  captureLog('INFO', 'taxAmount:', props.taxAmount, 'shippingAmount:', props.shippingAmount, 'discountAmount:', props.discountAmount);
  captureLog('INFO', 'customerInfo:', props.customerInfo);

  // Classify the error
  // Card declines: bank/issuer rejected the card (customer can fix)
  const declinePatterns = [
    'DECLINED',
    'declined',
    'Declined',
    'insufficient funds',
    'card expired',
    'do not honor',
    'lost card',
    'stolen card',
    'invalid card',
    'pickup card',
    'restricted card',
    'security violation',
    'exceed withdrawal',
    'not permitted',
  ];

  const isDecline = declinePatterns.some((p) => rawError.includes(p));
  // "Could not complete CC transaction" can be either a decline or a config issue.
  // After our amount-mismatch fix, if this still appears it's most likely a genuine decline.
  const isCCFailure = rawError.includes('Could not complete CC transaction');

  if (isDecline || isCCFailure) {
    isCardDecline.value = true;
    isTechnicalError.value = false;
    paymentError.value = isCCFailure
      ? 'Your card was declined. Please check your card number, expiry date, and CVV, then try again. If the problem persists, contact your bank or try a different card.'
      : `Your card was declined: ${rawError}. Please try a different card or contact your bank.`;
  } else if (rawError.includes('Invalid card transaction request')) {
    isCardDecline.value = false;
    isTechnicalError.value = true;
    paymentError.value = 'There was a technical issue processing your payment. Please try again.';
  } else {
    isCardDecline.value = false;
    isTechnicalError.value = true;
    paymentError.value = 'An unexpected error occurred during payment. Please try again.';
  }

  paymentComplete.value = false;

  emit('payment-failed', eventMessage);
  emit('payment-complete', {
    success: false,
    error: paymentError.value,
  });

  // Remove the iframe after failed payment
  removeHelcimIframe();
};

// Copy debug info to clipboard for customer support
const copyDebugInfo = async () => {
  try {
    const info = [
      '--- ProSkatersPlace Payment Debug Info ---',
      `Date: ${new Date().toISOString()}`,
      `Error: ${rawErrorMessage.value}`,
      `Amount: ${props.amount} ${props.currency}`,
      `Line Items: ${props.lineItems?.length || 0}`,
      `Tax: ${props.taxAmount} | Shipping: ${props.shippingAmount} | Discount: ${props.discountAmount}`,
      `Token Present: ${!!checkoutToken.value}`,
      '',
      '--- Logs ---',
      ...debugLogs.value.slice(-50), // Last 50 log entries
      '--- End ---',
    ].join('\n');

    await navigator.clipboard.writeText(info);
    debugLogsCopied.value = true;
    setTimeout(() => {
      debugLogsCopied.value = false;
    }, 3000);
  } catch (err) {
    console.error('[HelcimCard] Failed to copy debug info:', err);
    // Fallback: select text in a textarea
    alert('Could not copy automatically. Please contact support@proskatersplace.ca with details about this error.');
  }
};

const processPayment = () => {
  if (!checkoutToken.value) {
    paymentError.value = 'Payment not initialized';
    emit('error', paymentError.value);
    return;
  }

  if (!(window as any).appendHelcimPayIframe) {
    paymentError.value = 'Helcim payment script not loaded';
    emit('error', paymentError.value);
    return;
  }

  console.log('[HelcimCard] Opening payment modal');
  paymentError.value = null;

  try {
    (window as any).appendHelcimPayIframe(checkoutToken.value, true); // allowExit = true
  } catch (error) {
    console.error('[HelcimCard] Error opening payment modal:', error);
    paymentError.value = 'Failed to open payment form';
    emit('error', paymentError.value);
  }
};

const handleCompleteCheckout = () => {
  console.log('[HelcimCard] Complete checkout button clicked');
  emit('checkout-requested');
};

const removeHelcimIframe = () => {
  try {
    console.log('[HelcimCard] Removing Helcim iframe and overlays...');

    // Use Helcim's built-in removal function if available
    if ((window as any).removeHelcimPayIframe) {
      (window as any).removeHelcimPayIframe();
    }

    // Fallback: manually remove all Helcim-related elements
    const elementsToRemove = ['helcimPayIframe', 'helcim-pay-iframe', 'helcim-iframe', 'helcim-overlay', 'helcim-modal', 'helcim-backdrop'];

    elementsToRemove.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        console.log(`[HelcimCard] Removing element: ${id}`);
        element.remove();
      }
    });

    // Remove any elements with Helcim-related classes BUT NOT our own component container
    const helcimElements = document.querySelectorAll('[class*="helcim"], [id*="helcim"]');
    helcimElements.forEach((element) => {
      // Skip if it's our own component container or any of our component's children
      if (element.classList.contains('helcim-payment-container') || element.closest('.helcim-payment-container')) {
        console.log('[HelcimCard] Skipping removal of our own component:', element);
        return;
      }

      // Only remove iframes and divs that are modals/overlays (not our component)
      if (element.tagName === 'IFRAME' || element.tagName === 'DIV') {
        console.log(`[HelcimCard] Removing Helcim element:`, element);
        element.remove();
      }
    });

    // Remove any high z-index overlays that might be blocking the page
    const allElements = document.querySelectorAll('*');
    allElements.forEach((element) => {
      const styles = window.getComputedStyle(element);
      const zIndex = parseInt(styles.zIndex);

      // Remove elements with very high z-index that might be modal overlays
      if (zIndex > 9999 && (element.tagName === 'DIV' || element.tagName === 'IFRAME')) {
        // Check if it's likely a Helcim overlay by checking size and position
        const rect = element.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
          console.log(`[HelcimCard] Removing high z-index overlay:`, element);
          element.remove();
        }
      }
    });

    // Restore body scroll if it was disabled
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    console.log('[HelcimCard] Cleanup completed');
  } catch (error) {
    console.error('[HelcimCard] Error removing iframe:', error);
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
      console.log(`[HelcimCard] Amount changed from ${oldAmount} to ${newAmount} cents, re-initializing...`);
      initializePayment();
    }
  },
);

onUnmounted(() => {
  console.log('[HelcimCard] Component unmounting - cleaning up...');

  // Clean up event listeners
  if ((window as any)._helcimMessageHandler) {
    window.removeEventListener('message', (window as any)._helcimMessageHandler);
    delete (window as any)._helcimMessageHandler;
  }

  // Remove iframe and overlays if still present
  removeHelcimIframe();
});
</script>

<template>
  <div class="helcim-payment-container">
    <!-- Error Display -->
    <div v-if="paymentError" class="mb-4">
      <!-- Card Decline - clear customer-facing message -->
      <div v-if="isCardDecline" class="p-4 bg-red-50 rounded-lg border border-red-200">
        <div class="flex items-start gap-3">
          <Icon name="ion:card" size="24" class="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <div class="font-medium text-red-800 mb-1">Card Declined</div>
            <p class="text-sm text-red-700">{{ paymentError }}</p>
          </div>
        </div>
      </div>

      <!-- Technical / Unexpected Error - with copy debug button -->
      <div v-else class="p-4 bg-orange-50 rounded-lg border border-orange-200">
        <div class="flex items-start gap-3">
          <Icon name="ion:warning" size="24" class="text-orange-500 mt-0.5 flex-shrink-0" />
          <div class="flex-1">
            <div class="font-medium text-orange-800 mb-1">Payment Error</div>
            <p class="text-sm text-orange-700 mb-3">{{ paymentError }}</p>
            <p class="text-xs text-orange-600 mb-2">
              If this keeps happening, please copy the error details below and email them to
              <a href="mailto:support@proskatersplace.ca" class="underline font-medium">support@proskatersplace.ca</a>
            </p>
            <button
              @click="copyDebugInfo"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              :class="
                debugLogsCopied
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-white text-orange-700 border border-orange-300 hover:bg-orange-100'
              ">
              <Icon :name="debugLogsCopied ? 'ion:checkmark-circle' : 'ion:copy'" size="14" />
              {{ debugLogsCopied ? 'Copied!' : 'Copy Error Details' }}
            </button>
          </div>
        </div>
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
      <div class="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
        <Icon name="ion:checkmark-circle" size="24" class="text-green-600" />
        <div>
          <div class="font-medium text-green-800">Payment Successful</div>
          <div class="text-sm text-green-600">Transaction ID: {{ transactionData?.data?.transactionId }}</div>
        </div>
      </div>
    </div>

    <!-- Ready to Pay State -->
    <div v-else class="payment-ready">
      <div class="payment-info mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-blue-800">Secure Payment</div>
            <div class="text-sm text-blue-600">Amount: {{ currency }} ${{ displayAmount }}</div>
          </div>
          <Icon name="ion:shield-checkmark" size="24" class="text-blue-600" />
        </div>
      </div>

      <button @click="handleCompleteCheckout" class="helcim-pay-button w-full" :disabled="isInitializing || !checkoutToken">
        <Icon name="ion:card" size="20" class="mr-2" />
        Complete Purchase
      </button>

      <div class="payment-security mt-3 text-center">
        <div class="text-xs text-gray-500 flex items-center justify-center gap-1">
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
