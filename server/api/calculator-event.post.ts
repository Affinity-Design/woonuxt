// server/api/calculator-event.post.ts
//
// Public ingest for size-calculator funnel telemetry. The client (composables/useCalculator.ts)
// posts a FULL session snapshot on each interaction burst, so this endpoint is a plain upsert:
// last write wins and a dropped intermediate beacon loses nothing as long as a later one lands.
//
// WHY SERVER-SIDE AT ALL
// ---------------------
// The calculator already pushes the same events to GA4 (dataLayer/gtag). GA4 is fine for trends but
// unusable for the question the shop actually asks ("which brand pairs are people sizing, and where
// do they drop out?") without dashboard work, and it is blocked for a large share of visitors. This
// store powers the my-account Admin → Calculator Stats tab and is read by
// server/api/admin/calculator-stats.get.ts.
//
// PRIVACY
// -------
// Sizing and brand choices only. No IP (only a salted hash for the rate-limit bucket), no email, no
// customer id, no user agent. Coarse country comes from Cloudflare's own header.
//
// ABUSE CONTROL (this endpoint is unauthenticated by necessity — guests use the calculator)
// ---------------------------------------------------------------------------------------
//   * request body capped, event name allow-listed, every string/number sanitised and clamped
//   * per-session write cap  — one session cannot grow unbounded
//   * per-IP daily event cap — session-id rotation cannot fan out into unbounded KV keys
// Anything rejected returns 202 anyway: telemetry must never surface an error to a shopper.
import {getHeader, getRequestIP, readBody, setHeader, setResponseStatus} from 'h3';
import type {StatsSessionRecord} from '../utils/statsStorage';

const ALLOWED_EVENTS = new Set([
  'calc_step_advance',
  'calc_reference_selected',
  'calc_browse_mode',
  'calc_target_selected',
  'calc_recommendation',
  'calc_price_reveal_click',
]);

/** `YYYYMMDD-<random>`; the day prefix keeps every write for one session on a single key. */
const SESSION_ID_PATTERN = /^(\d{8})-([a-z0-9]{8,32})$/;

/** Mirrors StorefrontChoice in composables/useStorefrontSelection.ts — which store a reveal opened. */
const STOREFRONT_CHOICES = ['canada', 'usa', 'international'];

const MAX_BODY_BYTES = 4000;
const MAX_WRITES_PER_SESSION = 40;
const MAX_EVENTS_PER_IP_PER_DAY = 400;
const MAX_REVEAL_CLICKS = 20;

/** Ids/labels come from our own data files; keep letters, digits and light punctuation. */
const cleanText = (value: unknown, maxLength = 64): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .trim()
    .slice(0, maxLength)
    .replace(/[^\w\s.\-+/&'()]/g, '');
  return cleaned || null;
};

const cleanNumber = (value: unknown, min: number, max: number): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.round(parsed * 10) / 10));
};

const cleanEnum = (value: unknown, allowed: string[]): string | null => {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.includes(text) ? text : null;
};

/** Non-reversible bucket id for the rate limiter. The IP itself is never persisted. */
const hashIp = async (ip: string): Promise<string> => {
  const salt = process.env.NUXT_STATS_IP_SALT || 'psp-calculator-stats';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store');
  // Beacons are fire-and-forget: always 202, never leak a reason a scraper could probe.
  setResponseStatus(event, 202);

  const contentLength = Number(getHeader(event, 'content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return {ok: false};

  const body = await readBody(event).catch(() => null);
  if (!body || typeof body !== 'object') return {ok: false};

  const eventName = typeof body.event === 'string' ? body.event.trim() : '';
  if (!ALLOWED_EVENTS.has(eventName)) return {ok: false};

  const sessionIdMatch = typeof body.sessionId === 'string' ? body.sessionId.trim().match(SESSION_ID_PATTERN) : null;
  if (!sessionIdMatch) return {ok: false};

  const sessionId = sessionIdMatch[0];
  const claimedDay = sessionIdMatch[1];

  // The day prefix is client-supplied, so it decides only WHICH key is written and must stay inside
  // a ±1 day window of server time (timezone slop). Anything else is bucketed to today.
  const today = statsUtcDay();
  const allowedDays = new Set([statsCompactDay(today), statsCompactDay(statsShiftDay(today, -1)), statsCompactDay(statsShiftDay(today, 1))]);
  const day = allowedDays.has(claimedDay) ? claimedDay : statsCompactDay(today);

  // --- per-IP daily budget -------------------------------------------------------------------
  const ip = getHeader(event, 'cf-connecting-ip') || getRequestIP(event, {xForwardedFor: true}) || 'unknown';
  const rateLimitKey = `${STATS_RATELIMIT_PREFIX}${today}:${await hashIp(ip)}`;
  const usedToday = (await statsGetItem<number>(rateLimitKey)) || 0;
  if (usedToday >= MAX_EVENTS_PER_IP_PER_DAY) return {ok: false};

  const sessionKey = `${STATS_SESSION_PREFIX}${day}:${sessionId}`;
  const existing = await statsGetItem<StatsSessionRecord>(sessionKey);
  if (existing && (existing.writes || 0) >= MAX_WRITES_PER_SESSION) return {ok: false};

  const nowIso = new Date().toISOString();
  const step = cleanNumber(body.step, 1, 6) || 1;
  const recommendedLabel = cleanText(body.recommendedLabel, 48);

  const revealClicks = Array.isArray(body.revealClicks)
    ? body.revealClicks
        .slice(0, MAX_REVEAL_CLICKS)
        .map((click: any) => ({slug: cleanText(click?.slug, 120), region: cleanEnum(click?.region, STOREFRONT_CHOICES)}))
        .filter((click: any): click is {slug: string; region: string} => !!click.slug && !!click.region)
    : [];

  const record: StatsSessionRecord = {
    sessionId,
    day,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    writes: (existing?.writes || 0) + 1,
    lastEvent: eventName,
    furthestStep: Math.max(existing?.furthestStep || 0, step),
    completed: existing?.completed || !!recommendedLabel,
    browseMode: !!body.browseMode || !!existing?.browseMode,
    referenceCategory: cleanText(body.referenceCategory, 32) || existing?.referenceCategory || null,
    referenceBrandId: cleanText(body.referenceBrandId, 64) || existing?.referenceBrandId || null,
    referenceBrandName: cleanText(body.referenceBrandName, 64) || existing?.referenceBrandName || null,
    sizeField: cleanEnum(body.sizeField, ['mm', 'eu', 'usmen', 'uswomen', 'usyouth', 'uk']) || existing?.sizeField || null,
    resolvedMm: cleanNumber(body.resolvedMm, 150, 400) ?? existing?.resolvedMm ?? null,
    targetCategory: cleanText(body.targetCategory, 32) || existing?.targetCategory || null,
    targetBrandId: cleanText(body.targetBrandId, 64) || existing?.targetBrandId || null,
    targetBrandName: cleanText(body.targetBrandName, 64) || existing?.targetBrandName || null,
    recommendedLabel: recommendedLabel || existing?.recommendedLabel || null,
    sizingGap: !!body.sizingGap || !!existing?.sizingGap,
    // Cumulative and client-authoritative: the snapshot always carries the whole list.
    revealClicks: revealClicks.length ? revealClicks : existing?.revealClicks || [],
    locale: cleanText(body.locale, 12) || existing?.locale || null,
    region: cleanEnum(body.region, STOREFRONT_CHOICES) || existing?.region || null,
    country: cleanText(getHeader(event, 'cf-ipcountry'), 4) || existing?.country || null,
  };

  try {
    await statsSetItem(sessionKey, record, {ttl: STATS_SESSION_TTL_SECONDS});
    await statsSetItem(rateLimitKey, usedToday + 1, {ttl: STATS_RATELIMIT_TTL_SECONDS});
  } catch (error: any) {
    // No store available (binding missing in dev, KV outage) — telemetry is never load-bearing.
    console.warn('[Calc Stats] ingest write failed:', error?.message || error);
    return {ok: false};
  }

  return {ok: true};
});
