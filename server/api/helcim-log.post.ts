// server/api/helcim-log.post.ts
// Captures Helcim charge FAILURES reported by the client (HelcimCard.vue).
//
// Why this exists: a "Could not complete CC transaction" rejection is killed by Helcim
// BEFORE authorization, so it creates no record in Helcim AND no order in WooCommerce.
// Only a fixed classification and bounded operational metadata are accepted from the
// browser. Raw errors, payment responses, customer data, and credentials are discarded.
// See docs/helcim-cc-rejection-critical-patch.md.
//
// This endpoint is diagnostic only. It must never throw back to the checkout UI.
import {defineEventHandler, readBody} from 'h3';
import {getSafeErrorLogDetails} from '../../utils/publicErrorMessages.mjs';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);

    const allowedClassifications = new Set(['bank_decline', 'cc_processing_rejection', 'unknown']);
    const record = {
      traceId: typeof body?.traceId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(body.traceId) ? body.traceId : 'no-trace',
      classification: allowedClassifications.has(body?.classification) ? body.classification : 'unknown',
      amount: Number.isFinite(Number(body?.amount)) ? Number(body.amount) : null,
      currency: typeof body?.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : null,
      lineItemCount: Number.isInteger(Number(body?.lineItemCount)) ? Number(body.lineItemCount) : 0,
      hasCoupon: body?.hasCoupon === true,
      at: new Date().toISOString(),
    };

    // Always log — visible in real-time Cloudflare Functions logs / wrangler tail.
    // Grep by the traceId to line this up with the matching "[Helcim Trace]" outbound payload.
    console.error('[Helcim FAIL]', JSON.stringify(record));

    // Persist failures to the dedicated payment store (NUXT_PAYMENT_DATA) so they survive cache
    // clears and can be reviewed after the fact (best-effort). 30-day TTL keeps growth bounded
    // now that nothing ever purges this namespace.
    try {
      const key = `helcim-fail:${record.traceId || 'no-trace'}:${Date.now()}`;
      await paymentSetItem(key, record, {ttl: 30 * 24 * 60 * 60});
    } catch (storageError) {
      console.warn('[Helcim FAIL] KV persistence unavailable. Sensitive details were withheld.');
    }

    // Also index it in the queryable checkout-failure ledger (D1 when bound).
    await logCheckoutFailure(event, {
      stage: 'charge_failed_beacon',
      reason: `Client-reported Helcim charge failure: ${record.classification}`,
      detail: record,
      cartTotal: record.amount,
      requestId: record.traceId,
    });

    return {ok: true};
  } catch (error: any) {
    // Swallow everything — diagnostics must not affect the customer's checkout.
    console.warn('[Helcim FAIL] logging error:', getSafeErrorLogDetails(error));
    return {ok: false};
  }
});
