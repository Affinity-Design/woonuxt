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
//   - { action: 'list', secret }       → admin: list stranded charges (body/header credential or WP admin session).
//   - { action: 'recover-all', secret }→ admin: attempt recovery of every pending charge.
import {defineEventHandler, readBody, getHeader, getQuery, createError} from 'h3';
import type {RecoveredOrderRef} from '../utils/helcimOrderRecovery';
import {getSafeErrorLogDetails} from '../../utils/publicErrorMessages.mjs';

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
  const secret = body?.secret || getHeader(event, 'x-internal-secret');

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

  // Backfill idempotency records after an adoption so the next lookup (guard, retry, or another
  // recovery call) resolves instantly without re-verifying. Best-effort.
  const backfillIdempotency = async (transactionId: string, checkoutAttemptId: string | undefined, order: RecoveredOrderRef) => {
    const record = {status: 'completed', completedAt: new Date().toISOString(), order, transactionId, checkoutAttemptId, recoveredBackfill: true};
    try {
      await paymentSetItem(`idempotency:admin-order:${transactionId}`, record);
      if (checkoutAttemptId) {
        await paymentSetItem(`idempotency:admin-order:attempt:${checkoutAttemptId}`, record);
      }
    } catch {
      // ignore — purely an optimization
    }
  };

  // opts.checkoutAttemptId / opts.email come from the customer's own browser state. The attempt
  // id is an unguessable client-minted UUID: presenting the one stored inside a record (or one
  // Helcim confirms is stamped on the charge) is what authorizes adopting an order when no
  // server-side stranded record exists. A bare transactionId alone must never unlock a receipt.
  const recoverOne = async (transactionId: string, opts: {checkoutAttemptId?: string; email?: string} = {}) => {
    const record = await getStrandedCharge(transactionId);
    if (record?.status === 'recovered' && record.recoveredOrder) {
      return {recovered: true, alreadyRecovered: true, order: record.recoveredOrder, via: record.recoveredVia};
    }

    // 1. Idempotency record already says the order completed (the response was just lost) →
    //    adopt it. Without a stranded record (the server never saw a failure — e.g. the redirect
    //    to the receipt died in the browser), require proof of the attempt id stored on the record.
    try {
      const idem = await paymentGetItem<any>(`idempotency:admin-order:${transactionId}`);
      if (idem?.status === 'completed' && idem?.order) {
        const attemptMatches = !!opts.checkoutAttemptId && !!idem.checkoutAttemptId && String(idem.checkoutAttemptId) === String(opts.checkoutAttemptId);
        if (record || attemptMatches) {
          await updateStrandedCharge(transactionId, {status: 'recovered', recoveredOrder: idem.order, recoveredVia: 'idempotency'});
          return {recovered: true, order: idem.order, via: 'idempotency'};
        }
        console.warn('[Helcim Recovery] Completed idempotency record found but caller lacks matching attempt id — not adopting', {transactionId});
      }
    } catch (e: any) {
      console.warn('[Helcim Recovery] idempotency lookup failed (continuing):', getSafeErrorLogDetails(e));
    }

    // 1b. Attempt-keyed idempotency record: possession of the attempt id authorizes directly.
    //     If its charge differs from the one presented, the caller is holding a DUPLICATE charge
    //     for an already-ordered attempt — return the original order and strand the duplicate.
    if (opts.checkoutAttemptId) {
      try {
        const attemptIdem = await paymentGetItem<any>(`idempotency:admin-order:attempt:${opts.checkoutAttemptId}`);
        if (attemptIdem?.status === 'completed' && attemptIdem?.order) {
          const isSameCharge = String(attemptIdem.transactionId || '') === String(transactionId);
          if (!isSameCharge) {
            // The caller is holding a DIFFERENT charge than the one that created the attempt's
            // order — a real duplicate that needs a REFUND. Record it and leave it PENDING so it
            // stays visible in the support recovery list; do NOT mark it recovered.
            await recordStrandedCharge(
              transactionId,
              {billing: {email: opts.email || attemptIdem?.order?.billing?.email}},
              `duplicate_charge_for_completed_attempt:${attemptIdem.transactionId}`,
            );
          } else {
            await updateStrandedCharge(transactionId, {status: 'recovered', recoveredOrder: attemptIdem.order, recoveredVia: 'attempt_idempotency'});
          }
          return {recovered: true, order: attemptIdem.order, via: 'attempt_idempotency', duplicateChargeDetected: !isSameCharge};
        }
      } catch (e: any) {
        console.warn('[Helcim Recovery] attempt idempotency lookup failed (continuing):', getSafeErrorLogDetails(e));
      }
    }

    // 2. Stranded record exists → verify against WooCommerce whether an order already exists.
    if (record) {
      let existing: RecoveredOrderRef | null = null;
      try {
        existing = await findExistingWooOrder(transactionId, record.customerEmail || record.payload?.billing?.email);
      } catch (e: any) {
        // We could not confirm the order is absent — refuse to auto-create to avoid a duplicate.
        await updateStrandedCharge(transactionId, {lastError: 'WooCommerce verification failed. Sensitive details were withheld.'});
        console.warn('[Helcim Recovery] Verification failed; flagging for manual review:', {transactionId, ...getSafeErrorLogDetails(e)});
        return {recovered: false, reason: 'verification_failed', needsManualReview: true, error: 'We could not safely verify the order. Customer service must review this payment.'};
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
        await updateStrandedCharge(transactionId, {attempts: (record.attempts || 0) + 1, lastError: 'Order recreation did not return an order.'});
        return {recovered: false, reason: 'recreate_failed', error: 'We could not recreate the order automatically. Customer service must review this payment.'};
      } catch (e: any) {
        await updateStrandedCharge(transactionId, {attempts: (record.attempts || 0) + 1, lastError: 'Order recreation failed. Sensitive details were withheld.'});
        console.warn('[Helcim Recovery] Order recreation failed:', getSafeErrorLogDetails(e));
        return {recovered: false, reason: 'recreate_failed', error: 'We could not recreate the order automatically. Customer service must review this payment.'};
      }
    }

    // 4. NO server-side record at all (KV wiped/unbound, or the failure never touched the
    //    server). Authorize via Helcim itself: the charge's invoice number is derived from the
    //    attempt id, so Helcim confirming the link proves the caller owns this charge. Then find
    //    the order WooCommerce-side via the stamped `_checkout_attempt_id` meta.
    if (opts.checkoutAttemptId) {
      const belongsToAttempt = await verifyTransactionBelongsToAttempt(config.helcimApiToken as string, opts.checkoutAttemptId, transactionId);
      if (belongsToAttempt && hasWpCreds) {
        try {
          const wooOrder = await findWooOrderForAttempt({
            wpBaseUrl,
            authHeader: `Basic ${auth}`,
            email: opts.email,
            checkoutAttemptId: opts.checkoutAttemptId,
            transactionId,
          });
          if (wooOrder) {
            await backfillIdempotency(transactionId, opts.checkoutAttemptId, wooOrder);
            return {recovered: true, order: wooOrder, via: 'helcim_verified_woo_order'};
          }
          // The charge is real and verified but no order exists anywhere and we hold no payload
          // to replay — a human needs to finish this one. Never leaves the customer unpaid-for.
          console.warn('[Helcim Recovery] Helcim-verified charge has no Woo order and no replay payload — manual review', {
            transactionId,
            checkoutAttemptId: opts.checkoutAttemptId,
          });
          return {recovered: false, reason: 'verified_charge_without_order', needsManualReview: true};
        } catch (e: any) {
          console.warn('[Helcim Recovery] Helcim-verified Woo lookup failed; manual review required:', {transactionId, ...getSafeErrorLogDetails(e)});
          return {recovered: false, reason: 'verification_failed', needsManualReview: true, error: 'We could not safely verify the order. Customer service must review this payment.'};
        }
      }
    }

    return {recovered: false, reason: 'no_recoverable_charge'};
  };

  // --- Admin actions (secret- OR wp-role-gated) -------------------------------------------------
  if (action === 'list' || action === 'recover-all') {
    const secretOk = !!process.env.REVALIDATION_SECRET && secret === process.env.REVALIDATION_SECRET;
    if (!secretOk) {
      // My-account admin UI sends no secret — authorize by the WP role WordPress resolves from
      // the woocommerce-session cookie (fail-closed, see server/utils/adminAuth.ts).
      const adminUser = await verifyAdminSession(event);
      if (!adminUser.isAdmin) {
        throw createError({statusCode: 401, statusMessage: 'Invalid token'});
      }
      console.log('[Helcim Recovery] Admin action authorized via WP role', {action, username: adminUser.username});
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
          failureReason: c.failureReason ? 'Order creation failed; sensitive details were withheld.' : undefined,
          lastError: c.lastError ? 'The latest recovery attempt failed; sensitive details were withheld.' : undefined,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          recoveredOrder: c.recoveredOrder,
        })),
      };
    }

    // recover-all
    const results = [];
    for (const c of pending) {
      const outcome = await recoverOne(c.transactionId);
      await logCheckoutFailure(event, {
        stage: 'recovery_attempt',
        reason: outcome?.recovered ? `recovered_via_${(outcome as any).via || 'unknown'}` : `failed: ${(outcome as any)?.reason || 'unknown'}`,
        transactionId: c.transactionId,
        email: c.customerEmail,
        cartTotal: c.cartTotal,
      });
      results.push({transactionId: c.transactionId, ...outcome});
    }
    return {success: true, processed: results.length, results};
  }

  // --- Single recovery (customer self-service from the duplicate-charge block) ------------------
  const transactionId = body?.transactionId;
  if (!transactionId) {
    throw createError({statusCode: 400, statusMessage: 'transactionId is required'});
  }

  const result = await recoverOne(String(transactionId), {
    checkoutAttemptId: body?.checkoutAttemptId ? String(body.checkoutAttemptId) : undefined,
    email: body?.email ? String(body.email) : undefined,
  });

  await logCheckoutFailure(event, {
    stage: 'recovery_attempt',
    reason: result?.recovered ? `recovered_via_${(result as any).via || 'unknown'}` : `failed: ${(result as any)?.reason || 'unknown'}`,
    transactionId: String(transactionId),
  });

  return {success: true, ...result};
});
