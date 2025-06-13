import type {
  CheckoutInput,
  UpdateCustomerInput,
  CreateAccountInput,
} from "#gql";

export function useCheckout() {
  const orderInput = useState<any>("orderInput", () => {
    return {
      customerNote: "",
      paymentMethod: "",
      shipToDifferentAddress: false,
      metaData: [{ key: "order_via", value: "WooNuxt" }],
      username: "",
      password: "",
      transactionId: "",
      createAccount: false, // Make sure this is explicitly false, not undefined
    };
  });

  const isProcessingOrder = useState<boolean>("isProcessingOrder", () => false);

  // if Country or State are changed, calculate the shipping rates again
  async function updateShippingLocation(): Promise<void> {
    const { customer, viewer } = useAuth();
    const { isUpdatingCart, refreshCart } = useCart();

    isUpdatingCart.value = true;

    try {
      // Call GqlUpdateCustomer for both logged-in users (with ID) and guests (ID will be undefined).
      // The backend mutation should handle an undefined ID by updating session data for guests.
      await GqlUpdateCustomer({
        input: {
          id: viewer?.value?.id, // Pass viewer.value.id; will be undefined for guests
          shipping: orderInput.value.shipToDifferentAddress
            ? customer.value.shipping
            : customer.value.billing,
          billing: customer.value.billing,
        } as UpdateCustomerInput,
      });

      // After attempting to update the customer/session address,
      // always refresh the cart to fetch new shipping rates.
      await refreshCart();
    } catch (error) {
      console.error(
        "Error updating shipping location or refreshing cart:",
        error
      );
      // Even if GqlUpdateCustomer fails, try to refresh the cart.
      // This allows WooCommerce to potentially calculate shipping based on any existing session data
      // or fall back to default rates.
      try {
        if (!isUpdatingCart.value) {
          // Avoid double setting if error was in refreshCart itself
          isUpdatingCart.value = true; // Ensure it's true before this refreshCart
        }
        console.log(
          "Attempting to refresh cart after an error in updateShippingLocation..."
        );
        await refreshCart();
      } catch (refreshError) {
        console.error(
          "Error refreshing cart after GqlUpdateCustomer failure:",
          refreshError
        );
      }
    } finally {
      isUpdatingCart.value = false;
    }
  }

  async function openPayPalWindow(redirectUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      const width = 750;
      const height = 750;
      const left = window.innerWidth / 2 - width / 2;
      const top = window.innerHeight / 2 - height / 2 + 80;
      const payPalWindow = window.open(
        redirectUrl,
        "",
        `width=${width},height=${height},top=${top},left=${left}`
      );
      const timer = setInterval(() => {
        if (payPalWindow && payPalWindow.closed) {
          clearInterval(timer);
          resolve(true);
        }
      }, 500);
    });
  }

  const getPaymentId = (): string => {
    // Make this more robust - often the issue is the payment method ID format
    if (!orderInput.value.paymentMethod) return "fkwcs_stripe";
    return (
      orderInput.value.paymentMethod.id ||
      orderInput.value.paymentMethod ||
      "fkwcs_stripe"
    );
  };

  // VALIDATION FUNCTION: Checks for errors before payment
  const validateOrderPrePayment = async (): Promise<{
    success: boolean;
    error?: boolean;
    errorMessage?: string;
    needsLogin?: boolean;
  }> => {
    const { customer } = useAuth();
    const { cart } = useCart();

    try {
      // Basic validation
      if (!customer.value?.billing?.email) {
        return {
          success: false,
          error: true,
          errorMessage: "Email address is required",
        };
      }

      if (!cart.value || cart.value.isEmpty) {
        return {
          success: false,
          error: true,
          errorMessage: "Cart is empty",
        };
      }

      const email = customer.value?.billing?.email;

      try {
        // Use our dedicated validation endpoint
        const response = await GqlValidateCheckout({
          email: email,
          username: orderInput.value.username || email,
        });

        const validateData = response.validateCheckoutData;

        if (!validateData.success) {
          alert(
            validateData.message ||
              "There was an error validating your account."
          );
          return {
            success: false,
            error: true,
            errorMessage: validateData.message,
          };
        }

        // If creating account and email is already registered, fail
        if (
          orderInput.value.createAccount &&
          (validateData.userExists || !validateData.emailAvailable)
        ) {
          alert(
            "An account is already registered with your email address. Please log in to continue."
          );
          return {
            success: false,
            error: true,
            errorMessage:
              "An account is already registered with your email address. Please log in to continue.",
            needsLogin: true,
          };
        }

        // If NOT creating account but email exists, still might cause issues
        // Let's warn and prevent
        if (!orderInput.value.createAccount && validateData.userExists) {
          alert(
            "An account is already registered with your email address. Please log in to continue, or use a different email address."
          );
          return {
            success: false,
            error: true,
            errorMessage:
              "An account is already registered with your email address. Please log in to continue.",
            needsLogin: true,
          };
        }
      } catch (validationError) {
        console.error(
          "GqlValidateCheckout failed during pre-payment validation:",
          validationError
        );

        // If our custom validation endpoint fails, fall back to the alternative approach
        try {
          // Create a minimal checkout payload that only tests account creation
          let validationPayload: any = {
            billing: { email }, // Only include email for validation
            paymentMethod: "cod", // Use COD to avoid payment processing
            isPaid: false,
          };

          // Only include account if createAccount is true
          if (orderInput.value.createAccount) {
            validationPayload.account = {
              username: orderInput.value.username || email,
              password: orderInput.value.password,
              turnstileToken: orderInput.value.turnstileToken || "",
            } as CreateAccountInput;
          }

          await GqlCheckout(validationPayload);
        } catch (fallbackError: any) {
          console.error(
            "Fallback validation GqlCheckout failed:",
            fallbackError
          );

          // Check for account already registered error
          const errorMessage = fallbackError?.gqlErrors?.[0]?.message;

          if (errorMessage?.includes("An account is already registered with")) {
            alert(
              "An account is already registered with your email address. Please log in to continue."
            );
            return {
              success: false,
              error: true,
              errorMessage:
                "An account is already registered with your email address. Please log in to continue.",
              needsLogin: true,
            };
          }

          // Other errors
          if (errorMessage) {
            alert(errorMessage);
            return { success: false, error: true, errorMessage };
          }
        }
      }

      // All validation passed
      return { success: true };
    } catch (error: any) {
      console.error("Unexpected error during pre-payment validation:", error);

      // Handle any other errors
      const errorMessage = error?.gqlErrors?.[0]?.message;
      alert(
        errorMessage || "An unexpected error occurred during order validation."
      );
      return {
        success: false,
        error: true,
        errorMessage: errorMessage || "An unexpected error occurred.",
      };
    }
  };

  // PROCESS CHECKOUT: Place order after payment
  const processCheckout = async (isPaid = false): Promise<any> => {
    const { customer, loginUser } = useAuth();
    const router = useRouter();
    const { replaceQueryParam } = useHelpers();
    const { cart, emptyCart, refreshCart } = useCart();

    isProcessingOrder.value = true;

    try {
      const { username, password, shipToDifferentAddress } = orderInput.value;
      const billing = customer.value?.billing;
      const shipping = shipToDifferentAddress
        ? customer.value?.shipping
        : billing;
      const shippingMethod = cart.value?.chosenShippingMethods;
      const paymentMethodId = getPaymentId();

      console.log(
        "[processCheckout] Using payment method ID:",
        paymentMethodId
      );

      let checkoutPayload: CheckoutInput = {
        billing,
        shipping,
        shippingMethod,
        metaData: orderInput.value.metaData,
        paymentMethod: paymentMethodId,
        customerNote: orderInput.value.customerNote,
        shipToDifferentAddress,
        transactionId: orderInput.value.transactionId,
        isPaid,
      };

      // Handle account creation
      if (orderInput.value.createAccount) {
        checkoutPayload.account = { username, password } as CreateAccountInput;
      } else {
        // Remove account from checkoutPayload if not creating account
        checkoutPayload.account = null;
      }

      console.log("[processCheckout] Finalizing order with payload:", {
        isPaid,
        paymentMethod: paymentMethodId,
        transactionId: orderInput.value.transactionId,
      });

      const { checkout } = await GqlCheckout(checkoutPayload);

      if (checkout?.result !== "success") {
        let errorMessage =
          "There was an error processing your order. Please try again.";

        try {
          const messages = JSON.parse(checkout?.messages || "{}");
          if (messages.error) errorMessage = messages.error;
        } catch (e) {
          if (checkout?.messages) errorMessage = checkout.messages;
        }

        alert(errorMessage);
        return { success: false, error: true, errorMessage };
      }

      // Login user if account was created during checkout
      if (orderInput.value.createAccount) {
        await loginUser({ username, password });
      }

      const orderId = checkout?.order?.databaseId;
      const orderKey = checkout?.order?.orderKey;
      const orderInputPaymentId = paymentMethodId;
      const isPayPal =
        orderInputPaymentId === "paypal" ||
        orderInputPaymentId === "ppcp-gateway";

      // Empty cart first - BEFORE any redirects
      try {
        await emptyCart();
        await refreshCart();
        console.log(
          "Cart emptied and refreshed successfully after order completion"
        );
      } catch (cartError) {
        console.error("Error emptying cart:", cartError);
      }

      // Handle redirects after cart is emptied
      if (checkout?.redirect && isPayPal) {
        // PayPal specific handling
        const frontEndUrl = window.location.origin;
        let redirectUrl = checkout?.redirect ?? "";
        const payPalReturnUrl = `${frontEndUrl}/checkout/order-received/${orderId}/?key=${orderKey}&from_paypal=true`;
        const payPalCancelUrl = `${frontEndUrl}/checkout/?cancel_order=true&from_paypal=true`;

        redirectUrl = replaceQueryParam("return", payPalReturnUrl, redirectUrl);
        redirectUrl = replaceQueryParam(
          "cancel_return",
          payPalCancelUrl,
          redirectUrl
        );
        redirectUrl = replaceQueryParam("bn", "WooNuxt_Cart", redirectUrl);

        const isPayPalWindowClosed = await openPayPalWindow(redirectUrl);

        if (isPayPalWindowClosed) {
          router.push(
            `/checkout/order-received/${orderId}/?key=${orderKey}&fetch_delay=true`
          );
        }
      } else {
        // Stripe or other payment methods
        router.push(`/checkout/order-received/${orderId}/?key=${orderKey}`);
      }

      return { success: true, orderId, orderKey };
    } catch (error: any) {
      const errorMessage = error?.gqlErrors?.[0]?.message;

      console.log(
        "GraphQL Error Message from processCheckout:",
        errorMessage,
        error
      );

      if (errorMessage?.includes("An account is already registered with")) {
        alert(
          "An account is already registered with your email address. Please log in to continue."
        );
        return { success: false, error: true, errorMessage, needsLogin: true };
      }

      alert(errorMessage || "An unexpected error occurred during checkout.");
      return {
        success: false,
        error: true,
        errorMessage: errorMessage || "An unexpected error occurred.",
      };
    } finally {
      isProcessingOrder.value = false;
    }
  };

  return {
    orderInput,
    isProcessingOrder,
    validateOrderPrePayment,
    processCheckout,
    updateShippingLocation,
  };
}
