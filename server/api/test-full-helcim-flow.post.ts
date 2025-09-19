// Test Full Helcim Flow - Simulates complete Helcim payment → Admin Order Creation
// This endpoint tests the complete flow that would happen during real checkout

export default defineEventHandler(async (event) => {
  try {
    console.log("🔄 Testing complete Helcim-to-admin-order flow...");

    // Simulate Helcim payment data
    const simulatedTransactionId = `helcim-${Date.now()}`;
    const simulatedCustomerData = {
      billing: {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        phone: "555-123-4567",
        company: "Test Company",
        address1: "123 Main Street",
        address2: "Suite 200",
        city: "Toronto",
        state: "ON",
        postcode: "M5V 3K4",
        country: "CA",
      },
      shipping: {
        firstName: "John",
        lastName: "Doe",
        company: "Test Company",
        address1: "123 Main Street",
        address2: "Suite 200",
        city: "Toronto",
        state: "ON",
        postcode: "M5V 3K4",
        country: "CA",
      },
      lineItems: [
        {
          productId: 114132, // ZETAZS Trident Pro Electric Longboard
          quantity: 1,
          price: 899.99,
          name: "ZETAZS Trident Pro Electric Longboard",
        },
      ],
      transactionId: simulatedTransactionId,
      customerNote: "Test order from full Helcim flow simulation",
      shippingMethod: "flat_rate",
    };

    console.log("💳 Simulated Helcim payment completed:", {
      transactionId: simulatedTransactionId,
      amount: "$899.99 CAD",
      customer: `${simulatedCustomerData.billing.firstName} ${simulatedCustomerData.billing.lastName}`,
      items: simulatedCustomerData.lineItems.length,
    });

    // Now call our admin order creation API (the same way the real checkout would)
    console.log("🔧 Creating admin order via GraphQL...");

    const adminOrderResult: any = await $fetch("/api/create-admin-order", {
      method: "POST",
      body: simulatedCustomerData,
    });

    if (adminOrderResult.success && adminOrderResult.order) {
      console.log("✅ Complete flow test SUCCESSFUL!");

      return {
        success: true,
        message: "Complete Helcim-to-admin-order flow test successful!",
        flow: {
          step1: "✅ Helcim payment simulation",
          step2: "✅ Admin order creation via GraphQL",
          step3: "✅ Order successfully created",
        },
        simulatedPayment: {
          transactionId: simulatedTransactionId,
          amount: "$899.99 CAD",
          method: "helcim",
        },
        createdOrder: {
          orderId: adminOrderResult.order.databaseId,
          orderNumber: adminOrderResult.order.orderNumber,
          orderKey: adminOrderResult.order.orderKey,
          status: adminOrderResult.order.status,
          total: adminOrderResult.order.total,
          paymentMethod: adminOrderResult.order.paymentMethod,
          transactionId: adminOrderResult.order.transactionId,
        },
        checkoutUrl: `/checkout/order-received/${adminOrderResult.order.databaseId}/?key=${adminOrderResult.order.orderKey}`,
        adminOrderData: adminOrderResult,
      };
    } else {
      return {
        success: false,
        error: "Admin order creation failed",
        details: adminOrderResult,
      };
    }
  } catch (error: any) {
    console.error("❌ Full flow test failed:", error);
    return {
      success: false,
      error: "Full Helcim flow test failed",
      details: error.message,
      stack: error.stack,
    };
  }
});
