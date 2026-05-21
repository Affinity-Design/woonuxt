# Size Calculator 2.0 — Developer Plan

> **Companion to** [`size-calulator-2-upgrade.md`](./size-calulator-2-upgrade.md) (the PRD / spec doc).
> That doc defines _what_ we're building. This doc defines _how_ — phase by phase, file by file, grounded in this codebase's actual architecture.

**Status**: Planning complete. No code written yet. All client decisions resolved (§ 11.1). Two dev-owned technical audits remain (§ 11.2). Ready for Phase 1 kickoff after audits.

**Location**: Lives on `proskatersplace.ca`. Replaces the current single-page calculator at [`/inline-skates-size-calculator`](../pages/inline-skates-size-calculator.vue). New canonical URL: **`/roller-skates-size-calculator`** (see § 9).

---

## 1. Goals & Non-Goals

### Goals
1. Convert any user-known footwear size (from their existing skates or shoes) into an absolute **millimeter baseline**, then match that baseline against a brand-specific catalog table to produce a recommended skate size.
2. Serve **both** Canadian and US/international traffic from the `.ca` host without forcing US users to view CAD pricing — by deferring all price reveal to the destination store via search-URL routing.
3. Establish a **data-driven, client-editable** brand reference + carried-brand catalog so the source of truth lives outside the component code.
4. Maintain prerender + KV cache compatibility (current calculator is prerendered with a 7-day cache — see [`nuxt.config.ts:271-274`](../nuxt.config.ts#L271-L274)).
5. Preserve current page's SEO equity (rankings, backlinks) through controlled URL migration.

### Non-Goals (explicitly NOT in v2)
- ❌ Width-based **math adjustment** of recommended size (dropped in June 2026 spec — width is disclaimer-only).
- ❌ "Best Control / Best Comfort" dual-output model (dropped in June 2026 spec — single recommended size per brand).
- ❌ Real-time price lookup / cross-store inventory sync. Calculator never shows prices.
- ❌ Account-bound size profile persistence (no user accounts hit).
- ❌ Category archive page mega-menu redesign — flagged in spec doc § "Side Action Item" as a separate workstream (see § 10 below).
- ❌ Adding US-store product data to the `.ca` repo. Cross-store linking is **live WPGraphQL** against the destination store's endpoint — no product mirroring, no shared database.

---

## 2. Architecture Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| Source of truth for sizing data | **Bundled JSON** under [`data/calculator-data/*.json`](../data/calculator-data/) | Matches existing patterns ([`data/brand-master-list.json`](../data/brand-master-list.json), [`data/product-routes.json`](../data/product-routes.json)). Built at compile time, prerendered, no runtime cost, version-controlled. |
| Baseline metric | **Millimeters (integer)** | Per spec § 1. All conversion math hits mm before lookup. |
| Geo detection | **Cloudflare `CF-IPCountry` request header** | Free on Cloudflare Pages (this site's hosting platform). Server-side, no third-party API, no client-side delay. Cached-friendly. |
| Cross-domain routing | **WPGraphQL product lookup** on both stores → open direct `${storeBaseUrl}/product/{slug}` in new tab. No `?s=` search URLs. | Per Q1 answer. Real product data (title, image, slug) — better UX than a search-results landing page. Both stores expose WPGraphQL. Frontend-only, no server proxy. |
| Price display | **Always hidden**. "Click to find price" badge → `target="_blank"` to geo-resolved product URL. | Per spec § 3. Even though GraphQL can return price, we deliberately suppress it in our render — price reveals on the destination store. |
| Calculator URL | **`/roller-skates-size-calculator`** (new canonical). Slug parameterized so it can be changed again without component rewrite. Old `/inline-skates-size-calculator` 301s to new. | Per Q2 answer. Targets "roller skates size calculator" keyword. Page is a thin route shell that consumes the `SizeCalculator/Calculator.vue` component, so slug ≠ implementation. |
| Layer | **Root layer** (NOT `woonuxt_base/`) | Project rule #1: never modify base. New components live in root [`components/`](../components/) and [`pages/`](../pages/). |
| State management | **Single page-scoped composable** `useCalculator()` (no global state — calculator session dies on tab close, by design per spec § 3 "Tab State Persistence"). | Matches existing useState pattern from CLAUDE.md. |
| SEO | **`useCanadianSEO()`** (existing composable at [`composables/useCanadianSEO.ts`](../composables/useCanadianSEO.ts)) | Project rule #2: never use raw `useHead()` alone. Already supports hreflang for en-CA / fr-CA / en-US / x-default. |

---

## 3. Data Schema

Two JSON files under `data/calculator-data/`. Both are **input-only**: built by a node script that ingests the client Google Sheet (see § 5).

### 3.1 `reference-brands.json` — what the user owns

Used to translate a user-entered "I wear size X in brand Y" into millimeters.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-21T12:00:00Z",
  "brands": [
    {
      "id": "ref_nike_001",
      "name": "Nike",
      "category": "sports_shoes",
      "officialSizingUrl": "https://www.nike.com/size-fit/mens-footwear",
      "sizes": [
        {
          "mm": 270,
          "eu": 42.0,
          "usMen": 9.0,
          "usWomen": 10.5,
          "uk": 8.0
        }
      ]
    }
  ]
}
```

**Field rules**:
- `id`: kebab + numeric suffix. Stable across rebuilds. Used as Vue `:key` and as the value passed into URL query params for deep-linking.
- `category`: enum — `inline_skates` | `roller_skates` | `ice_skates` | `sports_shoes`. **Drives Step 2 dropdown contents.**
- `officialSizingUrl`: optional. When present, rendered as outbound trust link (`rel="noopener nofollow"`, `target="_blank"`) — drives the SEO bonus from spec § 2 Step 2.
- `sizes[]`: every row must have `mm` populated. Other fields optional — but **at least one of `eu`, `usMen`, `usWomen`, `uk` required** per row (validation step in importer).
- Gender split rule: per spec § 2 Step 3, only `usMen` and `usWomen` are gendered. `eu`, `uk`, `mm` are unisex.

### 3.2 `carried-brands.json` — what we sell

Used to translate a millimeter baseline into a recommended size for a specific skate brand we stock.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-21T12:00:00Z",
  "brands": [
    {
      "id": "car_fr_skates_001",
      "name": "FR Skates",
      "productCategory": "inline_skates",
      "widthProfile": "wide",
      "widthDisclaimer": "This brand features a wide shell profile. If you are between sizes, we recommend staying true to size.",
      "graphqlLookup": {
        "productAttributeBrandSlug": "fr-skates",
        "categorySlug": "inline-skates"
      },
      "sizeRanges": [
        {
          "mmMin": 266,
          "mmMax": 271,
          "recommendedLabel": "EU 42 / US 9",
          "sizeAttributeValue": "42"
        }
      ]
    }
  ]
}
```

**Field rules**:
- `productCategory`: enum — `inline_skates` | `roller_skates` | `ski_boots`. **Per spec § 4, ice skates are excluded from output suggestions** even though they're a valid _reference_ category.
- `widthProfile`: enum — `narrow` | `average` | `wide`. Drives default disclaimer text if `widthDisclaimer` is empty.
- `widthDisclaimer`: per-brand override. Long text. Rendered verbatim under the recommended size.
- `sizeRanges[]`: every range must satisfy `mmMin <= mmMax`. Ranges within a brand **must not overlap** — importer enforces this.
- `recommendedLabel`: human-readable string shown to user (e.g. `"EU 42 / US 9"`).
- `graphqlLookup`: the keys used to find this brand's products via WPGraphQL on either store. `productAttributeBrandSlug` matches WooCommerce's `pa_brand` taxonomy slug; `categorySlug` matches the product category. **Both stores must use the same slugs** for this to work cross-domain — confirm in Phase 1.5 audit.
- `sizeAttributeValue`: the WooCommerce `pa_size` (or equivalent size attribute) value to filter by when fetching products at this range. Used in the GraphQL `where: { attributes: [...] }` clause.

### 3.3 Generated TypeScript types

A build step emits `types/calculator-data.ts` from these JSON files so the calculator component has typed access. Single source of truth = the JSON.

---

## 4. Phase 0 — Discovery & Planning (this doc)

**Status**: complete pending two technical audits. **Exit criteria**:
- [x] Architecture decisions locked (§ 2)
- [x] Data schema drafted (§ 3)
- [x] Client decisions Q1–Q9 resolved (§ 11.1)
- [ ] Q10 CORS audit complete (§ 11.2) — **blocking Phase 4**
- [ ] Q11 slug-parity audit complete (§ 11.2) — **blocking Phase 1 Sheet structure** (a slug mismatch adds 2 columns to Tab 2)
- [ ] PSP sign-off on the June 2026 user path in the spec doc
- [ ] Phase 1 (data sift) kicked off

---

## 5. Phase 1 — Data Sift & Schema Population

This phase has **two streams running in parallel**:
- **Stream A — Carried brands** (what PSP sells). Source: the 17 existing files in [`data/calculator-data/`](../data/calculator-data/).
- **Stream B — Reference brands** (what users own). Source: client-provided Google Sheet for skate brands + curated sports-shoe brand list compiled by us.

### 5.1 Stream A — Audit existing 17 chart files

Already in repo:

| File | Category | Best mapping target |
|---|---|---|
| Adapt Sizing Chart.jpg | Inline | carried-brands |
| CHAYA Sizing Chart.jpg | Roller | carried-brands |
| FR Brand Sizing Chart.jpg | Inline | carried-brands |
| Flying Eagle Sizing Chart.xlsx | Inline | carried-brands (easiest — already tabular) |
| Gawds Sizing Chart.jpg | Inline | carried-brands |
| Generic Size Convertion Table.JPG | n/a | **reference base table** — seeds the unisex mm/eu/uk/us cross-walk for sports shoes |
| Iqon Sizing Chart.jpg | Inline | carried-brands |
| Luminous Sizing Chart.jpg | Roller | carried-brands |
| Mesmer Sizing Chart.jpg | Inline | carried-brands |
| PlayLife Sizing Chart.jpg | Inline | carried-brands |
| Powerslide Sizing Chart.jpg | Inline | carried-brands |
| Razor Sizing Chart.jpg | Inline | carried-brands |
| Reign Hockey Sizing Chart.jpg | Ice | reference-brands only (excluded from output per § 4) |
| Rio Roller Sizing Chart.jpg | Roller | carried-brands |
| Rollerblade Sizing Chart.pdf | Inline | carried-brands |
| SEBA Sizing Chart.jpg | Inline | carried-brands |
| USD Sizing Chart.jpg | Inline | carried-brands |

**Work items**:
1. **Transcribe each chart** (image OCR + manual verification) into a row-per-size CSV per brand. Store transcriptions under `data/calculator-data/_transcribed/{brand}.csv` — kept in repo as audit trail.
2. **Build a coverage matrix**: brand × size range covered × fields available (mm? EU? US? width?). Goal: identify gaps before sending to client.
3. **Width profile audit**: for each carried brand, document narrow/average/wide based on chart notes or our retail experience. This populates `widthProfile`.
4. **Disclaimer authoring**: 1-3 sentences of "this brand fits X" text per carried brand. Pulled from current brand-master copy where possible.

### 5.2 Stream B — Reference brands the user owns

The June 2026 spec lists 4 reference categories. For each, we need a **dropdown list** of brand options:

| Reference category | Initial brand list (proposed — pre-populate in Sheet, client edits during Phase 1) |
|---|---|
| Inline Skates | All carried inline brands + Rollerblade legacy lines, K2, Bauer, Mission |
| Roller Skates | All carried roller brands + Moxi, Sure-Grip, Riedell |
| Ice Skates | Bauer, CCM, Graf, Jackson, Riedell |
| Sports Shoes | Nike, Adidas, New Balance, Puma, Under Armour, Vans, Converse, Asics |

For most sports-shoe brands the **Generic Size Conversion Table** chart covers them (mm/eu/us/uk are industry-standard). Per-brand `officialSizingUrl` is the SEO payload.

### 5.3 The Google Sheet template

The Sheet ([linked](https://docs.google.com/spreadsheets/d/1j4XDYpStEpGmhGGlV9aTJmL9BD3iQfBCk0IwRsx_LNg/edit?usp=sharing)) needs **two tabs** matching the schema. The Sheet currently exists as a blank `Sheet1` — we'll scaffold the structure below in Phase 1.

**Tab 1: Reference Brands** (8 columns + 1 row per size)

| Column | Required | Type | Notes |
|---|---|---|---|
| Brand Name | ✅ | text | One brand name repeated across all its size rows |
| Category | ✅ | dropdown | enum: `inline_skates` \| `roller_skates` \| `ice_skates` \| `sports_shoes` |
| Official Sizing URL | optional | URL | Drives the outbound trust link in Step 2 (SEO) |
| mm | ✅ | integer | Core key — every row must have this |
| EU | optional* | float | e.g. `42` or `42.5` |
| US Men | optional* | float | |
| US Women | optional* | float | |
| UK | optional* | float | |

*At least one of EU / US Men / US Women / UK must be populated per row. Validation enforced in the importer.

**Tab 2: Carried Brands** (~8 columns + 1 row per size range)

| Column | Required | Type | Notes |
|---|---|---|---|
| Brand Name | ✅ | text | One brand repeated across all its size-range rows |
| Product Category | ✅ | dropdown | enum: `inline_skates` \| `roller_skates` \| `ski_boots` |
| Width Profile | ✅ | dropdown | enum: `narrow` \| `average` \| `wide` |
| Width Disclaimer Text | optional | long text | Per-brand override; if blank, default from Width Profile |
| GraphQL Brand Slug | ✅ | text | WP `pa_brand` taxonomy slug (e.g. `fr-skates`). **Pending Q11 audit** — if slugs differ between `.ca` and `.com`, this becomes two columns: "GraphQL Brand Slug (CA)" + "GraphQL Brand Slug (COM)" |
| GraphQL Category Slug | ✅ | text | WP product category slug (e.g. `inline-skates`). Same Q11 caveat — may split into two columns |
| mm Min | ✅ | integer | Start of the size range |
| mm Max | ✅ | integer | End of the size range. Must satisfy `mmMin ≤ mmMax`; ranges within a brand must not overlap |
| Recommended Label | ✅ | text | Human-readable size shown to user (e.g. `EU 42 / US 9`) |
| Size Attribute Value | ✅ | text | WP `pa_size` value used in the GraphQL `search` parameter (e.g. `42`) |

Both tabs use Sheet's **Data Validation** dropdowns for enum columns. Dropdown values must match the JSON enums **exactly** (lowercase, underscore-separated).

We pre-populate the Sheet with everything we transcribe from Stream A so the client only fills **gaps**, not the full table.

### 5.4 Sheet → JSON conversion script

`scripts/build-calculator-data.js` (new file). Runs as part of `npm run build`.

Responsibilities:
1. Pull both tabs from the [client Google Sheet](https://docs.google.com/spreadsheets/d/1j4XDYpStEpGmhGGlV9aTJmL9BD3iQfBCk0IwRsx_LNg/edit?usp=sharing) via the public per-tab CSV export URL (`/export?format=csv&gid={tabId}`)
2. Validate every row against the schema (enums correct, no overlapping ranges, all required fields present)
3. Generate stable `id` slugs (kebab brand name + numeric counter)
4. Emit `data/calculator-data/reference-brands.json` + `data/calculator-data/carried-brands.json`
5. Emit `types/calculator-data.ts` (TS types derived from validated JSON)
6. **Fail the build** on validation error — never ship a broken table

Integrates into [`package.json`](../package.json) build chain alongside the existing `build-all-routes` etc. scripts.

### 5.5 Exit criteria for Phase 1
- Both JSON files exist, validate, and contain a minimum viable dataset: every category populated, at least one carried brand per output category, generic table covers full mm range 165-335.
- Sheet → JSON script runs in CI without manual intervention.
- Client has access to the Sheet and a 1-pager explaining how to edit it.

---

## 6. Phase 2 — Geo-Detection Infrastructure

### 6.1 The constraint

The calculator page is **prerendered at build time** ([`nuxt.config.ts:271`](../nuxt.config.ts#L271)), so its HTML is identical for every user — there's no per-request SSR pass to read `CF-IPCountry` from. Region must be resolved **on the client after hydration**, before any "Click to find price" link can be clicked.

### 6.2 The mechanism

Two new files:

- **`server/api/region.json.get.ts`** — a tiny Nitro API route. Reads the `CF-IPCountry` header from the incoming request, returns `{ countryCode: 'CA' | 'US' | ... }`. This endpoint is **not prerendered** — it executes per request on the edge, so the header is always fresh. In dev (no header), defaults to `'CA'`.
- **`composables/useRegion.ts`** — exposes `useRegion()`. On mount, fires a single `$fetch('/api/region.json')`, memoizes the result in a `useState('region', ...)`, and exposes a reactive `region` object. Subsequent calls in the same session hit the cache, no re-fetch.

Existing [`server/middleware/forward-client-ip.ts`](../server/middleware/forward-client-ip.ts) handles IP forwarding for other purposes — unchanged.

### 6.3 Why not a third-party IP API?
- Adds an external runtime dependency.
- Cloudflare's `CF-IPCountry` is free, sub-millisecond at the edge, and as accurate as commercial GeoIP databases.

### 6.4 The composable contract

```ts
interface Region {
  countryCode: string;        // 'CA', 'US', 'GB', etc.
  isCanadian: boolean;
  storeBaseUrl: string;       // 'https://proskatersplace.ca' | 'https://proskatersplace.com'
  graphqlEndpoint: string;    // `${storeBaseUrl}/graphql`
  loading: boolean;           // true until /api/region.json resolves
}

const region = useRegion();   // reactive, auto-fetched on first call
```

`storeBaseUrl` resolves to `.ca` only when `countryCode === 'CA'`. Everyone else (US + international) gets `.com`.

### 6.5 The 1-RTT delay

There's a ~30-100ms window between page hydration and `/api/region.json` resolving. During that window, "Click to find price" links should be either:
- **Disabled** with a subtle "Detecting region..." indicator (cleaner UX), OR
- **Pre-rendered with `storeBaseUrl = '.ca'`** and live-updated when region resolves (faster apparent UX, but a US user clicking in that ~30ms window would briefly land on `.ca`).

Recommendation: **disabled-during-load**. The user can't reach Step 6 (where price-reveal lives) in under several seconds anyway, so the region call has long completed by the time it matters. Loading state matters only for the rare back-button case.

---

## 7. Phase 3 — Component Decomposition

### 7.1 File map

```
pages/
  roller-skates-size-calculator.vue    # NEW canonical page (thin shell, hands off to component tree)
  inline-skates-size-calculator.vue    # DELETED — replaced by a routeRules 301 entry in nuxt.config.ts (see § 9)

components/
  SizeCalculator/
    Calculator.vue                     # Top-level orchestrator. Owns step state.
    Step1ReferenceCategory.vue         # 4 cards: Inline / Roller / Ice / Sports Shoes
    Step2ReferenceBrand.vue            # Dropdown filtered by Step 1 selection
    Step3SizeInput.vue                 # 5-field mutually-exclusive input
    Step4Intent.vue                    # mm range display + "What to buy?" 3-button choice
    Step5TargetBrand.vue               # Carried brand dropdown filtered by Step 4 intent
    Step6Output.vue                    # Recommended size + width disclaimer + product grid
    PriceRevealCard.vue                # Single sample-product card with "Click to find price" CTA
    BrandSizingLink.vue                # Outbound trust link (used in Step 2)

composables/
  useCalculator.ts                     # Step state, mm conversion, brand lookup, validation
  useRegion.ts                         # (Phase 2)
  useCalculatorData.ts                 # Loads + memoizes the two JSON files

queries/
  getCalculatorProducts.gql            # WPGraphQL query for Step 6 product grid (Phase 4)

server/
  api/
    region.json.get.ts                 # (Phase 2) Returns { countryCode } from CF-IPCountry header

types/
  calculator-data.ts                   # AUTO-GENERATED by scripts/build-calculator-data.js (do not edit)
  SampleProduct.ts                     # { name, slug, image } returned by the cross-domain GraphQL query
```

### 7.2 State machine

The calculator is a 6-step linear funnel with backtracking. State shape:

```ts
interface CalculatorState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  referenceCategory: ReferenceCategory | null;
  referenceBrandId: string | null;
  inputs: {
    mm: number | null;
    cm: number | null;
    eu: number | null;
    usMen: number | null;
    usWomen: number | null;
    uk: number | null;
  };
  activeInputField: keyof CalculatorState['inputs'] | null;  // The "locked" field
  resolvedMm: number | null;                                  // Computed from inputs
  intent: 'inline_skates' | 'roller_skates' | 'ski_boots' | null;
  targetBrandId: string | null;
  result: { recommendedLabel: string; disclaimer: string; sampleProducts: SampleProduct[] } | null;
}
```

### 7.3 Mutually-exclusive input rule (Step 3)

Per spec § 2 Step 3 + June 2026 flow Step 3 — when one input field gets a value, all others get `disabled` and visually grayed. Clearing the active field re-enables all.

Implementation: a single `activeInputField` ref in state. `disabled` computed per field as `activeInputField !== null && activeInputField !== thisField`. Clearing the active field's value sets `activeInputField` back to `null`.

### 7.4 mm-resolution algorithm

Given a single non-null input + the user's selected reference brand:
1. If input is `mm` → use directly.
2. If input is `cm` → multiply by 10.
3. Else (eu / usMen / usWomen / uk) → lookup in the selected reference brand's `sizes[]` table. **No interpolation** — per Q6, snap to the nearest size row by absolute difference and surface a warning: _"Snapped to EU 42 — your entered size was between charted values."_
4. Output `resolvedMm`. Show user: _"Your foot length is approximately X mm (Y mm to Z mm range)"_ where Y..Z is `mm ± 2.5mm` (half-size tolerance).

### 7.5 Recommended size lookup (Step 6)

Given `resolvedMm` + selected `targetBrandId`:
1. Find brand in `carried-brands.json`.
2. Walk `sizeRanges[]`. The matching range is the one where `mmMin <= resolvedMm <= mmMax`.
3. If `resolvedMm` is between two ranges (gap), pick the closer one and append a "between sizes" note from the disclaimer.
4. If outside all ranges, output a graceful "We don't stock this size for {brand}. Try {alternate brand suggestion}" — alternates pulled from same product category.

---

## 8. Phase 4 — Cross-Domain GraphQL Resolution & Price Reveal

### 8.1 The cross-domain GraphQL model

Both stores expose WPGraphQL. The `.ca` frontend (this app) queries **whichever store's GraphQL endpoint matches the user's region** to retrieve real product cards (title, image, slug). Click opens the direct `/product/{slug}` page on that store.

```
User region (CF-IPCountry → window.__pspRegion)
    │
    ├─ 'CA' → query https://proskatersplace.ca/graphql
    │         link target https://proskatersplace.ca/product/{slug}
    │
    └─ other → query https://proskatersplace.com/graphql
              link target https://proskatersplace.com/product/{slug}
```

**Critical prerequisite (Phase 1.5 audit)**:
- The `.com` WPGraphQL endpoint must permit CORS from `proskatersplace.ca` origin.
- Both stores must use **matching `pa_brand` and category slugs** for the lookup to resolve on either side. Mismatches → graceful "Not available on this store, [link to alt store]" fallback.

### 8.2 The GraphQL query

Base layer is read-only (CLAUDE.md rule #1), so the query goes in root [`queries/getCalculatorProducts.gql`](../queries/) (new file).

**Schema audit finding**: the existing installed WPGraphQL schema (see [`woonuxt_base/app/queries/getProductsWithCursor.gql`](../woonuxt_base/app/queries/getProductsWithCursor.gql)) supports `where: { categoryIn, search, visibility, status, orderby, ... }` but **does NOT expose multi-taxonomy AND filtering** for `pa_brand` + `pa_size` in one call. To filter precisely we need to extend the schema.

**Two approaches** — A ships day one, B is the long-term precise solution:

**Approach A — `search` parameter (zero backend changes, fuzzy)**

```graphql
query getCalculatorProducts(
  $categorySlug: [String]
  $search: String!
  $first: Int = 6
) {
  products(
    first: $first
    where: {
      categoryIn: $categorySlug
      search: $search
      visibility: VISIBLE
      status: "publish"
    }
  ) {
    nodes {
      id
      slug
      name
      image { sourceUrl altText }
    }
  }
}
```

Caller passes `search: "FR Skates 42"` (concatenating `graphqlLookup.productAttributeBrandSlug` + `sizeAttributeValue` from `carried-brands.json`). Ships immediately. Risk: false positives from products whose title incidentally contains both terms.

**Approach B — custom WP snippet adding a `taxFilter` arg (precise, ~30 lines of PHP)**

**Build target**: [`wordpress/mu-plugins/psp-graphql-tax-filter.php`](../wordpress/mu-plugins/) — to be created during Phase 4. Lives alongside the existing [`psp-brand-content-field.php`](../wordpress/mu-plugins/psp-brand-content-field.php) and [`helcim-refund-error-handler.php`](../wordpress/mu-plugins/helcim-refund-error-handler.php) and follows the same header/style convention.

**Deployment target**: both `proskatersplace.ca` AND `proskatersplace.com` WP backends. Per CLAUDE.md rule #8 (US/CAD boundary), this is a flagged cross-site change — coordinate with PSP's WP team for install on both sites.

No third-party plugin dependency — pure WPGraphQL + WP_Query hooks.

```php
<?php
// File: wp-content/mu-plugins/proskaters-graphql-tax-filter.php

add_action('graphql_register_types', function () {
  register_graphql_input_type('TaxFilterInput', [
    'fields' => [
      'taxonomy' => ['type' => ['non_null' => 'String']],
      'terms'    => ['type' => ['non_null' => ['list_of' => 'String']]],
    ],
  ]);

  register_graphql_field('RootQueryToProductUnionConnectionWhereArgs', 'taxFilter', [
    'type'        => ['list_of' => 'TaxFilterInput'],
    'description' => 'AND-filter products by multiple taxonomies (e.g. pa_brand + pa_size).',
  ]);
});

add_filter('graphql_product_connection_query_args', function ($args, $source, $input) {
  if (empty($input['where']['taxFilter'])) return $args;
  $tax_query = ['relation' => 'AND'];
  foreach ($input['where']['taxFilter'] as $f) {
    $tax_query[] = [
      'taxonomy' => sanitize_key($f['taxonomy']),
      'field'    => 'slug',
      'terms'    => array_map('sanitize_title', $f['terms']),
      'operator' => 'IN',
    ];
  }
  $args['tax_query'] = isset($args['tax_query'])
    ? array_merge($args['tax_query'], $tax_query)
    : $tax_query;
  return $args;
}, 10, 3);
```

Once installed, the calculator query becomes:

```graphql
query getCalculatorProducts($brandSlug: String!, $sizeAttr: String!, $first: Int = 6) {
  products(first: $first, where: {
    taxFilter: [
      { taxonomy: "pa_brand", terms: [$brandSlug] }
      { taxonomy: "pa_size",  terms: [$sizeAttr] }
    ]
    status: "publish"
    visibility: VISIBLE
  }) {
    nodes { id slug name image { sourceUrl altText } }
  }
}
```

Why snippet over third-party plugin:
- Zero plugin-update risk; pure WPGraphQL hooks have been stable for years
- ~30 lines of code, one file, trivially auditable by PSP's backend team
- No naming collision risk — `taxFilter` is ours
- Removal = delete one file

**Decision**: ship Approach A in v1 to unblock launch. In parallel, submit the snippet to PSP's WP team for review/install on both backends. Once snippet is live, swap the query body to Approach B — only the `.gql` file changes (same component, same composable, same JSON).

### 8.3 The runtime client switch

Default `nuxt-graphql-client` is configured for `.ca` only. For Step 6, we need a **second endpoint** — either:
- **Option A**: register a second `nuxt-graphql-client` client (one for `.ca`, one for `.com`) and pick at query time
- **Option B**: bypass the auto-client and use raw `$fetch` against the appropriate `/graphql` endpoint

Option B is simpler (no module reconfig, no codegen drift) and fits a one-off cross-domain use case. Decision: **Option B**.

### 8.4 The "Click to find price" card

`PriceRevealCard.vue` props:
- `name: string`
- `image: string`
- `slug: string`
- `storeBaseUrl: string` (from `useRegion()`)

Render:
- Image
- Product name
- **No price** — even if GraphQL returned one (per spec § 3 "Zero Price Render")
- Badge button: **"Click to find price"** → `target="_blank" rel="noopener"` → `${storeBaseUrl}/product/${slug}`

### 8.5 Sample products grid (Step 6)

After Step 5 resolves the recommended size for the chosen brand, the page fires the GraphQL query above (against the region-matched endpoint) with that brand's `graphqlLookup.productAttributeBrandSlug`, `categorySlug`, and the matching `sizeAttributeValue` from the resolved range. Renders up to 6 `PriceRevealCard`s.

If the query returns zero results (out of stock, cross-store mismatch), show a fallback: _"No live results — [browse {brand} on {store}]"_ pointing to the brand category page.

### 8.6 Error & empty states

The cross-domain GraphQL call can fail in several ways. Each needs an explicit UI state:

| Failure | UI behavior |
|---|---|
| `/api/region.json` hasn't resolved yet | Step 6 product grid shows skeleton placeholders; "Click to find price" buttons disabled |
| GraphQL request times out (>5s) or returns 5xx | Show: _"Live product data unavailable. [Browse {brand} on {store}]"_ → falls back to a static category-page link, not a search URL |
| GraphQL returns CORS error (Q10 blocker) | Same fallback as above; log to error monitoring |
| Query succeeds with zero matching products (e.g. out of stock) | Show: _"No live results for size {recommendedLabel}. [Browse all {brand}]"_ pointing to brand category page on the destination store |
| Query succeeds with results but image URLs 404 | Render with a placeholder image; broken images don't block the click-through |

All failure paths must still allow the user to reach a usable destination on the correct store. **The calculator must never dead-end.**

---

## 9. Phase 5 — Migration & SEO Preservation

### 9.1 The URL (decided)

Per Q2: new canonical = **`/roller-skates-size-calculator`**. Old `/inline-skates-size-calculator` does a **301 → new URL** to preserve link equity.

Slug is treated as a config value, not hardcoded. The Vue page component is named generically (`SizeCalculator/Calculator.vue`) and the route file is whatever Nuxt's pages directory naming requires for the current canonical slug. **If we rename again** (e.g. to `/size-calculator` later), only the page file gets renamed; the component tree and JSON data are untouched.

**Trade-off note**: targeting "roller skates size calculator" as the keyword means the H1, title, meta description, and structured data must lean into "roller skates" while still serving the inline-skate audience (which has higher search volume historically). The H1 can be something like _"Skate Size Calculator — Roller, Inline & More"_ that captures both intents.

Concrete file changes:
1. **Create** `pages/roller-skates-size-calculator.vue` — new thin page shell
2. **Delete** `pages/inline-skates-size-calculator.vue` — the old single-file calculator
3. **Add to** [`nuxt.config.ts:246`](../nuxt.config.ts#L246) `routeRules`: a `'/inline-skates-size-calculator': { redirect: { to: '/roller-skates-size-calculator', statusCode: 301 } }` entry — Nuxt handles the redirect at the edge, no page file required
4. **Update** [`nuxt.config.ts:226`](../nuxt.config.ts#L226) `prerender.routes` — replace `'/inline-skates-size-calculator'` with `'/roller-skates-size-calculator'`
5. **Update** [`nuxt.config.ts:271`](../nuxt.config.ts#L271) `routeRules` — replace the old slug's `{ prerender: true, cache: ... }` block with one for the new slug
6. **Update** [`components/MainMenu.vue:49-52`](../components/MainMenu.vue#L49-L52) — change menu `to=` to new slug, update `isActive()` check
7. **Update** sitemap generator scripts ([`scripts/generate-sitemap*.js`](../scripts/) — confirm exact filename during work) to emit the new URL
8. **Update** internal blog post link from [`content/blog/`](../content/blog/) (one known reference at `index.md:104`)

The 301 must be in place **before** the new URL is published, so Google sees a permanent redirect on the first crawl of the old slug after launch.

### 9.2 SEO meta strategy (mandatory)
Per CLAUDE.md rule #2: use `useCanadianSEO()` at the page level. Reuse the existing structured data block from the current calculator ([`pages/inline-skates-size-calculator.vue:13-37`](../pages/inline-skates-size-calculator.vue#L13-L37)) — extend the `WebApplication` schema with the additional reference categories.

### 9.3 Sitemap
- New URL `/roller-skates-size-calculator` added to sitemap
- Old URL `/inline-skates-size-calculator` removed from sitemap (the 301 will inform crawlers)
- After launch, resubmit sitemap to Google Search Console and monitor the URL Inspection tool for the old slug until it shows the redirect as the canonical resolution

### 9.4 Hreflang + canonical strategy

`useCanadianSEO()` already emits hreflang tags for en-CA, fr-CA, en-US, x-default. For v1 (English-only — Q8):
- `canonical` → `https://proskatersplace.ca/roller-skates-size-calculator`
- `hreflang="en-CA"` → same URL (canonical Canadian)
- `hreflang="en-US"` → **same URL** (we serve US visitors on the same page, with `.com` product routing under the hood)
- `hreflang="fr-CA"` → same URL until French v1.5 ships; flip to `/fr-ca/...` once it does
- `hreflang="x-default"` → same URL

Trade-off: pointing en-US hreflang at our `.ca` URL means Google may show the `.ca` listing in US search results. This is intentional — the calculator is the entry point, and the cross-domain routing on Step 6 sends users to the right store after they engage.

### 9.5 Rollout sequence
1. Ship the new page on a staging branch / preview deployment first.
2. Internal QA: smoke-test every reference category, a sampling of brands per category, every target brand, and at least one size at each end of each brand's range.
3. Verify all five analytics events fire correctly (see § 11.3) on staging.
4. Verify `/api/region.json` returns correct `countryCode` from at least one Canadian and one non-Canadian VPN.
5. Soft-launch: deploy new URL, leave old URL **NOT yet redirected** for 24h to compare analytics baseline.
6. Hard-cutover: enable the 301 from old to new in `nuxt.config.ts` routeRules.
7. Resubmit sitemap to Google Search Console; monitor Coverage report for 2 weeks.

### 9.6 Accessibility & mobile

Required for any interactive UI we ship; the spec doc doesn't address these explicitly but they're table stakes.

| Requirement | Implementation |
|---|---|
| Keyboard navigation through all 6 steps | Buttons/cards focusable, Tab + Enter to select, Esc to back up a step |
| Focus management between steps | When a step completes, auto-focus the first interactive element of the next step |
| Screen reader labels on input fields | `aria-label` on each of the 5 size-input fields, including current locked/disabled state |
| Screen reader announcements when a field locks | `aria-live="polite"` region announcing _"Other size fields disabled. Clear this field to re-enable them."_ |
| Color contrast | All disabled/grayed states must still meet WCAG AA contrast (4.5:1) so disabled fields are visible to low-vision users |
| Mobile viewport | All steps render single-column on viewport <640px; the 5 size-input fields stack vertically; no horizontal scroll |
| Touch targets | All buttons/cards ≥44×44px per Apple HIG / WCAG 2.5.5 |
| Reduced motion | Step transitions disabled when `prefers-reduced-motion: reduce` is set |

### 9.7 Open Graph / social card asset

Current page uses [`/images/inline-skates-size-calculator.jpg`](../public/images/) (referenced at [`pages/inline-skates-size-calculator.vue:9`](../pages/inline-skates-size-calculator.vue#L9)). New page needs `/images/roller-skates-size-calculator.jpg` — 1200×630 OG-spec asset, designed for the new keyword positioning. **TBD asset creation** — flag for design.

---

## 10. Out of Scope (Separate Workstream)

**Category page mega-menu overhaul** — spec doc § "Side Action Item". The category archive currently presents a "wall of options" list; client wants visual block grouping matching the `.com` mega-menu. **This is a separate doc and project.** Mentioning here only so it doesn't leak into the calculator launch scope. To be tracked in a future `docs/category-archive-overhaul-plan.md`.

---

## 11. Open Questions (Need Client / Team Input)

### 11.1 Client decisions (all resolved)

| # | Question | Resolution |
|---|---|---|
| Q1 | Cross-domain product linking | WPGraphQL query against region-matched store endpoint → open `${storeBaseUrl}/product/{slug}` (see § 8) |
| Q2 | New calculator URL | `/roller-skates-size-calculator` + 301 from old. Slug treated as config (see § 9.1) |
| Q3 | Reference-brand dropdown lists | Pre-populate proposed § 5.2 lists in the Sheet; client edits/extends during Phase 1 review |
| Q4 | Google Sheet access | **Public CSV export URL** — Sheet set to "anyone with link can view", build script reads via the exported CSV link. No OAuth, no credentials. **Sheet URL provided**: see § 13 |
| Q5 | Geo resolution | Path A — frontend-only `window.__pspRegion` via hydration call to `/api/region.json` (see § 8.6) |
| Q6 | Size not in reference table | **Snap to nearest table row + show warning** — e.g. _"Snapped to EU 42 — your entered size was between charted values"_. User sees the snap and can adjust |
| Q7 | Sample products source | Live WPGraphQL (per Q1) |
| Q8 | Localization at launch | **English-only v1**. French (fr-CA) is a Phase 1.5 follow-up. UI string count is small (~30); retrofit is cheap. Calculator page still emits hreflang via `useCanadianSEO()` even before French content exists |
| Q9 | Analytics | Track **all four** event categories — see § 11.3 below |

### 11.2 Technical audit items (blocking, dev-owned — not client decisions)

Both audits should run **before Phase 1 Sheet scaffolding** — Q11's outcome directly determines Tab 2's column count.

| # | Question | Blocks | Owner | Test |
|---|---|---|---|---|
| Q10 | Does `proskatersplace.com`'s WPGraphQL endpoint allow CORS from `proskatersplace.ca` origin? | Phase 4 (architecture) | Dev | `curl -H "Origin: https://proskatersplace.ca" -i https://proskatersplace.com/graphql` and inspect `Access-Control-Allow-Origin` in response headers. **If blocked**: WP admin adds CORS allow-list (preferred), OR we proxy through `server/api/cross-store-graphql.post.ts` (breaks the "frontend-only" principle but viable fallback) |
| Q11 | Do `.ca` and `.com` use identical `pa_brand` and product-category slugs? | Phase 1 (Sheet structure: 1 column vs 2 per slug) | Dev | Query both `/graphql` endpoints' taxonomy term lists; diff them. **If identical**: keep Tab 2 single-column for each slug. **If they differ**: split into "GraphQL Brand Slug (CA)" + "GraphQL Brand Slug (COM)" columns, schema gets `graphqlLookup.ca` + `graphqlLookup.com` |
| Q12 (new) | Is the custom `taxFilter` snippet (§ 8.2 Approach B) installed on either backend? | Phase 4 (which approach we render) | Dev + PSP WP team | Run introspection on each `/graphql` endpoint and check for `TaxFilterInput` in `__schema.types`. **If absent on both**: ship Approach A and, during Phase 4, create the mu-plugin at `wordpress/mu-plugins/psp-graphql-tax-filter.php` and submit to PSP's WP team for install on both backends. **If present on both**: ship Approach B directly. **If split**: ship A everywhere until both are installed (avoids divergent query bodies per region) |

### 11.3 Analytics event schema (Q9 resolution)

All four event categories tracked. Use existing analytics layer (confirm wiring during Phase 3).

| Event name | Fires when | Payload |
|---|---|---|
| `calc_step_advance` | User moves from step N to step N+1 | `{ from: N, to: N+1, durationMs }` |
| `calc_reference_selected` | Step 2 brand chosen | `{ category, brandId, brandName }` |
| `calc_target_selected` | Step 5 brand chosen | `{ intent, brandId, brandName, resolvedMm }` |
| `calc_recommendation` | Step 6 result rendered | `{ referenceBrandId, referenceSize, resolvedMm, targetBrandId, recommendedLabel }` |
| `calc_price_reveal_click` | "Click to find price" badge clicked | `{ region, storeBaseUrl, targetBrandId, productSlug }` |

Privacy note: no PII in any payload. Brand IDs and millimeter values only.

---

## 12. Phase Timeline (Rough)

| Phase | Work | Estimate |
|---|---|---|
| 0 | Planning (this doc) + client sign-off | ✅ done (in review) |
| 0.5 | **Q10 + Q11 + Q12 technical audits** | 0.5 day |
| 1 | Data sift + Sheet scaffold + 17-chart transcription + import script | **3-5 dev days** + ⏳ client gap-fill turnaround |
| 2 | `/api/region.json` + `useRegion()` composable | 0.5 day |
| 3 | Component rewrite (6 step components + state machine) | 3-4 days |
| 4 | Cross-domain GraphQL query + PriceRevealCard + error states + author `wordpress/mu-plugins/psp-graphql-tax-filter.php` snippet for backend install | 1.5 days |
| 5 | Migration + SEO + a11y + OG asset + launch | 1 day |
| **Total dev** | | **~10-13 dev days** |
| **Wall-clock** | | gated by client Sheet-fill turnaround (Phase 1 gap-fill) and asset design (OG image) |

**Critical path**: Phase 1 data entry. Phases 2 + 3 can run in parallel with client filling gaps in the Sheet — the importer fails the build gracefully on missing data, so dev can iterate against partial JSON.

**Out-of-band work to start early**:
- Confirm error-monitoring wiring (Sentry or equivalent — TBD whether this project has it). The Step 6 GraphQL failures need somewhere to log.
- Design 1200×630 OG image for `/images/roller-skates-size-calculator.jpg`.

---

## 13. Source of Truth References

- **PRD / spec / UX flow**: [`docs/size-calulator-2-upgrade.md`](./size-calulator-2-upgrade.md) — June 2026 user path is canonical
- **Client Google Sheet (data entry)**: [Master Sizing Sheet](https://docs.google.com/spreadsheets/d/1j4XDYpStEpGmhGGlV9aTJmL9BD3iQfBCk0IwRsx_LNg/edit?usp=sharing) — two tabs (Reference Brands + Carried Brands), public-read CSV exports feed the importer
- **Existing implementation**: [`pages/inline-skates-size-calculator.vue`](../pages/inline-skates-size-calculator.vue) — to be replaced
- **Raw sizing chart source files**: [`data/calculator-data/`](../data/calculator-data/) — 17 files
- **Existing JSON patterns**: [`data/brand-master-list.json`](../data/brand-master-list.json), [`data/product-routes.json`](../data/product-routes.json)
- **Routing reference**: [`pages/search.vue`](../pages/search.vue)
- **SEO composable**: [`composables/useCanadianSEO.ts`](../composables/useCanadianSEO.ts)
- **IP middleware reference**: [`server/middleware/forward-client-ip.ts`](../server/middleware/forward-client-ip.ts)
- **Build config**: [`nuxt.config.ts`](../nuxt.config.ts) (route rules at L246-L275)
