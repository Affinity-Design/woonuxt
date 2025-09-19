export default defineEventHandler(async (event) => {
  try {
    // Test data simulating a cart with coupon applied
    const testData = {
      transactionId: `test-helcim-${Date.now()}`,
      billing: {
        firstName: "Test",
        lastName: "Customer",
        email: "test@example.com",
        address1: "123 Test St",
        city: "Toronto",
        state: "ON",
        postcode: "M5V 3A1",
        country: "CA",
        phone: "416-555-0123",
      },
      shipping: {
        firstName: "Test",
        lastName: "Customer",
        address1: "123 Test St",
        city: "Toronto",
        state: "ON",
        postcode: "M5V 3A1",
        country: "CA",
      },
      lineItems: [
        {
          productId: 16774, // Your skate product
          quantity: 1,
          name: "Test Skate Product",
        },
      ],
      coupons: [
        {
          code: "TESTCOUPON",
          discountAmount: "0.50",
          discountTax: "0.065",
        },
      ],
      customerNote: "Test order with coupon simulation",
    };

    console.log(
      "Testing admin order creation with test data:",
      JSON.stringify(testData, null, 2)
    );

    // Call the admin order creation API
    const response = await $fetch("/api/create-admin-order", {
      method: "POST",
      body: testData,
    });

    return {
      success: true,
      message: "Test admin order created successfully",
      testData,
      response,
    };
  } catch (error: any) {
    console.error("Test admin order creation failed:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
      stack: error.stack,
    };
  }
});
