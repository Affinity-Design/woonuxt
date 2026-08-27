import {defineEventHandler, createError} from 'h3';
import {createSafeClientErrorReport} from '../utils/clientErrorReport';

/**
 * TEMPORARY diagnostic error-beacon reader (see plugins/error-beacon.client.ts).
 * Lists recent client error reports captured in KV. Access requires a server-verified
 * WordPress administrator session, and legacy records are reshaped before being returned.
 */
const MAX_REPORTS = 50;

export default defineEventHandler(async (event) => {
  const adminUser = await verifyAdminSession(event);
  if (!adminUser.isAdmin) {
    throw createError({statusCode: 404, statusMessage: 'Not Found'});
  }

  const storage = useStorage('cache');
  const keys = (await storage.getKeys('client-errors:')).sort().reverse().slice(0, MAX_REPORTS);
  const reports = [];
  for (const key of keys) {
    try {
      const item = await storage.getItem(key);
      const safeReport = createSafeClientErrorReport(item);
      if (safeReport) reports.push({key, ...safeReport});
    } catch {
      /* skip unreadable entries */
    }
  }
  return {count: reports.length, reports};
});
