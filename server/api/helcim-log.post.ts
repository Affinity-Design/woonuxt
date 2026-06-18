// server/api/helcim-log.post.ts
// Captures Helcim charge FAILURES reported by the client (HelcimCard.vue).
//
// Why this exists: a "Could not complete CC transaction" rejection is killed by Helcim
// BEFORE authorization, so it creates no record in Helcim AND no order in WooCommerce.
// The raw error only exists in the customer's browser. This endpoint pulls it server-side
// so it shows up in `wrangler ... tail` and is persisted (failures only) for later review.
// See docs/helcim-cc-rejection-critical-patch.md.
//
// This endpoint is diagnostic only. It must never throw back to the checkout UI.
import {defineEventHandler, readBody} from 'h3';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);

    const record = {
      ...body,
      at: new Date().toISOString(),
      ip: event.node?.req?.headers?.['cf-connecting-ip'] || event.node?.req?.headers?.['x-forwarded-for'] || null,
    };

    // Always log — visible in real-time Cloudflare Functions logs / wrangler tail.
    // Grep by the traceId to line this up with the matching "[Helcim Trace]" outbound payload.
    console.error('[Helcim FAIL]', JSON.stringify(record));

    // Persist failures to KV so they can be reviewed after the fact (best-effort).
    try {
      const storage = useStorage('cache');
      const key = `helcim-fail:${record.traceId || 'no-trace'}:${Date.now()}`;
      await storage.setItem(key, record);
    } catch (storageError) {
      console.warn('[Helcim FAIL] KV persist unavailable:', storageError);
    }

    return {ok: true};
  } catch (error: any) {
    // Swallow everything — diagnostics must not affect the customer's checkout.
    console.warn('[Helcim FAIL] logging error:', error?.message || error);
    return {ok: false};
  }
});
