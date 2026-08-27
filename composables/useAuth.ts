import type {ResetPasswordKeyMutationVariables, ResetPasswordEmailMutationVariables, LoginInput} from '#gql';
import {getSafeAuthenticationErrorMessage} from '~/utils/publicErrorMessages.mjs';

interface RegistrationCredentials {
  email: string;
  password: string;
  turnstileToken?: string;
}

interface LoginCredentials {
  username: string;
  password: string;
  turnstileToken?: string;
}

interface AuthenticationActionResult {
  success: boolean;
  error: string | null;
}

export const useAuth = () => {
  const {refreshCart} = useCart();
  const {logGQLError, clearAllCookies} = useHelpers();
  const router = useRouter();

  const customer = useState<Customer>('customer', () => ({
    billing: {},
    shipping: {},
  }));
  const viewer = useState<Viewer | null>('viewer', () => null);
  const isPending = useState<boolean>('isPending', () => false);
  const orders = useState<Order[] | null>('orders', () => null);
  const downloads = useState<DownloadableItem[] | null>('downloads', () => null);
  const loginClients = useState<LoginClient[] | null>('loginClients', () => null);

  // Log in the user
  const loginUser = async (credentials: LoginCredentials): Promise<AuthenticationActionResult> => {
    isPending.value = true;

    try {
      const {username, password, turnstileToken} = credentials;

      const {login} = await GqlLogin({username, password}, {
        headers: {
          'Content-Type': 'application/json',
          'X-Turnstile-Token': turnstileToken || '',
        },
        credentials: 'include', // 👈 Critical for cookies
      });

      if (login?.user && login?.authToken) {
        useGqlToken(login.authToken);
        await refreshCart();
      }

      isPending.value = false;
      return {
        success: true,
        error: null,
      };
    } catch (error: any) {
      logGQLError(error);
      isPending.value = false;

      return {
        success: false,
        error: getSafeAuthenticationErrorMessage(error, 'signIn'),
      };
    }
  };
  const loginWithProvider = async (state: string, code: string, provider: any): Promise<AuthenticationActionResult> => {
    isPending.value = true;

    try {
      const input: LoginInput = {oauthResponse: {state, code}, provider};
      const response = await GqlLoginWithProvider({input});
      if (response.login?.authToken) {
        useGqlToken(response.login.authToken);
        await refreshCart();
        if (viewer.value === null) {
          return {
            success: false,
            error: 'We signed you in, but could not finish loading your account. Please refresh the page or contact customer service.',
          };
        }
      }

      return {
        success: true,
        error: null,
      };
    } catch (error: any) {
      logGQLError(error);

      return {
        success: false,
        error: getSafeAuthenticationErrorMessage(error, 'providerSignIn'),
      };
    } finally {
      isPending.value = false;
    }
  };

  // Log out the user
  const logoutUser = async (): Promise<AuthenticationActionResult> => {
    isPending.value = true;
    try {
      const {logout} = await GqlLogout();
      if (logout) {
        await refreshCart();
        clearAllCookies();
        customer.value = {billing: {}, shipping: {}};
      }
      return {success: true, error: null};
    } catch (error: any) {
      logGQLError(error);
      return {success: false, error: getSafeAuthenticationErrorMessage(error, 'signOut')};
    } finally {
      updateViewer(null);
      if (router.currentRoute.value.path === '/my-account' && viewer.value === null) {
        router.push('/my-account');
      } else {
        router.push('/');
      }
    }
  };

  const registerUser = async (registrationCredentials: RegistrationCredentials): Promise<AuthenticationActionResult> => {
    isPending.value = true;
    try {
      const {email, password, turnstileToken} = registrationCredentials;
      await GqlRegisterCustomer(
        {input: {email, password}},
        {
          headers: {
            'X-Turnstile-Token': turnstileToken || '',
          },
        },
      );
      return {success: true, error: null};
    } catch (error: any) {
      logGQLError(error);
      return {success: false, error: getSafeAuthenticationErrorMessage(error, 'register')};
    } finally {
      isPending.value = false;
    }
  };

  // Update the user state
  // IMPORTANT: Merge billing/shipping to preserve locally-entered form data
  // (e.g., phone, email) that hasn't been saved to WordPress yet.
  // refreshCart() calls GqlGetCart() which returns WP-stored customer data,
  // and WP may return null for fields the user typed but didn't persist.
  const updateCustomer = (payload: Customer): void => {
    const sessionToken = payload?.sessionToken;
    if (sessionToken) {
      useGqlHeaders({'woocommerce-session': `Session ${sessionToken}`});
      const newToken = useCookie('woocommerce-session', {
        path: '/',
        sameSite: 'lax',
        secure: import.meta.env.PROD,
      });
      newToken.value = sessionToken;
    }

    // Preserve locally-entered billing/shipping fields that WP returns as null
    const currentBilling = customer.value?.billing || {};
    const currentShipping = customer.value?.shipping || {};
    const incomingBilling = payload?.billing || {};
    const incomingShipping = payload?.shipping || {};

    // For each billing field: keep local value if WP returned null/empty
    const mergedBilling: Record<string, any> = {...currentBilling};
    for (const [key, value] of Object.entries(incomingBilling)) {
      if (value !== null && value !== undefined && value !== '') {
        mergedBilling[key] = value;
      }
      // If WP returns null but we have a local value, keep the local value
    }

    const mergedShipping: Record<string, any> = {...currentShipping};
    for (const [key, value] of Object.entries(incomingShipping)) {
      if (value !== null && value !== undefined && value !== '') {
        mergedShipping[key] = value;
      }
    }

    customer.value = {
      ...payload,
      billing: mergedBilling,
      shipping: mergedShipping,
    };
    isPending.value = false;
  };

  const updateViewer = (payload: Viewer | null): void => {
    viewer.value = payload;
    isPending.value = false;
  };

  const sendResetPasswordEmail = async ({
    username,
  }: ResetPasswordEmailMutationVariables): Promise<AuthenticationActionResult> => {
    try {
      isPending.value = true;
      const {sendPasswordResetEmail} = await GqlResetPasswordEmail({
        username,
      });
      if (sendPasswordResetEmail?.success) {
        isPending.value = false;
        return {success: true, error: null};
      }
      return {
        success: false,
        error: 'There was an error sending the reset password email. Please try again later.',
      };
    } catch (error: any) {
      logGQLError(error);
      isPending.value = false;
      return {success: false, error: getSafeAuthenticationErrorMessage(error, 'requestPasswordReset')};
    }
  };

  const resetPasswordWithKey = async ({
    key,
    login,
    password,
  }: ResetPasswordKeyMutationVariables): Promise<AuthenticationActionResult> => {
    try {
      isPending.value = true;
      const {resetUserPassword} = await GqlResetPasswordKey({
        key,
        login,
        password,
      });
      const wasPasswordReset = Boolean(resetUserPassword?.user?.id);
      if (wasPasswordReset) {
        isPending.value = false;
        return {success: true, error: null};
      }
      return {
        success: false,
        error: 'There was an error resetting the password. Please try again later.',
      };
    } catch (error: any) {
      isPending.value = false;
      return {success: false, error: getSafeAuthenticationErrorMessage(error, 'resetPassword')};
    }
  };

  const getOrders = async (): Promise<AuthenticationActionResult> => {
    try {
      const {customer} = await GqlGetOrders();
      if (customer) {
        orders.value = customer.orders?.nodes ?? [];
        return {success: true, error: null};
      }
      return {
        success: false,
        error: 'There was an error getting your orders. Please try again later.',
      };
    } catch (error: any) {
      logGQLError(error);
      return {success: false, error: getSafeAuthenticationErrorMessage(error, 'loadOrders')};
    }
  };

  const getDownloads = async (): Promise<AuthenticationActionResult> => {
    try {
      const {customer} = await GqlGetDownloads();
      if (customer) {
        downloads.value = customer.downloadableItems?.nodes ?? [];
        return {success: true, error: null};
      }
      return {
        success: false,
        error: 'There was an error getting your downloads. Please try again later.',
      };
    } catch (error: any) {
      logGQLError(error);
      return {success: false, error: getSafeAuthenticationErrorMessage(error, 'loadDownloads')};
    }
  };

  const updateLoginClients = (payload?: LoginClient[]): void => {
    loginClients.value = payload ?? null;
  };

  const avatar = computed(() => viewer.value?.avatar?.url ?? null);
  const wishlistLink = computed<string>(() => (viewer.value ? '/my-account?tab=wishlist' : '/wishlist'));

  return {
    viewer,
    customer,
    isPending,
    orders,
    downloads,
    avatar,
    wishlistLink,
    loginUser,
    loginClients,
    loginWithProvider,
    updateCustomer,
    updateViewer,
    logoutUser,
    registerUser,
    sendResetPasswordEmail,
    resetPasswordWithKey,
    getOrders,
    getDownloads,
    updateLoginClients,
  };
};
