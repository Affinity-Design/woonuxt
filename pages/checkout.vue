<script setup lang="ts">
import { loadStripe } from "@stripe/stripe-js";
import type {
  Stripe,
  StripeElements,
  CreateSourceData,
  StripeCardElement,
} from "@stripe/stripe-js";

interface PaymentError {
  message: string;
  code?: string;
  type?: string;
}

const { t } = useI18n();
const { query } = useRoute();
const { cart, isUpdatingCart, paymentGateways } = useCart();
const { customer, viewer } = useAuth();
const { orderInput, isProcessingOrder, proccessCheckout } = useCheckout();
const runtimeConfig = useRuntimeConfig();
const stripeKey = runtimeConfig.public?.STRIPE_PUBLISHABLE_KEY || null;
const stripeElementRef = ref(); // Add ref to StripeElement component
const cardElement = ref<any>(null);

const buttonText = ref<string>(
  isProcessingOrder.value
    ? t("messages.general.processing")
    : t("messages.shop.checkoutButton")
);
const isCheckoutDisabled = computed<boolean>(
  () =>
    isProcessingOrder.value ||
    isUpdatingCart.value ||
    !orderInput.value.paymentMethod
);

const isInvalidEmail = ref<boolean>(false);
const stripe: Stripe | null = stripeKey ? await loadStripe(stripeKey) : null;
const elements = ref();
const isPaid = ref<boolean>(false);
const paymentError = ref<string | null>(null);
const isSubmitting = ref<boolean>(false);

onBeforeMount(async () => {
  if (query.cancel_order) window.close();
});

const payNow = async () => {
  paymentError.value = null;
  isSubmitting.value = true;
  buttonText.value = t("messages.general.processing");

  try {
    // Validate cart
    if (!cart.value || cart.value.isEmpty) {
      throw new Error(t("messages.shop.cartEmpty"));
    }

    // Validate payment method
    if (!orderInput.value.paymentMethod) {
      throw new Error(
        t("messages.shop.selectPaymentMethod", "Please select a payment method")
      );
    }

    // Process Stripe Payment
    if (
      orderInput.value.paymentMethod.id === "stripe" &&
      stripe &&
      elements.value
    ) {
      // Get Stripe Payment Intent
      const result = await GqlGetStripePaymentIntent().catch((err: any) => {
        console.error("Payment intent error:", err);
        throw new Error(
          t("messages.shop.paymentInitError", "Payment initialization failed")
        );
      });

      // Check for GraphQL errors in the response
      if (result.errors) {
        console.error("GraphQL errors:", result.errors);
        throw new Error(
          t("messages.shop.paymentInitError", "Payment initialization failed")
        );
      }

      // Destructure stripePaymentIntent and validate
      const { stripePaymentIntent } = result;

      if (!stripePaymentIntent || !stripePaymentIntent.clientSecret) {
        throw new Error(
          t("messages.shop.paymentInitError", "Payment initialization failed")
        );
      }

      const clientSecret = stripePaymentIntent.clientSecret;

      // Get card element
      const cardElement = elements.value.getElement(
        "card"
      ) as StripeCardElement;

      // Confirm card payment (not setup)
      const { paymentIntent, error: paymentError } =
        await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        });

      if (paymentError) {
        throw new Error(paymentError.message);
      }

      // Check if payment succeeded
      if (paymentIntent.status === "succeeded") {
        isPaid.value = true;
        orderInput.value.transactionId = paymentIntent.id;
        // Optionally, add metadata
        orderInput.value.metaData.push({
          key: "_stripe_intent_id",
          value: paymentIntent.id,
        });
      } else {
        throw new Error("Payment did not succeed");
      }
    }
  } catch (error: unknown) {
    console.error("Checkout error:", error);
    // Handle different error types
    if (error instanceof Error) {
      paymentError.value = error.message;
    } else if (typeof error === "string") {
      paymentError.value = error;
    } else {
      paymentError.value = t(
        "messages.shop.genericError",
        "An error occurred. Please try again."
      );
    }
    // Reset states
    isPaid.value = false;
    buttonText.value = t("messages.shop.placeOrder");
  } finally {
    isSubmitting.value = false;
  }

  // Process final checkout
  await proccessCheckout(isPaid.value);
};
// Add handler for card state changes
const handleCardStateChange = ({ complete, error }) => {
  console.log("Card state changed:", { complete, error });
  // You can update UI or state based on card completion
};
// Add computed property for showing error message
const hasPaymentError = computed(() => {
  return paymentError.value && !isSubmitting.value;
});

const handleStripeElement = (stripeElements: StripeElements): void => {
  elements.value = stripeElements;
};

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

const checkEmailOnBlur = (email?: string | null): void => {
  if (email) isInvalidEmail.value = !emailRegex.test(email);
};

const checkEmailOnInput = (email?: string | null): void => {
  if (email && isInvalidEmail.value)
    isInvalidEmail.value = !emailRegex.test(email);
};

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
          <!-- Customer details -->
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

          <div>
            <h2 class="w-full mb-3 text-2xl font-semibold">
              {{ $t("messages.billing.billingDetails") }}
            </h2>
            <BillingDetails v-model="customer.billing" />
          </div>

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

          <Transition name="scale-y" mode="out-in">
            <div v-if="orderInput.shipToDifferentAddress">
              <h2 class="mb-4 text-xl font-semibold">
                {{ $t("messages.general.shippingDetails") }}
              </h2>
              <ShippingDetails v-model="customer.shipping" />
            </div>
          </Transition>

          <!-- Shipping methods -->
          <div v-if="cart.availableShippingMethods.length">
            <h3 class="mb-4 text-xl font-semibold">
              {{ $t("messages.general.shippingSelect") }}
            </h3>
            <ShippingOptions
              :options="cart.availableShippingMethods[0].rates"
              :active-option="cart.chosenShippingMethods[0]"
            />
          </div>

          <!-- Pay methods -->
          <div v-if="paymentGateways?.nodes.length" class="mt-2 col-span-full">
            <h2 class="mb-4 text-xl font-semibold">
              {{ $t("messages.billing.paymentOptions") }}
            </h2>
            <PaymentOptions
              v-model="orderInput.paymentMethod"
              class="mb-4"
              :paymentGateways
            />
            <StripeElement
              ref="stripeElementRef"
              v-if="stripe"
              v-show="orderInput.paymentMethod.id == 'stripe'"
              :stripe="stripe"
              @updateElement="handleStripeElement"
              @cardStateChange="handleCardStateChange"
            />
          </div>

          <!-- Order note -->
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
.checkout-form select,
.checkout-form .StripeElement {
  @apply bg-white border rounded-md outline-none border-gray-300 shadow-sm w-full py-2 px-4;
}

.checkout-form input.has-error,
.checkout-form textarea.has-error {
  @apply border-red-500;
}

.checkout-form label {
  @apply my-1.5 text-xs text-gray-600 uppercase;
}

.checkout-form .StripeElement {
  padding: 1rem 0.75rem;
}
</style>
