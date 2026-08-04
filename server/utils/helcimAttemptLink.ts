// server/utils/helcimAttemptLink.ts
//
// Authoritative link between a checkout attempt and its Helcim charge — WITHOUT depending on
// our own storage.
//
// WHY THIS EXISTS
// ---------------
// Every duplicate-charge guard layer before this one depends on state WE wrote: the D1
// attempt_charges table (binding may not exist), the payment KV store (binding may not exist →
// falls back to NUXT_CACHE, which cache clears wipe and whose eventual consistency a fast retry
// can outrun). The 2026-08-03 incident (orders 500048481/500048484/500048487 — three charges,
// three orders, one intended purchase) happened because the customer's retry sailed past those
// layers. Helcim itself is the one party that ALWAYS knows a charge happened.
//
// HOW IT WORKS
// ------------
// 1. At HelcimPay initialize we stamp the invoice with a deterministic invoice number derived
//    from the client-minted checkoutAttemptId (stable across reload/retry of the same cart).
// 2. Before issuing any NEW checkout token, we ask Helcim for card transactions carrying that
//    invoice number. An APPROVED purchase = this attempt already charged → block the new token.
// 3. The recovery endpoint uses the same lookup to prove a transactionId belongs to an attempt
//    (the attempt id is an unguessable client UUID, so possession authorizes recovery).
//
// All lookups are best-effort with a hard timeout: any error/timeout fails OPEN so checkout is
// never broken by this layer (the KV/D1 layers still ran first).

import {createHash} from 'node:crypto';

export interface HelcimTransactionSummary {
  transactionId: string;
  status?: string;
  type?: string;
  amount?: number | string;
  currency?: string;
  invoiceNumber?: string;
  dateCreated?: string;
  cardHolderName?: string;
  customerCode?: string;
}

const HELCIM_API_BASE = 'https://api.helcim.com/v2';
const LOOKUP_TIMEOUT_MS = 6000;

/**
 * Deterministic, per-attempt Helcim invoice number. Short (20 chars) to satisfy invoice-number
 * length limits, prefixed for readability in the Helcim dashboard, and derived by hash so the
 * raw attempt UUID (which authorizes recovery) is never exposed on the invoice itself.
 * Returns null when there is no attempt id (e.g. legacy clients).
 */
export function deriveAttemptInvoiceNumber(attemptId: string | null | undefined): string | null {
  if (!attemptId || typeof attemptId !== 'string') return null;
  const digest = createHash('sha256').update(`psp-attempt:${attemptId}`).digest('hex').slice(0, 16);
  return `PSP-${digest.toUpperCase()}`;
}

function isApprovedPurchase(tx: any): boolean {
  const status = String(tx?.status || '').toUpperCase();
  const type = String(tx?.type || '').toLowerCase();
  // Helcim reports APPROVED for successful transactions. Tolerate a missing `type` (API shape
  // drift) but explicitly exclude reversals/refunds/declines.
  if (status !== 'APPROVED') return false;
  if (type && !['purchase', 'preauth', 'capture', 'verify'].includes(type)) return false;
  if (type === 'verify') return false; // card verification, not money movement
  return true;
}

/** Defensive minutes-ago: Helcim timestamps carry no timezone offset, so this is display-only. */
export function minutesSinceHelcimDate(dateCreated?: string): number {
  if (!dateCreated) return 0;
  const parsed = new Date(String(dateCreated).replace(' ', 'T'));
  if (isNaN(parsed.getTime())) return 0;
  const mins = Math.round((Date.now() - parsed.getTime()) / 60000);
  return Math.min(Math.max(mins, 0), 999);
}

/**
 * Ask Helcim for card transactions carrying this attempt's invoice number. Returns the newest
 * APPROVED purchase, or null (not found / any error / timeout — fail open, callers treat null
 * as "no authoritative evidence of a prior charge").
 */
export async function findHelcimChargeForAttempt(
  helcimApiToken: string | undefined | null,
  attemptId: string | null | undefined,
): Promise<HelcimTransactionSummary | null> {
  const invoiceNumber = deriveAttemptInvoiceNumber(attemptId);
  if (!helcimApiToken || !invoiceNumber) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

    const response = await fetch(`${HELCIM_API_BASE}/card-transactions?invoiceNumber=${encodeURIComponent(invoiceNumber)}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-token': helcimApiToken,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('[Helcim Attempt Link] transaction lookup non-OK (failing open):', response.status);
      return null;
    }

    const payload: any = await response.json().catch(() => null);
    // Tolerate both a bare array and { data: [...] } / { transactions: [...] } wrappers.
    const list: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.transactions) ? payload.transactions : [];

    const approved = list
      .filter((tx) => tx && tx.transactionId != null && isApprovedPurchase(tx))
      // The invoiceNumber filter SHOULD be applied by the API; re-check locally in case the
      // parameter is ignored by an API version — a wrong match here could block a stranger's
      // checkout, so exact-match only.
      .filter((tx) => !tx.invoiceNumber || String(tx.invoiceNumber) === invoiceNumber)
      .sort((a, b) => String(b.dateCreated || '').localeCompare(String(a.dateCreated || '')));

    if (!approved.length) return null;

    const tx = approved[0];
    return {
      transactionId: String(tx.transactionId),
      status: tx.status,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      invoiceNumber: tx.invoiceNumber ? String(tx.invoiceNumber) : invoiceNumber,
      dateCreated: tx.dateCreated ? String(tx.dateCreated) : undefined,
      cardHolderName: tx.cardHolderName ? String(tx.cardHolderName) : undefined,
      customerCode: tx.customerCode ? String(tx.customerCode) : undefined,
    };
  } catch (error: any) {
    console.warn('[Helcim Attempt Link] transaction lookup failed (failing open):', error?.message || error);
    return null;
  }
}

/**
 * Verify that a specific transactionId belongs to the given checkout attempt, using Helcim as
 * the authority. Used by recovery to authorize adopting an order when our own KV records are
 * gone: the attempt id is an unguessable client-minted UUID, and Helcim confirms the link.
 */
export async function verifyTransactionBelongsToAttempt(
  helcimApiToken: string | undefined | null,
  attemptId: string | null | undefined,
  transactionId: string | null | undefined,
): Promise<boolean> {
  if (!transactionId) return false;
  const tx = await findHelcimChargeForAttempt(helcimApiToken, attemptId);
  return !!tx && String(tx.transactionId) === String(transactionId);
}
