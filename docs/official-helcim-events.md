# Official Helcim Event Handling Implementation

## Issue Identified

The previous implementation was relying on custom component events rather than the **official Helcim window message events** documented in the Helcim API.

## Official Helcim Event Structure

According to Helcim documentation, the correct event listener should be:

```javascript
window.addEventListener("message", (event) => {
  const helcimPayJsIdentifierKey = "helcim-pay-js-" + checkoutToken;

  if (event.data.eventName === helcimPayJsIdentifierKey) {
    if (event.data.eventStatus === "ABORTED") {
      console.error("Transaction failed!", event.data.eventMessage);
    }

    if (event.data.eventStatus === "SUCCESS") {
      // Handle successful transaction
      // event.data.eventMessage contains the transaction data and hash
    }

    if (event.data.eventStatus === "HIDE") {
      console.log("Modal or confirmation screen closed.");
    }
  }
});
```

## Transaction Data Structure

The official Helcim success response contains:

```javascript
{
  data: {
    "transactionId": "20163175",
    "dateCreated": "2023-07-17 10:34:35",
    "cardBatchId": "2915466",
    "status": "APPROVED",
    "type": "purchase",
    "amount": "15.45",
    "currency": "CAD",
    "avsResponse": "X",
    "cvvResponse": "",
    "approvalCode": "T3E5ST",
    "cardToken": "27128ae9440a0b47e2a068",
    "cardNumber": "4000000028",
    "cardHolderName": "Test",
    "customerCode": "CST1049",
    "invoiceNumber": "INV001045",
    "warning": ""
  },
  hash: "dbcb570cca52c38d597941adbed03f01be78c43cba89048722925b2f168226a9"
}
```

## Implementation Changes Made

### 1. **Added Official Event Listeners in checkout.vue**

```javascript
const setupHelcimEventListeners = () => {
  const messageHandler = (event: MessageEvent) => {
    if (!helcimCheckoutToken.value) return;

    const helcimPayJsIdentifierKey = 'helcim-pay-js-' + helcimCheckoutToken.value;

    if (event.data.eventName === helcimPayJsIdentifierKey) {
      switch (event.data.eventStatus) {
        case 'SUCCESS':
          handleHelcimOfficialSuccess(event.data.eventMessage);
          break;
        case 'ABORTED':
          handleHelcimOfficialFailed(event.data.eventMessage);
          break;
        case 'HIDE':
          console.log('Modal closed');
          break;
      }
    }
  };

  window.addEventListener('message', messageHandler);
};
```

### 2. **Enhanced Transaction Validation**

```javascript
const handleHelcimOfficialSuccess = async (eventMessage: any) => {
  // Validate response structure according to Helcim docs
  if (!eventMessage?.data) {
    throw new Error("Invalid Helcim response: missing data");
  }

  const transactionData = eventMessage.data;
  const hash = eventMessage.hash;

  // Validate transaction status
  if (!transactionData.transactionId || transactionData.status !== 'APPROVED') {
    throw new Error(`Helcim transaction not approved: ${transactionData.status}`);
  }

  // Process the transaction
  await handleHelcimSuccess({
    data: {
      data: transactionData,
      hash: hash
    }
  });
};
```

### 3. **Token Capture from HelcimCard Component**

```javascript
const handleHelcimReady = (tokens?: any) => {
  if (tokens?.checkoutToken) {
    helcimCheckoutToken.value = tokens.checkoutToken;
  }
  if (tokens?.secretToken) {
    helcimSecretToken.value = tokens.secretToken;
  }
};
```

### 4. **Updated HelcimCard Component**

Modified to emit checkout and secret tokens when ready:

```javascript
emit("ready", {
  checkoutToken: checkoutToken.value,
  secretToken: secretToken.value,
});
```

## Benefits of This Implementation

### 1. **Official API Compliance**

- Uses the exact event structure documented by Helcim
- Follows official event naming conventions
- Handles all documented event statuses

### 2. **Dual Event Handling**

- Maintains existing component-based events as backup
- Adds official window message events as primary
- Provides redundancy for transaction processing

### 3. **Enhanced Validation**

- Validates transaction status is 'APPROVED'
- Checks for required transaction data
- Provides detailed error logging

### 4. **Hash Validation Ready**

- Captures hash value from response
- Ready for backend validation implementation
- Maintains transaction integrity

## Event Flow

### New Official Flow:

1. ✅ Helcim payment processed
2. ✅ Helcim sends official window message event
3. ✅ `setupHelcimEventListeners()` captures event
4. ✅ `handleHelcimOfficialSuccess()` validates response
5. ✅ Calls existing `handleHelcimSuccess()` with proper format
6. ✅ `payNow()` triggered for WordPress order creation

### Backup Component Flow (still active):

1. ✅ HelcimCard component events
2. ✅ Direct `handleHelcimSuccess()` calls
3. ✅ Same order creation process

## Testing Recommendations

1. **Monitor Console Logs**: Look for "Official Helcim event received" messages
2. **Verify Event Structure**: Check that transaction data matches Helcim format
3. **Test All Event Types**: SUCCESS, ABORTED, and HIDE events
4. **Validate Transaction Data**: Ensure transactionId and APPROVED status
5. **Check Token Capture**: Verify checkout and secret tokens are captured

## Next Steps

1. **Optional Hash Validation**: Implement backend hash validation using secret token
2. **Error Handling**: Enhanced error messages for different failure scenarios
3. **Performance**: Monitor for any duplicate event processing
4. **Security**: Consider implementing the optional response validation

This implementation should now correctly handle Helcim payments according to their official documentation and provide more reliable transaction processing.
