# Checkout Button Fixes - October 23, 2025

## Issues Reported

### Issue 1: Two Checkout Buttons Appearing

**Problem**: When Helcim payment method was selected, users saw TWO checkout buttons:

1. Blue Helcim "Pay Now" button (correct)
2. Red standard checkout button below it (incorrect - confusing)

**Root Cause**: The standard checkout button had incorrect conditional logic:

```vue
<!-- WRONG: v-else tied to Turnstile condition -->
<button v-else ...></button>
```

This caused the button to appear whenever Turnstile was disabled OR when it was enabled, creating duplication.

### Issue 2: Button Stuck on "Processing" When Modal Closed

**Problem**: If user closed the Helcim payment modal without completing payment:

- Button remained in "Processing" state
- Spinning loader continued indefinitely
- User couldn't retry checkout without refreshing page

**Root Cause**:

1. No event listener for Helcim modal close
2. No timeout/fallback to reset button state
3. Infinite wait loop for payment completion

---

## Fixes Applied

### ✅ Fix 1: Corrected Button Conditional Logic

**File**: `pages/checkout.vue`

```vue
<!-- BEFORE: Wrong conditional -->
<div v-if="isTurnstileEnabled" class="mt-4 mb-4">
  <!-- Turnstile widget -->
</div>

<button v-else type="submit">
  <!-- This appeared when Turnstile was disabled OR with Helcim! -->
</button>

<!-- AFTER: Correct conditional -->
<div v-if="isTurnstileEnabled && !shouldShowHelcimCard" class="mt-4 mb-4">
  <!-- Turnstile widget - only for non-Helcim payments -->
</div>

<button v-if="!shouldShowHelcimCard" type="submit">
  <!-- Only shown when Helcim card is NOT displayed -->
</button>
```

**Logic Flow Now**:

- **Helcim Payment Selected**: Shows Helcim card with blue "Pay Now" button → NO standard button
- **Other Payment Methods**: Shows Turnstile widget + standard checkout button
- **No Duplication**: Only ONE button appears at a time

---

### ✅ Fix 2: Added Modal Close Detection

**File**: `pages/checkout.vue`

Added event listener in `onBeforeMount`:

```typescript
// Listen for Helcim modal close events to reset button state
const helcimModalCloseHandler = (event: MessageEvent) => {
  if (event.data && event.data.eventName === 'helcimPayClosed' && event.data.eventStatus === 'HIDE') {
    console.log('[Checkout] Helcim modal was closed by user');
    // Reset button state if payment wasn't completed
    if (!helcimPaymentComplete.value && isSubmitting.value) {
      console.log('[Checkout] Resetting button state after modal close');
      isSubmitting.value = false;
      buttonText.value = t('messages.shop.placeOrder');
      paymentError.value = 'Payment was cancelled. Please try again when ready.';
    }
  }
};

window.addEventListener('message', helcimModalCloseHandler);

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('message', helcimModalCloseHandler);
});
```

**What This Does**:

1. Listens for Helcim's `helcimPayClosed` event when modal closes
2. Checks if payment was actually completed
3. If not completed, resets button state immediately
4. Shows user-friendly message: "Payment was cancelled. Please try again when ready."
5. Properly cleans up event listener on component unmount

---

### ✅ Fix 3: Added Payment Timeout Protection

**File**: `pages/checkout.vue`

Updated payment waiting logic:

```typescript
// BEFORE: Could wait forever
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

  // 5 minute timeout
  setTimeout(() => resolve(false), 300000);
});

// AFTER: Proper timeout with resolved flag
success = await new Promise((resolve) => {
  let resolved = false;

  const checkPayment = () => {
    if (resolved) return; // Stop checking if already resolved

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

  // 2 minute timeout (user probably closed modal)
  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      console.log('[payNow] Payment timeout - user may have closed modal');
      paymentError.value = 'Payment was not completed. Please try again.';
      resolve(false);
    }
  }, 120000); // 2 minutes
});
```

**Improvements**:

1. **Resolved Flag**: Prevents race conditions between timeout and success
2. **Shorter Timeout**: 2 minutes instead of 5 (more reasonable)
3. **Better Error Message**: Tells user payment wasn't completed
4. **Stops Checking**: Once resolved, stops the check loop

---

## Updated Imports

**File**: `pages/checkout.vue`

```typescript
// Added onUnmounted
import {ref, computed, onBeforeMount, onUnmounted, watch, nextTick} from 'vue';
```

---

## User Experience Flow

### **Scenario A: Helcim Payment - Happy Path**

1. User selects Helcim payment method
2. ✅ Sees ONLY blue "Pay Now" button (Helcim's button)
3. Clicks button → Helcim modal opens
4. Completes payment → Modal closes
5. Order created successfully

### **Scenario B: Helcim Payment - User Closes Modal**

1. User selects Helcim payment method
2. Clicks "Pay Now" → Helcim modal opens
3. ❌ User closes modal without completing
4. ✅ **IMMEDIATELY**: Button resets to "Place Order"
5. ✅ Message appears: "Payment was cancelled. Please try again when ready."
6. User can click button again to retry

### **Scenario C: Helcim Payment - Network Timeout**

1. User clicks "Pay Now" → Helcim modal opens
2. Network issue prevents payment completion
3. After 2 minutes:
4. ✅ Button automatically resets
5. ✅ Error message: "Payment was not completed. Please try again."
6. User can retry

### **Scenario D: Other Payment Methods**

1. User selects COD, Bank Transfer, etc.
2. ✅ Sees Turnstile widget + standard checkout button
3. ✅ NO Helcim button shown
4. Clicks checkout → Order processes normally

---

## Testing Checklist

### Button Display Tests

- [ ] **Helcim Selected**: Only blue Helcim button visible, no duplicate
- [ ] **COD Selected**: Only standard button visible with Turnstile
- [ ] **Switch Payment Methods**: Buttons update correctly without duplication

### Modal Close Tests

- [ ] **Close Modal (X button)**: Button resets immediately, shows cancellation message
- [ ] **Close Modal (ESC key)**: Button resets immediately
- [ ] **Close Modal (Click outside)**: Button resets if that's enabled
- [ ] **Complete Payment**: Button stays in processing, order completes

### Timeout Tests

- [ ] **Wait 2+ minutes without action**: Button resets with timeout message
- [ ] **Complete before timeout**: Order processes normally

### Retry Tests

- [ ] **After modal close**: Can click button again, modal reopens
- [ ] **After timeout**: Can click button again, modal reopens
- [ ] **Multiple retries**: Works consistently

---

## Technical Notes

### Event Detection

The fix listens for Helcim's standard postMessage event:

```javascript
{
  eventName: 'helcimPayClosed',
  eventStatus: 'HIDE'
}
```

This is sent by Helcim's iframe when the user closes the modal.

### State Management

Three key states prevent infinite loops:

1. `isSubmitting` - Prevents duplicate submissions
2. `helcimPaymentComplete` - Tracks if payment succeeded
3. `resolved` flag - Prevents race conditions in timeout

### Cleanup

The event listener is properly removed on component unmount to prevent memory leaks.

---

## Benefits

✅ **No Button Confusion**: Only one checkout button at a time
✅ **Better UX**: Immediate feedback when modal closes
✅ **No Stuck States**: Button always recoverable
✅ **Retry Capability**: Users can try again after failure
✅ **Proper Timeouts**: Don't wait forever for payment
✅ **Clean Code**: Proper event listener cleanup

---

**Status**: ✅ Complete
**Files Modified**: `pages/checkout.vue` (button logic, event listeners, imports)
**Testing**: Pending production verification
