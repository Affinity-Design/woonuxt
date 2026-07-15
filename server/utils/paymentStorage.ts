// server/utils/paymentStorage.ts
//
// Dedicated durable storage for payment-critical records:
//   - stranded-charge recovery records  (helcim-recovery:*)
//   - duplicate-charge fingerprints     (helcim-charge:*)
//   - order-creation idempotency        (idempotency:admin-order:*)
//   - Helcim failure beacons            (helcim-fail:*)
//
// WHY THIS EXISTS
// ---------------
// These records used to live in the `cache` mount (NUXT_CACHE KV namespace). The cache-clearing
// scripts (`npm run clear-cache-all` / `reset-cache`) delete EVERY key in that namespace, so a
// routine cache rebuild could silently wipe pending payment-recovery state and momentarily disarm
// the duplicate-charge guard. The `payment` mount is backed by its own KV namespace
// (NUXT_PAYMENT_DATA) that no cache tooling touches.
//
// MIGRATION SAFETY
// ----------------
// - Reads check the payment store first, then fall back to the legacy cache location, so records
//   written before this migration stay visible until their TTL expires.
// - Writes target the payment store; if its binding is missing (namespace not yet bound on the
//   Pages project), we fall back to the cache store so behaviour is never worse than before.
// - All helpers are best-effort and never throw unless BOTH stores are unavailable; callers keep
//   their existing try/catch semantics.

function paymentStore() {
  return useStorage('payment');
}

function legacyCacheStore() {
  return useStorage('cache');
}

/** Read a record: payment store first, legacy cache fallback. Returns null when absent/unavailable. */
export async function paymentGetItem<T>(key: string): Promise<T | null> {
  try {
    const hit = await paymentStore().getItem<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch (error: any) {
    console.warn('[Payment Storage] payment store read failed, trying legacy cache:', error?.message || error);
  }

  try {
    return (await legacyCacheStore().getItem<T>(key)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a record to the payment store; fall back to the legacy cache store if the payment
 * binding is unavailable. Throws only when both stores fail (callers are best-effort).
 */
export async function paymentSetItem(key: string, value: any, opts?: any): Promise<void> {
  try {
    await paymentStore().setItem(key, value, opts);
    return;
  } catch (error: any) {
    console.warn('[Payment Storage] payment store write failed, falling back to legacy cache:', error?.message || error);
  }

  await legacyCacheStore().setItem(key, value, opts);
}

/** List keys under a prefix across BOTH stores (deduped), so pre-migration records stay listable. */
export async function paymentGetKeys(prefix: string): Promise<string[]> {
  const keys = new Set<string>();

  try {
    for (const key of (await paymentStore().getKeys(prefix)) || []) keys.add(key);
  } catch (error: any) {
    console.warn('[Payment Storage] payment store getKeys failed:', error?.message || error);
  }

  try {
    for (const key of (await legacyCacheStore().getKeys(prefix)) || []) keys.add(key);
  } catch {
    // legacy store unavailable — payment-store keys (if any) still returned
  }

  return [...keys];
}
