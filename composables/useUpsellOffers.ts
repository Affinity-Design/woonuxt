// composables/useUpsellOffers.ts
//
// Storefront view of the conditional upsell rules (pattern: useCartNotices.ts).
//  - rules:      active .ca rules from /api/upsell/rules (KV-cached 5 min) — product-page banners
//                are matched client-side so the 24h product cache never goes stale.
//  - cartUpsell: session-bound state from /api/upsell/cart (notices, per-line discounts). The
//                backend applies/removes UPSELL-* coupons itself; if its coupon set differs from
//                the cart we hold, the cart is refreshed once so totals stay in step.

import type {CartUpsellState, ProductUpsellMatch, UpsellLineItemDiscount, UpsellRulePublic} from '#shared/types/upsell';
import {extractProductTerms, matchProduct, torontoToday} from '#shared/utils/upsellMatcher.mjs';

const AUTO_COUPON_PATTERN = /^upsell-/i;

export function useUpsellOffers() {
  const {cart, refreshCart, isRefreshPending} = useCart();
  const {locale} = useI18n();

  const rules = useState<UpsellRulePublic[]>('upsell-rules', () => []);
  const rulesLoaded = useState<boolean>('upsell-rules-loaded', () => false);
  const rulesLoading = useState<boolean>('upsell-rules-loading', () => false);
  const cartUpsell = useState<CartUpsellState | null>('upsell-cart', () => null);
  const isFetchingCart = useState<boolean>('upsell-cart-fetching', () => false);
  const lastCartSignature = useState<string>('upsell-cart-signature', () => '');

  const noticeLocale = computed<'en' | 'fr'>(() => (String(locale.value || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'));

  const loadRules = async (force = false): Promise<void> => {
    if (import.meta.server) return;
    if ((rulesLoaded.value && !force) || rulesLoading.value) return;
    rulesLoading.value = true;
    try {
      const result = await $fetch<UpsellRulePublic[]>('/api/upsell/rules');
      rules.value = Array.isArray(result) ? result : [];
    } catch {
      rules.value = [];
    } finally {
      rulesLoaded.value = true;
      rulesLoading.value = false;
    }
  };

  const ruleById = (id: number): UpsellRulePublic | undefined => rules.value.find((rule) => rule.id === id);

  const matchProductOffers = (product: any): ProductUpsellMatch[] => {
    if (!product || !rules.value.length) return [];
    return matchProduct(extractProductTerms(product), rules.value, {locale: noticeLocale.value, today: torontoToday()});
  };

  const isAutoCoupon = (code: string | null | undefined): boolean => AUTO_COUPON_PATTERN.test(String(code || ''));

  const cartSignature = computed<string>(() => {
    const nodes: any[] = cart.value?.contents?.nodes || [];
    const lines = nodes.map((node) => `${node.key}:${node.quantity}`);
    const coupons = (cart.value?.appliedCoupons || []).map((coupon: any) => String(coupon?.code || '').toLowerCase());
    return `${noticeLocale.value}|${lines.join(',')}|${coupons.join(',')}`;
  });

  const refreshCartUpsell = async (): Promise<void> => {
    if (import.meta.server) return;
    if (!cart.value || cart.value.isEmpty) {
      cartUpsell.value = null;
      lastCartSignature.value = cartSignature.value;
      return;
    }
    const signature = cartSignature.value;
    if (signature === lastCartSignature.value && cartUpsell.value) return;
    lastCartSignature.value = signature;
    isFetchingCart.value = true;
    try {
      const result = await $fetch<CartUpsellState | null>('/api/upsell/cart', {method: 'POST', body: {locale: noticeLocale.value}});
      cartUpsell.value = result && typeof result === 'object' ? result : null;
      if (cartUpsell.value && !rulesLoaded.value) loadRules();

      // The backend may have just applied/removed an auto coupon: bring our cart copy in step.
      const serverCodes = (cartUpsell.value?.appliedAutoCoupons || []).map((code) => code.toUpperCase());
      const clientCodes = (cart.value?.appliedCoupons || []).map((coupon: any) => String(coupon?.code || '').toUpperCase()).filter(isAutoCoupon);
      const drifted = serverCodes.some((code) => !clientCodes.includes(code)) || clientCodes.some((code) => !serverCodes.includes(code));
      if (drifted && !isRefreshPending.value) {
        await refreshCart();
      }
    } catch {
      cartUpsell.value = null;
    } finally {
      isFetchingCart.value = false;
    }
  };

  if (import.meta.client) {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    watch(
      cartSignature,
      () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          refreshCartUpsell();
        }, 400);
      },
      {immediate: true},
    );
  }

  const cartNotices = computed(() => cartUpsell.value?.cartNotices || []);
  const missingQualifiers = computed(() => cartUpsell.value?.missingQualifiers || []);
  const appliedAutoCoupons = computed(() => cartUpsell.value?.appliedAutoCoupons || []);
  const lineItemDiscounts = computed<UpsellLineItemDiscount[]>(() => cartUpsell.value?.lineItemDiscounts || []);
  const hasUpsellNotices = computed(() => cartNotices.value.length > 0);
  const discountForLine = (cartItemKey: string): UpsellLineItemDiscount[] => lineItemDiscounts.value.filter((discount) => discount.cartItemKey === cartItemKey);

  return {
    rules,
    rulesLoaded,
    loadRules,
    ruleById,
    matchProductOffers,
    cartUpsell,
    isFetchingCart,
    refreshCartUpsell,
    cartNotices,
    missingQualifiers,
    appliedAutoCoupons,
    lineItemDiscounts,
    hasUpsellNotices,
    discountForLine,
    isAutoCoupon,
    noticeLocale,
  };
}
