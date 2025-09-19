// Debug Session Headers in GraphQL Client
// Add this temporarily to your checkout flow to debug session issues

export default defineEventHandler(async (event) => {
  try {
    console.log("🔍 Debugging GraphQL Client Session Headers...");

    // Test the exact same mutation that's failing in production
    const testPayload = {
      billing: {
        firstName: "Test",
        lastName: "User",
        email: "test@proskatersplace.com",
        phone: "555-0123",
        address1: "123 Test St",
        city: "Test City",
        country: "CA",
        postcode: "K1A0A6",
      },
      paymentMethod: "cod",
      isPaid: true,
      transactionId: "DEBUG_SESSION_TEST",
      metaData: [{ key: "debug_test", value: "true" }],
    };

    // First, try to get cart to establish session
    console.log("1. Establishing session with getCart...");
    const { cart } = await GqlGetCart();
    console.log("Cart session established:", !!cart);

    // Check if cart has items (this might be the issue)
    if (cart?.isEmpty !== false) {
      console.log("⚠️  Cart is empty, this might cause checkout to fail");
    }

    // Now try checkout immediately after cart call
    console.log("2. Attempting checkout with same session...");
    const { checkout } = await GqlCheckout(testPayload);

    return {
      success: !!checkout?.result,
      result: checkout?.result,
      order: checkout?.order,
      message:
        checkout?.result === "success"
          ? "Checkout successful - session is working"
          : "Checkout failed - session issue confirmed",
    };
  } catch (error: any) {
    console.error("Session debug error:", error);

    // Check if it's the specific session error
    const isSessionError = error.message?.includes("no session found");

    return {
      success: false,
      error: error.message,
      isSessionError,
      diagnosis: isSessionError
        ? "CONFIRMED: Session not persisting between GraphQL calls"
        : "Different error - not session related",
    };
  }
});
