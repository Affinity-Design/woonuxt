# SOLUTION: GraphQL "Please verify that you are human" Error

## 🎯 Problem Identified

You were getting this GraphQL error:

```
"message": "Please verify that you are human."
```

This happens because your WordPress/WooCommerce backend requires Turnstile verification at the **GraphQL level**, not just our frontend APIs.

## ✅ Complete Solution Implemented

### 1. **Updated GraphQL Checkout Mutation**

Modified `woonuxt_base/app/queries/checkout.gql` to include `turnstileToken`:

```graphql
mutation Checkout(
  $billing: CustomerAddressInput = {}
  $metaData: [MetaDataInput] = { key: "", value: "" }
  $paymentMethod: String = "stripe"
  $shipping: CustomerAddressInput = {}
  $customerNote: String = ""
  $shipToDifferentAddress: Boolean = false
  $account: CreateAccountInput = { username: "", password: "" }
  $transactionId: String = ""
  $isPaid: Boolean = false
  $turnstileToken: String = ""  # ← Added this
) {
  checkout(
    input: {
      paymentMethod: $paymentMethod
      billing: $billing
      metaData: $metaData
      shipping: $shipping
      customerNote: $customerNote
      shipToDifferentAddress: $shipToDifferentAddress
      account: $account
      transactionId: $transactionId
      isPaid: $isPaid
      turnstileToken: $turnstileToken  # ← Added this
    }
  )
```

### 2. **Updated Checkout Composable**

Modified `composables/useCheckout.ts` to pass `turnstileToken` to GraphQL:

```typescript
let checkoutPayload: any = {
  billing,
  shipping,
  shippingMethod,
  metaData: enhancedMetaData,
  paymentMethod: effectivePaymentMethod,
  customerNote: orderInput.value.customerNote,
  shipToDifferentAddress,
  transactionId: orderInput.value.transactionId,
  isPaid,
  turnstileToken: turnstileToken, // ← Now included in all GraphQL calls
};
```

### 3. **Frontend Integration**

The checkout page now:

- ✅ Collects Turnstile token from user
- ✅ Passes token to backend via GraphQL
- ✅ Shows appropriate errors if verification fails

## 🔄 How It Now Works

### Complete Flow:

1. **User loads checkout** → Turnstile widget appears
2. **User completes Turnstile** → Token generated
3. **User submits order** → Frontend validates token exists
4. **GraphQL checkout called** → Token sent to WordPress backend
5. **WordPress verifies token** → With Cloudflare Turnstile API
6. **If valid** → Order created ✅
7. **If invalid** → "Please verify that you are human" error ❌

### Dual Protection:

- **Admin Order API**: Direct server-side verification (for Helcim payments)
- **GraphQL Checkout**: WordPress-level verification (for all other payments)

## 🧪 Testing the Fix

### Test Script:

```powershell
# Test GraphQL integration specifically
node test-graphql-checkout.js
```

### Manual Testing:

1. **Go to checkout page**
2. **Fill form, complete Turnstile**
3. **Submit order** → Should work ✅
4. **Try without Turnstile** → Should get "verify human" error ❌

## ⚡ Expected Results

### Before Fix:

```
❌ GraphQL Error: "Please verify that you are human."
❌ Orders blocked even with frontend Turnstile
❌ Spam still getting through
```

### After Fix:

```
✅ GraphQL accepts valid Turnstile tokens
✅ Orders process normally with verification
✅ Spam orders blocked at GraphQL level
✅ Clear error messages for users
```

## 🔧 Configuration Required

Make sure these are set in your environment:

```bash
TURNSTYLE_SITE_KEY="your_cloudflare_site_key"
TURNSTYLE_SECRET_KEY="your_cloudflare_secret_key"
```

## 🚀 Deployment Checklist

- [x] GraphQL mutation updated with turnstileToken
- [x] Checkout composable passes token to GraphQL
- [x] Frontend collects and validates token
- [x] Server-side verification for admin orders
- [x] Error handling and user feedback
- [x] Test scripts created

## 🎉 This Fixes Your Issue!

The "Please verify that you are human" error will now be resolved because:

1. **GraphQL gets the token** it expects from our checkout
2. **WordPress can verify** the token with Cloudflare
3. **Legitimate orders proceed** normally
4. **Spam orders are blocked** at the GraphQL level

You can now enable Cloudflare Turnstile without breaking checkout functionality!
