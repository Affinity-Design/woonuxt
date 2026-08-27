<script setup lang="ts">
// Admin-only my-account tab: size-calculator funnel stats. Thin UI over
// /api/admin/calculator-stats, which authorizes via the WP role check (server/utils/adminAuth.ts).
// Data is collected by /api/calculator-event (see composables/useCalculator.ts) — brand and sizing
// choices only, no PII, so nothing here identifies a shopper.
interface NamedCount {
  id: string;
  name: string;
  count: number;
}

interface KeyCount {
  key: string;
  count: number;
}

interface StatsResponse {
  generatedAt: string;
  timezone: string;
  range: {days: number; from: string; to: string};
  totals: {sessions: number; completed: number; completionRate: number; browseMode: number; revealClicks: number; sizingGaps: number};
  funnel: Array<{step: number; label: string; reached: number; share: number}>;
  daily: Array<{day: string; sessions: number; completed: number}>;
  referenceBrands: NamedCount[];
  targetBrands: NamedCount[];
  targetCategories: KeyCount[];
  referenceCategories: KeyCount[];
  sizeBuckets: KeyCount[];
  sizeFields: KeyCount[];
  revealByRegion: KeyCount[];
  revealProducts: KeyCount[];
  sizingGapBrands: NamedCount[];
  countries: KeyCount[];
  recent: Array<{
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
  }>;
  coverage: {partial: boolean; missingDays: string[]; daysFromRollup: number; daysScannedRaw: number; recordsFetched: number; recentWindowHours: number};
}

const RANGE_OPTIONS = [7, 30, 90] as const;

const stats = ref<StatsResponse | null>(null);
const rangeDays = ref<number>(30);
const isLoading = ref(false);
const loadError = ref<string | null>(null);

const load = async (): Promise<void> => {
  isLoading.value = true;
  loadError.value = null;
  try {
    stats.value = await $fetch<StatsResponse>('/api/admin/calculator-stats', {query: {days: rangeDays.value}});
  } catch (error: any) {
    const statusCode = error?.status || error?.statusCode;
    loadError.value =
      statusCode === 401
        ? 'The server did not recognize your login as an admin, so it refused the stats.'
        : 'We could not load calculator statistics. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const setRange = (days: number): void => {
  if (rangeDays.value === days) return;
  rangeDays.value = days;
  load();
};

const num = (value: number | null | undefined): string => (typeof value === 'number' ? value.toLocaleString('en-CA') : '—');

const formatDay = (day: string): string => new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-CA', {month: 'short', day: 'numeric', timeZone: 'UTC'});

const formatWhen = (iso: string): string => new Date(iso).toLocaleString('en-CA', {dateStyle: 'medium', timeStyle: 'short'});

const SIZE_FIELD_LABELS: Record<string, string> = {mm: 'Millimeters', eu: 'EU', usmen: 'US Men', uswomen: 'US Women', usyouth: 'US Youth', uk: 'UK'};

const STOREFRONT_LABELS: Record<string, string> = {canada: 'proskatersplace.ca', usa: 'proskatersplace.com', international: 'International (.com)'};

const CATEGORY_LABELS: Record<string, string> = {
  inline_skates: 'Inline skates',
  roller_skates: 'Roller skates',
  ice_skates: 'Ice skates',
  ski_boots: 'Ski boots',
  sports_shoes: 'Sports shoes',
};

const prettyKey = (key: string): string => CATEGORY_LABELS[key] || SIZE_FIELD_LABELS[key] || STOREFRONT_LABELS[key] || key;

/** Bar width as a % of the largest value in a list, floored so a 1-count row stays visible. */
const barWidth = (value: number, max: number): string => (max > 0 ? `${Math.max(2, Math.round((value / max) * 100))}%` : '0%');

const maxOf = (rows: Array<{count: number}>): number => rows.reduce((max, row) => Math.max(max, row.count), 0);

const maxDailySessions = computed(() => (stats.value?.daily || []).reduce((max, day) => Math.max(max, day.sessions), 0));

const hasData = computed(() => (stats.value?.totals.sessions || 0) > 0);

onMounted(load);
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 md:p-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 class="text-xl font-semibold">Calculator Stats</h3>
        <p class="text-sm text-gray-500 mt-1 max-w-xl">
          Size-calculator funnel for
          <NuxtLink to="/roller-skates-size-calculator" class="text-primary underline">/roller-skates-size-calculator</NuxtLink>. Brand and sizing
          choices only — no personal data is stored. Days are <strong>UTC</strong>.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex rounded-lg bg-gray-100 p-1">
          <button
            v-for="option in RANGE_OPTIONS"
            :key="option"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
            :class="rangeDays === option ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'"
            :disabled="isLoading"
            @click="setRange(option)">
            {{ option }}d
          </button>
        </div>
        <button
          type="button"
          class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-60"
          :disabled="isLoading"
          @click="load">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex items-center gap-3 py-12 justify-center text-gray-500">
      <LoadingIcon size="20" />
      <span>Loading calculator stats…</span>
    </div>

    <div v-else-if="loadError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {{ loadError }}
    </div>

    <template v-else-if="stats">
      <!-- Coverage is stated, never silently swallowed: a truncated scan must not read as a low number. -->
      <div v-if="stats.coverage.partial" class="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        Partial range — {{ stats.coverage.missingDays.length }} day(s) were not fully counted because this request hit its read budget
        ({{ stats.coverage.missingDays.slice(0, 5).join(', ') }}{{ stats.coverage.missingDays.length > 5 ? '…' : '' }}). Hit
        <strong>Refresh</strong> to finish building the day rollups — each day is only ever scanned once.
      </div>

      <div v-if="!hasData" class="py-12 text-center text-gray-500">
        <Icon name="ion:bar-chart-outline" size="32" class="text-gray-300 mb-2" />
        <p class="font-medium text-gray-600">No calculator sessions in the last {{ stats.range.days }} days.</p>
        <p class="text-sm mt-1 max-w-md mx-auto">
          Collection starts when a visitor interacts with the calculator after this feature is deployed — it cannot backfill history from GA4.
        </p>
      </div>

      <template v-else>
        <!-- KPIs -->
        <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Sessions</div>
            <div class="mt-1 text-2xl font-bold text-gray-900">{{ num(stats.totals.sessions) }}</div>
            <div class="text-xs text-gray-500 mt-0.5">Visitors who started sizing</div>
          </div>
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Recommendations</div>
            <div class="mt-1 text-2xl font-bold text-gray-900">{{ num(stats.totals.completed) }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ stats.totals.completionRate }}% of sessions finished</div>
          </div>
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Price reveals</div>
            <div class="mt-1 text-2xl font-bold text-gray-900">{{ num(stats.totals.revealClicks) }}</div>
            <div class="text-xs text-gray-500 mt-0.5">Clicks through to a product</div>
          </div>
          <div class="rounded-lg border p-4" :class="stats.totals.sizingGaps ? 'border-yellow-200 bg-yellow-50' : 'border-gray-100 bg-gray-50'">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Sizing gaps</div>
            <div class="mt-1 text-2xl font-bold" :class="stats.totals.sizingGaps ? 'text-yellow-800' : 'text-gray-900'">
              {{ num(stats.totals.sizingGaps) }}
            </div>
            <div class="text-xs text-gray-500 mt-0.5">Snapped — no charted range matched</div>
          </div>
        </div>

        <!-- Funnel -->
        <section class="mt-8">
          <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Funnel — furthest step reached</h4>
          <div class="mt-3 space-y-2">
            <div v-for="stage in stats.funnel" :key="stage.step" class="flex items-center gap-3">
              <div class="w-44 shrink-0 truncate text-sm text-gray-600" :title="stage.label">{{ stage.label }}</div>
              <div class="h-6 flex-1 rounded bg-gray-100">
                <div class="h-6 rounded bg-primary/80" :style="{width: barWidth(stage.reached, stats.totals.sessions)}"></div>
              </div>
              <div class="w-28 shrink-0 text-right text-sm tabular-nums text-gray-700">{{ num(stage.reached) }} · {{ stage.share }}%</div>
            </div>
          </div>
        </section>

        <!-- Daily volume -->
        <section class="mt-8">
          <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Sessions per day</h4>
          <div class="mt-3 flex h-28 items-end gap-0.5 overflow-x-auto">
            <div
              v-for="day in stats.daily"
              :key="day.day"
              class="flex min-w-[6px] flex-1 flex-col justify-end"
              :title="`${day.day} — ${day.sessions} session(s), ${day.completed} recommendation(s)`">
              <!-- Outer bar = sessions; the shaded portion at its base = sessions that finished. -->
              <div
                class="flex w-full flex-col justify-end rounded-t bg-gray-200"
                :style="{height: maxDailySessions ? `${Math.round((day.sessions / maxDailySessions) * 100)}%` : '0%'}">
                <div class="w-full bg-primary/80" :style="{height: day.sessions ? `${Math.round((day.completed / day.sessions) * 100)}%` : '0%'}"></div>
              </div>
            </div>
          </div>
          <div class="mt-1 flex justify-between text-xs text-gray-400">
            <span>{{ stats.daily.length ? formatDay(stats.daily[0].day) : '' }}</span>
            <span>Bars: sessions · shaded: reached a recommendation</span>
            <span>{{ stats.daily.length ? formatDay(stats.daily[stats.daily.length - 1].day) : '' }}</span>
          </div>
        </section>

        <!-- Brand demand -->
        <div class="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Sizing from (reference brand)</h4>
            <p class="text-xs text-gray-400 mt-1">What visitors already own — useful for comparison content.</p>
            <div class="mt-3 space-y-1.5">
              <div v-for="brand in stats.referenceBrands" :key="brand.id" class="flex items-center gap-3">
                <div class="w-40 shrink-0 truncate text-sm text-gray-600" :title="brand.name">{{ brand.name }}</div>
                <div class="h-4 flex-1 rounded bg-gray-100">
                  <div class="h-4 rounded bg-gray-400" :style="{width: barWidth(brand.count, maxOf(stats.referenceBrands))}"></div>
                </div>
                <div class="w-10 shrink-0 text-right text-sm tabular-nums text-gray-700">{{ num(brand.count) }}</div>
              </div>
              <p v-if="!stats.referenceBrands.length" class="text-sm text-gray-400">No brand selected yet.</p>
            </div>
          </section>

          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Shopping for (target brand)</h4>
            <p class="text-xs text-gray-400 mt-1">Demand signal — what they want to buy next.</p>
            <div class="mt-3 space-y-1.5">
              <div v-for="brand in stats.targetBrands" :key="brand.id" class="flex items-center gap-3">
                <div class="w-40 shrink-0 truncate text-sm text-gray-600" :title="brand.name">{{ brand.name }}</div>
                <div class="h-4 flex-1 rounded bg-gray-100">
                  <div class="h-4 rounded bg-primary/70" :style="{width: barWidth(brand.count, maxOf(stats.targetBrands))}"></div>
                </div>
                <div class="w-10 shrink-0 text-right text-sm tabular-nums text-gray-700">{{ num(brand.count) }}</div>
              </div>
              <p v-if="!stats.targetBrands.length" class="text-sm text-gray-400">No target brand selected yet — check the step-5 drop-off.</p>
            </div>
          </section>
        </div>

        <!-- Size demand + gaps -->
        <div class="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Foot length requested (mm)</h4>
            <p class="text-xs text-gray-400 mt-1">Where demand clusters — compare against what you stock.</p>
            <div class="mt-3 space-y-1.5">
              <div v-for="bucket in stats.sizeBuckets" :key="bucket.key" class="flex items-center gap-3">
                <div class="w-20 shrink-0 text-sm tabular-nums text-gray-600">{{ bucket.key }}</div>
                <div class="h-4 flex-1 rounded bg-gray-100">
                  <div class="h-4 rounded bg-gray-400" :style="{width: barWidth(bucket.count, maxOf(stats.sizeBuckets))}"></div>
                </div>
                <div class="w-10 shrink-0 text-right text-sm tabular-nums text-gray-700">{{ num(bucket.count) }}</div>
              </div>
              <p v-if="!stats.sizeBuckets.length" class="text-sm text-gray-400">No sizes resolved yet.</p>
            </div>
          </section>

          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Sizing gaps by target brand</h4>
            <p class="text-xs text-gray-400 mt-1">The measurement fell outside every charted range — these size charts need filling in.</p>
            <div class="mt-3 space-y-1.5">
              <div v-for="brand in stats.sizingGapBrands" :key="brand.id" class="flex items-center gap-3">
                <div class="w-40 shrink-0 truncate text-sm text-gray-600" :title="brand.name">{{ brand.name }}</div>
                <div class="h-4 flex-1 rounded bg-gray-100">
                  <div class="h-4 rounded bg-yellow-400" :style="{width: barWidth(brand.count, maxOf(stats.sizingGapBrands))}"></div>
                </div>
                <div class="w-10 shrink-0 text-right text-sm tabular-nums text-gray-700">{{ num(brand.count) }}</div>
              </div>
              <p v-if="!stats.sizingGapBrands.length" class="text-sm text-gray-400">
                <Icon name="ion:checkmark-circle-outline" size="16" class="text-green-500" />
                Every recommendation matched a charted range.
              </p>
            </div>
          </section>
        </div>

        <!-- Reveals + input mix -->
        <div class="mt-8 grid gap-8 lg:grid-cols-3">
          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Reveals by storefront</h4>
            <ul class="mt-3 space-y-1.5 text-sm">
              <li v-for="row in stats.revealByRegion" :key="row.key" class="flex items-center justify-between gap-3">
                <span class="truncate text-gray-600">{{ prettyKey(row.key) }}</span>
                <span class="tabular-nums font-medium text-gray-800">{{ num(row.count) }}</span>
              </li>
              <li v-if="!stats.revealByRegion.length" class="text-gray-400">No price reveals yet.</li>
            </ul>
          </section>

          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Most revealed products</h4>
            <ul class="mt-3 space-y-1.5 text-sm">
              <li v-for="row in stats.revealProducts" :key="row.key" class="flex items-center justify-between gap-3">
                <NuxtLink :to="`/product/${row.key}`" class="truncate text-primary underline" :title="row.key">{{ row.key }}</NuxtLink>
                <span class="tabular-nums font-medium text-gray-800">{{ num(row.count) }}</span>
              </li>
              <li v-if="!stats.revealProducts.length" class="text-gray-400">No price reveals yet.</li>
            </ul>
          </section>

          <section>
            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Size scale used</h4>
            <ul class="mt-3 space-y-1.5 text-sm">
              <li v-for="row in stats.sizeFields" :key="row.key" class="flex items-center justify-between gap-3">
                <span class="truncate text-gray-600">{{ prettyKey(row.key) }}</span>
                <span class="tabular-nums font-medium text-gray-800">{{ num(row.count) }}</span>
              </li>
              <li v-if="!stats.sizeFields.length" class="text-gray-400">No sizes entered yet.</li>
            </ul>
          </section>
        </div>

        <!-- Recent -->
        <section class="mt-8">
          <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
            Recent sessions <span class="normal-case font-normal text-gray-400">(last {{ stats.coverage.recentWindowHours }}h)</span>
          </h4>
          <div v-if="stats.recent.length" class="mt-3 overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead>
                <tr class="border-b text-xs uppercase tracking-wide text-gray-400">
                  <th class="py-2 pr-4">When</th>
                  <th class="py-2 pr-4">Sized from</th>
                  <th class="py-2 pr-4">Foot</th>
                  <th class="py-2 pr-4">Shopping for</th>
                  <th class="py-2 pr-4">Result</th>
                  <th class="py-2 pr-4">Step</th>
                  <th class="py-2">Reveals</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="session in stats.recent" :key="session.updatedAt + (session.targetBrandName || '')" class="border-b last:border-0">
                  <td class="py-2.5 pr-4 whitespace-nowrap text-gray-600">{{ formatWhen(session.updatedAt) }}</td>
                  <td class="py-2.5 pr-4">
                    <div class="text-gray-800">{{ session.referenceBrandName || '—' }}</div>
                    <div v-if="session.country" class="text-xs text-gray-400">{{ session.country }}</div>
                  </td>
                  <td class="py-2.5 pr-4 whitespace-nowrap tabular-nums text-gray-700">
                    {{ session.resolvedMm ? `${session.resolvedMm} mm` : '—' }}
                    <span v-if="session.sizeField" class="text-xs text-gray-400">({{ prettyKey(session.sizeField) }})</span>
                  </td>
                  <td class="py-2.5 pr-4 text-gray-800">{{ session.targetBrandName || '—' }}</td>
                  <td class="py-2.5 pr-4">
                    <span v-if="session.recommendedLabel" class="font-medium text-gray-900">{{ session.recommendedLabel }}</span>
                    <span v-else class="text-gray-400">abandoned</span>
                    <span
                      v-if="session.sizingGap"
                      class="ml-1.5 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800"
                      title="No charted range covered this measurement">
                      gap
                    </span>
                  </td>
                  <td class="py-2.5 pr-4 tabular-nums text-gray-600">{{ session.furthestStep }}/6</td>
                  <td class="py-2.5 tabular-nums text-gray-700">{{ session.revealClicks || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="mt-3 text-sm text-gray-400">No sessions in the last {{ stats.coverage.recentWindowHours }} hours.</p>
        </section>

        <p class="mt-8 text-xs text-gray-400">
          Generated {{ formatWhen(stats.generatedAt) }} · {{ stats.range.from }} → {{ stats.range.to }} (UTC) ·
          {{ stats.coverage.daysFromRollup }} day(s) from rollups, {{ stats.coverage.daysScannedRaw }} scanned live
        </p>
      </template>
    </template>
  </div>
</template>
