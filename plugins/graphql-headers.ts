/**
 * GraphQL Headers Plugin
 *
 * Ensures proper headers are sent to WordPress GraphQL API during both SSR and client-side requests.
 *
 * Issue: WooCommerce GraphQL returns 403 during SSR because:
 * - Default headers in woonuxt_base are minimal
 * - Session tokens and Origin are only set client-side in plugins/init.ts
 * - WordPress may have security rules blocking requests without proper headers
 *
 * Solution: Set SSR-compatible headers that satisfy WordPress security requirements
 */

export default defineNuxtPlugin((nuxtApp) => {
  // Get GQL_HOST from environment or runtime config
  const gqlHost = process.env.GQL_HOST || '';

  // Extract domain from GQL_HOST for Origin header
  let originDomain = '';
  try {
    if (gqlHost) {
      const url = new URL(gqlHost);
      originDomain = url.origin;
    }
  } catch (e) {
    console.warn('[GraphQL Headers] Could not parse GQL_HOST for Origin header:', gqlHost);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Frontend-Type': 'woonuxt',
    'X-Requested-With': 'XMLHttpRequest',
  };

  // Server-side specific headers (for SSR)
  if (import.meta.server) {
    // Add User-Agent for server-side requests
    // This helps WordPress identify the request source and can prevent 403 errors
    headers['User-Agent'] = 'WooNuxt/3.0 (Nuxt SSR)';

    // Add Referer header (some WordPress setups require this)
    if (originDomain) {
      headers['Referer'] = originDomain;
      headers['Origin'] = originDomain;
    }
  }
  // Client-side specific headers
  else if (import.meta.client) {
    // Use actual browser origin
    headers['Origin'] = window.location.origin;
    headers['Referer'] = window.location.href;

    // Add session token if available (for authenticated requests)
    try {
      const {getDomain} = useHelpers();
      const sessionToken = useCookie('woocommerce-session', {
        domain: getDomain(window.location.href),
      });

      if (sessionToken.value) {
        headers['woocommerce-session'] = `Session ${sessionToken.value}`;
      }
    } catch (e) {
      // getDomain might not be available yet, that's okay
    }
  }

  // Set headers for GraphQL client (from nuxt-graphql-client module)
  useGqlHeaders(headers);
});
