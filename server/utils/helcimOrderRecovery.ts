import {getSafeErrorLogDetails, removeSensitiveFields} from '../../utils/publicErrorMessages.mjs';

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
// sanitized order-creation payload here, keyed by transactionId. Account credentials are removed
// before storage. A recovery flow can then reconcile the charge into a real Woo order out-of-band
// without asking the customer to pay again.
//
// All operations are best-effort: if KV is unavailable we fail safe (never throw into the order
// flow). The happy path never touches this module.
//
// STORAGE: records live in the dedicated `payment` mount (NUXT_PAYMENT_DATA) via paymentStorage.ts
// so cache clears/rebuilds can't wipe them; reads fall back to the legacy cache location for
// records written before the migration.

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
  // Replayable order data with account credentials removed before storage.
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

function sanitizeStrandedCharge(record: StrandedCharge | null): StrandedCharge | null {
  if (!record) return null;
  return {
    ...record,
    payload: removeSensitiveFields(record.payload),
    failureReason: record.failureReason ? 'Order creation failed. Sensitive details were withheld.' : undefined,
    lastError: record.lastError ? 'The latest recovery attempt failed. Sensitive details were withheld.' : undefined,
  };
}

/**
 * Persist a stranded charge (successful Helcim charge whose Woo order failed to create).
 * Best-effort. Never overwrites an already-`recovered` record.
 */
export async function recordStrandedCharge(transactionId: string | undefined | null, payload: any, failureReason?: string): Promise<void> {
  if (!transactionId) return;
  try {
    const key = keyFor(String(transactionId));

    const existing = await paymentGetItem<StrandedCharge>(key).catch(() => null);
    if (existing?.status === 'recovered') {
      // Already reconciled into an order — don't regress it back to pending.
      return;
    }

    const now = new Date().toISOString();
    const recoveryPayload = removeSensitiveFields(payload);
    const record: StrandedCharge = {
      transactionId: String(transactionId),
      status: 'pending',
      payload: recoveryPayload,
      customerEmail: payload?.billing?.email,
      customerName: `${payload?.billing?.firstName || ''} ${payload?.billing?.lastName || ''}`.trim() || undefined,
      cartTotal: cleanPriceText(payload?.cartTotals?.total) || undefined,
      failureReason: failureReason || existing?.failureReason,
      attempts: existing?.attempts || 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await paymentSetItem(key, record, {ttl: KV_TTL_SECONDS});
    console.log('[Helcim Recovery] Recorded stranded charge for later reconciliation. Identifiers and failure details were withheld.');
  } catch (error: any) {
    console.warn('[Helcim Recovery] recordStrandedCharge failed (continuing):', getSafeErrorLogDetails(error));
  }
}

/** Fetch a single stranded-charge record. Returns null if missing or storage is unavailable. */
export async function getStrandedCharge(transactionId: string): Promise<StrandedCharge | null> {
  try {
    return sanitizeStrandedCharge((await paymentGetItem<StrandedCharge>(keyFor(transactionId))) || null);
  } catch (error: any) {
    console.warn('[Helcim Recovery] stranded-charge lookup failed. Sensitive details were withheld.');
    return null;
  }
}

/** Update an existing stranded-charge record. Best-effort; merges `extra` over the stored record. */
export async function updateStrandedCharge(transactionId: string, extra: Partial<StrandedCharge>): Promise<void> {
  try {
    const key = keyFor(transactionId);
    const existing = await paymentGetItem<StrandedCharge>(key);
    if (!existing) return;
    const updated = sanitizeStrandedCharge({...existing, ...extra, updatedAt: new Date().toISOString()});
    if (!updated) return;
    // Written to the payment store even when the original was read from the legacy cache —
    // updates migrate legacy records forward.
    await paymentSetItem(key, updated, {ttl: KV_TTL_SECONDS});
  } catch (error: any) {
    console.warn('[Helcim Recovery] stranded-charge update failed. Sensitive details were withheld.');
  }
}

/** List stranded-charge records, newest first. Optionally filter by status. */
export async function listStrandedCharges(status?: StrandedChargeStatus): Promise<StrandedCharge[]> {
  try {
    const keys = await paymentGetKeys(KEY_PREFIX);
    if (!keys?.length) return [];

    const records = await Promise.all(keys.map((k) => paymentGetItem<StrandedCharge>(k).catch(() => null)));
    const list = records.filter((r): r is StrandedCharge => !!r);
    const sanitizedList = list.map((record) => sanitizeStrandedCharge(record)).filter((record): record is StrandedCharge => !!record);
    const filtered = status ? sanitizedList.filter((r) => r.status === status) : sanitizedList;
    return filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (error: any) {
    console.warn('[Helcim Recovery] stranded-charge list failed. Sensitive details were withheld.');
    return [];
  }
}
