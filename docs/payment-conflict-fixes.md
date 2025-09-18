# Payment Conflict Prevention Fixes

## Issue

Customer complained that both Stripe and Helcim payments were firing at the same time, causing potential double charges or payment conflicts.

## Root Cause Analysis

1. The `handleFormSubmit` function was calling `payNow()` for all payment methods, including Helcim
2. The Helcim component also emits `checkout-requested` which triggers the form submission again
3. This created a potential race condition where both payment systems could be triggered

## Fixes Applied

### 1. Enhanced Form Submission Handler

- Added check to prevent multiple simultaneous submissions (`isSubmitting.value`)
- Special handling for Helcim payments to bypass standard form submission
- Only non-Helcim payments go through the standard `payNow()` flow from form submission

```javascript
const handleFormSubmit = async () => {
  // Prevent multiple simultaneous submissions
  if (isSubmitting.value) {
    console.log(
      "[handleFormSubmit] Already processing, ignoring duplicate submission"
    );
    return;
  }

  // Special handling for Helcim payments
  const paymentMethodId = orderInput.value.paymentMethod?.id || "";
  if (paymentMethodId === "helcimjs" || paymentMethodId === "helcim") {
    console.log(
      "[handleFormSubmit] Helcim payment method detected - bypassing standard form submission"
    );
    return;
  }

  await payNow();
};
```

### 2. Helcim Checkout Request Handler

- Modified to call `payNow()` directly instead of triggering form submission
- Added duplicate request prevention
- Added billing phone validation before processing

```javascript
const handleHelcimCheckoutRequest = async () => {
  // Prevent multiple simultaneous submissions
  if (isSubmitting.value) {
    console.log(
      "[handleHelcimCheckoutRequest] Already processing, ignoring duplicate request"
    );
    return;
  }

  // Validate billing phone number first
  if (!customer.value?.billing?.phone) {
    paymentError.value = "Billing phone number is required.";
    return;
  }

  // Call payNow directly
  await payNow();
};
```

### 3. Enhanced PayNow Function

- Added duplicate call prevention
- Added explicit logging to show which payment method is being processed
- Added safeguards to ensure only the correct payment processor is called

```javascript
const payNow = async () => {
  // Prevent multiple simultaneous submissions
  if (isSubmitting.value) {
    console.log("[payNow] Already processing, ignoring duplicate call");
    return;
  }

  // ...existing validation code...

  if (paymentMethodId === "helcimjs" || paymentMethodId === "helcim") {
    console.log(
      "[payNow] Processing Helcim payment - ensuring Stripe is not called"
    );
    // Helcim processing logic
  } else if (paymentMethodId === "fkwcs_stripe") {
    console.log(
      "[payNow] Processing Stripe payment - ensuring Helcim is not called"
    );
    // Stripe processing logic
  }
};
```

### 4. Stripe Payment Function Safeguard

- Added verification to ensure Stripe payment is only called when the payment method is actually Stripe
- Throws error if there's a payment method mismatch

```javascript
const processStripePayment = async () => {
  // Double check that this is actually a Stripe payment
  const currentPaymentMethod = orderInput.value.paymentMethod?.id || "";
  if (currentPaymentMethod !== "fkwcs_stripe") {
    console.error(
      "[processStripePayment] CRITICAL ERROR: Stripe payment called but payment method is:",
      currentPaymentMethod
    );
    throw new Error("Stripe payment method mismatch - this should not happen!");
  }
  // ...rest of Stripe logic...
};
```

### 5. Helcim Success Handler Protection

- Added duplicate success event prevention
- Ensures transaction data is only processed once

```javascript
const handleHelcimSuccess = (transactionData: any) => {
  // Prevent double processing
  if (helcimPaymentComplete.value) {
    console.log("[Checkout] Helcim payment already processed, ignoring duplicate success event");
    return;
  }
  // ...rest of success logic...
};
```

## Testing Recommendations

1. Test Helcim payment flow to ensure only Helcim is called
2. Test Stripe payment flow to ensure only Stripe is called
3. Check browser console for any "CRITICAL ERROR" messages
4. Verify no duplicate payment processing occurs
5. Test rapid clicking on payment buttons to ensure duplicate submission prevention works

## Monitoring

- Added extensive console logging to track which payment method is being processed
- Each payment path now logs clearly which processor is being used
- Error messages will appear if wrong payment processor is called

## Next Steps

1. Monitor logs during checkout to ensure separation is working
2. Test both payment methods thoroughly
3. Remove old checkout.vue file in woonuxt_base if not needed
