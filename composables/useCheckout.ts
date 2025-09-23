import type { CreateAccountInput } from "#gql";

export function useCheckout() {
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
      createAccount: false,
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
      await GqlUpdateCustomer({
        input: {
          id: viewer?.value?.id,
          shipping: orderInput.value.shipToDifferentAddress
            ? customer.value.shipping
            : customer.value.billing,
          billing: customer.value.billing,
        } as any,
      });

      await refreshCart();
    } catch (error) {
      console.error("Error updating shipping location:", error);
      try {
        await refreshCart();
      } catch (refreshError) {
        console.error("Error refreshing cart:", refreshError);
      }
    } finally {
      isUpdatingCart.value = false;
    }
  }

  const processCheckout = async (isPaid = false): Promise<any> => {
    const { customer, loginUser } = useAuth();
    const router = useRouter();
    const { cart, emptyCart, refreshCart } = useCart();

    isProcessingOrder.value = true;

    const { username, password, shipToDifferentAddress } = orderInput.value;
    const billing = customer.value?.billing;
    const shipping = shipToDifferentAddress
      ? customer.value?.shipping
      : billing;
    const shippingMethod = cart.value?.chosenShippingMethods;

    try {
      // Handle Helcim payments that use COD backend but are actually paid
      const isHelcimPayment =
        orderInput.value.paymentMethod?.title?.includes("Helcim") && isPaid;

      // Keep using COD as payment method but add clear metadata that this is Helcim
      const effectivePaymentMethod =
        orderInput.value.paymentMethod.id || orderInput.value.paymentMethod;

      console.log("[processCheckout] Payment method handling:", {
        originalMethod:
          orderInput.value.paymentMethod.id || orderInput.value.paymentMethod,
        isHelcimPayment,
        effectivePaymentMethod,
        isPaid,
        transactionId: orderInput.value.transactionId,
      });

      // Add Helcim-specific metadata if this is a Helcim payment
      const enhancedMetaData = [...orderInput.value.metaData];
      if (isHelcimPayment) {
        enhancedMetaData.push(
          { key: "_actual_payment_method", value: "helcim" },
          { key: "_payment_method_title", value: "Helcim Credit Card Payment" },
          { key: "_helcim_payment_processed", value: "yes" },
          { key: "_paid_date", value: new Date().toISOString() },
          { key: "_transaction_paid", value: "1" },
          { key: "_order_status_after_payment", value: "processing" }
        );

        console.log(
          "[processCheckout] Added Helcim metadata for COD backend:",
          enhancedMetaData.filter(
            (m) =>
              m.key.includes("helcim") ||
              m.key.includes("payment") ||
              m.key.includes("paid")
          )
        );
      }

      // Try admin order creation for Helcim payments to bypass session issues
      if (isHelcimPayment && orderInput.value.transactionId) {
        console.log(
          "[processCheckout] Using admin order creation for Helcim payment:",
          {
            transactionId: orderInput.value.transactionId,
            amount: cart.value?.total,
            paymentMethod: orderInput.value.paymentMethod,
          }
        );

        try {
          // Prepare admin order data
          const adminOrderData = {
            billing,
            shipping: shipToDifferentAddress ? shipping : billing,
            transactionId: orderInput.value.transactionId,
            lineItems:
              cart.value?.contents?.nodes?.map((item: any) => ({
                productId: item.product?.node?.databaseId,
                variationId: item.variation?.node?.databaseId || null,
                quantity: item.quantity,
                name: item.product?.node?.name,
                // Pass the item's actual total from cart (after discounts)
                total: item.total,
                subtotal: item.subtotal,
              })) || [],
            coupons:
              cart.value?.appliedCoupons?.map((coupon: any) => ({
                code: coupon.code,
                discountAmount: coupon.discountAmount,
                discountTax: coupon.discountTax,
              })) || [],
            // Pass cart totals to ensure correct pricing
            cartTotals: {
              subtotal: cart.value?.subtotal,
              total: cart.value?.total,
              totalTax: cart.value?.totalTax,
              discountTotal: cart.value?.discountTotal,
              discountTax: cart.value?.discountTax,
            },
            shippingMethod: shippingMethod?.[0] || "flat_rate",
            customerNote: orderInput.value.customerNote,
            metaData: enhancedMetaData,
            createAccount: orderInput.value.createAccount,
          };

          console.log("[processCheckout] Calling admin order creation API...");

          // Call our admin order creation API
          const adminOrderResult: any = await $fetch(
            "/api/create-admin-order",
            {
              method: "POST",
              body: adminOrderData,
            }
          );

          if (adminOrderResult.success && adminOrderResult.order) {
            console.log(
              "[processCheckout] Admin order created successfully:",
              adminOrderResult.order
            );

            // Login user if account was created during checkout
            if (orderInput.value.createAccount) {
              await loginUser({
                username,
                password,
                turnstileToken: "", // Required field
              } as CreateAccountInput);
            }

            const orderId = adminOrderResult.order.databaseId;
            const orderKey = adminOrderResult.order.orderKey;

            // Empty cart and redirect to order received page
            try {
              await emptyCart();
              await refreshCart();
              console.log(
                "Cart emptied and refreshed successfully after admin order creation"
              );
            } catch (cartError) {
              console.error("Error emptying cart:", cartError);
            }

            // Redirect to order received page
            router.push(`/checkout/order-received/${orderId}/?key=${orderKey}`);

            return {
              success: true,
              orderId,
              orderKey,
              adminCreated: true,
              transactionId: orderInput.value.transactionId,
            };
          } else {
            console.error(
              "[processCheckout] Admin order creation failed:",
              adminOrderResult.error || "Unknown error"
            );

            // Fall back to regular GraphQL checkout if admin creation fails
            console.log(
              "[processCheckout] Falling back to regular GraphQL checkout..."
            );
          }
        } catch (adminError) {
          console.error(
            "[processCheckout] Admin order creation error:",
            adminError
          );
          console.log(
            "[processCheckout] Falling back to regular GraphQL checkout..."
          );
        }
      }

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
      };

      // Create account
      if (orderInput.value.createAccount) {
        checkoutPayload.account = {
          username,
          password,
          turnstileToken: "", // Required field
        } as CreateAccountInput;
      } else {
        // Remove account from checkoutPayload if not creating account
        checkoutPayload.account = null;
      }

      console.log("[processCheckout] Finalizing order with payload:", {
        isPaid,
        paymentMethod: checkoutPayload.paymentMethod,
        transactionId: orderInput.value.transactionId,
      });

      // Enhanced session management: Always refresh to get latest session token
      console.log(
        "[processCheckout] Ensuring fresh session before checkout..."
      );
      const { refreshCart } = useCart();

      try {
        // Always refresh cart to ensure we have the latest session token
        await refreshCart();

        // Get the session token from cookie after refresh
        const { getDomain } = useHelpers();
        const sessionToken = useCookie("woocommerce-session", {
          domain: getDomain(window?.location?.href || ""),
        });

        console.log("[processCheckout] Session validation:", {
          hasToken: !!sessionToken.value,
          tokenLength: sessionToken.value?.length,
          customerHasSession: !!customer.value?.sessionToken,
        });

        // Prefer the customer.sessionToken from the refresh if available
        const activeSessionToken =
          customer.value?.sessionToken || sessionToken.value;

        if (activeSessionToken) {
          useGqlHeaders({
            "woocommerce-session": `Session ${activeSessionToken}`,
          });

          // Update cookie to match customer session token
          if (
            customer.value?.sessionToken &&
            customer.value.sessionToken !== sessionToken.value
          ) {
            sessionToken.value = customer.value.sessionToken;
            console.log(
              "[processCheckout] Updated session cookie to match customer token"
            );
          }

          console.log("[processCheckout] Session header set for checkout");
        } else {
          throw new Error(
            "Unable to establish valid session token for checkout"
          );
        }
      } catch (refreshError) {
        console.error(
          "[processCheckout] Failed to refresh session:",
          refreshError
        );
        alert(
          "Unable to establish session for checkout. Please refresh the page and try again."
        );
        return {
          success: false,
          error: true,
          errorMessage: "Session establishment failed",
        };
      }

      let checkout: any = null;

      try {
        console.log("[processCheckout] Sending checkout payload:", {
          paymentMethod: checkoutPayload.paymentMethod,
          transactionId: checkoutPayload.transactionId,
          isPaid: checkoutPayload.isPaid,
          billing: {
            firstName: checkoutPayload.billing?.firstName,
            lastName: checkoutPayload.billing?.lastName,
            email: checkoutPayload.billing?.email,
            phone: checkoutPayload.billing?.phone,
            address1: checkoutPayload.billing?.address1,
            city: checkoutPayload.billing?.city,
            state: checkoutPayload.billing?.state,
            postcode: checkoutPayload.billing?.postcode,
            country: checkoutPayload.billing?.country,
          },
          shipping: {
            firstName: checkoutPayload.shipping?.firstName,
            lastName: checkoutPayload.shipping?.lastName,
            address1: checkoutPayload.shipping?.address1,
            city: checkoutPayload.shipping?.city,
            state: checkoutPayload.shipping?.state,
            postcode: checkoutPayload.shipping?.postcode,
            country: checkoutPayload.shipping?.country,
          },
          shippingMethod: checkoutPayload.shippingMethod,
          customerNote: checkoutPayload.customerNote,
          metaData: checkoutPayload.metaData,
          createAccount: !!orderInput.value.createAccount,
        });

        const result = await GqlCheckout(checkoutPayload);
        checkout = result.checkout;

        if (checkout?.result !== "success") {
          let errorMessage =
            "There was an error processing your order. Please try again.";

          try {
            const messages = JSON.parse(checkout?.messages || "{}");
            if (messages.error) errorMessage = messages.error;
          } catch (e) {
            if (checkout?.messages) errorMessage = checkout.messages;
          }

          console.error("[processCheckout] Checkout failed:", {
            result: checkout?.result,
            messages: checkout?.messages,
            errorMessage,
          });

          alert(errorMessage);
          return { success: false, error: true, errorMessage };
        }
      } catch (gqlError: any) {
        console.error("[processCheckout] GraphQL Error Details:", {
          fullError: gqlError,
          statusCode: gqlError?.statusCode,
          gqlErrors: gqlError?.gqlErrors,
          networkError: gqlError?.networkError,
          response: gqlError?.response,
          extensions: gqlError?.extensions,
        });

        // Log individual GraphQL errors for better debugging
        if (gqlError?.gqlErrors?.length > 0) {
          gqlError.gqlErrors.forEach((err: any, index: number) => {
            console.error(`[processCheckout] GraphQL Error ${index + 1}:`, {
              message: err.message,
              locations: err.locations,
              path: err.path,
              extensions: err.extensions,
            });
          });
        }

        // Check for session-related errors
        const isSessionError = gqlError?.gqlErrors?.some(
          (err: any) =>
            err.message?.includes("no session found") ||
            err.message?.includes("session")
        );

        if (isSessionError) {
          console.log(
            "[processCheckout] Session error detected, attempting recovery..."
          );

          // Try to refresh cart and get new session token
          const { refreshCart } = useCart();
          await refreshCart();

          // Get fresh session token after refresh
          const { getDomain } = useHelpers();
          const freshSessionToken = useCookie("woocommerce-session", {
            domain: getDomain(window?.location?.href || ""),
          });

          // Use customer.sessionToken if available, otherwise use cookie
          const recoveredSessionToken =
            customer.value?.sessionToken || freshSessionToken.value;

          if (recoveredSessionToken) {
            useGqlHeaders({
              "woocommerce-session": `Session ${recoveredSessionToken}`,
            });

            // Update cookie if needed
            if (customer.value?.sessionToken) {
              freshSessionToken.value = customer.value.sessionToken;
            }
          }

          try {
            console.log(
              "[processCheckout] Retrying checkout after session refresh..."
            );
            const retryResult = await GqlCheckout(checkoutPayload);
            checkout = retryResult.checkout;

            if (checkout?.result !== "success") {
              throw new Error("Checkout failed after session recovery");
            }
            console.log("[processCheckout] Retry successful!");
          } catch (retryError) {
            console.error("[processCheckout] Retry failed:", retryError);
            alert("Session expired. Please refresh the page and try again.");
            return {
              success: false,
              error: true,
              errorMessage: "Session expired",
            };
          }
        } else {
          // Other GraphQL errors
          const errorMessage =
            gqlError?.gqlErrors?.[0]?.message ||
            gqlError.message ||
            "Checkout failed";
          console.error(
            "[processCheckout] Non-session GraphQL error:",
            errorMessage
          );
          alert(errorMessage);
          return { success: false, error: true, errorMessage };
        }
      }

      // Login user if account was created during checkout
      if (orderInput.value.createAccount) {
        await loginUser({
          username,
          password,
          turnstileToken: "", // Required field
        } as CreateAccountInput);
      }

      const orderId = checkout?.order?.databaseId;
      const orderKey = checkout?.order?.orderKey;

      // Empty cart and redirect to order received page
      try {
        await emptyCart();
        await refreshCart();
        console.log(
          "Cart emptied and refreshed successfully after order completion"
        );
      } catch (cartError) {
        console.error("Error emptying cart:", cartError);
      }

      // Simple redirect - no PayPal/Stripe complexity needed for Helcim
      router.push(`/checkout/order-received/${orderId}/?key=${orderKey}`);

      return { success: true, orderId, orderKey };
    } catch (error: any) {
      const errorMessage = error?.gqlErrors?.[0]?.message;

      console.error("[processCheckout] Error:", {
        gqlErrors: error?.gqlErrors,
        networkError: error?.networkError,
        paymentMethod: orderInput.value.paymentMethod,
        transactionId: orderInput.value.transactionId,
        isPaidFlag: isPaid,
      });

      if (errorMessage?.includes("An account is already registered with")) {
        const accountErrorMsg =
          "An account is already registered with your email address. Please log in to continue.";
        alert(accountErrorMsg);
        return {
          success: false,
          error: true,
          errorMessage: accountErrorMsg,
          needsLogin: true,
        };
      }

      const finalErrorMessage =
        errorMessage || "An unexpected error occurred during checkout.";
      alert(finalErrorMessage);
      return {
        success: false,
        error: true,
        errorMessage: finalErrorMessage,
      };
    } finally {
      isProcessingOrder.value = false;
    }
  };

  return {
    orderInput,
    isProcessingOrder,
    processCheckout,
    updateShippingLocation,
    setOrderAttribution,
  };
}
