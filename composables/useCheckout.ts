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
    };
  });

  const isProcessingOrder = useState<boolean>("isProcessingOrder", () => false);

  // if Country or State are changed, calculate the shipping rates again
  async function updateShippingLocation() {
    const { customer, viewer } = useAuth();
    const { isUpdatingCart, refreshCart } = useCart();

    isUpdatingCart.value = true;

    try {
      const { updateCustomer } = await GqlUpdateCustomer({
        input: {
          id: viewer?.value?.id,
          shipping: orderInput.value.shipToDifferentAddress
            ? customer.value.shipping
            : customer.value.billing,
          billing: customer.value.billing,
        } as UpdateCustomerInput,
      });

      if (updateCustomer) refreshCart();
    } catch (error) {
      console.error(error);
    }
  }

  function openPayPalWindow(redirectUrl: string): Promise<boolean> {
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
        if (payPalWindow?.closed) {
          clearInterval(timer);
          resolve(true);
        }
      }, 500);
    });
  }

  const getPaymentId = () => {
    return orderInput.value.paymentMethod.id
      ? orderInput.value.paymentMethod.id
      : "fkwcs_stripe";
  };

  const proccessCheckout = async (isPaid = false) => {
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

      let checkoutPayload: CheckoutInput = {
        billing,
        shipping,
        shippingMethod,
        metaData: orderInput.value.metaData,
        paymentMethod: getPaymentId(),
        customerNote: orderInput.value.customerNote,
        shipToDifferentAddress,
        transactionId: orderInput.value.transactionId,
        isPaid,
      };

      // Create account
      if (orderInput.value.createAccount) {
        checkoutPayload.account = { username, password } as CreateAccountInput;
      } else {
        // Remove account from checkoutPayload
        checkoutPayload.account = null;
      }

      const { checkout } = await GqlCheckout(checkoutPayload);

      // Check if checkout was successful
      if (checkout?.result !== "success") {
        alert("There was an error processing your order. Please try again.");
        window.location.reload();
        return checkout;
      }

      // handle login
      if (orderInput.value.createAccount) {
        await loginUser({ username, password });
      }

      const orderId = checkout?.order?.databaseId;
      const orderKey = checkout?.order?.orderKey;
      const orderInputPaymentId = orderInput.value.paymentMethod.id;
      const isPayPal =
        orderInputPaymentId === "paypal" ||
        orderInputPaymentId === "ppcp-gateway";

      // First empty the cart for all successful orders - BEFORE redirection
      try {
        await emptyCart();
        await refreshCart();
        console.log("Cart emptied successfully after order completion");
      } catch (cartError) {
        console.error("Error emptying cart:", cartError);
      }

      // Handle redirects after cart is emptied
      if (checkout?.redirect && isPayPal) {
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
    } catch (error: any) {
      isProcessingOrder.value = false;

      const errorMessage = error?.gqlErrors?.[0].message;

      if (
        errorMessage?.includes(
          "An account is already registered with your email address"
        )
      ) {
        alert("An account is already registered with your email address");
        return null;
      }

      alert(errorMessage);
      return null;
    }

    isProcessingOrder.value = false;
  };

  return {
    orderInput,
    isProcessingOrder,
    proccessCheckout,
    updateShippingLocation,
  };
}
