// Recognises WPGraphQL for eCommerce rejecting the stored `woocommerce-session` token. Dependency-free:
// composables and Nitro routes import it via #shared, node tests via a relative path.
//
// 1.0.x: QL_Session_Handler::init_session_token() turns a token that fails JWT::decode / iss / customer-id
// checks into "invalid_token: <reason>", thrown as a UserError by the `cart` root field and by every cart
// mutation (Cart_Mutation::check_session_token runs before anything changes). The same request has already
// started a new session and put its token in the `woocommerce-session` response header. 1.0.3 also signs
// with a new key (wp_salt() instead of 'graphql-woo-cart-session'), so every 0.21.1 token fails this way once.
// 0.21.x sent the bare reason; it is matched too. In production only the sanitized copy below ever arrives, so a
// backend serving sanitizer < 1.2.0 (PROD-02 until it gets 1.2.1) never triggers this recovery: refreshCart's
// failure path (clear cookies, base init.ts logout) runs instead, as before.
//
// Only GraphQL errors[].message is read: Headless Login reports a bad Bearer token as HTTP 403 with the reason
// in extensions.debug, so an expired login is never mistaken for a dead cart session.

/**
 * Fixed copy wordpress/mu-plugins/psp-graphql-error-sanitizer.php returns for a rejected session token
 * (production rewrites every GraphQL error before it leaves WordPress). Keep the two in sync;
 * tests/wooSession.test.mjs checks the PHP file still contains this exact text.
 */
export const SANITIZED_SESSION_TOKEN_REJECTION = 'Your cart session expired. Refresh the page to start a new one.';

const SESSION_TOKEN_REJECTION =
  /^invalid_token:|^(?:failed to decode session token|customer id not found in the token|the iss do not match with this server|signature verification failed|expired token|wrong number of segments|invalid session token)$/i;

function graphqlErrorMessages(source) {
  if (!source || typeof source !== 'object') return [];
  const lists = Array.isArray(source) ? [source] : [source.gqlErrors, source.errors, source.response?.errors, source.data?.errors];
  return lists
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map((entry) => (typeof entry?.message === 'string' ? entry.message.trim() : ''))
    .filter(Boolean);
}

/** @param {unknown} source nuxt-graphql-client error, a GraphQL `errors` array, or a GraphQL response body. */
export function isWooSessionTokenError(source) {
  return graphqlErrorMessages(source).some((message) => message === SANITIZED_SESSION_TOKEN_REJECTION || SESSION_TOKEN_REJECTION.test(message));
}
