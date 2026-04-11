import type {AddToCartInput} from '#gql';
import {applyAuthoritativeCartPricing} from '~/utils/authoritativePricing';

/**
 * @name useCart
 * @description A composable that handles the cart in local storage
 */
export function useCart() {
  const {storeSettings} = useAppConfig();

  const cart = useState<Cart | null>('cart', () => null);
  const isShowingCart = useState<boolean>('isShowingCart', () => false);
  const isUpdatingCart = useState<boolean>('isUpdatingCart', () => false);
  const isUpdatingCoupon = useState<boolean>('isUpdatingCoupon', () => false);
  const isRefreshPending = useState<boolean>('isRefreshPending', () => false);
  const paymentGateways = useState<PaymentGateways | null>('paymentGateways', () => null);
  const {logGQLError, clearAllCookies} = useHelpers();

  async function overlayAuthoritativeCartPricing(cartPayload?: Cart | null): Promise<Cart | null> {
    const slugs = Array.from(
      new Set((cartPayload?.contents?.nodes || []).map((item) => item?.product?.node?.slug).filter(Boolean) as string[]),
    );

    if (!cartPayload || !slugs.length) {
      return cartPayload || null;
    }

    try {
      const authorityResponse = await $fetch<{enabled?: boolean; products?: Record<string, any>}>('/api/authoritative-product-prices', {
        method: 'POST',
        body: {
          slugs,
        },
      });

      if (!authorityResponse?.enabled || !authorityResponse.products) {
        return cartPayload;
      }

      return (applyAuthoritativeCartPricing(cartPayload, authorityResponse.products) as Cart) || cartPayload;
    } catch (error) {
      console.warn('[useCart] Failed to overlay authoritative cart pricing:', error);
      return cartPayload;
    }
  }

  /** Refesh the cart from the server
   * @returns {Promise<boolean>} - A promise that resolves
   * to true if the cart was successfully refreshed
   */
  async function refreshCart(): Promise<boolean> {
    try {
      const {cart, customer, viewer, paymentGateways, loginClients} = await GqlGetCart();
      const {updateCustomer, updateViewer, updateLoginClients} = useAuth();
      const authoritativeCart = await overlayAuthoritativeCartPricing(cart);

      if (authoritativeCart) updateCart(authoritativeCart);
      if (customer) updateCustomer(customer);
      if (viewer) updateViewer(viewer);
      if (paymentGateways) updatePaymentGateways(paymentGateways);
      if (loginClients) updateLoginClients(loginClients.filter((client) => client !== null));

      return true; // Cart was successfully refreshed
    } catch (error: any) {
      logGQLError(error);
      clearAllCookies();
      resetInitialState();
      return false; // Cart was not successfully refreshed
    } finally {
      isRefreshPending.value = false;
      isUpdatingCart.value = false;
    }
  }

  function resetInitialState() {
    cart.value = null;
    paymentGateways.value = null;
  }

  function updateCart(payload?: Cart | null): void {
    cart.value = payload || null;
  }

  function updatePaymentGateways(payload: PaymentGateways): void {
    paymentGateways.value = payload;
  }

  // toggle the cart visibility
  function toggleCart(state: boolean | undefined = undefined): void {
    isShowingCart.value = state ?? !isShowingCart.value;
  }

  // add an item to the cart - uses server-side API to avoid 403 errors from WordPress
  async function addToCart(input: AddToCartInput): Promise<{success: boolean; message?: string}> {
    isUpdatingCart.value = true;
    const toast = useToast();

    try {
      // Use server-side API to bypass CORS/security blocks on client-side GraphQL
      const response = await $fetch<{success: boolean; cart?: Cart; message?: string}>('/api/add-to-cart', {
        method: 'POST',
        body: {
          productId: input.productId,
          quantity: input.quantity || 1,
          variationId: input.variationId,
          extraData: input.extraData,
        },
      });

      if (response?.cart) {
        cart.value = await overlayAuthoritativeCartPricing(response.cart);
      }

      // Auto open the cart when an item is added to the cart if the setting is enabled
      const {storeSettings} = useAppConfig();
      if (storeSettings.autoOpenCart && !isShowingCart.value) toggleCart(true);

      // Refresh cart in the background to get complete price fields
      // (addToCart mutation may return incomplete variation price data)
      // Don't reset isUpdatingCart here — refreshCart() will reset it when done,
      // keeping the skeleton visible until final cart data arrives.
      isRefreshPending.value = true;
      refreshCart();

      return {success: true};
    } catch (error: any) {
      logGQLError(error);

      // Extract user-friendly error message from the API error
      let errorMessage = 'Unable to add item to cart. Please try again.';

      // Check for error message in response data
      const apiMessage = error?.data?.message || error?.message || '';

      if (apiMessage) {
        // WooCommerce stock error patterns - use the message directly as it's usually descriptive
        // Common patterns: "You cannot add that amount", "not enough stock", "only X left in stock"
        if (
          apiMessage.toLowerCase().includes('stock') ||
          apiMessage.toLowerCase().includes('quantity') ||
          apiMessage.toLowerCase().includes('cannot') ||
          apiMessage.toLowerCase().includes('not enough') ||
          apiMessage.toLowerCase().includes('only') ||
          apiMessage.toLowerCase().includes('available') ||
          apiMessage.toLowerCase().includes('add that amount')
        ) {
          errorMessage = apiMessage;
        }
      }

      // Show toast notification with error message (HTML entities decoded automatically)
      toast.error(errorMessage);

      // Only reset loading state on error — success path relies on refreshCart() to reset
      isUpdatingCart.value = false;
      return {success: false, message: errorMessage};
    }
  }

  // remove an item from the cart (uses server-side API to avoid 403 errors)
  async function removeItem(key: string) {
    isUpdatingCart.value = true;
    try {
      // Get session token from cookie
      const sessionToken = useCookie('woocommerce-session').value;

      const response = await $fetch('/api/update-cart-quantity', {
        method: 'POST',
        body: {
          key,
          quantity: 0,
          sessionToken,
        },
      });

      if (response.success && response.cart) {
        updateCart(await overlayAuthoritativeCartPricing(response.cart));
      }
    } catch (error: any) {
      console.error('[removeItem] Error:', error);
      const toast = useToast();
      toast.error(error.data?.message || error.message || 'Failed to remove item');
    } finally {
      isUpdatingCart.value = false;
    }
  }

  // update the quantity of an item in the cart (uses server-side API to avoid 403 errors)
  async function updateItemQuantity(key: string, quantity: number): Promise<void> {
    isUpdatingCart.value = true;
    try {
      // Get session token from cookie
      const sessionToken = useCookie('woocommerce-session').value;

      const response = await $fetch('/api/update-cart-quantity', {
        method: 'POST',
        body: {
          key,
          quantity,
          sessionToken,
        },
      });

      if (response.success && response.cart) {
        updateCart(await overlayAuthoritativeCartPricing(response.cart));
      }
    } catch (error: any) {
      console.error('[updateItemQuantity] Error:', error);
      const toast = useToast();
      toast.error(error.data?.message || error.message || 'Failed to update quantity');
    } finally {
      isUpdatingCart.value = false;
    }
  }

  // empty the cart
  async function emptyCart(): Promise<void> {
    try {
      isUpdatingCart.value = true;
      const {emptyCart} = await GqlEmptyCart();
      updateCart(await overlayAuthoritativeCartPricing(emptyCart?.cart));
    } catch (error: any) {
      logGQLError(error);
    }
  }

  // Update shipping method
  async function updateShippingMethod(shippingMethods: string) {
    isUpdatingCart.value = true;
    const {updateShippingMethod} = await GqlChangeShippingMethod({shippingMethods});
    updateCart(await overlayAuthoritativeCartPricing(updateShippingMethod?.cart));
  }

  // Apply coupon
  async function applyCoupon(code: string): Promise<{message: string | null}> {
    try {
      isUpdatingCoupon.value = true;
      const {applyCoupon} = await GqlApplyCoupon({code});
      updateCart(await overlayAuthoritativeCartPricing(applyCoupon?.cart));
      isUpdatingCoupon.value = false;
    } catch (error: any) {
      isUpdatingCoupon.value = false;
      logGQLError(error);
    }
    return {message: null};
  }

  // Remove coupon
  async function removeCoupon(code: string): Promise<void> {
    try {
      isUpdatingCart.value = true;
      const {removeCoupons} = await GqlRemoveCoupons({codes: [code]});
      updateCart(await overlayAuthoritativeCartPricing(removeCoupons?.cart));
    } catch (error) {
      logGQLError(error);
      isUpdatingCart.value = false;
    }
  }

  // Stop the loading spinner when the cart is updated,
  // but not if a background refreshCart() is still pending
  watch(cart, (val) => {
    if (!isRefreshPending.value) {
      isUpdatingCart.value = false;
    }
  });

  // Check if all products in the cart are virtual
  const allProductsAreVirtual = computed(() => {
    const nodes = cart.value?.contents?.nodes || [];
    return nodes.length === 0 ? false : nodes.every((node) => (node.product?.node as SimpleProduct)?.virtual === true);
  });

  // Check if the billing address is enabled
  const isBillingAddressEnabled = computed(() => (storeSettings.hideBillingAddressForVirtualProducts ? !allProductsAreVirtual.value : true));

  return {
    cart,
    isShowingCart,
    isUpdatingCart,
    isUpdatingCoupon,
    paymentGateways,
    isBillingAddressEnabled,
    updateCart,
    refreshCart,
    toggleCart,
    addToCart,
    removeItem,
    updateItemQuantity,
    emptyCart,
    updateShippingMethod,
    applyCoupon,
    removeCoupon,
  };
}
