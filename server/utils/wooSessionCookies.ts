import {deleteCookie, getRequestHost, type H3Event} from 'h3';

const WOO_SESSION_COOKIE = 'woocommerce-session';

/**
 * Expire every copy of the shopper's `woocommerce-session` cookie: the host-only one and the Domain= copy
 * useCheckout used to write (when both exist, parseCookies returns the first, often the stale one).
 * Call it BEFORE setCookie() of a new token: h3 drops an earlier Set-Cookie with the same name/path/flags.
 */
export function forgetWooSessionCookies(event: H3Event): void {
  deleteCookie(event, WOO_SESSION_COOKIE, {path: '/'});
  const domain = String(getRequestHost(event) || '')
    .split(':')[0]
    .replace(/^www\d?\./i, '');
  if (domain.includes('.')) deleteCookie(event, WOO_SESSION_COOKIE, {path: '/', domain});
}
