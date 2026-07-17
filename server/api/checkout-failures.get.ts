// server/api/checkout-failures.get.ts
//
// Support-triage view of the checkout failure ledger (mitigation plan §6 Tier 1).
// Merges D1 rows (NUXT_CHECKOUT_LOGS) with KV fallback records, newest first.
//
// Usage (secret-gated, same pattern as recover-helcim-order admin actions):
//   GET /api/checkout-failures?secret=...                     → latest 100
//   GET /api/checkout-failures?secret=...&email=demetrius     → filter by email substring
//   GET /api/checkout-failures?secret=...&stage=order_create_failed
//   GET /api/checkout-failures?secret=...&since=2026-07-15T00:00:00Z&limit=500
import {defineEventHandler, getQuery, createError} from 'h3';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  if (!process.env.REVALIDATION_SECRET || query?.secret !== process.env.REVALIDATION_SECRET) {
    throw createError({statusCode: 401, statusMessage: 'Invalid token'});
  }

  const failures = await queryCheckoutFailures(event, {
    email: query.email ? String(query.email) : undefined,
    stage: query.stage ? String(query.stage) : undefined,
    since: query.since ? String(query.since) : undefined,
    limit: query.limit ? Number(query.limit) : undefined,
  });

  return {
    success: true,
    count: failures.length,
    d1Bound: !!getCheckoutLogsDb(event),
    failures,
  };
});
