// server/api/checkout-failures.get.ts
//
// Support-triage view of the checkout failure ledger (mitigation plan §6 Tier 1).
// Merges D1 rows (NUXT_CHECKOUT_LOGS) with KV fallback records, newest first.
//
// Usage: authenticate with a WordPress admin session or send REVALIDATION_SECRET in the
// x-internal-secret header. Credentials are never accepted in query strings.
import {defineEventHandler, getHeader, getQuery, createError} from 'h3';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  const headerSecret = getHeader(event, 'x-internal-secret');
  const secretAuthorized = !!process.env.REVALIDATION_SECRET && headerSecret === process.env.REVALIDATION_SECRET;
  if (!secretAuthorized) {
    const adminUser = await verifyAdminSession(event);
    if (!adminUser.isAdmin) {
      throw createError({statusCode: 404, statusMessage: 'Not Found'});
    }
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
