<script setup lang="ts">
import { ref, computed, onBeforeMount, watch, nextTick } from "vue";

const { t } = useI18n();
const { query } = useRoute();
const { cart, isUpdatingCart, paymentGateways, refreshCart } = useCart();
const { customer, viewer } = useAuth();
const {
  orderInput,
  isProcessingOrder,
  processCheckout,
  updateShippingLocation,
} = useCheckout();

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
const helcimCardRef = ref<any>(null);

// Helcim payment state
const helcimPaymentComplete = ref<boolean>(false);
const helcimTransactionData = ref<any>(null);

// Watch for cart updates and preserve Helcim payment state
watch(
  () => cart.value,
  (newCart, oldCart) => {
    if (newCart && oldCart && helcimPaymentComplete.value) {
      console.log("[Checkout] Cart updated, preserving Helcim payment state");
      // Ensure payment method stays selected after cart updates
      nextTick(() => {
        if (orderInput.value.paymentMethod?.title?.includes("Helcim")) {
          console.log(
            "[Checkout] Helcim payment method preserved after cart update"
          );
        }
      });
    }
  },
  { deep: true }
);

onBeforeMount(() => {
  if (query.cancel_order) window.close();
});

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

// Handle form submission
const payNow = async () => {
  // Prevent multiple simultaneous submissions
  if (isSubmitting.value) {
    console.log("[payNow] Already processing, ignoring duplicate call");
    return;
  }

  paymentError.value = null;
  isSubmitting.value = true;
  buttonText.value = t("messages.general.processing");

  try {
    // Validate cart
    if (!cart.value || cart.value.isEmpty) {
      throw new Error(t("messages.shop.cartEmpty"));
    }

    // Check if billing phone number is present - REQUIRED FOR ALL PAYMENT METHODS
    if (!customer.value?.billing?.phone) {
      paymentError.value = "Billing phone number is required.";
      console.error("[payNow] Billing phone number is missing.");
      throw new Error(paymentError.value);
    }

    console.log(
      "[payNow] Starting checkout process. Cart items:",
      cart.value.contents?.nodes?.length
    );

    // Process payment based on method
    let success = false;
    const paymentMethodId = orderInput.value.paymentMethod?.id || "";

    console.log("[payNow] Processing payment with method:", paymentMethodId);

    if (
      paymentMethodId === "cod" &&
      orderInput.value.paymentMethod?.title?.includes("Helcim")
    ) {
      console.log("[payNow] Processing Custom Helcim payment via COD backend");

      if (helcimPaymentComplete.value) {
        success = true;
        console.log("[payNow] Helcim payment already completed");
      } else {
        // Trigger Helcim payment process
        if (helcimCardRef.value?.processPayment) {
          console.log("[payNow] Triggering Helcim payment...");
          helcimCardRef.value.processPayment();

          // Wait for payment completion (with timeout)
          success = await new Promise((resolve) => {
            const checkPayment = () => {
              if (helcimPaymentComplete.value) {
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

    // Complete checkout only if payment succeeded
    const checkoutResult = await processCheckout(success);
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

// Helcim payment event handlers
const handleHelcimReady = (tokens?: any) => {
  console.log("[Checkout] Helcim payment ready", tokens);
};

const handleHelcimError = (error: any) => {
  console.error("[Checkout] Helcim payment error:", error);
  paymentError.value = error;
};

const handleHelcimSuccess = async (transactionData: any) => {
  console.log("[Checkout] Helcim payment successful:", transactionData);

  // Prevent double processing
  if (helcimPaymentComplete.value) {
    console.log(
      "[Checkout] Helcim payment already processed, ignoring duplicate success event"
    );
    return;
  }

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

  console.log("[Checkout] Helcim payment state updated successfully");

  // Trigger order creation
  console.log(
    "[Checkout] Triggering payNow() after successful Helcim payment to create order"
  );

  try {
    await payNow();
  } catch (error: any) {
    console.error(
      "[Checkout] Error during order creation after Helcim payment:",
      error
    );
    paymentError.value =
      error.message || "Order creation failed after successful payment";
  }
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

const hasPaymentError = computed(
  () => paymentError.value && !isSubmitting.value
);

// Computed to show Helcim card even during cart updates when payment method might be temporarily cleared
const shouldShowHelcimCard = computed(() => {
  // Show if currently selected method is Helcim
  const isCurrentlyHelcim =
    orderInput.value.paymentMethod?.id === "cod" &&
    orderInput.value.paymentMethod?.title?.includes("Helcim");

  // Also show if we have a completed Helcim payment (prevents disappearing during cart updates)
  const hasHelcimPayment =
    helcimPaymentComplete.value || helcimTransactionData.value;

  return isCurrentlyHelcim || hasHelcimPayment;
});

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
        @submit.prevent="payNow"
      >
        <div class="grid w-full max-w-2xl gap-8 checkout-form md:flex-1">
          <!-- Customer details section -->
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
            <!-- Account creation section -->
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
              {{ $t("messages.billing.billingDetails") }}
            </h2>
            <BillingDetails v-model="customer.billing" />
          </div>

          <!-- Ship to different address section -->
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

          <!-- Shipping details section -->
          <Transition name="scale-y" mode="out-in">
            <div v-if="orderInput.shipToDifferentAddress">
              <h2 class="mb-4 text-xl font-semibold">
                {{ $t("messages.general.shippingDetails") }}
              </h2>
              <ShippingDetails v-model="customer.shipping" />
            </div>
          </Transition>

          <!-- Shipping methods section -->
          <div v-if="cart.availableShippingMethods.length">
            <h3 class="mb-4 text-xl font-semibold">
              {{ $t("messages.general.shippingSelect") }}
            </h3>
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

            <!-- Other payment methods info -->
            <div
              v-if="
                orderInput.paymentMethod?.id &&
                !(
                  orderInput.paymentMethod?.id === 'cod' &&
                  orderInput.paymentMethod?.title?.includes('Helcim')
                )
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

          <!-- Order note section -->
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
          <div v-if="shouldShowHelcimCard" class="mt-4">
            <HelcimCard
              ref="helcimCardRef"
              :amount="helcimAmount"
              currency="CAD"
              @ready="handleHelcimReady"
              @error="handleHelcimError"
              @payment-success="handleHelcimSuccess"
              @payment-failed="handleHelcimFailed"
              @payment-complete="handleHelcimComplete"
            />
          </div>

          <!-- Standard checkout button - shown for all non-Helcim payments -->
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
