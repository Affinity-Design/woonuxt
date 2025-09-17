<script setup lang="ts">
import { ref, computed, onBeforeMount } from "vue";

const { t } = useI18n();
const { query } = useRoute();
const { cart, isUpdatingCart, paymentGateways, refreshCart } = useCart(); // Add refreshCart here
const { customer, viewer } = useAuth();
const {
  orderInput,
  isProcessingOrder,
  validateOrderPrePayment,
  processCheckout,
  updateShippingLocation,
  setOrderAttribution,
  processHelcimPayment,
} = useCheckout();
const runtimeConfig = useRuntimeConfig();

// Refs for managing checkout state
const buttonText = ref<string>(
  isProcessingOrder.value
    ? t("messages.general.processing")
    : t("messages.shop.checkoutButton")
);
const isCheckoutDisabled = computed<boolean>(
  () => isProcessingOrder.value || isUpdatingCart.value
);

const isInvalidEmail = ref<boolean>(false);
const isPaid = ref<boolean>(false);
const paymentError = ref<string | null>(null);
const isSubmitting = ref<boolean>(false);
const stripeCardRef = ref<any>(null);
const helcimCardRef = ref<any>(null);

// Helcim payment state
const helcimPaymentComplete = ref<boolean>(false);
const helcimTransactionData = ref<any>(null);

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
  const totalStr = cart.value.total.replace(/[^\d.-]/g, "");
  const totalInDollars = parseFloat(totalStr) || 0;

  console.log(`[DEBUG Checkout] Helcim amount calculation:`, {
    originalString: cart.value.total,
    cleanedString: totalStr,
    parsedDollars: totalInDollars,
    sendingToHelcimComponent: totalInDollars,
  });

  return totalInDollars;
});

onBeforeMount(() => {
  if (query.cancel_order) window.close();

  // Set additional order attribution data when checkout page loads
  setOrderAttribution({
    _wc_order_attribution_session_entry: window.location.href,
    _wc_order_attribution_session_start_time: new Date().toISOString(),
  });
});

// Handle Stripe payment
const processStripePayment = async () => {
  console.log("[processStripePayment] Starting Stripe payment process");
  try {
    // Get Stripe instance from the card component
    const stripeInstance = stripeCardRef.value?.getStripe?.();
    const cardElement = stripeCardRef.value?.getCardElement?.();

    console.log(
      "[processStripePayment] Stripe instance:",
      stripeInstance ? "Available" : "Not available"
    );
    console.log(
      "[processStripePayment] Card element:",
      cardElement ? "Available" : "Not available"
    );

    if (!stripeInstance || !cardElement) {
      console.error("[processStripePayment] Stripe elements not initialized");
      throw new Error("Stripe payment elements not initialized");
    }

    // Check if card is complete
    const isCardComplete = stripeCardRef.value?.isCardComplete?.();
    console.log("[processStripePayment] Is card complete:", isCardComplete);
    if (!isCardComplete) {
      console.error("[processStripePayment] Card details incomplete");
      throw new Error("Please complete your card details");
    }

    // Calculate amount in cents
    console.log("[processStripePayment] Raw cart total:", cart.value.rawTotal);
    const rawTotal = parseFloat(cart.value.rawTotal);
    if (isNaN(rawTotal)) {
      console.error(
        "[processStripePayment] Invalid cart total:",
        cart.value.rawTotal
      );
      throw new Error("Invalid cart total for payment");
    }

    const amount = Math.round(rawTotal * 100);
    console.log("[processStripePayment] Amount to charge (cents):", amount);

    // Create a payment method
    console.log(
      "[processStripePayment] Creating payment method with billing details..."
    );
    const { paymentMethod, error: pmError } =
      await stripeInstance.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: {
          name: `${customer.value.billing.firstName} ${customer.value.billing.lastName}`,
          email: customer.value.billing.email,
          phone: customer.value.billing.phone,
          address: {
            line1: customer.value.billing.address1,
            line2: customer.value.billing.address2,
            city: customer.value.billing.city,
            state: customer.value.billing.state,
            postal_code: customer.value.billing.postcode,
            country: customer.value.billing.country,
          },
        },
      });

    if (pmError) {
      console.error(
        "[processStripePayment] Stripe payment method error:",
        pmError
      );
      throw new Error(pmError.message);
    }

    console.log(
      "[processStripePayment] Payment method created successfully:",
      paymentMethod.id
    );

    // Create payment intent on server
    console.log("[processStripePayment] Creating payment intent on server...");
    const requestBody = {
      action: "create_payment_intent",
      amount,
      paymentMethodId: paymentMethod.id,
      metadata: {
        customer_email: customer.value.billing.email,
        cart_id: cart.value.id,
      },
    };
    console.log("[processStripePayment] Request body:", requestBody);

    let response;
    try {
      response = await $fetch("/api/stripe", {
        method: "POST",
        body: requestBody,
      });
      console.log("[processStripePayment] Server response:", response);
    } catch (fetchError: any) {
      console.error("[processStripePayment] Fetch error:", fetchError);
      console.error(
        "[processStripePayment] Fetch error data:",
        fetchError.data
      );
      throw new Error(
        `Server request failed: ${fetchError.message || "Unknown server error"}`
      );
    }

    if (!response.success) {
      console.error(
        "[processStripePayment] Server returned error:",
        (response as any).error
      );
      throw new Error(
        (response as any).error?.message || "Payment failed on server"
      );
    }

    // Add payment info to order
    console.log("[processStripePayment] Adding payment metadata to order...");
    orderInput.value.metaData.push({
      key: "_stripe_payment_intent_id",
      value: (response as any).paymentIntentId,
    });
    orderInput.value.transactionId = (response as any).paymentIntentId;

    isPaid.value = true;
    console.log(
      "[processStripePayment] Payment successful:",
      (response as any).paymentIntentId
    );
    return true;
  } catch (error: any) {
    console.error("[processStripePayment] CATCH BLOCK - Error object:", error);
    console.error(
      "[processStripePayment] CATCH BLOCK - Error message:",
      error.message
    );
    console.error(
      "[processStripePayment] CATCH BLOCK - Error stack:",
      error.stack
    );

    paymentError.value = error.message || "Payment processing failed";
    console.error(
      "[processStripePayment] Set paymentError.value to:",
      paymentError.value
    );
    return false;
  }
};

// Debug function to inspect Stripe state
const debugStripeState = () => {
  console.log("[DEBUG] Stripe card ref:", stripeCardRef.value);
  console.log(
    "[DEBUG] Stripe instance available:",
    stripeCardRef.value?.getStripe
      ? stripeCardRef.value.getStripe()
        ? "Yes"
        : "No"
      : "Method not available"
  );
  console.log(
    "[DEBUG] Card element available:",
    stripeCardRef.value?.getCardElement
      ? stripeCardRef.value.getCardElement()
        ? "Yes"
        : "No"
      : "Method not available"
  );
  console.log(
    "[DEBUG] Card complete:",
    stripeCardRef.value?.isCardComplete
      ? stripeCardRef.value.isCardComplete()
      : "Method not available"
  );
};

// New function to handle form submission with phone validation
const handleFormSubmit = async () => {
  paymentError.value = null; // Clear previous errors

  // Check if billing phone number is present
  if (!customer.value?.billing?.phone) {
    paymentError.value = "Billing phone number is required."; // Use direct string instead of translation
    console.error("[handleFormSubmit] Billing phone number is missing.");
    isSubmitting.value = false; // Ensure button is re-enabled if it was set to submitting
    buttonText.value = t("messages.shop.placeOrder"); // Reset button text
    return; // Stop execution
  }

  // If phone number is present, proceed with payNow
  await payNow();
};

// Handle form submission
const payNow = async () => {
  // paymentError.value = null; // Moved to handleFormSubmit
  isSubmitting.value = true;
  buttonText.value = t("messages.general.processing");

  try {
    // Validate cart
    if (!cart.value || cart.value.isEmpty) {
      throw new Error(t("messages.shop.cartEmpty"));
    }

    console.log(
      "[payNow] Starting checkout process. Cart items:",
      cart.value.contents?.nodes?.length
    );

    // Debug Stripe state before validation
    // debugStripeState();

    // STEP 1: Validate order details BEFORE payment
    const validationResult = await validateOrderPrePayment();

    if (!validationResult.success) {
      console.log("[payNow] Validation failed:", validationResult.errorMessage);
      paymentError.value = validationResult.errorMessage || "Validation failed";
      throw new Error(paymentError.value || "Validation failed");
    }
    console.log("[payNow] Validation passed, proceeding to payment");

    // STEP 2: Process payment only if validation succeeded
    let success = false;
    const paymentMethodId = orderInput.value.paymentMethod?.id || "";

    console.log("[payNow] Processing payment with method:", paymentMethodId);

    if (paymentMethodId === "helcimjs" || paymentMethodId === "helcim") {
      // For Helcim, payment is processed through the HelcimCard component
      // The success is determined by helcimPaymentComplete state
      if (helcimPaymentComplete.value) {
        success = true;
        console.log("[payNow] Helcim payment already completed");

        // WORKAROUND: Change payment method to COD for WordPress order creation
        // since WordPress doesn't recognize 'helcimjs' but payment is already processed
        console.log(
          "[payNow] Switching payment method from helcimjs to cod for WordPress compatibility"
        );
        orderInput.value.paymentMethod = {
          id: "cod",
          title: "Cash on Delivery (Paid via Helcim)",
          description: `Payment processed via Helcim. Transaction ID: ${helcimTransactionData.value?.data?.data?.transactionId || "N/A"}`,
        };
      } else {
        // Trigger Helcim payment process
        if (helcimCardRef.value?.processPayment) {
          console.log("[payNow] Triggering Helcim payment...");
          helcimCardRef.value.processPayment();

          // Wait for payment completion (with timeout)
          success = await new Promise((resolve) => {
            const checkPayment = () => {
              if (helcimPaymentComplete.value) {
                // Change payment method to COD after successful payment
                console.log(
                  "[payNow] Helcim payment completed, switching to COD for WordPress"
                );
                orderInput.value.paymentMethod = {
                  id: "cod",
                  title: "Cash on Delivery (Paid via Helcim)",
                  description: `Payment processed via Helcim. Transaction ID: ${helcimTransactionData.value?.data?.data?.transactionId || "N/A"}`,
                };
                resolve(true);
              } else if (paymentError.value) {
                resolve(false);
              } else {
                setTimeout(checkPayment, 500);
              }
            };
            checkPayment();

            // Timeout after 5 minutes
            setTimeout(() => resolve(false), 300000);
          });
        } else {
          throw new Error("Helcim payment component not ready");
        }
      }
    } else if (paymentMethodId === "fkwcs_stripe") {
      // Process Stripe payment
      success = await processStripePayment();
    } else {
      // For other payment methods (like COD), assume success
      success = true;
      console.log("[payNow] Using non-card payment method:", paymentMethodId);
    }

    if (!success) {
      console.log("[payNow] Payment failed:", paymentError.value);
      throw new Error(paymentError.value || "Payment failed");
    }

    console.log("[payNow] Payment successful, completing order...");

    // STEP 3: Complete checkout only if payment succeeded
    const checkoutResult = await processCheckout(success); // <- Change this from 'proccessCheckout' to 'processCheckout'
    if (!checkoutResult?.success) {
      console.log(
        "[payNow] Order completion failed:",
        checkoutResult?.errorMessage
      );
      paymentError.value =
        checkoutResult?.errorMessage || "Order completion failed after payment";
      throw new Error(
        paymentError.value || "Order completion failed after payment"
      );
    }

    console.log("[payNow] Checkout completed successfully");
  } catch (error: any) {
    console.error("Checkout error:", error);
    paymentError.value =
      error.message || t("messages.shop.genericError", "An error occurred");
    isPaid.value = false;
    buttonText.value = t("messages.shop.placeOrder");
  } finally {
    isSubmitting.value = false;
    // Reset buttonText only if there was no error that keeps it as "Processing"
    // or if the process completed successfully.
    // If an error occurred within payNow, paymentError will be set, and buttonText might be reset there.
    // If no error, it means success, so reset to default.
    // This part might need adjustment based on how you want the button text to behave on errors within payNow.
    if (!paymentError.value) {
      buttonText.value = t("messages.shop.placeOrder");
    }
  }
};

// Check for email validity
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
const checkEmailOnBlur = (email?: string | null): void => {
  if (email) isInvalidEmail.value = !emailRegex.test(email);
};
const checkEmailOnInput = (email?: string | null): void => {
  if (email && isInvalidEmail.value)
    isInvalidEmail.value = !emailRegex.test(email);
};

// Handle Stripe card ready state
const handleStripeReady = (event: any) => {
  // console.log("Stripe card ready:", event);
};

// Handle Stripe card errors
const handleStripeError = (error: any) => {
  paymentError.value = error;
};

// Helcim payment event handlers
const handleHelcimReady = () => {
  console.log("[Checkout] Helcim payment ready");
};

const handleHelcimError = (error: any) => {
  console.error("[Checkout] Helcim payment error:", error);
  paymentError.value = error;
};

const handleHelcimSuccess = (transactionData: any) => {
  console.log("[Checkout] Helcim payment successful:", transactionData);
  helcimPaymentComplete.value = true;
  helcimTransactionData.value = transactionData;

  // Add transaction metadata to order
  const actualTransactionId =
    transactionData?.data?.data?.transactionId ||
    transactionData?.data?.transactionId;
  if (actualTransactionId) {
    orderInput.value.metaData.push({
      key: "_helcim_transaction_id",
      value: actualTransactionId,
    });
    orderInput.value.transactionId = actualTransactionId;
    console.log("[Checkout] Set transaction ID:", actualTransactionId);
  }

  // Set payment as completed
  isPaid.value = true;
  paymentError.value = null;
};

const handleHelcimFailed = (error: any) => {
  console.error("[Checkout] Helcim payment failed:", error);
  helcimPaymentComplete.value = false;
  isPaid.value = false;
  paymentError.value = typeof error === "string" ? error : "Payment failed";
};

const handleHelcimComplete = (result: any) => {
  console.log("[Checkout] Helcim payment completed:", result);

  if (result.success) {
    handleHelcimSuccess(result.transactionData);
  } else {
    handleHelcimFailed(result.error);
  }
};

const handleHelcimCheckoutRequest = async () => {
  console.log(
    "[Checkout] Helcim checkout requested - triggering form submission"
  );

  // Reset any previous Helcim payment state
  helcimPaymentComplete.value = false;
  helcimTransactionData.value = null;

  // Trigger the form submission which will run validation and then call Helcim payment
  const form = document.querySelector("form");
  if (form) {
    const submitEvent = new Event("submit", {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(submitEvent);
  }
};

const hasPaymentError = computed(
  () => paymentError.value && !isSubmitting.value
);

useSeoMeta({
  title: t("messages.shop.checkout"),
});
</script>

<template>
  <div class="flex flex-col min-h-[600px]">
    <template v-if="cart && customer">
      <div
        v-if="cart.isEmpty"
        class="flex flex-col items-center justify-center flex-1 mb-12"
      >
        <!-- Empty cart content - unchanged -->
        <Icon name="ion:cart-outline" size="156" class="opacity-25 mb-5" />
        <h2 class="text-2xl font-bold mb-2">
          {{ $t("messages.shop.cartEmpty") }}
        </h2>
        <span class="text-gray-400 mb-4">{{
          $t("messages.shop.addProductsInYourCart")
        }}</span>
        <NuxtLink
          to="/products"
          class="flex items-center justify-center gap-3 p-2 px-3 mt-4 font-semibold text-center text-white rounded-lg shadow-md bg-primary hover:bg-primary-dark"
        >
          {{ $t("messages.shop.browseOurProducts") }}
        </NuxtLink>
      </div>

      <form
        v-else
        class="container flex flex-wrap items-start gap-8 my-16 justify-evenly lg:gap-20"
        @submit.prevent="handleFormSubmit"
      >
        <div class="grid w-full max-w-2xl gap-8 checkout-form md:flex-1">
          <!-- Customer details section - unchanged -->
          <div v-if="!viewer && customer.billing">
            <h2 class="w-full mb-2 text-2xl font-semibold leading-none">
              Contact Information
            </h2>
            <p class="mt-1 text-sm text-gray-500">
              Already have an account?
              <a href="/my-account" class="text-primary text-semibold">Log in</a
              >.
            </p>
            <div class="w-full mt-4">
              <label for="email">{{ $t("messages.billing.email") }}</label>
              <input
                v-model="customer.billing.email"
                placeholder="johndoe@email.com"
                autocomplete="email"
                type="email"
                name="email"
                :class="{ 'has-error': isInvalidEmail }"
                @blur="checkEmailOnBlur(customer.billing.email)"
                @input="checkEmailOnInput(customer.billing.email)"
                required
              />
              <Transition name="scale-y" mode="out-in">
                <div v-if="isInvalidEmail" class="mt-1 text-sm text-red-500">
                  Invalid email address
                </div>
              </Transition>
            </div>
            <!-- Account creation section - unchanged -->
            <div v-if="orderInput.createAccount">
              <div class="w-full mt-4">
                <label for="username">{{
                  $t("messages.account.username")
                }}</label>
                <input
                  v-model="orderInput.username"
                  placeholder="johndoe"
                  autocomplete="username"
                  type="text"
                  name="username"
                  required
                />
              </div>
              <div class="w-full my-2" v-if="orderInput.createAccount">
                <label for="password">{{
                  $t("messages.account.password")
                }}</label>
                <PasswordInput
                  id="password"
                  class="my-2"
                  v-model="orderInput.password"
                  placeholder="••••••••••"
                  :required="true"
                />
              </div>
            </div>
            <div v-if="!viewer" class="flex items-center gap-2 my-2">
              <label for="creat-account">Create an account?</label>
              <input
                id="creat-account"
                v-model="orderInput.createAccount"
                type="checkbox"
                name="creat-account"
              />
            </div>
          </div>

          <!-- Billing details section - unchanged -->
          <div>
            <h2 class="w-full mb-3 text-2xl font-semibold">
              {{ $t("messages.billing.billingDetails") }}
            </h2>
            <BillingDetails v-model="customer.billing" />
          </div>

          <!-- Ship to different address section - unchanged -->
          <label
            v-if="cart.availableShippingMethods.length > 0"
            for="shipToDifferentAddress"
            class="flex items-center gap-2"
          >
            <span>{{ $t("messages.billing.differentAddress") }}</span>
            <input
              id="shipToDifferentAddress"
              v-model="orderInput.shipToDifferentAddress"
              type="checkbox"
              name="shipToDifferentAddress"
            />
          </label>

          <!-- Shipping details section - unchanged -->
          <Transition name="scale-y" mode="out-in">
            <div v-if="orderInput.shipToDifferentAddress">
              <h2 class="mb-4 text-xl font-semibold">
                {{ $t("messages.general.shippingDetails") }}
              </h2>
              <ShippingDetails v-model="customer.shipping" />
            </div>
          </Transition>

          <!-- Shipping methods section - unchanged -->
          <div v-if="cart.availableShippingMethods.length">
            <h3 class="mb-4 text-xl font-semibold">
              {{ $t("messages.general.shippingSelect") }}
            </h3>
            <!-- Fix the ShippingOptions component -->
            <ShippingOptions
              :options="cart?.availableShippingMethods?.[0]?.rates || []"
              :active-option="cart?.chosenShippingMethods?.[0] || ''"
              @shipping-changed="refreshCart"
            />
          </div>

          <!-- Payment methods section -->
          <div v-if="paymentGateways?.nodes.length" class="mt-2 col-span-full">
            <h2 class="mb-4 text-xl font-semibold">
              {{ $t("messages.billing.paymentOptions") }}
            </h2>
            <PaymentOptions
              v-model="orderInput.paymentMethod"
              class="mb-4"
              :paymentGateways
            />

            <!-- Helcim Card Component - Moved to OrderSummary -->
            <!-- <div v-if="orderInput.paymentMethod?.id === 'helcimjs' || orderInput.paymentMethod?.id === 'helcim'" class="mt-4">
              <h3 class="mb-2 text-md font-medium">Secure Payment</h3>
              <HelcimCard
                ref="helcimCardRef"
                :amount="Math.round(parseFloat(cart.rawTotal || '0') * 100)"
                currency="CAD"
                @ready="handleHelcimReady"
                @error="handleHelcimError"
                @payment-success="handleHelcimSuccess"
                @payment-failed="handleHelcimFailed"
                @payment-complete="handleHelcimComplete"
              />
            </div> -->

            <!-- Stripe Card Component -->
            <div
              v-if="orderInput.paymentMethod?.id === 'fkwcs_stripe'"
              class="mt-4"
            >
              <h3 class="mb-2 text-md font-medium">Card Details</h3>
              <StripeCard
                ref="stripeCardRef"
                @ready="handleStripeReady"
                @error="handleStripeError"
              />
            </div>

            <!-- Other payment methods info -->
            <div
              v-else-if="
                orderInput.paymentMethod?.id &&
                orderInput.paymentMethod?.id !== 'helcimjs' &&
                orderInput.paymentMethod?.id !== 'helcim'
              "
              class="mt-4"
            >
              <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div class="flex items-center gap-3">
                  <Icon
                    name="ion:information-circle"
                    size="20"
                    class="text-blue-600"
                  />
                  <div>
                    <div class="font-medium text-gray-800">
                      {{ orderInput.paymentMethod.title }}
                    </div>
                    <div
                      v-if="orderInput.paymentMethod.description"
                      class="text-sm text-gray-600 mt-1"
                      v-html="orderInput.paymentMethod.description"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order note section - unchanged -->
          <div>
            <h2 class="mb-4 text-xl font-semibold">
              {{ $t("messages.shop.orderNote") }} ({{
                $t("messages.general.optional")
              }})
            </h2>
            <textarea
              id="order-note"
              v-model="orderInput.customerNote"
              name="order-note"
              class="w-full min-h-[100px]"
              rows="4"
              :placeholder="$t('messages.shop.orderNotePlaceholder')"
            ></textarea>
          </div>
        </div>

        <!-- Order summary section -->
        <OrderSummary>
          <div
            v-if="hasPaymentError"
            class="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md"
          >
            {{ paymentError }}
          </div>

          <!-- Helcim Card Component in Order Summary -->
          <div
            v-if="
              orderInput.paymentMethod?.id === 'helcimjs' ||
              orderInput.paymentMethod?.id === 'helcim'
            "
            class="mt-4"
          >
            <HelcimCard
              ref="helcimCardRef"
              :amount="helcimAmount"
              currency="CAD"
              @ready="handleHelcimReady"
              @error="handleHelcimError"
              @payment-success="handleHelcimSuccess"
              @payment-failed="handleHelcimFailed"
              @payment-complete="handleHelcimComplete"
              @checkout-requested="handleHelcimCheckoutRequest"
            />
          </div>

          <!-- Standard checkout button - hidden when Helcim is selected -->
          <button
            v-else
            type="submit"
            class="flex items-center justify-center w-full gap-3 p-3 mt-4 font-semibold text-center text-white rounded-lg shadow-md bg-primary hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-400"
            :disabled="isCheckoutDisabled || isSubmitting"
          >
            {{ buttonText }}
            <LoadingIcon
              v-if="isProcessingOrder || isSubmitting"
              color="#fff"
              size="18"
            />
          </button>
        </OrderSummary>
      </form>
    </template>
    <LoadingIcon v-else class="m-auto" />
  </div>
</template>

<style lang="postcss">
.checkout-form input[type="text"],
.checkout-form input[type="email"],
.checkout-form input[type="tel"],
.checkout-form input[type="password"],
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
</style>
