// server/utils/helcimChargeGuard.ts
//
// Persistent, charge-level duplicate-charge guard for Helcim payments.
//
// WHY THIS EXISTS
// ---------------
// The Helcim integration is "charge-first, order-second": the card is charged entirely
// client-side inside the HelcimPay.js modal BEFORE any WooCommerce order exists. The only
// pre-existing duplicate protection (server/api/create-admin-order.post.ts) is keyed on the
// Helcim `transactionId`, which only comes into existence AFTER a charge succeeds. That guard
// can stop one charge from creating two orders, but it canNOT stop two charges.
//
// If order creation fails AFTER a successful charge (slow/again Worker timeout, GraphQL error,
// network blip), the customer sees an error, reloads — which wipes the in-component
// `helcimPaymentComplete` flag — and pays again. Result: a real double charge (see the
// June 7 2026 Heather Krause incident, two $383.41 charges 8 min apart on two different cards).
//
// WHAT THIS DOES
// --------------
// Records every SUCCESSFUL charge in KV keyed by a stable fingerprint (email + amount + line
// items). On the NEXT `initialize`, we look the fingerprint up and, if a matching charge
// happened within the recent window, block issuing a new Helcim checkout token. That removes the
// reload-and-retry path that created real duplicate charges.
//
// All operations are best-effort: if KV is unavailable, we fail open (no warning, no error) so
// checkout is never broken by this guard.

import {createHash} from 'node:crypto';

export interface ChargeFingerprintInput {
  email?: string | null;
  amount?: number | string | null;
  lineItems?: Array<{sku?: string; description?: string; quantity?: number; price?: number}> | null;
}

export interface RecordedCharge {
  transactionId?: string;
  amount?: number | string;
  email?: string;
  traceId?: string;
  at: string; // ISO timestamp
}

// How long a prior successful charge keeps triggering the duplicate warning.
export const DUPLICATE_WARNING_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
// KV TTL — a little longer than the warning window so reads inside the window always hit.
const KV_TTL_SECONDS = 30 * 60; // 30 minutes

/**
 * Build a stable fingerprint for a charge from the inputs the client sends to BOTH
 * /api/helcim (initialize) and /api/helcim-validate. Inputs are normalized so the same cart
 * produces the same fingerprint on both calls.
 */
export function computeChargeFingerprint(input: ChargeFingerprintInput): string {
  const email = (input.email || '').trim().toLowerCase();

  // Normalize amount to a 2-decimal string (handles number or string input).
  const amountNum = typeof input.amount === 'string' ? parseFloat(input.amount.replace(/[^0-9.\-]/g, '')) : Number(input.amount);
  const amount = isFinite(amountNum) ? amountNum.toFixed(2) : '0.00';

  // Normalize line items to a sorted, compact signature so ordering never changes the hash.
  const itemsSig = (input.lineItems || [])
    .map((i) => {
      const id = (i.sku || i.description || '').trim().toLowerCase();
      const qty = Number(i.quantity) || 0;
      const price = Number(i.price) || 0;
      return `${id}x${qty}@${price.toFixed(2)}`;
    })
    .sort()
    .join('|');

  const raw = `${email}::${amount}::${itemsSig}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function keyFor(fingerprint: string): string {
  return `helcim-charge:${fingerprint}`;
}

/**
 * Record a successful charge. Best-effort: swallows all storage errors.
 */
export async function recordSuccessfulCharge(input: ChargeFingerprintInput, charge: Omit<RecordedCharge, 'at'>): Promise<void> {
  try {
    const fingerprint = computeChargeFingerprint(input);
    const storage = useStorage('cache');
    const record: RecordedCharge = {...charge, at: new Date().toISOString()};
    // Pass ttl when supported by the KV driver; harmlessly ignored otherwise (we also
    // window-check on read, so an ignored TTL never causes a stale warning).
    await storage.setItem(keyFor(fingerprint), record, {ttl: KV_TTL_SECONDS} as any);
    console.log('[Helcim Guard] Recorded successful charge', {fingerprint, transactionId: charge.transactionId});
  } catch (error: any) {
    console.warn('[Helcim Guard] recordSuccessfulCharge failed (continuing):', error?.message || error);
  }
}

/**
 * Look up a recent successful charge for the same fingerprint. Returns null when none is found,
 * the record is outside the window, or storage is unavailable (fail open).
 */
export async function findRecentCharge(input: ChargeFingerprintInput): Promise<(RecordedCharge & {minutesAgo: number}) | null> {
  try {
    const fingerprint = computeChargeFingerprint(input);
    const storage = useStorage('cache');
    const record = await storage.getItem<RecordedCharge>(keyFor(fingerprint));
    if (!record?.at) return null;

    const ageMs = Date.now() - new Date(record.at).getTime();
    if (ageMs < 0 || ageMs > DUPLICATE_WARNING_WINDOW_MS) return null;

    return {...record, minutesAgo: Math.max(0, Math.round(ageMs / 60000))};
  } catch (error: any) {
    console.warn('[Helcim Guard] findRecentCharge failed (failing open):', error?.message || error);
    return null;
  }
}
