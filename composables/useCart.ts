import type {AddToCartInput} from '#gql';
import {
  createCartRefreshCoordinator,
  fetchCartWithSessionRecovery,
  finalizeSuccessfulCartMutation,
  prepareCartSessionForMutation,
} from '~/utils/cartRefreshCoordinator.mjs';
import {getSafeCartErrorMessage, getSafeErrorLogDetails} from '#shared/utils/publicErrorMessages.mjs';
import {isWooSessionTokenError} from '#shared/utils/wooSession.mjs';

const CART_REFRESH_TIMEOUT_MILLISECONDS = 15_000;
const EXPIRED_CART_SESSION_MESSAGE = 'Your cart session expired. Please add your items again.';
const REFRESHED_CART_SESSION_MESSAGE = 'Your cart was refreshed. Please check your cart and try that again.';
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
  const {installWooSession, dropWooSession} = useWooSession();

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
        const fetchCart = () => {
          if (refreshTimeout) clearTimeout(refreshTimeout);
          const refreshTimeoutPromise = new Promise<never>((_, reject) => {
            refreshTimeout = setTimeout(() => reject(new Error('Cart refresh timed out')), CART_REFRESH_TIMEOUT_MILLISECONDS);
          });
          return Promise.race([GqlGetCart(), refreshTimeoutPromise]);
        };
        // A token WooGraphQL no longer accepts (every 0.21.1 token after the 1.0.3 upgrade, or an expired one) is
        // dropped and the fetch repeated once on the new session; updateCustomer() below installs its token. The
        // Bearer token stays: a signed-in shopper's new session is keyed to their user ID, so only guest carts are lost.
        const {cart, customer, viewer, paymentGateways, loginClients} = await fetchCartWithSessionRecovery({
          fetchCart,
          isStaleSessionError: isWooSessionTokenError,
          dropSession: () => {
            console.warn('[refreshCart] WooCommerce rejected the stored session; starting a new one.');
            dropWooSession();
          },
        });
        const {updateCustomer, updateViewer, updateLoginClients} = useAuth();

        if (cart) updateCart(cart);
        if (customer) updateCustomer(customer);
        // WooGraphQL can leave customer.sessionToken null for a signed-in shopper; the viewer carries the same
        // session (upstream WooNuxt 01e1a38e).
        if (!customer?.sessionToken && viewer?.wooSessionToken) installWooSession(viewer.wooSessionToken);
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

  /**
   * The session holding this cart no longer exists (WooGraphQL rejected its token): start a clean one and
   * return copy for the shopper. Never use it for a paid checkout: the shopper would re-add and pay again.
   */
  async function restartExpiredCartSession(): Promise<string> {
    dropWooSession();
    await refreshCart();
    // A signed-in shopper's saved cart comes back with the new user-keyed session: don't invite them to re-add it
    // (doubled quantities). The action they clicked was not applied either way.
    return cart.value && !cart.value.isEmpty ? REFRESHED_CART_SESSION_MESSAGE : EXPIRED_CART_SESSION_MESSAGE;
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
      const requestAddToCart = () =>
        $fetch<{success: boolean; cart?: Cart; sessionToken?: string | null; code?: string; sessionReset?: boolean}>('/api/add-to-cart', {
          method: 'POST',
          body: {
            productId: input.productId,
            quantity: input.quantity || 1,
            variationId: input.variationId,
            extraData: input.extraData,
          },
        });
      let response = await requestAddToCart();

      // Signed in, and WooGraphQL rejected the stored session. The route won't open a guest session (it would replace
      // the account's saved cart), so rebuild the user-keyed session with the Bearer token here, then add once more.
      if (response?.code === 'session_expired') {
        dropWooSession();
        // Retry only on a rebuilt session: after a failed refresh there is no stored token, so the route would add to
        // a fresh guest session that the next Bearer refresh lets overwrite the account's saved cart.
        const sessionRebuilt = await refreshCart();
        isUpdatingCart.value = true;
        response = sessionRebuilt ? await requestAddToCart() : response;
        if (response?.code === 'session_expired') {
          toast.error(EXPIRED_CART_SESSION_MESSAGE);
          isUpdatingCart.value = false;
          return {success: false, message: EXPIRED_CART_SESSION_MESSAGE};
        }
      }

      // A guest whose session WooGraphQL rejected: the item went into a new cart and the earlier items didn't follow.
      if (response?.sessionReset) toast.info('Your previous cart session expired, so this item was added to a new cart.');

      await finalizeSuccessfulCartMutation({
        refreshCoordinator: cartRefreshCoordinator,
        successfulCart: response?.cart || null,
        sessionToken: response?.sessionToken,
        installSessionToken: installWooSession,
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

      const response = await $fetch<{success: boolean; cart?: Cart; code?: string}>('/api/update-cart-quantity', {
        method: 'POST',
        body: {
          key,
          quantity: 0,
          sessionToken,
        },
      });

      // The cart this key belongs to lives in a session WooGraphQL no longer accepts (the route already dropped it).
      if (response.code === 'session_expired') {
        useToast().error(await restartExpiredCartSession());
        return;
      }

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

      const response = await $fetch<{success: boolean; cart?: Cart; code?: string}>('/api/update-cart-quantity', {
        method: 'POST',
        body: {
          key,
          quantity,
          sessionToken,
        },
      });

      // The cart this key belongs to lives in a session WooGraphQL no longer accepts (the route already dropped it).
      if (response.code === 'session_expired') {
        useToast().error(await restartExpiredCartSession());
        return;
      }

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
      // The session is gone, so its cart already is too: just start a clean one.
      if (isWooSessionTokenError(error)) await restartExpiredCartSession();
    }
  }

  // Update shipping method
  async function updateShippingMethod(shippingMethods: string) {
    isUpdatingCart.value = true;
    try {
      const {updateShippingMethod} = await GqlChangeShippingMethod({shippingMethods});
      updateCart(updateShippingMethod?.cart);
    } catch (error) {
      if (!isWooSessionTokenError(error)) throw error;
      useToast().error(await restartExpiredCartSession());
    }
  }

  // Apply coupon. A rejected code (invalid, expired, another session's auto coupon…) must reach
  // the shopper as a safe message instead of silently reporting success.
  async function applyCoupon(code: string): Promise<{success: boolean; message: string | null}> {
    try {
      isUpdatingCoupon.value = true;
      const {applyCoupon} = await GqlApplyCoupon({code});
      updateCart(applyCoupon?.cart);
      isUpdatingCoupon.value = false;
      return {success: true, message: null};
    } catch (error: any) {
      isUpdatingCoupon.value = false;
      logGQLError(error);
      if (isWooSessionTokenError(error)) return {success: false, message: await restartExpiredCartSession()};
      return {success: false, message: getSafeCartErrorMessage(error, 'That coupon could not be applied. Check the code and try again.')};
    }
  }

  // Remove coupon
  async function removeCoupon(code: string): Promise<{success: boolean; message: string | null}> {
    try {
      isUpdatingCart.value = true;
      const {removeCoupons} = await GqlRemoveCoupons({codes: [code]});
      updateCart(removeCoupons?.cart);
      return {success: true, message: null};
    } catch (error) {
      logGQLError(error);
      isUpdatingCart.value = false;
      const message = isWooSessionTokenError(error)
        ? await restartExpiredCartSession()
        : getSafeCartErrorMessage(error, 'We could not remove that coupon. Please try again.');
      useToast().error(message);
      return {success: false, message};
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
    restartExpiredCartSession,
  };
}
