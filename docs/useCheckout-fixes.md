# useCheckout.ts Composable Issues and Fixes

## Issues Found and Fixed

### 1. **Payment Method Default Issue**

**Problem**: The `getPaymentId()` function was defaulting to "helcimjs" when no payment method was selected.

```typescript
// BEFORE (Problematic)
if (!orderInput.value.paymentMethod) return "helcimjs"; // Default to Helcim if none set
return (
  orderInput.value.paymentMethod.id ||
  orderInput.value.paymentMethod ||
  "helcimjs"
);

// AFTER (Fixed)
if (!orderInput.value.paymentMethod) {
  console.warn("[getPaymentId] No payment method set, returning empty string");
  return ""; // Don't default to any payment method
}

const paymentId =
  orderInput.value.paymentMethod.id || orderInput.value.paymentMethod || "";

console.log("[getPaymentId] Returning payment ID:", paymentId);
return paymentId;
```

**Impact**: This was causing the system to think Helcim was selected even when no payment method was chosen, potentially triggering Helcim processing when it shouldn't.

### 2. **Missing Payment Method Validation**

**Problem**: No validation in `processCheckout()` to ensure a payment method was actually selected.

**Fix**: Added validation before processing:

```typescript
// Validate payment method
if (!paymentMethodId) {
  console.error("[processCheckout] No payment method selected");
  const errorMsg = "Please select a payment method before proceeding.";
  alert(errorMsg);
  return { success: false, error: true, errorMessage: errorMsg };
}
```

**Impact**: Prevents checkout attempts with no payment method selected, which could cause unexpected behavior.

### 3. **Enhanced Error Handling**

**Problem**: Limited error information when GraphQL checkout fails, making debugging difficult.

**Fix**: Added comprehensive error logging and handling:

```typescript
// Enhanced debugging for checkout errors
console.error("[processCheckout] Full error object:", {
  gqlErrors: error?.gqlErrors,
  networkError: error?.networkError,
  extraInfo: error?.extraInfo,
  originalPaymentMethod: orderInput.value.paymentMethod,
  finalPaymentMethodId: getPaymentId(),
  transactionId: orderInput.value.transactionId,
  isPaidFlag: isPaid,
});

// Better error categorization
if (error?.gqlErrors?.length > 0) {
  const gqlError = error.gqlErrors[0];
  if (gqlError.extensions?.category === "user") {
    finalErrorMessage = gqlError.message || "Invalid user data provided.";
  } else if (gqlError.extensions?.category === "internal") {
    finalErrorMessage = "Server error occurred. Please try again.";
  }
}
```

**Impact**: Provides better debugging information for the 500 errors we've been experiencing, helping identify root causes.

### 4. **Deprecated Function Clarity**

**Problem**: `processHelcimPayment()` function was confusing and not actually used.

**Fix**: Added clear documentation that this function is deprecated:

```typescript
// NOTE: This function is deprecated and not used in the current Helcim implementation
// Helcim payment processing is handled directly by the HelcimCard component
// and the checkout.vue page manages the flow through handleHelcimSuccess events
const processHelcimPayment = async (): Promise<boolean> => {
  console.warn(
    "[processHelcimPayment] DEPRECATED: This function is not used in the current Helcim implementation"
  );
  console.warn(
    "[processHelcimPayment] Helcim payments are handled by HelcimCard component events"
  );

  // The actual Helcim payment flow is:
  // 1. HelcimCard component processes payment
  // 2. Emits success/failure events to checkout.vue
  // 3. checkout.vue handles the events and calls processCheckout()

  return true; // Return true to avoid breaking existing code
};
```

**Impact**: Clarifies that this function is not part of the active Helcim flow, preventing confusion.

### 5. **Enhanced Payload Logging**

**Problem**: Limited visibility into what data is being sent to the GraphQL checkout mutation.

**Fix**: Added detailed payload logging:

```typescript
console.log("[processCheckout] Finalizing order with payload:", {
  isPaid,
  paymentMethod: paymentMethodId,
  transactionId: orderInput.value.transactionId,
  paymentMethodTitle: orderInput.value.paymentMethod?.title || "Unknown",
  metaDataCount: orderInput.value.metaData?.length || 0,
});
```

**Impact**: Better visibility into what's being sent to WordPress, helping debug order creation issues.

## Potential Impact on the 500 Error Issue

These fixes should help with the GraphQL 500 errors by:

1. **Preventing Invalid Payment Method IDs**: No longer defaulting to "helcimjs" when no method is selected
2. **Better Error Reporting**: More detailed error logs to identify the actual cause of 500 errors
3. **Validation Before Processing**: Catching invalid states before they reach the GraphQL endpoint
4. **Clearer Payment Flow**: Eliminating confusion about which functions handle which payment methods

## Testing Recommendations

1. **Test with No Payment Method Selected**: Ensure proper validation message appears
2. **Test Each Payment Method Individually**: Verify correct IDs are being sent
3. **Monitor Console Logs**: Check for the new detailed error information
4. **Test Rapid Clicking**: Ensure the enhanced validation prevents conflicts

## Next Steps

1. Test the checkout process with these fixes
2. Monitor the enhanced error logs for more specific 500 error information
3. If 500 errors persist, the detailed logging should help identify the exact GraphQL mutation parameter causing the issue
