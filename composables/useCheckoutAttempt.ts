// composables/useCheckoutAttempt.ts
//
// Stable, client-minted identity for ONE intended purchase ("checkout attempt").
//
// WHY: Helcim mints a fresh transactionId for every charge, so server-side idempotency keyed on
// transactionId can never connect "the customer retried after an error" back to the original
// attempt — that gap produced a real double charge + double order (orders 500047991/500047994).
// This id is generated BEFORE payment, persisted in localStorage keyed to the cart's contents,
// and survives reloads: a retry of the same cart reuses the SAME id, letting the server block a
// second charge at Helcim initialize and collapse duplicate order creation.
//
// Scope rules:
// - Same cart contents (product/variation/qty) => same attempt id, for up to ATTEMPT_MAX_AGE_MS.
// - Cart contents change, attempt completes (order created/recovered), or age expires => new id.
// - Deliberately IGNORES totals/shipping/tax: a $0.01 rounding drift on reload must not mint a
//   new purchase identity (see docs/checkout-failure-mitigation-plan.md P0-3).

const STORAGE_KEY = 'psp-checkout-attempt-v1';
const ATTEMPT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

interface StoredAttempt {
  id: string;
  cartSig: string;
  at: number;
}

export function useCheckoutAttempt() {
  const cartSignature = (): string => {
    const {cart} = useCart();
    const nodes = cart.value?.contents?.nodes || [];
    return nodes
      .map((item: any) => `${item.product?.node?.databaseId || 0}:${item.variation?.node?.databaseId || 0}x${item.quantity || 1}`)
      .sort()
      .join('|');
  };

  const readStored = (): StoredAttempt | null => {
    if (!import.meta.client) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.id && parsed?.cartSig && parsed?.at ? (parsed as StoredAttempt) : null;
    } catch {
      return null;
    }
  };

  const mintId = (): string => {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch {
      // fall through to manual uuid
    }
    return `att-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  };

  /** Returns the attempt id for the current cart, reusing a stored one when it matches. Null on SSR. */
  const getOrCreateAttemptId = (): string | null => {
    if (!import.meta.client) return null;

    const sig = cartSignature();
    const stored = readStored();
    if (stored && stored.cartSig === sig && Date.now() - stored.at < ATTEMPT_MAX_AGE_MS) {
      return stored.id;
    }

    const fresh: StoredAttempt = {id: mintId(), cartSig: sig, at: Date.now()};
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch {
      // Storage unavailable (private mode/quota): the id still works for this page-load; a reload
      // will mint a new one, which degrades to today's per-charge behaviour rather than breaking.
    }
    return fresh.id;
  };

  /** Clear after the attempt resolves into an order (created or recovered) so a future purchase
   *  of the same items is a NEW attempt and is never collapsed onto the finished one. */
  const clearAttemptId = (): void => {
    if (!import.meta.client) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return {getOrCreateAttemptId, clearAttemptId};
}
