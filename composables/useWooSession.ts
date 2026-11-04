// The one place that installs or forgets the WooCommerce session token. It lives in two places that must move
// together: the nuxt-graphql-client header used by browser Gql* calls, and the first-party `woocommerce-session`
// cookie read by the plugins and forwarded by the /api routes. Always written host-only: useCheckout used to
// write a Domain= copy, and when both exist browsers send the older one first, shadowing the fresh token.
const WOO_SESSION = 'woocommerce-session';
const sessionCookieOptions = () => ({path: '/', sameSite: 'lax' as const, secure: import.meta.env.PROD});

export function useWooSession() {
  const nuxtApp = useNuxtApp();
  const {getDomain} = useHelpers();

  const installWooSession = (token?: string | null): void => {
    if (!token) return;
    nuxtApp.runWithContext(() => {
      useGqlHeaders({[WOO_SESSION]: `Session ${token}`});
      useCookie<string | null>(WOO_SESSION, sessionCookieOptions()).value = token;
    });
  };

  /** Forget the token so the next GraphQL request makes WooGraphQL start a new session. */
  const dropWooSession = (): void => {
    nuxtApp.runWithContext(() => {
      // Empty, not removed: useGqlHeaders({}) resets every header. WooGraphQL treats an empty header as "no session".
      useGqlHeaders({[WOO_SESSION]: ''});
      if (!import.meta.client) return;
      useCookie<string | null>(WOO_SESSION, sessionCookieOptions()).value = null;
      // Expire the Domain= copy useCheckout used to write; left behind it can shadow the new host-only cookie.
      const domain = getDomain(window.location.href);
      if (domain) useCookie<string | null>(WOO_SESSION, {...sessionCookieOptions(), domain}).value = null;
    });
  };

  return {installWooSession, dropWooSession};
}
