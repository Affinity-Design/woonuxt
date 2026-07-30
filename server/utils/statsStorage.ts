// server/utils/statsStorage.ts
//
// Durable storage for size-calculator funnel telemetry (the Admin → Calculator Stats tab).
//
// KEYS
// ----
//   calc-stats:session:<YYYYMMDD>:<sessionId>   one record per calculator session (90d TTL)
//   calc-stats:rollup:<YYYY-MM-DD>              per-day aggregate, written once the day is sealed
//   calc-stats:rl:<YYYY-MM-DD>:<ipHash>         per-IP write budget for the public ingest endpoint
//
// WHY A SEPARATE MOUNT
// --------------------
// Analytics must survive routine cache rebuilds. `npm run clear-cache-all` deletes EVERY key in
// both NUXT_CACHE and NUXT_SCRIPT_DATA, so storing stats in either namespace unprotected means a
// cache reset silently erases the history. Two defences, same shape as server/utils/paymentStorage.ts:
//
//   1. Writes prefer the `stats` mount (NUXT_STATS_DATA KV binding). Bind that namespace on the
//      Pages project and calculator stats live in a namespace no cache tooling touches.
//   2. Until the binding exists, reads/writes fall back to `script_data` so the feature works today
//      with zero infra changes — and scripts/clear-kv-cache-safe.js refuses to delete keys under
//      the `calc-stats:` prefix, so the fallback is not a data-loss trap.
//
// Rollups are what make the history permanent: raw session records expire after 90 days, but the
// per-day rollup a read pass writes has a ~2 year TTL, so the dashboard keeps long-range trends
// without keeping (or ever needing) per-visitor rows.
//
// All helpers are best-effort: they never throw unless BOTH stores are unavailable.

/** Every key this feature owns starts with this. Mirrored in scripts/clear-kv-cache-safe.js. */
export const STATS_KEY_PREFIX = 'calc-stats:';

export const STATS_SESSION_PREFIX = `${STATS_KEY_PREFIX}session:`;
export const STATS_ROLLUP_PREFIX = `${STATS_KEY_PREFIX}rollup:`;
export const STATS_RATELIMIT_PREFIX = `${STATS_KEY_PREFIX}rl:`;

/** Raw per-session records: long enough to spot seasonal patterns, short enough to stay small. */
export const STATS_SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;
/** Sealed day rollups: the permanent history the dashboard reads for anything older than 48h. */
export const STATS_ROLLUP_TTL_SECONDS = 60 * 60 * 24 * 730;
/** Per-IP ingest budget window. */
export const STATS_RATELIMIT_TTL_SECONDS = 60 * 60 * 48;

function statsStore() {
  return useStorage('stats');
}

function fallbackStore() {
  return useStorage('script_data');
}

/** Read a record: dedicated stats store first, script_data fallback second. */
export async function statsGetItem<T>(key: string): Promise<T | null> {
  try {
    const hit = await statsStore().getItem<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch (error: any) {
    console.warn('[Calc Stats] stats store read failed, trying fallback:', error?.message || error);
  }

  try {
    return (await fallbackStore().getItem<T>(key)) ?? null;
  } catch {
    return null;
  }
}

/** Write to the stats store; fall back to script_data when the binding is missing. */
export async function statsSetItem(key: string, value: any, opts?: any): Promise<void> {
  try {
    await statsStore().setItem(key, value, opts);
    return;
  } catch (error: any) {
    console.warn('[Calc Stats] stats store write failed, falling back to script_data:', error?.message || error);
  }

  await fallbackStore().setItem(key, value, opts);
}

/** List keys under a prefix across BOTH stores (deduped), so pre-binding records stay visible. */
export async function statsGetKeys(prefix: string): Promise<string[]> {
  const keys = new Set<string>();

  try {
    for (const key of (await statsStore().getKeys(prefix)) || []) keys.add(key);
  } catch (error: any) {
    console.warn('[Calc Stats] stats store getKeys failed:', error?.message || error);
  }

  try {
    for (const key of (await fallbackStore().getKeys(prefix)) || []) keys.add(key);
  } catch {
    // fallback unavailable — dedicated-store keys (if any) still returned
  }

  return [...keys];
}

/** UTC day, `YYYY-MM-DD`. Every bucket boundary in this feature is UTC — the UI says so. */
export function statsUtcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Compact UTC day, `YYYYMMDD`, as used inside session ids and session keys. */
export function statsCompactDay(day: string): string {
  return day.replace(/-/g, '');
}

/** `YYYY-MM-DD` for `offset` days before `from` (negative offset = earlier). */
export function statsShiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return statsUtcDay(date);
}

/** One record per calculator session. The client re-sends a full snapshot, so last write wins. */
export interface StatsSessionRecord {
  sessionId: string;
  /** Compact UTC day (`YYYYMMDD`) the session started, taken from the session id. */
  day: string;
  createdAt: string;
  updatedAt: string;
  /** Accepted writes for this session — the per-session abuse cap. */
  writes: number;
  lastEvent: string;
  /** Highest step (1-6) the visitor reached. This is the funnel. */
  furthestStep: number;
  /** True once a size recommendation was rendered — the "submission" that matters. */
  completed: boolean;
  browseMode: boolean;
  referenceCategory: string | null;
  referenceBrandId: string | null;
  referenceBrandName: string | null;
  sizeField: string | null;
  resolvedMm: number | null;
  targetCategory: string | null;
  targetBrandId: string | null;
  targetBrandName: string | null;
  recommendedLabel: string | null;
  /** The recommendation fell outside every charted range — a sizing-data gap worth fixing. */
  sizingGap: boolean;
  revealClicks: Array<{slug: string; region: string}>;
  locale: string | null;
  region: string | null;
  /** Coarse geo from Cloudflare. No IP is ever stored. */
  country: string | null;
}
