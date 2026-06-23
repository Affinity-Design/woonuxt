// server/api/recover-helcim-order.post.ts
//
// Reconciles a stranded Helcim charge (card charged, Woo order never created) into a real order,
// WITHOUT charging the customer again. Closes the gap left by the duplicate-charge block: blocking
// the retry stops a double charge, but on its own it strands a paid customer with no order.
//
// Safety model (in order — designed so we NEVER create a duplicate Woo order):
//   1. Only acts on transactionIds the server itself recorded as stranded (helcimOrderRecovery KV).
//      A client cannot forge order data — recovery replays the server-persisted payload.
//   2. If the idempotency record says the order already completed, returns that order.
//   3. Verifies against WooCommerce whether an order already exists for the transactionId; if so,
//      adopts it instead of creating a new one.
//   4. If (and only if) no order exists, replays the persisted payload through /api/create-admin-order.
//   5. If WooCommerce verification fails (can't confirm absence), refuses to auto-create and flags
//      the charge for manual review — never risks a duplicate silently.
//
// Actions:
//   - default / { transactionId }      → recover a single charge (customer self-service from the block).
//   - { action: 'list', secret }       → admin: list stranded charges (REVALIDATION_SECRET required).
//   - { action: 'recover-all', secret }→ admin: attempt recovery of every pending charge.
import {defineEventHandler, readBody, getQuery, createError} from 'h3';
import type {RecoveredOrderRef} from '../utils/helcimOrderRecovery';

interface WooRestOrder {
  id: number;
  number?: number | string;
  order_key?: string;
  status?: string;
  total?: string;
  transaction_id?: string;
  meta_data?: Array<{key: string; value: any}>;
}

function normalizeWooOrder(o: WooRestOrder): RecoveredOrderRef {
  return {
    id: o.id,
    databaseId: o.id,
    orderNumber: o.number != null ? String(o.number) : String(o.id),
    orderKey: o.order_key,
    status: o.status,
    total: o.total,
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const body = await readBody(event).catch(() => ({}) as any);

  const action = (body?.action || query?.action || 'recover') as string;
  const secret = body?.secret || query?.secret;

  const wpBaseUrl = config.public?.wpBaseUrl;
  const hasWpCreds = !!(config.wpAdminUsername && config.wpAdminAppPassword && wpBaseUrl);
  const auth = hasWpCreds ? Buffer.from(`${config.wpAdminUsername}:${config.wpAdminAppPassword}`).toString('base64') : '';

  const orderMatchesTransaction = (o: WooRestOrder, transactionId: string): boolean => {
    if (String(o.transaction_id || '') === String(transactionId)) return true;
    return (
      Array.isArray(o.meta_data) &&
      o.meta_data.some((m) => ['_transaction_id', '_helcim_transaction_id'].includes(m.key) && String(m.value) === String(transactionId))
    );
  };

  const fetchWooOrders = async (queryString: string): Promise<WooRestOrder[]> => {
    const res = await fetch(`${wpBaseUrl}/wp-json/wc/v3/orders?${queryString}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WooNuxt-Order-Recovery/1.0',
      },
    });
    if (!res.ok) throw new Error(`WC order search failed: ${res.status} ${res.statusText}`);
    const orders = (await res.json()) as WooRestOrder[];
    return Array.isArray(orders) ? orders : [];
  };

  // Look up an existing Woo order for this transactionId via WC REST (App Password Basic auth,
  // matching create-admin-order's status-update call). Throws on any failure so the caller can
  // decline to auto-create rather than risk a duplicate.
  //
  // WC REST `search` does not reliably index the Helcim transaction id, but it DOES index the
  // customer email — so we primarily search by email (when known) and match the transaction id in
  // the returned orders' fields/meta. A direct transaction-id search is kept as a fallback.
  const findExistingWooOrder = async (transactionId: string, email?: string): Promise<RecoveredOrderRef | null> => {
    if (!hasWpCreds) throw new Error('WordPress admin credentials are not configured');

    const candidates: WooRestOrder[] = [];
    if (email) {
      candidates.push(...(await fetchWooOrders(`search=${encodeURIComponent(email)}&per_page=50&orderby=date&order=desc`)));
    }
    candidates.push(...(await fetchWooOrders(`search=${encodeURIComponent(transactionId)}&per_page=20`)));

    const match = candidates.find((o) => orderMatchesTransaction(o, transactionId));
    return match ? normalizeWooOrder(match) : null;
  };

  const recoverOne = async (transactionId: string) => {
    const record = await getStrandedCharge(transactionId);
    if (!record) {
      return {recovered: false, reason: 'no_recoverable_charge'};
    }
    if (record.status === 'recovered' && record.recoveredOrder) {
      return {recovered: true, alreadyRecovered: true, order: record.recoveredOrder, via: record.recoveredVia};
    }

    // 1. Idempotency record already says the order completed (response was just lost) → adopt it.
    try {
      const storage = useStorage('cache');
      const idem = await storage.getItem<any>(`idempotency:admin-order:${transactionId}`);
      if (idem?.status === 'completed' && idem?.order) {
        await updateStrandedCharge(transactionId, {status: 'recovered', recoveredOrder: idem.order, recoveredVia: 'idempotency'});
        return {recovered: true, order: idem.order, via: 'idempotency'};
      }
    } catch (e: any) {
      console.warn('[Helcim Recovery] idempotency lookup failed (continuing):', e?.message || e);
    }

    // 2. Verify against WooCommerce whether an order already exists for this charge.
    let existing: RecoveredOrderRef | null = null;
    try {
      existing = await findExistingWooOrder(transactionId, record.customerEmail || record.payload?.billing?.email);
    } catch (e: any) {
      // We could not confirm the order is absent — refuse to auto-create to avoid a duplicate.
      await updateStrandedCharge(transactionId, {lastError: `verification_failed: ${e?.message || e}`});
      console.warn('[Helcim Recovery] Verification failed — flagging for manual review', {transactionId, error: e?.message});
      return {recovered: false, reason: 'verification_failed', needsManualReview: true, error: e?.message || String(e)};
    }

    if (existing) {
      await updateStrandedCharge(transactionId, {status: 'recovered', recoveredOrder: existing, recoveredVia: 'existing_woo_order'});
      return {recovered: true, order: existing, via: 'existing_order'};
    }

    // 3. No order exists → replay the persisted payload through the normal creation endpoint.
    try {
      const result = (await $fetch('/api/create-admin-order', {method: 'POST', body: record.payload})) as any;
      if (result?.success && result?.order) {
        await updateStrandedCharge(transactionId, {status: 'recovered', recoveredOrder: result.order, recoveredVia: 'recreated'});
        return {recovered: true, order: result.order, via: 'recreated', created: true};
      }
      await updateStrandedCharge(transactionId, {attempts: (record.attempts || 0) + 1, lastError: result?.error || 'recreate returned no order'});
      return {recovered: false, reason: 'recreate_failed', error: result?.error || 'no order returned'};
    } catch (e: any) {
      await updateStrandedCharge(transactionId, {attempts: (record.attempts || 0) + 1, lastError: e?.message || String(e)});
      return {recovered: false, reason: 'recreate_failed', error: e?.message || String(e)};
    }
  };

  // --- Admin actions (secret-gated) -------------------------------------------------------------
  if (action === 'list' || action === 'recover-all') {
    if (!process.env.REVALIDATION_SECRET || secret !== process.env.REVALIDATION_SECRET) {
      throw createError({statusCode: 401, statusMessage: 'Invalid token'});
    }

    const pending = await listStrandedCharges('pending');

    if (action === 'list') {
      const all = await listStrandedCharges();
      return {
        success: true,
        pendingCount: pending.length,
        charges: all.map((c) => ({
          transactionId: c.transactionId,
          status: c.status,
          attempts: c.attempts,
          customerEmail: c.customerEmail,
          customerName: c.customerName,
          cartTotal: c.cartTotal,
          failureReason: c.failureReason,
          lastError: c.lastError,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          recoveredOrder: c.recoveredOrder,
        })),
      };
    }

    // recover-all
    const results = [];
    for (const c of pending) {
      results.push({transactionId: c.transactionId, ...(await recoverOne(c.transactionId))});
    }
    return {success: true, processed: results.length, results};
  }

  // --- Single recovery (customer self-service from the duplicate-charge block) ------------------
  const transactionId = body?.transactionId || query?.transactionId;
  if (!transactionId) {
    throw createError({statusCode: 400, statusMessage: 'transactionId is required'});
  }

  const result = await recoverOne(String(transactionId));
  return {success: true, ...result};
});
