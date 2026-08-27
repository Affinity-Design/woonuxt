import {defineEventHandler, readBody, createError} from 'h3';
import {createSafeClientErrorReport} from '../utils/clientErrorReport';

/**
 * TEMPORARY diagnostic error-beacon sink (see plugins/error-beacon.client.ts).
 * Stores small client error reports in KV with a short TTL so they can be
 * inspected remotely by an authenticated WordPress administrator. Remove after incident.
 */
const MAX_BODY_BYTES = 16 * 1024;
const TTL_SECONDS = 3 * 24 * 60 * 60;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const raw = JSON.stringify(body || {});
  if (raw.length > MAX_BODY_BYTES) {
    throw createError({statusCode: 413, statusMessage: 'Report too large'});
  }
  if (!body || !Array.isArray(body.events) || body.events.length === 0) {
    return {ok: false};
  }

  const safeReport = createSafeClientErrorReport(body);
  if (!safeReport) return {ok: false};

  const key = `client-errors:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const storage = useStorage('cache');
    await storage.setItem(key, safeReport, {ttl: TTL_SECONDS});
  } catch (e: any) {
    // Never fail the client over a diagnostics write.
    console.warn('[client-errors] KV write failed. Sensitive details were withheld.');
  }
  return {ok: true};
});
