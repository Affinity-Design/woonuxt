# Helcim Payment Integration with WooCommerce & WooNuxt

This document outlines the complete Helcim payment integration system that bypasses WooCommerce GraphQL session issues through admin-level order creation while maintaining proper order attribution and coupon handling.

## 🎯 Overview

The integration provides a seamless checkout experience with Helcim payments by:

- ✅ **Bypassing GraphQL session issues** through admin order creation
- ✅ **Maintaining payment method persistence** during cart updates
- ✅ **Proper order attribution** to proskatersplace.ca
- ✅ **Coupon support** via post-creation application
- ✅ **Correct payment method display** in order summaries

## 🏗️ Architecture

### Payment Flow

```
User Cart → Apply Coupons → Select Helcim → Process Payment → Admin Order Creation → Coupon Application → Order Completion
```

### Key Components

1. **Frontend Payment Selection** (`PaymentOptions.vue`)
2. **Checkout Processing** (`useCheckout.ts`)
3. **Admin Order Creation API** (`create-admin-order.post.ts`)
4. **Order Attribution System** (Built into `useCheckout.ts`)
5. **Post-Creation Coupon Application** (REST API integration)

## 🔧 Setup Requirements

### WordPress Configuration

```php
# wp-config.php or environment
# Application Password for admin API access
WP_ADMIN_USERNAME=proskatersplace.ca
WP_ADMIN_APP_PASSWORD=zuCu MEju aY3Z az7U Ugid Gbhn
WP_BASE_URL=https://your-wordpress-site.com
```

### User Requirements

- WordPress user `proskatersplace.ca` with **Shop Manager** role
- Application Password generated for API access
- WooCommerce REST API enabled
- GraphQL for WooCommerce plugin active

## 📦 File Structure

### Core Files

```
composables/
├── useCheckout.ts                 # Enhanced checkout with admin order creation
└── useCart.ts                     # Cart management with coupon support

server/api/
├── create-admin-order.post.ts     # Main admin order creation API
└── test-helcim-with-coupon.get.ts # Testing endpoint

components/shopElements/
├── PaymentOptions.vue             # Payment method selection with persistence
└── OrderSummary.vue              # Order display with coupon information

pages/
├── checkout.vue                   # Main checkout page
└── checkout/order-received/       # Order confirmation
    └── [...orderId].vue

woonuxt_base/app/pages/
└── order-summary.vue             # Order confirmation display
```

## 🚀 Implementation Details

### 1. Order Attribution System

The attribution system tracks order sources and provides comprehensive metadata:

```typescript
// Default attribution metadata
metaData: [
  { key: "order_via", value: "WooNuxt" },
  { key: "_wc_order_attribution_source_type", value: "direct" },
  { key: "_wc_order_attribution_referrer", value: "proskatersplace.ca" },
  { key: "_wc_order_attribution_utm_source", value: "proskatersplace.ca" },
  { key: "_wc_order_attribution_utm_medium", value: "headless" },
  { key: "_wc_order_attribution_utm_content", value: "nuxt-frontend" },
  { key: "_wc_order_attribution_session_entry", value: "proskatersplace.ca" },
  { key: "_wc_order_attribution_device_type", value: "Web" },
  { key: "order_source", value: "proskatersplace.ca" },
  { key: "frontend_origin", value: "proskatersplace.ca" },
];
```

#### Dynamic Attribution Updates

```typescript
const { setOrderAttribution } = useCheckout();

// Update attribution data dynamically
setOrderAttribution({
  _wc_order_attribution_utm_campaign: "summer-sale",
  _wc_order_attribution_utm_term: "skates",
});
```

### 2. Admin Order Creation Process

#### Detection & Routing

```typescript
// Helcim payment detection
const isHelcimPayment =
  orderInput.value.paymentMethod?.title?.includes("Helcim") && isPaid;

if (isHelcimPayment && orderInput.value.transactionId) {
  // Route to admin order creation
  const adminOrderResult = await $fetch("/api/create-admin-order", {
    method: "POST",
    body: adminOrderData,
  });
}
```

#### Admin API Processing

1. **GraphQL Order Creation** with Application Password auth
2. **Coupon Application** via WooCommerce REST API
3. **Order Total Recalculation** to reflect discounts
4. **Metadata Enhancement** for tracking and attribution

### 3. Coupon Handling

#### Frontend Cart Integration

```typescript
// Extract applied coupons from cart
coupons: cart.value?.appliedCoupons?.map((coupon: any) => ({
  code: coupon.code,
  discountAmount: coupon.discountAmount,
  discountTax: coupon.discountTax,
})) || [];
```

#### Backend Application

```typescript
// Apply coupons via REST API after order creation
for (const coupon of coupons) {
  await $fetch(`${wpBaseUrl}/wp-json/wc/v3/orders/${orderId}`, {
    method: "PUT",
    body: {
      coupon_lines: [
        {
          code: coupon.code,
          discount: coupon.discountAmount,
          discount_tax: coupon.discountTax,
        },
      ],
    },
  });
}

// Recalculate totals
await $fetch(`${wpBaseUrl}/wp-json/wc/v3/orders/${orderId}`, {
  method: "PUT",
  body: { recalculate: true },
});
```

### 4. Payment Method Persistence

#### SessionStorage Implementation

```typescript
// Save payment method during cart updates
const updatePaymentMethod = (method: string) => {
  if (process.client) {
    sessionStorage.setItem("selectedPaymentMethod", method);
  }
};

// Restore payment method after cart changes
const restorePaymentMethod = () => {
  if (process.client) {
    const saved = sessionStorage.getItem("selectedPaymentMethod");
    if (saved) {
      orderInput.value.paymentMethod = saved;
    }
  }
};
```

## 🧪 Testing

### Manual Testing Flow

1. **Add products** to cart
2. **Apply coupon** (verify discount shows in cart)
3. **Proceed to checkout**
4. **Select Helcim payment method**
5. **Complete payment** through Helcim
6. **Verify order creation** with:
   - ✅ Correct discounted total
   - ✅ Applied coupon listed
   - ✅ Payment method shows "Helcim Credit Card Payment"
   - ✅ Order attribution metadata present

### API Testing

```bash
# Test admin order creation
curl -X POST http://localhost:3000/api/create-admin-order \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "test-123",
    "billing": {
      "firstName": "Test",
      "lastName": "Customer",
      "email": "test@example.com"
    },
    "lineItems": [{"productId": 16774, "quantity": 1}],
    "coupons": [{"code": "SAVE10", "discountAmount": "5.00"}]
  }'
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Coupons Not Applied

**Symptoms**: Order shows full price, "Redeemed: None"
**Solution**: Verify coupon codes exist in WooCommerce and REST API credentials are correct

#### 2. Payment Method Shows as "Stripe"

**Symptoms**: Order summary displays wrong payment method
**Solution**: Check `order-summary.vue` line 287 uses dynamic payment method display

#### 3. Session Errors

**Symptoms**: "No session found" GraphQL errors
**Solution**: Admin order creation bypasses this - verify API is being called for Helcim payments

#### 4. Attribution Missing

**Symptoms**: Orders lack source tracking metadata
**Solution**: Verify `setOrderAttribution()` is called and metadata array is properly structured

### Debug Logging

Enable detailed logging in browser console:

```typescript
console.log("[processCheckout] Payment method handling:", {
  originalMethod: orderInput.value.paymentMethod,
  isHelcimPayment,
  transactionId: orderInput.value.transactionId,
});
```

## 📊 Order Data Structure

### Complete Order Metadata

```json
{
  "paymentMethod": "helcim",
  "paymentMethodTitle": "Helcim Credit Card Payment",
  "transactionId": "helcim-tx-123456",
  "status": "PROCESSING",
  "isPaid": true,
  "metaData": [
    { "key": "_created_via", "value": "woonuxt_admin_api" },
    { "key": "_helcim_transaction_id", "value": "helcim-tx-123456" },
    { "key": "_payment_method", "value": "helcim" },
    { "key": "_order_source", "value": "proskatersplace.ca" },
    { "key": "_wc_order_attribution_source_type", "value": "direct" },
    { "key": "_wc_order_attribution_referrer", "value": "proskatersplace.ca" },
    { "key": "order_source", "value": "proskatersplace.ca" }
  ]
}
```

## 🎉 Benefits

### For Users

- ✅ **Seamless checkout experience** without session errors
- ✅ **Reliable coupon application** and pricing
- ✅ **Consistent payment method persistence** during cart updates
- ✅ **Clear order confirmations** with proper payment method display

### For Administrators

- ✅ **Complete order attribution** for tracking and analytics
- ✅ **Proper order source identification** in WordPress admin
- ✅ **Reliable order creation** bypassing GraphQL session issues
- ✅ **Comprehensive order metadata** for reporting and analysis

### For Developers

- ✅ **Modular architecture** with clear separation of concerns
- ✅ **Robust error handling** with fallback mechanisms
- ✅ **Extensive logging** for debugging and monitoring
- ✅ **API-first approach** enabling future enhancements

## 🔄 Future Enhancements

- [ ] **Multi-currency coupon support**
- [ ] **Advanced attribution tracking** (UTM parameters, referrers)
- [ ] **Batch order processing** for high-volume scenarios
- [ ] **Real-time order status updates** via webhooks
- [ ] **Enhanced testing suite** with automated integration tests

---

## 📞 Support

For issues related to this integration:

1. **Check browser console** for detailed error logs
2. **Verify WordPress configuration** and Application Password setup
3. **Test admin order creation API** independently
4. **Review WooCommerce order metadata** in WordPress admin

**System Status**: ✅ **Production Ready** - All major functionality implemented and tested.
