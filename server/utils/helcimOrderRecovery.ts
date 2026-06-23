// server/utils/helcimOrderRecovery.ts
//
// Stranded-charge recovery store for Helcim payments.
//
// WHY THIS EXISTS
// ---------------
// The Helcim flow is "charge-first, order-second": the card is charged in the HelcimPay.js modal
// BEFORE any WooCommerce order exists. If `create-admin-order` then fails (Worker timeout, GraphQL
// error, network blip), the money has already left the customer but no order exists. The
// duplicate-charge guard (helcimChargeGuard.ts) now BLOCKS the customer from charging again — which
// is correct, but on its own it converts the failure from "charged twice" into "charged once, no
// order, and unable to retry" (a stranded payment).
//
// WHAT THIS DOES
// --------------
// On every `create-admin-order` failure that has a known-good Helcim transactionId, we persist the
// FULL order-creation payload here, keyed by transactionId. A recovery flow (customer self-service
// from the block, or admin/support via /api/recover-helcim-order) can then reconcile the charge into
// a real Woo order out-of-band — WITHOUT asking the customer to pay again.
//
// All operations are best-effort: if KV is unavailable we fail safe (never throw into the order
// flow). The happy path never touches this module.

export type StrandedChargeStatus = 'pending' | 'recovered' | 'failed';

export interface RecoveredOrderRef {
  id?: number | string;
  databaseId?: number | string;
  orderNumber?: string | number;
  orderKey?: string;
  status?: string;
  total?: string;
}

export interface StrandedCharge {
  transactionId: string;
  status: StrandedChargeStatus;
  // The exact body that was POSTed to /api/create-admin-order, so recovery can replay it verbatim.
  payload: any;
  // Light-weight, human-readable context for support tooling (avoids digging through `payload`).
  customerEmail?: string;
  customerName?: string;
  cartTotal?: string;
  failureReason?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  recoveredOrder?: RecoveredOrderRef;
  recoveredVia?: string;
  lastError?: string;
}

const KEY_PREFIX = 'helcim-recovery:';
// Keep stranded charges around long enough for support to act on them.
const KV_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function keyFor(transactionId: string): string {
  return `${KEY_PREFIX}${transactionId}`;
}

/**
 * Persist a stranded charge (successful Helcim charge whose Woo order failed to create).
 * Best-effort. Never overwrites an already-`recovered` record.
 */
export async function recordStrandedCharge(transactionId: string | undefined | null, payload: any, failureReason?: string): Promise<void> {
  if (!transactionId) return;
  try {
    const storage = useStorage('cache');
    const key = keyFor(String(transactionId));

    const existing = await storage.getItem<StrandedCharge>(key).catch(() => null);
    if (existing?.status === 'recovered') {
      // Already reconciled into an order — don't regress it back to pending.
      return;
    }

    const now = new Date().toISOString();
    const record: StrandedCharge = {
      transactionId: String(transactionId),
      status: 'pending',
      payload,
      customerEmail: payload?.billing?.email,
      customerName: `${payload?.billing?.firstName || ''} ${payload?.billing?.lastName || ''}`.trim() || undefined,
      cartTotal: payload?.cartTotals?.total,
      failureReason: failureReason || existing?.failureReason,
      attempts: existing?.attempts || 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await storage.setItem(key, record, {ttl: KV_TTL_SECONDS} as any);
    console.log('[Helcim Recovery] Recorded stranded charge for later reconciliation', {transactionId, failureReason});
  } catch (error: any) {
    console.warn('[Helcim Recovery] recordStrandedCharge failed (continuing):', error?.message || error);
  }
}

/** Fetch a single stranded-charge record. Returns null if missing or storage is unavailable. */
export async function getStrandedCharge(transactionId: string): Promise<StrandedCharge | null> {
  try {
    const storage = useStorage('cache');
    return (await storage.getItem<StrandedCharge>(keyFor(transactionId))) || null;
  } catch (error: any) {
    console.warn('[Helcim Recovery] getStrandedCharge failed:', error?.message || error);
    return null;
  }
}

/** Update an existing stranded-charge record. Best-effort; merges `extra` over the stored record. */
export async function updateStrandedCharge(transactionId: string, extra: Partial<StrandedCharge>): Promise<void> {
  try {
    const storage = useStorage('cache');
    const key = keyFor(transactionId);
    const existing = await storage.getItem<StrandedCharge>(key);
    if (!existing) return;
    const updated: StrandedCharge = {...existing, ...extra, updatedAt: new Date().toISOString()};
    await storage.setItem(key, updated, {ttl: KV_TTL_SECONDS} as any);
  } catch (error: any) {
    console.warn('[Helcim Recovery] updateStrandedCharge failed:', error?.message || error);
  }
}

/** List stranded-charge records, newest first. Optionally filter by status. */
export async function listStrandedCharges(status?: StrandedChargeStatus): Promise<StrandedCharge[]> {
  try {
    const storage = useStorage('cache');
    const keys = await storage.getKeys(KEY_PREFIX);
    if (!keys?.length) return [];

    const records = await Promise.all(keys.map((k) => storage.getItem<StrandedCharge>(k).catch(() => null)));
    const list = records.filter((r): r is StrandedCharge => !!r);
    const filtered = status ? list.filter((r) => r.status === status) : list;
    return filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (error: any) {
    console.warn('[Helcim Recovery] listStrandedCharges failed:', error?.message || error);
    return [];
  }
}
