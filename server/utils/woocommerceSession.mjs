export function normalizeWooCommerceSessionToken(headerValue) {
  if (typeof headerValue !== 'string') return null;

  const normalizedToken = headerValue
    .trim()
    .replace(/^Session\s+/i, '')
    .trim();
  return normalizedToken || null;
}

/**
 * Runs a WooGraphQL cart call on the shopper's session. If WooGraphQL rejected the stored token, it already opened a
 * new session and returned its token in the `woocommerce-session` response header; the call is repeated ONCE on that
 * session (or with none if the header is missing). Only for calls the rejection stops before they change anything
 * (Cart_Mutation::check_session_token runs first in every 1.0.x cart mutation), e.g. addToCart.
 *
 * @param {object} options
 * @param {string | null} options.sessionToken The stored token, if any.
 * @param {(token: string | null) => Promise<{body: any, issuedToken: string | null}>} options.send
 * @param {(errors: unknown) => boolean} options.isStaleSessionError
 */
export async function sendWithWooSessionRecovery({sessionToken, send, isStaleSessionError}) {
  const first = await send(sessionToken || null);
  if (!sessionToken || !isStaleSessionError(first.body?.errors)) {
    return {body: first.body, sessionToken: first.issuedToken, sessionWasReset: false};
  }

  const retry = await send(first.issuedToken || null);
  return {body: retry.body, sessionToken: retry.issuedToken || first.issuedToken || null, sessionWasReset: true};
}
