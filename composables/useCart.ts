import type {AddToCartInput} from '#gql';
import {createCartRefreshCoordinator, finalizeSuccessfulCartMutation, prepareCartSessionForMutation} from '~/utils/cartRefreshCoordinator.mjs';
import {getSafeCartErrorMessage, getSafeErrorLogDetails} from '~/utils/publicErrorMessages.mjs';

const CART_REFRESH_TIMEOUT_MILLISECONDS = 15_000;
const cartRefreshCoordinators = new WeakMap<object, ReturnType<typeof createCartRefreshCoordinator>>();

interface RefreshCartOptions {
  preserveStateOnError?: boolean;
}

/**
 * @name useCart
 * @description A composable that handles the cart in local storage
 */
export function useCart() {
  const nuxtApp = useNuxtApp();
  let cartRefreshCoordinator = cartRefreshCoordinators.get(nuxtApp);

  if (!cartRefreshCoordinator) {
    cartRefreshCoordinator = createCartRefreshCoordinator();
    cartRefreshCoordinators.set(nuxtApp, cartRefreshCoordinator);
  }

  const {storeSettings} = useAppConfig();

  const cart = useState<Cart | null>('cart', () => null);
  const isShowingCart = useState<boolean>('isShowingCart', () => false);
  const isUpdatingCart = useState<boolean>('isUpdatingCart', () => false);
  const isUpdatingCoupon = useState<boolean>('isUpdatingCoupon', () => false);
  const isRefreshPending = useState<boolean>('isRefreshPending', () => false);
  const cartLoadError = useState<string | null>('cartLoadError', () => null);
  const paymentGateways = useState<PaymentGateways | null>('paymentGateways', () => null);
  const {logGQLError, clearAllCookies} = useHelpers();

  /** Refesh the cart from the server
   * @returns {Promise<boolean>} - A promise that resolves
   * to true if the cart was successfully refreshed
   */
  function refreshCart(options: RefreshCartOptions = {}): Promise<boolean> {
    isRefreshPending.value = true;

    return cartRefreshCoordinator.runRefresh(async () => {
      let refreshTimeout: ReturnType<typeof setTimeout> | undefined;

      try {
        cartLoadError.value = null;
        const refreshTimeoutPromise = new Promise<never>((_, reject) => {
          refreshTimeout = setTimeout(() => reject(new Error('Cart refresh timed out')), CART_REFRESH_TIMEOUT_MILLISECONDS);
        });
        const {cart, customer, viewer, paymentGateways, loginClients} = await Promise.race([GqlGetCart(), refreshTimeoutPromise]);
        const {updateCustomer, updateViewer, updateLoginClients} = useAuth();

        if (cart) updateCart(cart);
        if (customer) updateCustomer(customer);
        if (viewer) updateViewer(viewer);
        if (paymentGateways) updatePaymentGateways(paymentGateways);
        if (loginClients) updateLoginClients(loginClients.filter((client) => client !== null));

        return true;
      } catch (error: any) {
        logGQLError(error);
        cartLoadError.value = 'messages.shop.cartLoadError';

        if (!options.preserveStateOnError) {
          clearAllCookies();
          resetInitialState();
        }

        return false;
      } finally {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        isRefreshPending.value = false;
        isUpdatingCart.value = false;
      }
    });
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
    const toast = useToast();
    isUpdatingCart.value = true;

    try {
      // Lazy store initialization begins on the same first interaction as Add to Cart.
      // Complete one refresh first, even for click-only accessibility interactions.
      await prepareCartSessionForMutation({refreshCoordinator: cartRefreshCoordinator, refreshCart});
      isUpdatingCart.value = true;

      // Use server-side API to bypass CORS/security blocks on client-side GraphQL
      const response = await $fetch<{success: boolean; cart?: Cart; sessionToken?: string | null; message?: string}>('/api/add-to-cart', {
        method: 'POST',
        body: {
          productId: input.productId,
          quantity: input.quantity || 1,
          variationId: input.variationId,
          extraData: input.extraData,
        },
      });

      await finalizeSuccessfulCartMutation({
        refreshCoordinator: cartRefreshCoordinator,
        successfulCart: response?.cart || null,
        sessionToken: response?.sessionToken,
        installSessionToken: (sessionToken: string) => {
          useGqlHeaders({'woocommerce-session': `Session ${sessionToken}`});
          useCookie('woocommerce-session', {
            path: '/',
            sameSite: 'lax',
            secure: import.meta.env.PROD,
          }).value = sessionToken;
        },
        updateCart,
        markMutationFinalizationPending: () => {
          isUpdatingCart.value = true;
        },
        afterMutationApplied: () => {
          if (storeSettings.autoOpenCart && !isShowingCart.value) toggleCart(true);
        },
        refreshCart,
      });

      return {success: true};
    } catch (error: any) {
      logGQLError(error);

      const errorMessage = getSafeCartErrorMessage(error, 'Unable to add this item to your cart. Please try again.');

      // Show toast notification with error message (HTML entities decoded automatically)
      toast.error(errorMessage);

      isUpdatingCart.value = false;
      isRefreshPending.value = false;
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
        updateCart(response.cart);
      }
    } catch (error: any) {
      console.error('[removeItem] Cart update failed:', getSafeErrorLogDetails(error));
      const toast = useToast();
      toast.error(getSafeCartErrorMessage(error, 'We could not remove that item. Please try again.'));
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
        updateCart(response.cart);
      }
    } catch (error: any) {
      console.error('[updateItemQuantity] Cart update failed:', getSafeErrorLogDetails(error));
      const toast = useToast();
      toast.error(getSafeCartErrorMessage(error, 'We could not update that quantity. Please try again.'));
    } finally {
      isUpdatingCart.value = false;
    }
  }

  // empty the cart
  async function emptyCart(): Promise<void> {
    try {
      isUpdatingCart.value = true;
      const {emptyCart} = await GqlEmptyCart();
      updateCart(emptyCart?.cart);
    } catch (error: any) {
      logGQLError(error);
    }
  }

  // Update shipping method
  async function updateShippingMethod(shippingMethods: string) {
    isUpdatingCart.value = true;
    const {updateShippingMethod} = await GqlChangeShippingMethod({shippingMethods});
    updateCart(updateShippingMethod?.cart);
  }

  // Apply coupon
  async function applyCoupon(code: string): Promise<{message: string | null}> {
    try {
      isUpdatingCoupon.value = true;
      const {applyCoupon} = await GqlApplyCoupon({code});
      updateCart(applyCoupon?.cart);
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
      updateCart(removeCoupons?.cart);
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
    cartLoadError,
    paymentGateways,
    isBillingAddressEnabled,
    allProductsAreVirtual,
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
