// server/utils/calculatorStatsRollup.ts
//
// Pure aggregation for calculator stats — no storage, no request context, no side effects.
// Split out from server/api/admin/calculator-stats.get.ts so the counting logic can be exercised
// directly (the route itself is behind a WordPress admin session and cannot be called in dev).
//
// Everything here is counts keyed by string, which is what makes a day rollup mergeable: summing
// two days is summing their maps. That property is load-bearing — the read path merges sealed-day
// rollups with live days and must produce the same numbers either way.
import type {StatsSessionRecord} from './statsStorage';

/** Mergeable per-day aggregate. Persisted as `calc-stats:rollup:<YYYY-MM-DD>`. */
export interface StatsRollup {
  day: string;
  sessions: number;
  completed: number;
  browseMode: number;
  revealClicks: number;
  sizingGaps: number;
  /** Sessions keyed by the EXACT furthest step reached (1-6). Exact, so rollups stay mergeable. */
  stepCounts: Record<string, number>;
  referenceBrands: Record<string, {name: string; count: number}>;
  targetBrands: Record<string, {name: string; count: number}>;
  targetCategories: Record<string, number>;
  referenceCategories: Record<string, number>;
  sizeBuckets: Record<string, number>;
  sizeFields: Record<string, number>;
  revealByRegion: Record<string, number>;
  revealProducts: Record<string, number>;
  sizingGapBrands: Record<string, {name: string; count: number}>;
  countries: Record<string, number>;
  /** True when a fetch budget cut this day short — surfaced to the UI, never hidden. */
  truncated?: boolean;
}

export const STATS_STEP_LABELS: Record<number, string> = {
  1: '1 · Reference category',
  2: '2 · Reference brand',
  3: '3 · Size entered',
  4: '4 · Intent',
  5: '5 · Target brand',
  6: '6 · Recommendation shown',
};

export const statsEmptyRollup = (day: string): StatsRollup => ({
  day,
  sessions: 0,
  completed: 0,
  browseMode: 0,
  revealClicks: 0,
  sizingGaps: 0,
  stepCounts: {},
  referenceBrands: {},
  targetBrands: {},
  targetCategories: {},
  referenceCategories: {},
  sizeBuckets: {},
  sizeFields: {},
  revealByRegion: {},
  revealProducts: {},
  sizingGapBrands: {},
  countries: {},
});

const bumpCount = (bucket: Record<string, number>, key: string | null | undefined, by = 1) => {
  if (!key) return;
  bucket[key] = (bucket[key] || 0) + by;
};

const bumpNamed = (bucket: Record<string, {name: string; count: number}>, id: string | null | undefined, name: string | null | undefined, by = 1) => {
  if (!id) return;
  const entry = bucket[id] || {name: name || id, count: 0};
  entry.count += by;
  if (name) entry.name = name;
  bucket[id] = entry;
};

/** 10mm buckets ("250-259") — roughly one size step, fine enough to spot demand clusters. */
export const statsSizeBucketLabel = (mm: number): string => {
  const floor = Math.floor(mm / 10) * 10;
  return `${floor}-${floor + 9}`;
};

export const statsAddRecordToRollup = (rollup: StatsRollup, record: StatsSessionRecord): void => {
  rollup.sessions += 1;
  if (record.completed) rollup.completed += 1;
  if (record.browseMode) rollup.browseMode += 1;
  if (record.sizingGap) {
    rollup.sizingGaps += 1;
    bumpNamed(rollup.sizingGapBrands, record.targetBrandId, record.targetBrandName);
  }

  bumpCount(rollup.stepCounts, String(Math.min(6, Math.max(1, record.furthestStep || 1))));
  bumpNamed(rollup.referenceBrands, record.referenceBrandId, record.referenceBrandName);
  bumpNamed(rollup.targetBrands, record.targetBrandId, record.targetBrandName);
  bumpCount(rollup.targetCategories, record.targetCategory);
  bumpCount(rollup.referenceCategories, record.referenceCategory);
  bumpCount(rollup.sizeFields, record.sizeField);
  bumpCount(rollup.countries, record.country);
  if (typeof record.resolvedMm === 'number') bumpCount(rollup.sizeBuckets, statsSizeBucketLabel(record.resolvedMm));

  for (const click of record.revealClicks || []) {
    rollup.revealClicks += 1;
    bumpCount(rollup.revealByRegion, click.region);
    bumpCount(rollup.revealProducts, click.slug);
  }
};

/** Fold `source` into `target`. Used to combine sealed-day rollups with live days. */
export const statsMergeRollups = (target: StatsRollup, source: StatsRollup): void => {
  target.sessions += source.sessions || 0;
  target.completed += source.completed || 0;
  target.browseMode += source.browseMode || 0;
  target.revealClicks += source.revealClicks || 0;
  target.sizingGaps += source.sizingGaps || 0;

  for (const [key, value] of Object.entries(source.stepCounts || {})) bumpCount(target.stepCounts, key, value);
  for (const [key, value] of Object.entries(source.targetCategories || {})) bumpCount(target.targetCategories, key, value);
  for (const [key, value] of Object.entries(source.referenceCategories || {})) bumpCount(target.referenceCategories, key, value);
  for (const [key, value] of Object.entries(source.sizeBuckets || {})) bumpCount(target.sizeBuckets, key, value);
  for (const [key, value] of Object.entries(source.sizeFields || {})) bumpCount(target.sizeFields, key, value);
  for (const [key, value] of Object.entries(source.revealByRegion || {})) bumpCount(target.revealByRegion, key, value);
  for (const [key, value] of Object.entries(source.revealProducts || {})) bumpCount(target.revealProducts, key, value);
  for (const [key, value] of Object.entries(source.countries || {})) bumpCount(target.countries, key, value);
  for (const [id, entry] of Object.entries(source.referenceBrands || {})) bumpNamed(target.referenceBrands, id, entry?.name, entry?.count || 0);
  for (const [id, entry] of Object.entries(source.targetBrands || {})) bumpNamed(target.targetBrands, id, entry?.name, entry?.count || 0);
  for (const [id, entry] of Object.entries(source.sizingGapBrands || {})) bumpNamed(target.sizingGapBrands, id, entry?.name, entry?.count || 0);
};

/** Sessions that reached AT LEAST step N, derived from the exact-step counts. */
export const statsBuildFunnel = (rollup: StatsRollup): Array<{step: number; label: string; reached: number; share: number}> =>
  [1, 2, 3, 4, 5, 6].map((step) => {
    const reached = Object.entries(rollup.stepCounts).reduce((sum, [key, count]) => (Number(key) >= step ? sum + count : sum), 0);
    return {
      step,
      label: STATS_STEP_LABELS[step] || String(step),
      reached,
      share: rollup.sessions ? Math.round((reached / rollup.sessions) * 1000) / 10 : 0,
    };
  });

export const statsTopNamed = (bucket: Record<string, {name: string; count: number}>, limit = 10): Array<{id: string; name: string; count: number}> =>
  Object.entries(bucket)
    .map(([id, entry]) => ({id, name: entry.name, count: entry.count}))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

export const statsTopCounts = (bucket: Record<string, number>, limit = 10): Array<{key: string; count: number}> =>
  Object.entries(bucket)
    .map(([key, count]) => ({key, count}))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
