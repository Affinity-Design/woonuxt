// server/api/admin/calculator-stats.get.ts
//
// Admin-only aggregate for the size-calculator funnel (my-account → Admin → Calculator Stats).
// Authorization is the WP role check in server/utils/adminAuth.ts — the same enforcement point the
// Recoverable Orders endpoint uses. Hiding the tab is cosmetic; THIS is the gate.
//
// This file is I/O only: which days to read, from where, and within what budget. The counting lives
// in server/utils/calculatorStatsRollup.ts so it can be tested without an admin session.
//
// HOW IT STAYS CHEAP ON WORKERS
// -----------------------------
// A Worker request has a hard subrequest budget, so "read every session record for 90 days" is not
// an option. Instead the read path is incremental:
//
//   * today + yesterday  → always aggregated from raw session records (so the dashboard is live,
//                          and "Recent sessions" has something to show)
//   * older, sealed days → read from a per-day rollup (calc-stats:rollup:<day>); when a day has no
//                          rollup yet it is aggregated once from raw records and then written, so
//                          the cost is paid exactly once per day, ever
//
// A per-request fetch budget caps the work. If the budget runs out before every day is rolled up,
// the response reports `coverage.partial` with the days still missing rather than quietly showing a
// low number — one more Refresh finishes the job.
import {createError, getQuery, setHeader} from 'h3';
import type {StatsSessionRecord} from '../../utils/statsStorage';
import {
  statsAddRecordToRollup,
  statsBuildFunnel,
  statsEmptyRollup,
  statsMergeRollups,
  statsTopCounts,
  statsTopNamed,
  type StatsRollup,
} from '../../utils/calculatorStatsRollup';

interface RecentSession {
  updatedAt: string;
  furthestStep: number;
  completed: boolean;
  referenceBrandName: string | null;
  sizeField: string | null;
  resolvedMm: number | null;
  targetBrandName: string | null;
  recommendedLabel: string | null;
  sizingGap: boolean;
  revealClicks: number;
  country: string | null;
}

const MAX_RANGE_DAYS = 365;
/** Raw session records fetched per request across all days. Bounds Worker subrequests. */
const MAX_RECORD_FETCHES = 600;
const MAX_RECENT = 25;

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');

  const verification = await verifyAdminSession(event);
  if (!verification.isAdmin) {
    throw createError({statusCode: 401, statusMessage: 'Admin role required to read calculator stats.'});
  }

  const query = getQuery(event);
  const days = Math.min(MAX_RANGE_DAYS, Math.max(1, Number(query.days) || 30));

  const today = statsUtcDay();
  const rangeDays: string[] = [];
  for (let offset = 0; offset < days; offset += 1) rangeDays.push(statsShiftDay(today, -offset));
  const rangeSet = new Set(rangeDays);
  const from = rangeDays[rangeDays.length - 1] || today;

  // Days that are still moving (or too fresh to seal) are always recomputed from raw records.
  const liveDays = new Set([today, statsShiftDay(today, -1)]);

  // One list call, then group the session keys we care about by day.
  const sessionKeys = await statsGetKeys(STATS_SESSION_PREFIX);
  const keysByDay = new Map<string, string[]>();
  for (const key of sessionKeys) {
    const compactDay = key.split(':')[2];
    if (!compactDay || compactDay.length !== 8) continue;
    const day = `${compactDay.slice(0, 4)}-${compactDay.slice(4, 6)}-${compactDay.slice(6, 8)}`;
    if (!rangeSet.has(day)) continue;
    const bucket = keysByDay.get(day) || [];
    bucket.push(key);
    keysByDay.set(day, bucket);
  }

  let fetchBudget = MAX_RECORD_FETCHES;
  const recent: RecentSession[] = [];
  const missingDays: string[] = [];
  let rollupDayCount = 0;
  let rawDayCount = 0;

  /** Aggregate one day straight from its raw session records, respecting the fetch budget. */
  const buildRollupFromRaw = async (day: string, collectRecent: boolean): Promise<StatsRollup> => {
    const rollup = statsEmptyRollup(day);

    for (const key of keysByDay.get(day) || []) {
      if (fetchBudget <= 0) {
        rollup.truncated = true;
        break;
      }
      fetchBudget -= 1;

      const record = await statsGetItem<StatsSessionRecord>(key);
      if (!record) continue;
      statsAddRecordToRollup(rollup, record);

      if (collectRecent) {
        recent.push({
          updatedAt: record.updatedAt,
          furthestStep: record.furthestStep,
          completed: record.completed,
          referenceBrandName: record.referenceBrandName,
          sizeField: record.sizeField,
          resolvedMm: record.resolvedMm,
          targetBrandName: record.targetBrandName,
          recommendedLabel: record.recommendedLabel,
          sizingGap: record.sizingGap,
          revealClicks: (record.revealClicks || []).length,
          country: record.country,
        });
      }
    }

    return rollup;
  };

  const totals = statsEmptyRollup('range');
  const daily: Array<{day: string; sessions: number; completed: number}> = [];

  for (const day of rangeDays) {
    let rollup: StatsRollup | null = null;

    if (liveDays.has(day)) {
      rollup = await buildRollupFromRaw(day, true);
      rawDayCount += 1;
    } else {
      rollup = await statsGetItem<StatsRollup>(`${STATS_ROLLUP_PREFIX}${day}`);
      if (rollup) {
        rollupDayCount += 1;
      } else if (fetchBudget > 0) {
        // First time this sealed day is read: aggregate once, then persist so it is never rescanned.
        rollup = await buildRollupFromRaw(day, false);
        if (!rollup.truncated) {
          await statsSetItem(`${STATS_ROLLUP_PREFIX}${day}`, rollup, {ttl: STATS_ROLLUP_TTL_SECONDS}).catch(() => {});
        }
        rawDayCount += 1;
      } else {
        missingDays.push(day);
        continue;
      }
    }

    if (rollup.truncated) missingDays.push(day);
    statsMergeRollups(totals, rollup);
    daily.push({day, sessions: rollup.sessions, completed: rollup.completed});
  }

  daily.reverse(); // oldest → newest for charting
  recent.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return {
    generatedAt: new Date().toISOString(),
    timezone: 'UTC',
    range: {days, from, to: today},
    totals: {
      sessions: totals.sessions,
      completed: totals.completed,
      completionRate: totals.sessions ? Math.round((totals.completed / totals.sessions) * 1000) / 10 : 0,
      browseMode: totals.browseMode,
      revealClicks: totals.revealClicks,
      sizingGaps: totals.sizingGaps,
    },
    funnel: statsBuildFunnel(totals),
    daily,
    referenceBrands: statsTopNamed(totals.referenceBrands),
    targetBrands: statsTopNamed(totals.targetBrands),
    targetCategories: statsTopCounts(totals.targetCategories),
    referenceCategories: statsTopCounts(totals.referenceCategories),
    // Ascending by size, not by count — this list is read as a distribution.
    sizeBuckets: Object.entries(totals.sizeBuckets)
      .map(([key, count]) => ({key, count}))
      .sort((a, b) => (a.key < b.key ? -1 : 1)),
    sizeFields: statsTopCounts(totals.sizeFields),
    revealByRegion: statsTopCounts(totals.revealByRegion),
    revealProducts: statsTopCounts(totals.revealProducts),
    sizingGapBrands: statsTopNamed(totals.sizingGapBrands),
    countries: statsTopCounts(totals.countries, 8),
    recent: recent.slice(0, MAX_RECENT),
    coverage: {
      // Everything the numbers do NOT include is stated here rather than silently dropped.
      partial: missingDays.length > 0,
      missingDays,
      daysFromRollup: rollupDayCount,
      daysScannedRaw: rawDayCount,
      recordsFetched: MAX_RECORD_FETCHES - fetchBudget,
      recentWindowHours: 48,
    },
  };
});
