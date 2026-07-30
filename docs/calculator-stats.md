# Calculator Stats (Admin)

Funnel analytics for the size calculator at `/roller-skates-size-calculator`, visible to WordPress
admins at **`/my-account?tab=calculator-stats`**.

## Why this exists

The calculator already pushed its events to GA4 (`calc_step_advance`, `calc_recommendation`,
`calc_price_reveal_click`, …), but GA4 cannot answer the questions the shop actually asks without
dashboard work, and ad-blockers drop `gtag` for a large share of visitors:

- Which **reference → target brand** pairs are people sizing? (demand + comparison-content signal)
- Which **step loses them**?
- Which **foot lengths** are being requested? (stock signal)
- Which target brands produce a **sizing gap** — a measurement no charted range covers? (data-quality
  signal: those size charts need filling in)

GA4 still receives every event unchanged. This is an additional first-party store.

## Pieces

| File | Role |
| --- | --- |
| [`composables/useCalculator.ts`](../composables/useCalculator.ts) | Fires GA4 events **and** posts a session snapshot beacon |
| [`server/api/calculator-event.post.ts`](../server/api/calculator-event.post.ts) | Public ingest — validates, rate-limits, upserts |
| [`server/utils/statsStorage.ts`](../server/utils/statsStorage.ts) | KV mount + fallback, key layout, TTLs, record type |
| [`server/api/admin/calculator-stats.get.ts`](../server/api/admin/calculator-stats.get.ts) | Admin-gated aggregate (rollup-backed) |
| [`components/adminElements/CalculatorStats.vue`](../components/adminElements/CalculatorStats.vue) | The dashboard |
| [`pages/my-account/index.vue`](../pages/my-account/index.vue) | Admin tab wiring |

## Storage

Keys live under the `calc-stats:` prefix:

```
calc-stats:session:<YYYYMMDD>:<sessionId>   one record per session      TTL 90d
calc-stats:rollup:<YYYY-MM-DD>              per-day aggregate           TTL ~2y
calc-stats:rl:<YYYY-MM-DD>:<ipHash>         per-IP ingest budget        TTL 48h
```

Writes prefer the **`stats` mount → `NUXT_STATS_DATA`** KV binding. That binding does not exist yet,
so `statsStorage.ts` currently falls back to the **`script_data`** store — the feature works today
with no infra change. Two scripts were taught to protect the prefix so the fallback is not a
data-loss trap:

- `scripts/clear-kv-cache-safe.js` (`npm run clear-cache-all` / `clear-data-cache` / `reset-cache`)
- `scripts/prebuild-cache-purge.js` (runs at build time when `PURGE_SCRIPT_DATA=true`)

**To move stats into their own namespace** (recommended, same reasoning as `NUXT_PAYMENT_DATA`):
create a KV namespace, bind it to the Pages project as `NUXT_STATS_DATA`, and redeploy. No code
change and no migration step — reads check the dedicated store first and fall back, so existing
records stay visible until their TTL expires.

## Privacy

Sizing and brand choices only. **No IP** (the rate-limit bucket is a salted SHA-256 truncated to
8 bytes — set `NUXT_STATS_IP_SALT` to rotate it), no email, no customer id, no user agent, no
session cookie. Coarse country comes from Cloudflare's own `cf-ipcountry` header. Nothing stored
identifies a shopper, and raw per-session rows expire after 90 days while the day rollups that
power long-range trends keep no per-visitor data at all.

## Ingest contract

The client posts a **full session snapshot** on each interaction burst (debounced 1.2s; the
recommendation and price-reveal events flush immediately). The server upsert is last-write-wins, so
a dropped, throttled, or out-of-order beacon costs nothing as long as a later one lands.

Session id is `YYYYMMDD-<16 hex>`, minted **client-side on first interaction** — never in
`defaultState()`, because the calculator page is prerendered and an id baked into the HTML would be
shared by every visitor. The day prefix keeps all writes for one session on a single key and is
clamped server-side to ±1 day of server time.

Abuse controls (the endpoint must be unauthenticated — guests use the calculator):

| Control | Limit |
| --- | --- |
| Request body | 4 KB |
| Event names | allow-list of 6 |
| Writes per session | 40 |
| Events per IP per day | 400 |
| Reveal clicks per session | 20 |

Every string is length-capped and character-filtered; every number is clamped. Rejections still
return `202` — telemetry must never surface an error to a shopper.

## Read path (why it is rollup-backed)

A Worker request has a hard subrequest budget, so "read every session record for 90 days" is not an
option. Instead:

- **today + yesterday** → aggregated live from raw session records (keeps the dashboard current and
  feeds the "Recent sessions (last 48h)" table)
- **older, sealed days** → read from `calc-stats:rollup:<day>`; a day with no rollup yet is
  aggregated once and then written, so each day costs a full scan exactly once, ever

A per-request fetch budget (600 records) bounds the work. If it runs out, the response sets
`coverage.partial` with the days still missing and the UI says so — a truncated scan must never read
as a low number. One more **Refresh** finishes building the rollups.

Rollups are also what make history permanent: raw rows expire at 90 days, rollups keep ~2 years, so
the 90-day view keeps working indefinitely.

## Notes

- All day boundaries are **UTC**, and the UI states that.
- Data starts at deploy. There is no backfill — GA4 history cannot be imported into this store.
- Reveal `region` is the storefront choice (`canada` / `usa` / `international`), i.e. the
  `.ca`-vs-`.com` split, not a geo lookup.
- Auth is the same WP-role check as Recoverable Orders (`server/utils/adminAuth.ts`). Hiding the tab
  is cosmetic; the endpoint re-verifies on every request.
