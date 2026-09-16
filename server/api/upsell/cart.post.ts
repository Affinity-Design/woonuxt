// server/api/upsell/cart.post.ts
//
// Session-bound upsell state for the shopper's cart (`Cart.upsell` in WPGraphQL). Called
// with a raw fetch and the shopper's first-party `woocommerce-session` cookie forwarded as
// the session header (same pattern as server/utils/adminAuth.ts) — never a Gql* helper,
// which crash in server routes on Workers. Reading `Cart.upsell` also makes the backend
// apply/remove auto coupons for this cart. Fails soft: any problem → null (no upsell UI).

import type {CartUpsellState} from '#shared/types/upsell';
import {getCookie, getHeader, readBody} from 'h3';

const CART_UPSELL_QUERY = `
query WooNuxtCartUpsell($locale: String) {
  cart {
    upsell {
      channel
      rulesVersion
      eligibleOffers { ruleId state label couponCode discount }
      appliedAutoCoupons
      cartNotices(locale: $locale) { ruleId kind text ctaPath }
      missingQualifiers { ruleId label ctaPath }
      lineItemDiscounts { cartItemKey ruleId couponCode amount label }
      validatedCoupons
    }
  }
}`;

const lower = (value: unknown) => String(value || '').toLowerCase();

export default defineEventHandler(async (event): Promise<CartUpsellState | null> => {
  setHeader(event, 'Cache-Control', 'private, no-store');

  const body = await readBody(event).catch(() => ({}));
  const locale = lower(body?.locale).startsWith('fr') ? 'fr' : 'en';

  const config = useRuntimeConfig(event) as Record<string, any>;
  const wpBaseUrl = String(config.public?.wpBaseUrl || '').replace(/\/$/, '');
  if (!wpBaseUrl) return null;

  const headerToken = getHeader(event, 'woocommerce-session');
  const cookieToken = getCookie(event, 'woocommerce-session');
  const sessionHeader = headerToken || (cookieToken ? `Session ${cookieToken}` : '');
  if (!sessionHeader) return null;
  const authTokenCookie = getCookie(event, 'gql:default');
  const siteUrl = config.public?.siteUrl || 'https://proskatersplace.ca';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${wpBaseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: siteUrl,
        Referer: siteUrl,
        'X-Frontend-Type': 'woonuxt',
        'woocommerce-session': sessionHeader,
        ...(authTokenCookie ? {Authorization: `Bearer ${authTokenCookie}`} : {}),
      },
      body: JSON.stringify({query: CART_UPSELL_QUERY, variables: {locale}}),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json: any = await response.json().catch(() => null);
    const upsell = json?.data?.cart?.upsell;
    if (!upsell || typeof upsell !== 'object') return null;

    return {
      channel: lower(upsell.channel) === 'com' ? 'com' : 'ca',
      rulesVersion: String(upsell.rulesVersion || ''),
      eligibleOffers: (upsell.eligibleOffers || []).map((o: any) => ({
        ruleId: Number(o?.ruleId || 0),
        state: lower(o?.state) as CartUpsellState['eligibleOffers'][number]['state'],
        label: String(o?.label || ''),
        couponCode: o?.couponCode ? String(o.couponCode).toUpperCase() : null,
        discount: o?.discount ? String(o.discount) : null,
      })),
      appliedAutoCoupons: (upsell.appliedAutoCoupons || []).map((c: any) => String(c).toUpperCase()),
      cartNotices: (upsell.cartNotices || []).map((n: any) => ({
        ruleId: Number(n?.ruleId || 0),
        kind: lower(n?.kind) === 'applied' ? 'applied' : 'pending',
        text: String(n?.text || ''),
        ctaPath: n?.ctaPath ? String(n.ctaPath) : null,
      })),
      missingQualifiers: (upsell.missingQualifiers || []).map((m: any) => ({
        ruleId: Number(m?.ruleId || 0),
        label: String(m?.label || ''),
        ctaPath: String(m?.ctaPath || '/products'),
      })),
      lineItemDiscounts: (upsell.lineItemDiscounts || []).map((d: any) => ({
        cartItemKey: String(d?.cartItemKey || ''),
        ruleId: Number(d?.ruleId || 0),
        couponCode: String(d?.couponCode || '').toUpperCase(),
        amount: String(d?.amount || '0'),
        label: String(d?.label || ''),
      })),
      validatedCoupons: (upsell.validatedCoupons || []).map((c: any) => String(c).toUpperCase()),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
});
