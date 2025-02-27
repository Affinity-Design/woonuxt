<script setup lang="ts">
import { ref, computed, onBeforeMount } from "vue";

const { t } = useI18n();
const { query } = useRoute();
const { cart, isUpdatingCart, paymentGateways } = useCart();
const { customer, viewer } = useAuth();
const { orderInput, isProcessingOrder, proccessCheckout } = useCheckout();
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
const stripeCardRef = ref(null);

onBeforeMount(() => {
  if (query.cancel_order) window.close();
});

// Handle Stripe payment
const processStripePayment = async () => {
  try {
    // Get Stripe instance from the card component
    const stripeInstance = stripeCardRef.value?.getStripe();
    const cardElement = stripeCardRef.value?.getCardElement();

    if (!stripeInstance || !cardElement) {
      throw new Error("Stripe payment elements not initialized");
    }

    // Check if card is complete
    if (!stripeCardRef.value?.isCardComplete()) {
      throw new Error("Please complete your card details");
    }

    // Calculate amount in cents
    const amount = Math.round(parseFloat(cart.value.rawTotal) * 100);
    console.log("Amount to charge:", amount);

    // Create a payment method
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
      throw new Error(pmError.message);
    }

    // Create payment intent on server
    const response = await $fetch("/api/stripe", {
      method: "POST",
      body: {
        action: "create_payment_intent",
        amount,
        paymentMethodId: paymentMethod.id,
        metadata: {
          customer_email: customer.value.billing.email,
          cart_id: cart.value.id,
        },
      },
    });

    if (!response.success) {
      throw new Error(response.error.message || "Payment failed");
    }

    // Add payment info to order
    orderInput.value.metaData.push({
      key: "_stripe_payment_intent_id",
      value: response.paymentIntentId,
    });
    orderInput.value.transactionId = response.paymentIntentId;

    isPaid.value = true;
    console.log("Payment successful:", response.paymentIntentId);
    return true;
  } catch (error) {
    console.error("Stripe payment error:", error);
    paymentError.value = error.message || "Payment processing failed";
    return false;
  }
};

// Handle form submission
const payNow = async () => {
  // Currently only works for stripe
  paymentError.value = null;
  isSubmitting.value = true;
  buttonText.value = t("messages.general.processing");

  try {
    // Validate cart
    if (!cart.value || cart.value.isEmpty) {
      throw new Error(t("messages.shop.cartEmpty"));
    }
    // Process payment based on selected method
    const success = await processStripePayment();
    if (!success) {
      throw new Error(paymentError.value || "Payment failed");
    }
    // Send data to wordpress
    await proccessCheckout(success);
  } catch (error) {
    console.error("Checkout error:", error);
    paymentError.value =
      error.message || t("messages.shop.genericError", "An error occurred");
    isPaid.value = false;
    buttonText.value = t("messages.shop.placeOrder");
  } finally {
    isSubmitting.value = false;
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
const handleStripeReady = (event) => {
  // console.log("Stripe card ready:", event);
};

// Handle Stripe card errors
const handleStripeError = (error) => {
  paymentError.value = error;
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
        @submit.prevent="payNow"
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
            <template v-if="orderInput.createAccount">
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
                <label for="email">{{ $t("messages.account.password") }}</label>
                <PasswordInput
                  id="password"
                  class="my-2"
                  v-model="orderInput.password"
                  placeholder="••••••••••"
                  :required="true"
                />
              </div>
            </template>
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
            <ShippingOptions
              :options="cart.availableShippingMethods[0].rates"
              :active-option="cart.chosenShippingMethods[0]"
            />
          </div>

          <!-- Payment methods section - updated with new Stripe component -->
          <div v-if="paymentGateways?.nodes.length" class="mt-2 col-span-full">
            <h2 class="mb-4 text-xl font-semibold">
              {{ $t("messages.billing.paymentOptions") }}
            </h2>
            <PaymentOptions
              v-model="orderInput.paymentMethod"
              class="mb-4"
              :paymentGateways
            />

            <!-- New Stripe card component -->
            <div class="mt-4">
              <h3 class="mb-2 text-md font-medium">Card Details</h3>
              <StripeCard
                ref="stripeCardRef"
                @ready="handleStripeReady"
                @error="handleStripeError"
              />
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

        <!-- Order summary section - unchanged -->
        <OrderSummary>
          <div
            v-if="hasPaymentError"
            class="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md"
          >
            {{ paymentError }}
          </div>

          <button
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
