// server/utils/checkoutFailureLedger.ts
//
// Durable, queryable ledger of EVERY checkout/payment failure (mitigation plan §6 Tier 1).
//
// WHY: server console.log on Cloudflare Pages is real-time only — when order creation fails and
// nothing reaches WordPress, there is no durable trace to diagnose from ("stash the logs" ask
// after the 2026-07-15 double-charge incident). This ledger records a structured row at every
// failure stage (charge failure beacon, duplicate block, validation failure, order-create
// failure, recovery attempt) so support can query by email/stage/date without guessing.
//
// STORAGE (best available, in order):
//   1. Cloudflare D1 (binding `woonuxt-checkout-logs`; legacy name NUXT_CHECKOUT_LOGS also
//      accepted) — strongly consistent, SQL-queryable. The schema is auto-created on first
//      write, so binding the database is the ONLY setup step:
//        npx wrangler d1 create woonuxt-checkout-logs
//        Pages project → Settings → Bindings → D1 database → variable name woonuxt-checkout-logs
//   2. Payment KV store fallback (checkout-fail:* keys, 90-day TTL) when D1 isn't bound —
//      including local dev, where the payment mount is filesystem-backed.
//
// Read side: /api/checkout-failures (secret-gated) merges both sources.
// All operations are best-effort and never throw into a checkout flow.

export interface CheckoutFailureEntry {
  stage: string; // e.g. charge_failed_beacon | duplicate_block | validate_failed | order_create_failed | duplicate_charge_detected | recovery_attempt
  reason?: string | null;
  detail?: any; // JSON-stringified and truncated for storage
  transactionId?: string | null;
  checkoutAttemptId?: string | null;
  email?: string | null;
  cartTotal?: string | number | null;
  requestId?: string | null;
}

export interface CheckoutFailureRecord extends CheckoutFailureEntry {
  id: string;
  at: string;
  userAgent?: string | null;
  source?: 'd1' | 'kv';
}

const KV_KEY_PREFIX = 'checkout-fail:';
const KV_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const MAX_DETAIL_CHARS = 4000;

/** The D1 database bound to the Pages project, or null when not configured (dev / pre-binding).
 *  The production dashboard binds it under the variable name `woonuxt-checkout-logs` (dashed —
 *  needs bracket access); `NUXT_CHECKOUT_LOGS` is kept as a fallback so an environment bound
 *  with the originally-documented name keeps working too. */
export function getCheckoutLogsDb(event: any): any | null {
  const env = event?.context?.cloudflare?.env;
  return env?.['woonuxt-checkout-logs'] || env?.NUXT_CHECKOUT_LOGS || null;
}

// Schema bootstrap — once per isolate, so binding the database is the only manual setup step.
let schemaReady: Promise<void> | null = null;

export function ensureLedgerSchema(db: any): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS checkout_failures (
            id TEXT PRIMARY KEY,
            at TEXT NOT NULL,
            stage TEXT NOT NULL,
            transaction_id TEXT,
            checkout_attempt_id TEXT,
            email TEXT,
            cart_total TEXT,
            reason TEXT,
            detail TEXT,
            request_id TEXT,
            user_agent TEXT
          )`,
        ),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_checkout_failures_at ON checkout_failures(at)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_checkout_failures_email ON checkout_failures(email)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_checkout_failures_stage ON checkout_failures(stage)'),
        // Strongly-consistent attempt-charge markers for the duplicate-charge guard (plan P1-2).
        db.prepare(
          `CREATE TABLE IF NOT EXISTS attempt_charges (
            attempt_id TEXT PRIMARY KEY,
            transaction_id TEXT,
            email TEXT,
            amount TEXT,
            at TEXT NOT NULL
          )`,
        ),
      ]);
    })().catch((error: any) => {
      // Allow a later request to retry schema creation instead of caching the failure forever.
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function serializeDetail(detail: any): string | null {
  if (detail === undefined || detail === null) return null;
  try {
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}…[truncated]` : text;
  } catch {
    return String(detail).slice(0, MAX_DETAIL_CHARS);
  }
}

/**
 * Record one failure. Never throws. Always console.error's (visible in live tail) and then
 * persists to D1 when bound, else to the payment KV store.
 */
export async function logCheckoutFailure(event: any, entry: CheckoutFailureEntry): Promise<void> {
  const record: CheckoutFailureRecord = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    stage: entry.stage,
    reason: entry.reason || null,
    detail: serializeDetail(entry.detail),
    transactionId: entry.transactionId || null,
    checkoutAttemptId: entry.checkoutAttemptId || null,
    email: entry.email || null,
    cartTotal: entry.cartTotal != null ? String(entry.cartTotal) : null,
    requestId: entry.requestId || null,
    userAgent: event?.node?.req?.headers?.['user-agent'] || null,
  };

  // Always visible in real-time logs, greppable by stage/transactionId.
  console.error('[Checkout Ledger]', JSON.stringify(record));

  const db = getCheckoutLogsDb(event);
  if (db) {
    try {
      await ensureLedgerSchema(db);
      await db
        .prepare(
          `INSERT INTO checkout_failures
             (id, at, stage, transaction_id, checkout_attempt_id, email, cart_total, reason, detail, request_id, user_agent)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(
          record.id,
          record.at,
          record.stage,
          record.transactionId,
          record.checkoutAttemptId,
          record.email,
          record.cartTotal,
          record.reason,
          record.detail,
          record.requestId,
          record.userAgent,
        )
        .run();
      return;
    } catch (error: any) {
      console.warn('[Checkout Ledger] D1 write failed, falling back to KV:', error?.message || error);
    }
  }

  try {
    await paymentSetItem(`${KV_KEY_PREFIX}${record.at}:${record.id}`, {...record, source: 'kv'}, {ttl: KV_TTL_SECONDS});
  } catch (error: any) {
    console.warn('[Checkout Ledger] KV fallback write failed (record only in live logs):', error?.message || error);
  }
}

export interface LedgerQuery {
  email?: string;
  stage?: string;
  since?: string; // ISO timestamp lower bound
  limit?: number;
}

/** Query the ledger for support triage: D1 rows + KV fallback records, merged newest-first. */
export async function queryCheckoutFailures(event: any, query: LedgerQuery): Promise<CheckoutFailureRecord[]> {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const results: CheckoutFailureRecord[] = [];

  const db = getCheckoutLogsDb(event);
  if (db) {
    try {
      await ensureLedgerSchema(db);
      const where: string[] = [];
      const binds: any[] = [];
      if (query.email) {
        binds.push(`%${query.email.toLowerCase()}%`);
        where.push(`LOWER(email) LIKE ?${binds.length}`);
      }
      if (query.stage) {
        binds.push(query.stage);
        where.push(`stage = ?${binds.length}`);
      }
      if (query.since) {
        binds.push(query.since);
        where.push(`at >= ?${binds.length}`);
      }
      const sql = `SELECT id, at, stage, transaction_id, checkout_attempt_id, email, cart_total, reason, detail, request_id, user_agent
                   FROM checkout_failures ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                   ORDER BY at DESC LIMIT ${limit}`;
      const res = await db
        .prepare(sql)
        .bind(...binds)
        .all();
      for (const row of res?.results || []) {
        results.push({
          id: row.id,
          at: row.at,
          stage: row.stage,
          transactionId: row.transaction_id,
          checkoutAttemptId: row.checkout_attempt_id,
          email: row.email,
          cartTotal: row.cart_total,
          reason: row.reason,
          detail: row.detail,
          requestId: row.request_id,
          userAgent: row.user_agent,
          source: 'd1',
        });
      }
    } catch (error: any) {
      console.warn('[Checkout Ledger] D1 query failed:', error?.message || error);
    }
  }

  // KV fallback records (dev, or failures logged before the D1 binding existed).
  try {
    const keys = await paymentGetKeys(KV_KEY_PREFIX);
    const records = await Promise.all(keys.map((k) => paymentGetItem<CheckoutFailureRecord>(k).catch(() => null)));
    for (const rec of records) {
      if (!rec) continue;
      if (query.email && !String(rec.email || '').toLowerCase().includes(query.email.toLowerCase())) continue;
      if (query.stage && rec.stage !== query.stage) continue;
      if (query.since && String(rec.at) < query.since) continue;
      results.push({...rec, source: 'kv'});
    }
  } catch (error: any) {
    console.warn('[Checkout Ledger] KV fallback query failed:', error?.message || error);
  }

  return results.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}
