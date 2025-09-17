import type { CreateAccountInput } from "#gql";

export function useCheckout() {
  const { t } = useI18n();
  const orderInput = useState<any>("orderInput", () => {
    return {
      customerNote: "",
      paymentMethod: "",
      shipToDifferentAddress: false,
      metaData: [
        { key: "order_via", value: "WooNuxt" },
        // Order attribution metadata to track source
        { key: "_wc_order_attribution_source_type", value: "direct" },
        { key: "_wc_order_attribution_referrer", value: "proskatersplace.ca" },
        {
          key: "_wc_order_attribution_utm_source",
          value: "proskatersplace.ca",
        },
        { key: "_wc_order_attribution_utm_medium", value: "headless" },
        { key: "_wc_order_attribution_utm_content", value: "nuxt-frontend" },
        {
          key: "_wc_order_attribution_session_entry",
          value: "proskatersplace.ca",
        },
        { key: "_wc_order_attribution_device_type", value: "Web" },
        { key: "order_source", value: "proskatersplace.ca" },
        { key: "frontend_origin", value: "proskatersplace.ca" },
      ],
      username: "",
      password: "",
      transactionId: "",
      createAccount: false, // Make sure this is explicitly false, not undefined
    };
  });

  const isProcessingOrder = useState<boolean>("isProcessingOrder", () => false);

  // Function to add or update order attribution metadata
  const setOrderAttribution = (
    attributionData: Record<string, string>
  ): void => {
    // Add session timing information
    const currentTime = new Date().toISOString();
    const defaultAttribution = {
      _wc_order_attribution_session_start_time: currentTime,
      _wc_order_attribution_session_pages: "1",
      _wc_order_attribution_session_count: "1",
      _wc_order_attribution_user_agent: navigator.userAgent || "Unknown",
      ...attributionData,
    };

    // Add or update attribution metadata
    Object.entries(defaultAttribution).forEach(([key, value]) => {
      const existingIndex = orderInput.value.metaData.findIndex(
        (meta: any) => meta.key === key
      );
      if (existingIndex >= 0) {
        orderInput.value.metaData[existingIndex].value = value;
      } else {
        orderInput.value.metaData.push({ key, value });
      }
    });
  };

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
        } as any,
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
    const { customer, viewer } = useAuth();
    const { cart } = useCart();

    try {
      // Basic validation
      if (!customer.value?.billing?.email) {
        return {
          success: false,
          error: true,
          errorMessage: t(
            "messages.billing.emailRequired",
            "Email address is required"
          ),
        };
      }

      if (!cart.value || cart.value.isEmpty) {
        return {
          success: false,
          error: true,
          errorMessage: t("messages.shop.cartEmpty", "Cart is empty"),
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
          // This could be a generic failure from GqlValidateCheckout (e.g., invalid email format)
          // Applicable to both logged-in users and guests.
          alert(
            validateData.message ||
              t(
                "messages.error.validationFailed",
                "There was an error validating your account."
              )
          );
          return {
            success: false,
            error: true,
            errorMessage: validateData.message,
          };
        }

        // Account related validations should ONLY apply to GUESTS
        if (!viewer.value) {
          // If guest is trying to create an account and email is already registered
          if (
            orderInput.value.createAccount &&
            (validateData.userExists || !validateData.emailAvailable)
          ) {
            const msg = t(
              "messages.account.emailExists",
              "An account is already registered with your email address. Please log in to continue."
            );
            alert(msg);
            return {
              success: false,
              error: true,
              errorMessage: msg,
              needsLogin: true,
            };
          }

          // If guest is NOT creating an account but email belongs to a registered user
          if (!orderInput.value.createAccount && validateData.userExists) {
            const msg = t(
              "messages.account.emailExistsLogin",
              "An account is already registered with your email address. Please log in to continue, or use a different email address."
            );
            alert(msg);
            return {
              success: false,
              error: true,
              errorMessage: msg,
              needsLogin: true,
            };
          }
        }
        // If viewer.value is true (user is logged in), the above guest-specific checks are skipped.
        // validateData.success being true is sufficient at this point for a logged-in user regarding account status.
      } catch (validationError) {
        console.error(
          "GqlValidateCheckout failed during pre-payment validation:",
          validationError
        );

        // Fallback validation logic (attempt GqlCheckout with minimal payload)
        // This fallback is more relevant for guests if GqlValidateCheckout endpoint fails.
        try {
          let validationPayload: any = {
            billing: { email }, // Only include email for validation
            paymentMethod: "cod", // Use COD to avoid payment processing
            isPaid: false,
          };

          // Only include account if createAccount is true (should only be for guests)
          if (!viewer.value && orderInput.value.createAccount) {
            validationPayload.account = {
              username: orderInput.value.username || email,
              password: orderInput.value.password,
              turnstileToken: orderInput.value.turnstileToken || "",
            } as CreateAccountInput;
          }

          await GqlCheckout(validationPayload);
          // If GqlCheckout succeeds here, it implies the fallback validation passed.
          // This path is less common.
        } catch (fallbackError: any) {
          console.error(
            "Fallback validation GqlCheckout failed:",
            fallbackError
          );
          const errorMessage = fallbackError?.gqlErrors?.[0]?.message;

          // Check for account already registered error, specifically for guests in fallback
          if (
            !viewer.value &&
            errorMessage?.includes("An account is already registered with")
          ) {
            const msg = t(
              "messages.account.emailExistsLogin",
              "An account is already registered with your email address. Please log in to continue."
            );
            alert(msg);
            return {
              success: false,
              error: true,
              errorMessage: msg,
              needsLogin: true,
            };
          }

          // Other errors from fallback
          if (errorMessage) {
            alert(errorMessage);
            return { success: false, error: true, errorMessage };
          }
          // Generic fallback error
          const genericErrorMsg = t(
            "messages.error.validationUnexpected",
            "An unexpected error occurred during order validation."
          );
          alert(genericErrorMsg);
          return { success: false, error: true, errorMessage: genericErrorMsg };
        }
      }

      // All validation passed
      return { success: true };
    } catch (error: any) {
      console.error("Unexpected error during pre-payment validation:", error);
      const errorMessage =
        error?.gqlErrors?.[0]?.message ||
        t(
          "messages.error.validationUnexpected",
          "An unexpected error occurred during order validation."
        );
      alert(errorMessage);
      return {
        success: false,
        error: true,
        errorMessage: errorMessage,
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

      let checkoutPayload: any = {
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
        checkoutPayload.account = {
          username,
          password,
          turnstileToken: "", // Add required field with empty default
        } as CreateAccountInput;
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
        await loginUser({
          password,
          turnstileToken: "", // Add required field
        } as CreateAccountInput);
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

  // Add Helcim payment processing function
  const processHelcimPayment = async (): Promise<boolean> => {
    try {
      console.log("[processHelcimPayment] Starting Helcim payment process");

      // This function will be called after the HelcimCard component
      // has already processed the payment and emitted success
      // The actual payment processing is handled by the HelcimCard component

      console.log(
        "[processHelcimPayment] Helcim payment completed successfully"
      );
      return true;
    } catch (error: any) {
      console.error("[processHelcimPayment] Error:", error);
      return false;
    }
  };

  return {
    orderInput,
    isProcessingOrder,
    validateOrderPrePayment,
    processCheckout,
    updateShippingLocation,
    setOrderAttribution,
    processHelcimPayment, // Expose Helcim payment processing function
  };
}
