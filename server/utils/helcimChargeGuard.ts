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
//
// STORAGE: fingerprints live in the dedicated `payment` mount (NUXT_PAYMENT_DATA) via
// paymentStorage.ts so cache clears can't disarm the guard mid-window; reads fall back to the
// legacy cache location for records written before the migration.

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

function attemptKeyFor(attemptId: string): string {
  return `helcim-attempt:${attemptId}`;
}

/**
 * Record a successful charge. Best-effort: swallows all storage errors.
 */
export async function recordSuccessfulCharge(input: ChargeFingerprintInput, charge: Omit<RecordedCharge, 'at'>): Promise<void> {
  try {
    const fingerprint = computeChargeFingerprint(input);
    const record: RecordedCharge = {...charge, at: new Date().toISOString()};
    // Pass ttl when supported by the KV driver; harmlessly ignored otherwise (we also
    // window-check on read, so an ignored TTL never causes a stale warning).
    await paymentSetItem(keyFor(fingerprint), record, {ttl: KV_TTL_SECONDS});
    console.log('[Helcim Guard] Recorded successful charge', {fingerprint, transactionId: charge.transactionId});
  } catch (error: any) {
    console.warn('[Helcim Guard] recordSuccessfulCharge failed (continuing):', error?.message || error);
  }
}

/**
 * Record a successful charge against the client-minted checkout attempt id. Unlike the
 * fingerprint, the attempt id is exact (no amount/line-item normalization to drift), so this is
 * the strongest retry signal we have. Best-effort: swallows all storage errors.
 */
export async function recordAttemptCharge(attemptId: string | undefined | null, charge: Omit<RecordedCharge, 'at'>): Promise<void> {
  if (!attemptId) return;
  try {
    const record: RecordedCharge = {...charge, at: new Date().toISOString()};
    await paymentSetItem(attemptKeyFor(String(attemptId)), record, {ttl: KV_TTL_SECONDS});
    console.log('[Helcim Guard] Recorded successful charge for attempt', {attemptId, transactionId: charge.transactionId});
  } catch (error: any) {
    console.warn('[Helcim Guard] recordAttemptCharge failed (continuing):', error?.message || error);
  }
}

/**
 * Strongly-consistent attempt-charge marker (mitigation plan P1-2). KV is eventually consistent,
 * so a fast retry could read stale state and slip past the block; D1 reads hit the primary and
 * see the write immediately. Writes BOTH stores (D1 authoritative, KV as fallback + legacy
 * reader); falls back silently when the D1 binding is absent. Best-effort, never throws.
 *
 * Deliberate scope note: we mark attempts at charge-VALIDATION time, not when the pay modal
 * opens. The charge happens client-side inside HelcimPay.js, so a modal-open marker cannot
 * distinguish "charged but not yet validated" from "customer closed the modal without paying" —
 * blocking on it would lock legitimate abandoned-cart retries out for the whole window. The
 * residual exposure (reload in the seconds between charge success and validate) is covered by
 * the order-level attempt idempotency in create-admin-order.
 */
export async function recordAttemptChargeStrong(event: any, attemptId: string | undefined | null, charge: Omit<RecordedCharge, 'at'>): Promise<void> {
  if (!attemptId) return;

  const db = getCheckoutLogsDb(event);
  if (db) {
    try {
      await ensureLedgerSchema(db);
      await db
        .prepare('INSERT OR REPLACE INTO attempt_charges (attempt_id, transaction_id, email, amount, at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(String(attemptId), charge.transactionId || null, charge.email || null, charge.amount != null ? String(charge.amount) : null, new Date().toISOString())
        .run();
    } catch (error: any) {
      console.warn('[Helcim Guard] D1 attempt-charge write failed (KV still records):', error?.message || error);
    }
  }

  await recordAttemptCharge(attemptId, charge);
}

/** D1-first lookup of a recent charge for this attempt; falls back to the KV record. Fail open. */
export async function findRecentAttemptChargeStrong(
  event: any,
  attemptId: string | undefined | null,
): Promise<(RecordedCharge & {minutesAgo: number}) | null> {
  if (!attemptId) return null;

  const db = getCheckoutLogsDb(event);
  if (db) {
    try {
      await ensureLedgerSchema(db);
      const row: any = await db.prepare('SELECT transaction_id, email, amount, at FROM attempt_charges WHERE attempt_id = ?1').bind(String(attemptId)).first();
      if (row?.at) {
        const ageMs = Date.now() - new Date(row.at).getTime();
        if (ageMs >= 0 && ageMs <= DUPLICATE_WARNING_WINDOW_MS) {
          return {
            transactionId: row.transaction_id || undefined,
            email: row.email || undefined,
            amount: row.amount || undefined,
            at: row.at,
            minutesAgo: Math.max(0, Math.round(ageMs / 60000)),
          };
        }
        return null; // authoritative answer: known attempt, outside the window
      }
    } catch (error: any) {
      console.warn('[Helcim Guard] D1 attempt-charge lookup failed, falling back to KV:', error?.message || error);
    }
  }

  return findRecentAttemptCharge(attemptId);
}

/**
 * Look up a recent successful charge for the same checkout attempt id. Same window semantics as
 * findRecentCharge; fail open.
 */
export async function findRecentAttemptCharge(attemptId: string | undefined | null): Promise<(RecordedCharge & {minutesAgo: number}) | null> {
  if (!attemptId) return null;
  try {
    const record = await paymentGetItem<RecordedCharge>(attemptKeyFor(String(attemptId)));
    if (!record?.at) return null;

    const ageMs = Date.now() - new Date(record.at).getTime();
    if (ageMs < 0 || ageMs > DUPLICATE_WARNING_WINDOW_MS) return null;

    return {...record, minutesAgo: Math.max(0, Math.round(ageMs / 60000))};
  } catch (error: any) {
    console.warn('[Helcim Guard] findRecentAttemptCharge failed (failing open):', error?.message || error);
    return null;
  }
}

/**
 * Look up a recent successful charge for the same fingerprint. Returns null when none is found,
 * the record is outside the window, or storage is unavailable (fail open).
 */
export async function findRecentCharge(input: ChargeFingerprintInput): Promise<(RecordedCharge & {minutesAgo: number}) | null> {
  try {
    const fingerprint = computeChargeFingerprint(input);
    const record = await paymentGetItem<RecordedCharge>(keyFor(fingerprint));
    if (!record?.at) return null;

    const ageMs = Date.now() - new Date(record.at).getTime();
    if (ageMs < 0 || ageMs > DUPLICATE_WARNING_WINDOW_MS) return null;

    return {...record, minutesAgo: Math.max(0, Math.round(ageMs / 60000))};
  } catch (error: any) {
    console.warn('[Helcim Guard] findRecentCharge failed (failing open):', error?.message || error);
    return null;
  }
}
