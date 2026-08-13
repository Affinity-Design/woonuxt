import {defineEventHandler, getQuery, createError} from 'h3';

/**
 * TEMPORARY diagnostic error-beacon reader (see plugins/error-beacon.client.ts).
 * Lists recent client error reports captured in KV. Guarded by a static token —
 * acceptable for short-lived, low-sensitivity diagnostics. Remove after incident.
 */
const READ_TOKEN = 'psp-diag-7y81v8';
const MAX_REPORTS = 50;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  if (query.key !== READ_TOKEN) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'});
  }

  const storage = useStorage('cache');
  const keys = (await storage.getKeys('client-errors:')).sort().reverse().slice(0, MAX_REPORTS);
  const reports = [];
  for (const key of keys) {
    try {
      const item = await storage.getItem(key);
      if (item) reports.push({key, ...item});
    } catch {
      /* skip unreadable entries */
    }
  }
  return {count: reports.length, reports};
});
