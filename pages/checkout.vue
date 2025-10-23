<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, nextTick} from 'vue';

const {t} = useI18n();
const {query} = useRoute();
const {cart, isUpdatingCart, paymentGateways, refreshCart} = useCart();
const {customer, viewer} = useAuth();
const {orderInput, isProcessingOrder, processCheckout, updateShippingLocation} = useCheckout();

// Refs for managing checkout state
const buttonText = ref<string>(isProcessingOrder.value ? t('messages.general.processing') : t('messages.shop.checkoutButton'));
const isCheckoutDisabled = computed<boolean>(() => isProcessingOrder.value || isUpdatingCart.value);

const isInvalidEmail = ref<boolean>(false);
const isPaid = ref<boolean>(false);
const paymentError = ref<string | null>(null);
const isSubmitting = ref<boolean>(false);
const helcimCardRef = ref<any>(null);

// Helcim payment state
const helcimPaymentComplete = ref<boolean>(false);
const helcimTransactionData = ref<any>(null);
const isCreatingOrder = ref<boolean>(false);
const orderCreationMessage = ref<string>('');
const helcimModalClosed = ref<boolean>(false); // Track if user closed modal

// Watch for cart updates and preserve Helcim payment state
watch(
  () => cart.value,
  (newCart, oldCart) => {
    if (newCart && oldCart && helcimPaymentComplete.value) {
      console.log('[Checkout] Cart updated, preserving Helcim payment state');
      // Ensure payment method stays selected after cart updates
      nextTick(() => {
        if (orderInput.value.paymentMethod?.title?.includes('Helcim')) {
          console.log('[Checkout] Helcim payment method preserved after cart update');
        }
      });
    }
  },
  {deep: true},
);

// Turnstile integration for spam protection
const {generateToken, verifyToken, isEnabled: isTurnstileEnabled, error: turnstileError, turnstileToken, isVerified} = useTurnstile();

// Auto-generate Turnstile token when component mounts (if enabled)
onMounted(async () => {
  if (query.cancel_order) {
    window.close();
    return;
  }

  // Wait a bit for payment method auto-selection to complete
  // PaymentOptions component auto-selects first method on mount
  await new Promise(resolve => setTimeout(resolve, 500));

  // Initialize Turnstile widget on page load if enabled AND not using Helcim
  // Turnstile is only shown for non-Helcim payments
  if (isTurnstileEnabled.value && !shouldShowHelcimCard.value) {
    try {
      // Wait for DOM to be fully ready
      await nextTick();

      // Wait for Turnstile script to load before rendering widget
      const waitForTurnstile = () => {
        return new Promise<void>((resolve) => {
          if (typeof window !== 'undefined' && window.turnstile) {
            resolve();
            return;
          }

          // Poll for script to load (max 10 seconds)
          let attempts = 0;
          const maxAttempts = 50; // 50 * 200ms = 10 seconds
          const checkInterval = setInterval(() => {
            attempts++;
            if (window.turnstile) {
              clearInterval(checkInterval);
              resolve();
            } else if (attempts >= maxAttempts) {
              clearInterval(checkInterval);
              console.error('❌ Turnstile script failed to load after 10 seconds');
              resolve(); // Resolve anyway to prevent hanging
            }
          }, 200);
        });
      };

      // Also wait for DOM container to exist
      const waitForContainer = () => {
        return new Promise<void>((resolve) => {
          const container = document.getElementById('turnstile-container');
          if (container) {
            resolve();
            return;
          }

          // Poll for container (max 5 seconds)
          let attempts = 0;
          const maxAttempts = 25; // 25 * 200ms = 5 seconds
          const checkInterval = setInterval(() => {
            attempts++;
            const container = document.getElementById('turnstile-container');
            if (container) {
              clearInterval(checkInterval);
              resolve();
            } else if (attempts >= maxAttempts) {
              clearInterval(checkInterval);
              console.error('❌ Turnstile container not found in DOM after 5 seconds');
              resolve(); // Resolve anyway to prevent hanging
            }
          }, 200);
        });
      };

      console.log('🔐 Waiting for Turnstile script and container...');
      await Promise.all([waitForTurnstile(), waitForContainer()]);
      console.log('🔐 Turnstile ready, initializing widget...');
      await generateToken();
    } catch (error) {
      console.error('Failed to initialize Turnstile:', error);
    }
  } else {
    console.log('🔐 Turnstile initialization skipped:', {
      isTurnstileEnabled: isTurnstileEnabled.value,
      shouldShowHelcimCard: shouldShowHelcimCard.value,
      reason: shouldShowHelcimCard.value ? 'Using Helcim payment (Turnstile not needed)' : 'Turnstile disabled',
    });
  }
}); // Listen for Helcim modal close events to reset button state
const helcimModalCloseHandler = (event: MessageEvent) => {
  // Log ALL postMessage events to debug
  if (event.data?.eventName) {
    console.log('[Checkout] Received postMessage event:', {
      eventName: event.data.eventName,
      eventStatus: event.data.eventStatus,
      fullData: event.data,
    });
  }

  // Check for Helcim modal close event - the eventName contains the checkout token
  // So we check if it starts with 'helcim-pay-js-' and has status 'HIDE'
  if (event.data?.eventName?.startsWith('helcim-pay-js-') && event.data.eventStatus === 'HIDE') {
    console.log('[Checkout] ✅ Helcim modal was closed by user');
    console.log('[Checkout] Current state:', {
      isSubmitting: isSubmitting.value,
      helcimPaymentComplete: helcimPaymentComplete.value,
      paymentMethodId: orderInput.value.paymentMethod?.id,
    });

    // Set flag to stop payment waiting loop
    helcimModalClosed.value = true;
    console.log('[Checkout] Set helcimModalClosed flag to TRUE');

    // ALWAYS reset button state when modal closes without payment completion
    // This ensures the button is clickable for retry
    if (!helcimPaymentComplete.value) {
      console.log('[Checkout] Resetting button state after modal close');
      isSubmitting.value = false;
      buttonText.value = t('messages.shop.placeOrder');
      paymentError.value = null; // Clear any errors to allow retry
    }

    console.log('[Checkout] After modal close - isSubmitting:', isSubmitting.value);
  }
};

// Register event listener at component level
if (typeof window !== 'undefined') {
  window.addEventListener('message', helcimModalCloseHandler);
}

// Cleanup on unmount
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('message', helcimModalCloseHandler);
  }
});

// Handle form submission
const payNow = async () => {
  // Prevent multiple simultaneous submissions
  if (isSubmitting.value) {
    console.log('[payNow] Already processing, ignoring duplicate call');
    return;
  }

  paymentError.value = null;
  isSubmitting.value = true;
  buttonText.value = t('messages.general.processing');

  try {
    // Step 1: Verify Turnstile token if enabled (token already generated by user clicking checkbox)
    if (isTurnstileEnabled.value) {
      console.log('🔐 Verifying Turnstile token for spam protection...');

      // Check if token exists (user should have clicked checkbox)
      if (!turnstileToken.value) {
        console.error('❌ No Turnstile token found - user must complete security check');
        throw new Error('Please complete the security verification checkbox');
      }

      buttonText.value = 'Verifying security...';
      const isValidToken = await verifyToken(turnstileToken.value);

      if (!isValidToken) {
        console.error('❌ Turnstile token verification failed on server');
        throw new Error('Security verification failed. Please try again.');
      }

      console.log('✅ Turnstile verification successful');
      console.log('🔐 Turnstile token verified, proceeding with order submission');
      buttonText.value = t('messages.general.processing');
    } else {
      console.log('⚠️ Turnstile is disabled - skipping security verification');
    }
    // Validate cart
    if (!cart.value || cart.value.isEmpty) {
      throw new Error(t('messages.shop.cartEmpty'));
    }

    // Check if billing phone number is present - REQUIRED FOR ALL PAYMENT METHODS
    if (!customer.value?.billing?.phone) {
      paymentError.value = 'Billing phone number is required.';
      console.error('[payNow] Billing phone number is missing.');
      throw new Error(paymentError.value);
    }

    console.log('[payNow] Starting checkout process. Cart items:', cart.value.contents?.nodes?.length);

    // Process payment based on method
    let success = false;
    const paymentMethodId = orderInput.value.paymentMethod?.id || '';

    console.log('[payNow] Processing payment with method:', paymentMethodId);

    if (paymentMethodId === 'cod' && orderInput.value.paymentMethod?.title?.includes('Helcim')) {
      console.log('[payNow] Processing Custom Helcim payment via COD backend');

      if (helcimPaymentComplete.value) {
        success = true;
        console.log('[payNow] Helcim payment already completed');
      } else {
        // Reset modal closed flag at start of payment
        helcimModalClosed.value = false;

        // Trigger Helcim payment process
        if (helcimCardRef.value?.processPayment) {
          console.log('[payNow] Triggering Helcim payment...');
          helcimCardRef.value.processPayment();

          // Wait for payment completion (with timeout)
          success = await new Promise((resolve) => {
            let resolved = false;

            const checkPayment = () => {
              if (resolved) return;

              // Check if user closed modal
              if (helcimModalClosed.value) {
                resolved = true;
                console.log('[payNow] User closed modal - stopping payment check');
                resolve(false);
                return;
              }

              if (helcimPaymentComplete.value) {
                resolved = true;
                resolve(true);
              } else if (paymentError.value) {
                resolved = true;
                resolve(false);
              } else {
                setTimeout(checkPayment, 500);
              }
            };
            checkPayment();

            // Timeout after 2 minutes (user probably closed modal)
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                console.log('[payNow] Payment timeout - user may have closed modal');
                paymentError.value = 'Payment was not completed. Please try again.';
                resolve(false);
              }
            }, 120000); // 2 minutes
          });

          // If modal was closed, don't treat it as an error
          if (helcimModalClosed.value && !success) {
            console.log('[payNow] Modal closed by user - not throwing error');
            isSubmitting.value = false;
            buttonText.value = t('messages.shop.placeOrder');
            return; // Exit payNow without throwing error
          }
        } else {
          throw new Error('Helcim payment component not ready');
        }
      }
    } else {
      // For other payment methods (like COD), assume success
      success = true;
      console.log('[payNow] Using non-card payment method:', paymentMethodId);
    }

    if (!success) {
      console.log('[payNow] Payment failed:', paymentError.value);
      throw new Error(paymentError.value || 'Payment failed');
    }

    console.log('[payNow] Payment successful, completing order...');

    // Complete checkout only if payment succeeded
    const checkoutResult = await processCheckout(success);
    if (!checkoutResult?.success) {
      console.log('[payNow] Order completion failed:', checkoutResult?.errorMessage);
      paymentError.value = checkoutResult?.errorMessage || 'Order completion failed after payment';
      throw new Error(paymentError.value || 'Order completion failed after payment');
    }

    console.log('[payNow] Checkout completed successfully');
  } catch (error: any) {
    console.error('Checkout error:', error);
    paymentError.value = error.message || t('messages.shop.genericError', 'An error occurred');
    isPaid.value = false;
    buttonText.value = t('messages.shop.placeOrder');
  } finally {
    isSubmitting.value = false;
    if (!paymentError.value) {
      buttonText.value = t('messages.shop.placeOrder');
    }
  }
};

// Check for email validity
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
const checkEmailOnBlur = (email?: string | null): void => {
  if (email) isInvalidEmail.value = !emailRegex.test(email);
};
const checkEmailOnInput = (email?: string | null): void => {
  if (email && isInvalidEmail.value) isInvalidEmail.value = !emailRegex.test(email);
};

// Helcim payment event handlers
const handleHelcimReady = (tokens?: any) => {
  console.log('[Checkout] Helcim payment ready', tokens);
};

const handleHelcimError = (error: any) => {
  console.error('[Checkout] Helcim payment error:', error);
  paymentError.value = error;
};

const handleHelcimSuccess = async (transactionData: any) => {
  console.log('[Checkout] Helcim payment successful:', transactionData);

  // Prevent double processing
  if (helcimPaymentComplete.value) {
    console.log('[Checkout] Helcim payment already processed, ignoring duplicate success event');
    return;
  }

  helcimPaymentComplete.value = true;
  helcimTransactionData.value = transactionData;

  // Add transaction metadata to order
  const actualTransactionId = transactionData?.data?.data?.transactionId || transactionData?.data?.transactionId;
  if (actualTransactionId) {
    orderInput.value.metaData.push({
      key: '_helcim_transaction_id',
      value: actualTransactionId,
    });
    orderInput.value.transactionId = actualTransactionId;
    console.log('[Checkout] Set transaction ID:', actualTransactionId);
  }

  // Set payment as completed
  isPaid.value = true;
  paymentError.value = null;

  console.log('[Checkout] Helcim payment state updated successfully');

  // Show loading state for order creation
  isCreatingOrder.value = true;
  orderCreationMessage.value = '✅ Payment successful! Creating your order...';

  // Trigger order creation
  console.log('[Checkout] Triggering payNow() after successful Helcim payment to create order');

  try {
    await payNow();
    // Loading state will be cleared on redirect to success page
  } catch (error: any) {
    console.error('[Checkout] Error during order creation after Helcim payment:', error);
    paymentError.value = error.message || 'Order creation failed after successful payment';
    isCreatingOrder.value = false;
    orderCreationMessage.value = '';
  }
};

const handleHelcimFailed = (error: any) => {
  console.error('[Checkout] Helcim payment failed:', error);
  helcimPaymentComplete.value = false;
  isPaid.value = false;
  paymentError.value = typeof error === 'string' ? error : 'Payment failed';
};

const handleHelcimComplete = (result: any) => {
  console.log('[Checkout] Helcim payment completed:', result);

  if (result.success) {
    handleHelcimSuccess(result.transactionData);
  } else {
    handleHelcimFailed(result.error);
  }
};

const hasPaymentError = computed(() => paymentError.value && !isSubmitting.value);

// Computed property for Helcim amount that includes tax and is reactive
const helcimAmount = computed(() => {
  if (!cart.value?.total) return 0;

  console.log(`[DEBUG Checkout] Raw cart values:`, {
    cartTotal: cart.value.total,
    cartRawTotal: cart.value.rawTotal,
    cartSubtotal: cart.value.subtotal,
    cartTotalTax: cart.value.totalTax,
  });

  // Parse the total amount string (e.g., "$2.24 CAD" -> 2.24)
  const totalStr = cart.value.total.replace(/[^\d.-]/g, '');
  const totalInDollars = parseFloat(totalStr) || 0;

  console.log(`[DEBUG Checkout] Helcim amount calculation:`, {
    originalString: cart.value.total,
    cleanedString: totalStr,
    parsedDollars: totalInDollars,
    sendingToHelcimComponent: totalInDollars,
  });

  return totalInDollars;
});

// Computed to show Helcim card even during cart updates when payment method might be temporarily cleared
const shouldShowHelcimCard = computed(() => {
  // Show if currently selected method is Helcim
  const isCurrentlyHelcim = orderInput.value.paymentMethod?.id === 'cod' && orderInput.value.paymentMethod?.title?.includes('Helcim');

  // Also show if we have a completed Helcim payment (prevents disappearing during cart updates)
  const hasHelcimPayment = helcimPaymentComplete.value || helcimTransactionData.value;

  // Keep showing if user just closed modal (so they can try again)
  const userClosedModal = helcimModalClosed.value && !helcimPaymentComplete.value;

  console.log('[shouldShowHelcimCard] Evaluation:', {
    isCurrentlyHelcim,
    hasHelcimPayment,
    userClosedModal,
    paymentMethodId: orderInput.value.paymentMethod?.id,
    paymentMethodTitle: orderInput.value.paymentMethod?.title,
    helcimModalClosed: helcimModalClosed.value,
    helcimPaymentComplete: helcimPaymentComplete.value,
    result: isCurrentlyHelcim || hasHelcimPayment || userClosedModal,
  });

  return isCurrentlyHelcim || hasHelcimPayment || userClosedModal;
});
useSeoMeta({
  title: t('messages.shop.checkout'),
});
</script>

<template>
  <div class="flex flex-col min-h-[600px] relative">
    <!-- Order Creation Loading Overlay -->
    <Transition name="fade">
      <div v-if="isCreatingOrder" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="backdrop-filter: blur(4px)">
        <div class="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4">
          <div class="flex flex-col items-center text-center">
            <LoadingIcon color="#059669" size="64" class="mb-4" />
            <h3 class="text-2xl font-bold text-gray-800 mb-2">Processing Your Order</h3>
            <p class="text-gray-600 mb-4">{{ orderCreationMessage }}</p>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <Icon name="ion:checkmark-circle" size="20" class="text-green-600" />
              <span>Payment successful</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500 mt-2">
              <LoadingIcon color="#6B7280" size="16" />
              <span>Creating order...</span>
            </div>
            <p class="text-xs text-gray-400 mt-4">Please wait, do not close this page</p>
          </div>
        </div>
      </div>
    </Transition>

    <template v-if="cart && customer">
      <div v-if="cart.isEmpty" class="flex flex-col items-center justify-center flex-1 mb-12">
        <!-- Empty cart content - unchanged -->
        <Icon name="ion:cart-outline" size="156" class="opacity-25 mb-5" />
        <h2 class="text-2xl font-bold mb-2">
          {{ $t('messages.shop.cartEmpty') }}
        </h2>
        <span class="text-gray-400 mb-4">{{ $t('messages.shop.addProductsInYourCart') }}</span>
        <NuxtLink
          to="/products"
          class="flex items-center justify-center gap-3 p-2 px-3 mt-4 font-semibold text-center text-white rounded-lg shadow-md bg-primary hover:bg-primary-dark">
          {{ $t('messages.shop.browseOurProducts') }}
        </NuxtLink>
      </div>

      <form v-else class="container flex flex-wrap items-start gap-8 my-16 justify-evenly lg:gap-20" @submit.prevent="payNow">
        <div class="grid w-full max-w-2xl gap-8 checkout-form md:flex-1">
          <!-- Customer details section -->
          <div v-if="!viewer && customer.billing">
            <h2 class="w-full mb-2 text-2xl font-semibold leading-none">Contact Information</h2>
            <p class="mt-1 text-sm text-gray-500">
              Already have an account?
              <a href="/my-account" class="text-primary text-semibold">Log in</a>.
            </p>
            <div class="w-full mt-4">
              <label for="email">{{ $t('messages.billing.email') }}</label>
              <input
                v-model="customer.billing.email"
                placeholder="johndoe@email.com"
                autocomplete="email"
                type="email"
                name="email"
                :class="{'has-error': isInvalidEmail}"
                @blur="checkEmailOnBlur(customer.billing.email)"
                @input="checkEmailOnInput(customer.billing.email)"
                required />
              <Transition name="scale-y" mode="out-in">
                <div v-if="isInvalidEmail" class="mt-1 text-sm text-red-500">Invalid email address</div>
              </Transition>
            </div>
            <!-- Account creation section -->
            <div v-if="orderInput.createAccount">
              <div class="w-full mt-4">
                <label for="username">{{ $t('messages.account.username') }}</label>
                <input v-model="orderInput.username" placeholder="johndoe" autocomplete="username" type="text" name="username" required />
              </div>
              <div class="w-full my-2" v-if="orderInput.createAccount">
                <label for="password">{{ $t('messages.account.password') }}</label>
                <PasswordInput id="password" class="my-2" v-model="orderInput.password" placeholder="••••••••••" :required="true" />
              </div>
            </div>
            <!-- Disabled create account due to turnstyle issues on checkout -->
            <!-- <div v-if="!viewer" class="flex items-center gap-2 my-2">
              <label for="creat-account">Create an account?</label>
              <input
                id="creat-account"
                v-model="orderInput.createAccount"
                type="checkbox"
                name="creat-account"
              />
            </div> -->
          </div>

          <!-- Billing details section -->
          <div>
            <h2 class="w-full mb-3 text-2xl font-semibold">
              {{ $t('messages.billing.billingDetails') }}
            </h2>
            <BillingDetails v-model="customer.billing" />
          </div>

          <!-- Ship to different address section -->
          <label v-if="cart.availableShippingMethods.length > 0" for="shipToDifferentAddress" class="flex items-center gap-2">
            <span>{{ $t('messages.billing.differentAddress') }}</span>
            <input id="shipToDifferentAddress" v-model="orderInput.shipToDifferentAddress" type="checkbox" name="shipToDifferentAddress" />
          </label>

          <!-- Shipping details section -->
          <Transition name="scale-y" mode="out-in">
            <div v-if="orderInput.shipToDifferentAddress">
              <h2 class="mb-4 text-xl font-semibold">
                {{ $t('messages.general.shippingDetails') }}
              </h2>
              <ShippingDetails v-model="customer.shipping" />
            </div>
          </Transition>

          <!-- Shipping methods section -->
          <div v-if="cart.availableShippingMethods.length">
            <h3 class="mb-4 text-xl font-semibold">
              {{ $t('messages.general.shippingSelect') }}
            </h3>
            <ShippingOptions
              :options="cart?.availableShippingMethods?.[0]?.rates || []"
              :active-option="cart?.chosenShippingMethods?.[0] || ''"
              @shipping-changed="refreshCart" />
          </div>

          <!-- Payment methods section -->
          <div v-if="paymentGateways?.nodes.length" class="mt-2 col-span-full">
            <h2 class="mb-4 text-xl font-semibold">
              {{ $t('messages.billing.paymentOptions') }}
            </h2>
            <PaymentOptions v-model="orderInput.paymentMethod" class="mb-4" :paymentGateways />

            <!-- Other payment methods info -->
            <div
              v-if="orderInput.paymentMethod?.id && !(orderInput.paymentMethod?.id === 'cod' && orderInput.paymentMethod?.title?.includes('Helcim'))"
              class="mt-4">
              <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div class="flex items-center gap-3">
                  <Icon name="ion:information-circle" size="20" class="text-blue-600" />
                  <div>
                    <div class="font-medium text-gray-800">
                      {{ orderInput.paymentMethod.title }}
                    </div>
                    <div v-if="orderInput.paymentMethod.description" class="text-sm text-gray-600 mt-1" v-html="orderInput.paymentMethod.description"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order note section -->
          <div>
            <h2 class="mb-4 text-xl font-semibold">{{ $t('messages.shop.orderNote') }} ({{ $t('messages.general.optional') }})</h2>
            <textarea
              id="order-note"
              v-model="orderInput.customerNote"
              name="order-note"
              class="w-full min-h-[100px]"
              rows="4"
              :placeholder="$t('messages.shop.orderNotePlaceholder')"></textarea>
          </div>
        </div>

        <!-- Order summary section -->
        <OrderSummary>
          <div v-if="hasPaymentError" class="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {{ paymentError }}
          </div>

          <!-- Helcim Card Component in Order Summary -->
          <div v-if="shouldShowHelcimCard" class="mt-4">
            <HelcimCard
              ref="helcimCardRef"
              :amount="helcimAmount"
              currency="CAD"
              @ready="handleHelcimReady"
              @error="handleHelcimError"
              @payment-success="handleHelcimSuccess"
              @payment-failed="handleHelcimFailed"
              @payment-complete="handleHelcimComplete" />
          </div>

          <!-- Turnstile security verification - visible widget (shown for non-Helcim payments) -->
          <div v-if="isTurnstileEnabled && !shouldShowHelcimCard" class="mt-4 mb-4">
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div class="flex items-start gap-3 mb-3">
                <Icon name="ion:shield-checkmark" size="20" class="text-green-600 mt-1" />
                <div>
                  <div class="font-medium text-gray-800 text-sm">Security Verification</div>
                  <div class="text-xs text-gray-600 mt-1">Please verify you're human to complete your order</div>
                </div>
              </div>
              <!-- Visible Turnstile widget container -->
              <div id="turnstile-container" class="turnstile-checkout-widget"></div>
              <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
                {{ turnstileError }}
              </div>
            </div>
          </div>

          <!-- Standard checkout button - shown for all non-Helcim payments -->
          <button
            v-if="!shouldShowHelcimCard"
            type="submit"
            class="flex items-center justify-center w-full gap-3 p-3 mt-4 font-semibold text-center text-white rounded-lg shadow-md bg-primary hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-400"
            :disabled="isCheckoutDisabled || isSubmitting">
            {{ buttonText }}
            <LoadingIcon v-if="isProcessingOrder || isSubmitting" color="#fff" size="18" />
          </button>
        </OrderSummary>
      </form>
    </template>
    <LoadingIcon v-else class="m-auto" />
  </div>
</template>

<style lang="postcss">
/* Turnstile widget in checkout - visible inline widget */
.turnstile-checkout-widget {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 65px;
  margin: 0 auto;
}

/* Ensure Turnstile iframe is centered and properly sized */
.turnstile-checkout-widget iframe {
  margin: 0 auto;
  display: block;
}

.checkout-form input[type='text'],
.checkout-form input[type='email'],
.checkout-form input[type='tel'],
.checkout-form input[type='password'],
.checkout-form textarea,
.checkout-form select {
  @apply bg-white border rounded-md outline-none border-gray-300 shadow-sm w-full py-2 px-4;
}

.checkout-form input.has-error,
.checkout-form textarea.has-error {
  @apply border-red-500;
}

.checkout-form label {
  @apply my-1.5 text-xs text-gray-600 uppercase;
}

/* Fade transition for loading overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
