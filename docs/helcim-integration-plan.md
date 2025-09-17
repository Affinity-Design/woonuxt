# Helcim Payment Integration Implementation Plan

## Executive Summary

This document outlines the implementation plan for integrating Helcim payment processor into the WooNuxt e-commerce system. The system currently supports Stripe, PayPal, and Cash on Delivery. We will implement Helcim as the primary payment method, with the option to disable other methods.

## Current Payment Architecture Analysis

### Current Payment Flow

1. **Frontend (Nuxt)**: Collects payment details using Stripe Elements
2. **Server API**: `/server/api/stripe.post.ts` handles payment intent creation
3. **Checkout Process**: `useCheckout.ts` composable orchestrates the flow
4. **GraphQL**: `checkout.gql` mutation sends order to WordPress/WooCommerce
5. **Payment Methods**: Managed via `PaymentOptions.vue` component

### Key Components

- **Payment Processing**: `pages/checkout.vue` + `useCheckout.ts`
- **Payment UI**: `components/shopElements/StripeCard.vue`
- **Server API**: `server/api/stripe.post.ts`
- **Payment Options**: `components/shopElements/PaymentOptions.vue`
- **GraphQL**: `woonuxt_base/app/queries/checkout.gql`

## Implementation Strategy

### Option 1: WordPress Backend Integration (Recommended)

**Pros**:

- Leverages existing Helcim WooCommerce plugin
- Minimal frontend changes
- Consistent with current architecture
- Better security (payment processing on server)

**Cons**:

- Requires WordPress plugin customization
- May need custom GraphQL endpoints

### Option 2: Direct HelcimPay.js Integration

**Pros**:

- Direct control over payment flow
- No WordPress dependency for payments
- Can implement immediately

**Cons**:

- Need to handle payment validation
- More complex integration
- Security considerations for frontend payment handling

## Recommended Implementation Plan

### Phase 1: Backend Integration Setup (1-2 weeks)

#### 1.1 WordPress/WooCommerce Configuration

```php
// WordPress side - ensure Helcim gateway is configured
// Gateway ID should be: 'helcim' or 'helcimjs'
```

#### 1.2 GraphQL Schema Updates

Verify that Helcim payment method is exposed via GraphQL:

```graphql
query GetPaymentGateways {
  paymentGateways {
    nodes {
      id
      title
      description
      enabled
    }
  }
}
```

#### 1.3 Server API Creation

Create new server endpoint for Helcim initialization:

**File**: `server/api/helcim.post.ts`

```typescript
import { defineEventHandler, createError, readBody } from "h3";

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig();
  const helcimApiToken = runtimeConfig.helcimApiToken;

  const body = await readBody(event);
  const { action, amount, currency = "CAD" } = body;

  try {
    switch (action) {
      case "initialize":
        const response = await fetch(
          "https://api.helcim.com/v2/helcim-pay/initialize",
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "api-token": helcimApiToken,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              paymentType: "purchase",
              amount: amount,
              currency: currency,
            }),
          }
        );

        const data = await response.json();

        return {
          success: true,
          checkoutToken: data.checkoutToken,
          secretToken: data.secretToken,
        };

      default:
        throw createError({
          statusCode: 400,
          statusMessage: "Invalid action",
        });
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});
```

### Phase 2: Frontend Components (1 week)

#### 2.1 Create Helcim Payment Component

**File**: `components/shopElements/HelcimCard.vue`

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const emit = defineEmits([
  "ready",
  "error",
  "payment-success",
  "payment-failed",
]);

const checkoutToken = ref("");
const secretToken = ref("");
const paymentComplete = ref(false);
const paymentError = ref<string | null>(null);

const props = defineProps({
  amount: {
    type: Number,
    required: true,
  },
});

// Initialize Helcim payment
const initializePayment = async () => {
  try {
    const response = await $fetch("/api/helcim", {
      method: "POST",
      body: {
        action: "initialize",
        amount: props.amount,
      },
    });

    if (response.success) {
      checkoutToken.value = response.checkoutToken;
      secretToken.value = response.secretToken;
      loadHelcimScript();
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    paymentError.value = error.message;
    emit("error", error.message);
  }
};

const loadHelcimScript = () => {
  if (document.getElementById("helcim-pay-script")) return;

  const script = document.createElement("script");
  script.id = "helcim-pay-script";
  script.src = "https://secure.helcim.app/helcim-pay/services/start.js";
  script.onload = () => {
    setupEventListeners();
    emit("ready");
  };
  document.head.appendChild(script);
};

const setupEventListeners = () => {
  window.addEventListener("message", (event) => {
    const helcimPayJsIdentifierKey = "helcim-pay-js-" + checkoutToken.value;

    if (event.data.eventName === helcimPayJsIdentifierKey) {
      if (event.data.eventStatus === "SUCCESS") {
        paymentComplete.value = true;
        emit("payment-success", event.data.eventMessage);
      } else if (event.data.eventStatus === "ABORTED") {
        paymentError.value = event.data.eventMessage;
        emit("payment-failed", event.data.eventMessage);
      }
    }
  });
};

const processPayment = () => {
  if (checkoutToken.value && window.appendHelcimPayIframe) {
    window.appendHelcimPayIframe(checkoutToken.value);
  }
};

// Expose methods for parent component
defineExpose({
  processPayment,
  isPaymentComplete: () => paymentComplete.value,
  getSecretToken: () => secretToken.value,
});

onMounted(() => {
  initializePayment();
});

onUnmounted(() => {
  // Clean up event listeners
  window.removeEventListener("message", () => {});
});
</script>

<template>
  <div class="helcim-payment-container">
    <div v-if="paymentError" class="error-message">
      {{ paymentError }}
    </div>

    <div v-else-if="!checkoutToken" class="loading">
      Initializing payment...
    </div>

    <div v-else>
      <button
        @click="processPayment"
        class="helcim-pay-button"
        :disabled="paymentComplete"
      >
        {{ paymentComplete ? "Payment Complete" : "Pay with Helcim" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.helcim-pay-button {
  @apply bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark disabled:bg-gray-400;
}

.error-message {
  @apply text-red-600 text-sm mb-4;
}

.loading {
  @apply text-gray-600 text-sm;
}
</style>
```

#### 2.2 Update Payment Options Component

**File**: `components/shopElements/PaymentOptions.vue` (Update)

```vue
<script setup lang="ts">
// ... existing code ...

// Update excluded gateways to include only helcim
const excludedGateways = ["ppcp"]; // Remove helcim from exclusions

// Filter to show only Helcim if configured
const filterPaymentGateways = (gateways) => {
  // Option to show only Helcim
  const helcimOnly = true; // Configure this based on your needs

  if (helcimOnly) {
    const helcimGateway = gateways.find(
      (g) => g.id === "helcim" || g.id === "helcimjs"
    );
    return helcimGateway
      ? [helcimGateway]
      : gateways.filter((g) => !excludedGateways.includes(g.id));
  }

  return gateways.filter((gateway) => !excludedGateways.includes(gateway.id));
};
</script>
```

### Phase 3: Checkout Integration (1 week)

#### 3.1 Update useCheckout Composable

**File**: `composables/useCheckout.ts` (Add Helcim support)

```typescript
// Add Helcim payment processing function
const processHelcimPayment = async (): Promise<boolean> => {
  try {
    // Get Helcim component reference
    const helcimComponent = helcimCardRef.value;

    if (!helcimComponent) {
      throw new Error("Helcim payment component not initialized");
    }

    // Trigger payment process
    await helcimComponent.processPayment();

    // Wait for payment completion
    return new Promise((resolve, reject) => {
      const checkPaymentStatus = () => {
        if (helcimComponent.isPaymentComplete()) {
          // Add transaction metadata
          orderInput.value.metaData.push({
            key: "_helcim_transaction_id",
            value: helcimComponent.getTransactionId(),
          });
          orderInput.value.transactionId = helcimComponent.getTransactionId();
          resolve(true);
        } else {
          setTimeout(checkPaymentStatus, 1000);
        }
      };
      checkPaymentStatus();
    });
  } catch (error) {
    console.error("Helcim payment error:", error);
    return false;
  }
};

// Update the main payment processing logic
const processPayment = async (): Promise<boolean> => {
  const paymentMethodId = getPaymentId();

  switch (paymentMethodId) {
    case "helcim":
    case "helcimjs":
      return await processHelcimPayment();
    case "fkwcs_stripe":
      return await processStripePayment();
    default:
      return true; // For COD and other methods
  }
};
```

#### 3.2 Update Checkout Page

**File**: `pages/checkout.vue` (Add Helcim component)

```vue
<script setup lang="ts">
// ... existing imports ...

const helcimCardRef = ref(null);

// Add Helcim event handlers
const handleHelcimReady = () => {
  console.log("Helcim payment ready");
};

const handleHelcimSuccess = (paymentData) => {
  console.log("Helcim payment successful:", paymentData);
  isPaid.value = true;
};

const handleHelcimError = (error) => {
  console.error("Helcim payment error:", error);
  paymentError.value = error;
};

// Update payment processing logic
const payNow = async () => {
  // ... existing validation code ...

  // Process payment based on selected method
  const paymentMethodId = getPaymentId();
  let success = false;

  if (paymentMethodId === "helcim" || paymentMethodId === "helcimjs") {
    success = await processHelcimPayment();
  } else if (paymentMethodId === "fkwcs_stripe") {
    success = await processStripePayment();
  } else {
    success = true; // For COD
  }

  if (success) {
    const checkoutResult = await processCheckout(success);
    // ... handle result ...
  }
};
</script>

<template>
  <!-- ... existing template ... -->

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

    <!-- Helcim Card Component -->
    <div
      v-if="
        orderInput.paymentMethod?.id === 'helcim' ||
        orderInput.paymentMethod?.id === 'helcimjs'
      "
      class="mt-4"
    >
      <h3 class="mb-2 text-md font-medium">Payment Details</h3>
      <HelcimCard
        ref="helcimCardRef"
        :amount="Math.round(parseFloat(cart.rawTotal) * 100)"
        @ready="handleHelcimReady"
        @payment-success="handleHelcimSuccess"
        @payment-failed="handleHelcimError"
      />
    </div>

    <!-- Existing Stripe component -->
    <div
      v-else-if="orderInput.paymentMethod?.id === 'fkwcs_stripe'"
      class="mt-4"
    >
      <h3 class="mb-2 text-md font-medium">Card Details</h3>
      <StripeCard
        ref="stripeCardRef"
        @ready="handleStripeReady"
        @error="handleStripeError"
      />
    </div>
  </div>
</template>
```

### Phase 4: Environment Configuration (1 day)

#### 4.1 Update Environment Variables

**File**: `.env`

```properties
# Add Helcim configuration
HELCIM_API_TOKEN="your-helcim-api-token"
NUXT_HELCIM_API_TOKEN="your-helcim-api-token"
```

#### 4.2 Update Nuxt Config

**File**: `nuxt.config.ts`

```typescript
export default defineNuxtConfig({
  // ... existing config ...

  runtimeConfig: {
    // Server-only secrets
    helcimApiToken: process.env.NUXT_HELCIM_API_TOKEN,
    // ... existing server config ...

    public: {
      // ... existing public config ...
    },
  },
});
```

### Phase 5: Testing & Validation (1 week)

#### 5.1 Test Scenarios

- [ ] Helcim payment initialization
- [ ] Successful payment flow
- [ ] Failed payment handling
- [ ] Order creation in WordPress
- [ ] Payment method selection
- [ ] Mobile responsiveness
- [ ] Error handling

#### 5.2 Validation Checklist

- [ ] Payment amounts match cart totals
- [ ] Order attribution is properly set
- [ ] Transaction IDs are stored
- [ ] Email confirmations work
- [ ] Inventory is updated
- [ ] Customer accounts are created (if applicable)

## Implementation Timeline

| Phase                         | Duration  | Dependencies                        |
| ----------------------------- | --------- | ----------------------------------- |
| Phase 1: Backend Setup        | 1-2 weeks | Helcim API access, WordPress config |
| Phase 2: Frontend Components  | 1 week    | Phase 1 complete                    |
| Phase 3: Checkout Integration | 1 week    | Phase 2 complete                    |
| Phase 4: Configuration        | 1 day     | All phases                          |
| Phase 5: Testing              | 1 week    | All phases complete                 |

**Total Estimated Time**: 4-6 weeks

## Technical Considerations

### Security

- API tokens stored server-side only
- Payment processing handled via HTTPS
- Transaction validation using secret tokens
- No sensitive data stored in frontend

### Performance

- Lazy loading of Helcim scripts
- Efficient payment state management
- Minimal impact on existing checkout flow

### Maintenance

- Clear separation between payment methods
- Modular component structure
- Comprehensive error handling
- Logging for debugging

## Alternative Approaches

### Option A: WordPress Plugin Extension

Extend the existing Helcim WordPress plugin to expose additional GraphQL endpoints.

### Option B: Hybrid Approach

Use Helcim.js for payment collection but validate through WordPress backend.

### Option C: Full Replacement

Replace all payment methods with Helcim only.

## Risk Assessment

### High Risk

- Payment processor downtime
- API rate limiting
- Currency conversion issues

### Medium Risk

- Integration complexity
- Testing coverage
- Mobile compatibility

### Low Risk

- UI/UX changes
- Configuration management

## Success Criteria

1. ✅ Successful payment processing with Helcim
2. ✅ Order creation in WordPress/WooCommerce
3. ✅ Proper transaction tracking and attribution
4. ✅ Error handling and user feedback
5. ✅ Mobile-responsive payment interface
6. ✅ Performance maintained or improved
7. ✅ Security standards met or exceeded

## Next Steps

1. **Immediate**: Verify Helcim WordPress plugin configuration
2. **Week 1**: Implement server API and test Helcim initialization
3. **Week 2**: Create frontend components and basic integration
4. **Week 3**: Complete checkout flow integration
5. **Week 4**: Testing and refinement
6. **Week 5**: Production deployment and monitoring

## Support Resources

- **Helcim Documentation**: https://devdocs.helcim.com/
- **WordPress Integration**: Existing Helcim plugin
- **Testing Environment**: Use Helcim test API credentials
- **Monitoring**: Implement payment success/failure tracking

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Author**: Development Team  
**Review Required**: Technical Lead, Product Owner
