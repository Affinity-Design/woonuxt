# Size Calculator 2.0 — Developer Plan

> **Companion to** [`size-calulator-2-upgrade.md`](./size-calulator-2-upgrade.md) (the PRD / spec doc).
> That doc defines _what_ we're building. This doc defines _how_ — phase by phase, file by file, grounded in this codebase's actual architecture.

**Status**: Stage 6 MVP exists in code, but this plan is being realigned to the real commerce architecture before launch. The calculator should be treated as country-agnostic for sizing math, with country-aware outbound product links only. The remaining work is data completion, chart extraction, URL-resolution hardening, routing cleanup, and QA.

**Location**: Lives on `proskatersplace.ca`. Replaces the current single-page calculator at [`/inline-skates-size-calculator`](../pages/inline-skates-size-calculator.vue). New canonical URL: **`/roller-skates-size-calculator`** (see § 9).

**Current MVP gap ledger**:
- Product candidates currently come from the single backend, but destination URLs still need a resolver that chooses `.ca` permalink vs `.com` product URL from the shopper's explicit storefront selection.
- Replace the MVP's IP/Cloudflare-region detection with a first-screen storefront selector: Canada, USA, or International.
- The MVP dataset is intentionally small; the chart assets and backend catalog need to be extracted into a fuller reviewable dataset.
- The old `/inline-skates-size-calculator` page still needs redirect/migration cleanup.
- The spec includes a CM/Mondo input path; the MVP has MM/EU/US Men/US Women/UK and should add CM before launch.
- Official sizing URLs are supported by the UI but are not populated in the current generated reference data.

---

## 1. Goals & Non-Goals

### Goals
1. Convert any user-known footwear size (from their existing skates or shoes) into an absolute **millimeter baseline**, then match that baseline against a brand-specific catalog table to produce a recommended skate size.
2. Serve **both** Canadian and US/international traffic from the `.ca` host without forcing the wrong storefront or currency. The calculator does not show price; it resolves a product card and sends the shopper to the correct `.ca` or `.com` product page where the local storefront owns price display.
3. Establish a **data-driven, client-editable** brand reference + carried-brand catalog so the source of truth lives outside the component code.
4. Maintain prerender + KV cache compatibility (current calculator is prerendered with a 7-day cache — see [`nuxt.config.ts:271-274`](../nuxt.config.ts#L271-L274)).
5. Preserve current page's SEO equity (rankings, backlinks) through controlled URL migration.

### Non-Goals (explicitly NOT in v2)
- ❌ Width-based **math adjustment** of recommended size (dropped in June 2026 spec — width is disclaimer-only).
- ❌ "Best Control / Best Comfort" dual-output model (dropped in June 2026 spec — single recommended size per brand).
- ❌ Real-time price lookup / cross-store inventory sync. Calculator never shows prices.
- ❌ Account-bound size profile persistence (no user accounts hit).
- ❌ Category archive page mega-menu redesign — flagged in spec doc § "Side Action Item" as a separate workstream (see § 10 below).
- ❌ Adding a second product backend or trying to synchronize live currency/inventory in the calculator. The USD WooCommerce backend remains the product source of truth; the `.ca` headless layer owns Canadian SEO URLs and CAD presentation.

---

## 2. Architecture Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| Source of truth for sizing data | **Bundled JSON** under [`data/calculator-data/*.json`](../data/calculator-data/) | Matches existing patterns ([`data/brand-master-list.json`](../data/brand-master-list.json), [`data/product-routes.json`](../data/product-routes.json)). Built at compile time, prerendered, no runtime cost, version-controlled. |
| Baseline metric | **Millimeters (integer)** | Per spec § 1. All conversion math hits mm before lookup. |
| Commerce backend truth | **One USD WooCommerce / WordPress backend** | The `.ca` site is the modern headless Canadian storefront with CAD conversion, Cloudflare/KV caching, and SEO-friendly permalinks. It is not a second product database. Product identity, images, attributes, and stock signals come from the existing backend unless a build-time cache already contains the same normalized record. |
| Storefront selection | **User-selected flag, not IP tracking** | The calculator starts with a simple Canada / USA / International choice. This avoids fragile visitor-IP logic and keeps Cloudflare headers away from cart/session/add-to-cart behavior. The choice affects only the outbound "Click to find price" href. |
| Product URL resolver | **Resolve candidates once, choose destination URL by selected storefront** | Product cards can be found from backend GraphQL or from a generated/search/KV catalog derived from that backend. Canada should click to the `.ca` SEO permalink when available. USA and International should click to the `.com` product URL. Missing `.ca` mappings degrade to a logged fallback, not a dead end. |
| Price display | **Always hidden**. "Click to find price" badge → `target="_blank"` to the selected storefront URL. | Per spec § 3. Even though GraphQL can return price, we deliberately suppress it in our render — price reveals on the destination store. |
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
- `graphqlLookup`: the keys used to find this brand's products in the single WooCommerce backend or in a cache generated from that backend. `productAttributeBrandSlug` matches the backend manufacturer/brand taxonomy slug; `categorySlug` matches the backend product category used for candidate filtering. The `.ca` click URL is resolved later from the headless permalink map/search cache, not by querying a second `.ca` GraphQL backend.
- `sizeAttributeValue`: the WooCommerce `pa_size` (or equivalent size attribute) value to filter by when fetching products at this range. Used in the GraphQL `where: { attributes: [...] }` clause.

### 3.3 Product link resolver data

Step 6 needs product cards, not prices. The normalized card record should carry enough information to render the card and send the shopper to the right storefront:

```ts
interface CalculatorProductLink {
  backendId: string;
  sku?: string;
  name: string;
  imageUrl?: string;
  imageAlt?: string;
  backendSlug: string;
  caPath?: string;
  comPath: string;
  source: 'graphql' | 'kv_catalog' | 'search_cache';
}
```

Resolution rules:
- `comPath` is normally `/product/{backendSlug}` from the WooCommerce backend.
- `caPath` should come from the `.ca` generated product route map, sitemap data, cached product catalog, or search/KV index. This preserves the Canadian high-speed permalink structure and SEO coverage.
- If a Canadian `caPath` is missing, log the miss and fall back in this order: known `.ca` product slug, matching brand/category page, then `.com` product page. The button should always lead somewhere useful.
- The calculator never stores or renders price from this record.

### 3.4 Generated TypeScript types

A build step emits `types/calculator-data.ts` from these JSON files so the calculator component has typed access. Single source of truth = the JSON.

---

## 4. Phase 0 — Discovery & Planning (this doc)

**Status**: complete pending two technical audits. **Exit criteria**:
- [x] Architecture decisions locked (§ 2)
- [x] Data schema drafted (§ 3)
- [x] Client decisions Q1–Q9 resolved (§ 11.1)
- [x] Q10 CORS audit complete for the real backend (§ 11.2) — `.com` GraphQL allows requests from `.ca`
- [ ] Q11 `.ca` URL-map audit complete (§ 11.2) — **blocking Phase 4 URL resolver** (confirms which generated/KV/search artifact is the best source for Canadian product permalinks)
- [ ] PSP sign-off on the June 2026 user path in the spec doc
- [ ] Phase 1 (data sift) kicked off

---

## 5. Phase 1 — Data Sift & Schema Population

This phase has **four streams running in parallel**:
- **Stream A - chart extraction**: extract every usable size row from the 17 image/PDF/XLSX chart assets already in the repo.
- **Stream B - backend catalog enrichment**: query the single WooCommerce backend to pull product names, slugs, SKUs, categories, manufacturer terms, size attribute values, image URLs, and stock visibility for calculator candidate matching.
- **Stream C - `.ca` permalink mapping**: match backend product identity to the headless `.ca` product path from generated route data, sitemap data, cached product data, or the search/KV index.
- **Stream D - client sheet completion**: PSP/client fills or reviews the mm values and fit notes in the Google Sheet. The app must not wait on manual entry for data we can extract from charts or backend records ourselves.

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
1. **Inventory each chart asset** with file type, brand, product category, likely table orientation, and extraction method (`xlsx`, PDF table/text, image OCR, or vision). This becomes the extraction manifest.
2. **Extract machine-readable rows**:
   - XLSX: parse directly with a Node script.
   - PDF: try text/table extraction first; use page screenshots plus AI vision only where text extraction fails.
   - JPG/PNG: use AI vision to identify headers, rows, units, size ranges, and foot-length columns.
3. **Write normalized draft JSON/CSV per brand** under a generated review folder. Keep source file name, page/image area, confidence, and notes per row so a human can audit where each value came from.
4. **Run a validation script** over extracted rows: required mm values, no overlapping target ranges, monotonic size progression, no impossible jumps, category enums valid, width profile present.
5. **Build a coverage matrix**: brand x size range covered x fields available (mm? cm/mondo? EU? US Men? US Women? UK? width? source confidence?). This is the punch list for the client sheet.
6. **Width profile audit**: for each carried brand, document narrow/average/wide based on chart notes, official copy, product descriptions, or PSP retail knowledge. This populates `widthProfile`.
7. **Disclaimer authoring**: 1-3 sentences of "this brand fits X" text per carried brand. Pull from current brand-master copy where possible, then flag uncertain brands for client review.
8. **Backend catalog pull**: query the WooCommerce GraphQL backend for calculator-scope products only (`inline_skates`, `roller_skates`, `ski_boots`) and store a generated catalog with `databaseId`, `sku`, `name`, `slug`, `manufacturer/brand`, `size attribute values`, `categories`, `stockStatus`, and image.
9. **`.ca` route match**: join the backend catalog to `.ca` route/search data by stable keys in this order: `databaseId` if present, SKU, exact slug, normalized name. Output `caPath` confidence and misses.
10. **Sheet sync**: prefill the Google Sheet from extracted/validated data; client work should focus on mm corrections, fit nuance, and edge cases rather than manual transcription from scratch.

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
| GraphQL Brand Slug | ✅ | text | Single backend manufacturer/brand taxonomy slug used to find product candidates. This is not a `.ca` vs `.com` split. |
| GraphQL Category Slug | ✅ | text | Single backend product category slug used to constrain product candidates. The `.ca` destination URL is resolved from the product-link map, not from this field. |
| mm Min | ✅ | integer | Start of the size range |
| mm Max | ✅ | integer | End of the size range. Must satisfy `mmMin ≤ mmMax`; ranges within a brand must not overlap |
| Recommended Label | ✅ | text | Human-readable size shown to user (e.g. `EU 42 / US 9`) |
| Size Attribute Value | ✅ | text | WP `pa_size` value used in the GraphQL `search` parameter (e.g. `42`) |

Both tabs use Sheet's **Data Validation** dropdowns for enum columns. Dropdown values must match the JSON enums **exactly** (lowercase, underscore-separated).

We pre-populate the Sheet with everything we transcribe from Stream A so the client only fills **gaps**, not the full table.

Product-card URLs do **not** belong in the manual sizing sheet unless a product needs an override. They are generated from the backend catalog and `.ca` route/search cache so the sheet stays focused on sizing truth. If an override is needed, add a third optional tab, **Product Link Overrides**, with `sku`, `backendSlug`, `caPath`, `comPath`, and `reason`.

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

## 6. Phase 2 - Storefront Selector

### 6.1 The constraint

The calculator must send shoppers to the correct storefront, but it should not infer that choice from visitor IP, Cloudflare headers, or request middleware. Earlier IP-based visitor tracking created risk for unrelated storefront behavior, including cart/add-to-cart flows. The calculator should instead ask the shopper directly at the beginning.

### 6.2 The mechanism

Add a first-screen storefront selector before the sizing flow:

- Canada
- USA
- International

Use familiar flag icons or compact country labels. This is a storefront preference, not a legal residency check. The selector should include a small "Change" control near the final recommendation so a shopper can switch destinations without restarting the sizing math.

Implementation notes:
- Persist the choice in page state and optionally `localStorage` for the next calculator visit.
- Default to Canada only as a UI default, not as an inferred country.
- Do not read or write cart cookies, WooCommerce session headers, checkout state, or global visitor-tracking state.
- Do not depend on `CF-IPCountry`, forwarded IP middleware, or `/api/region.json` for calculator link routing.

### 6.3 The composable contract

```ts
type StorefrontChoice = 'canada' | 'usa' | 'international';

interface StorefrontSelection {
  choice: StorefrontChoice;
  label: 'Canada' | 'USA' | 'International';
  productHost: 'https://proskatersplace.ca' | 'https://proskatersplace.com';
  usesCanadianPermalinks: boolean;
}

const storefront = useStorefrontSelection();
```

Routing:
- `canada` -> prefer `.ca` product permalink.
- `usa` -> use `.com` product URL.
- `international` -> use `.com` product URL.

The GraphQL/catalog candidate source remains the single backend or a generated catalog from that backend. The storefront choice only changes which outbound URL the product card uses.

### 6.4 UI placement

The selector can be Step 0 or the first panel inside Step 1. It should appear before reference-category selection so the shopper understands why the final product links may open `.ca` or `.com`.

Recommended copy:
- "Where do you want product links to open?"
- Canada
- USA
- International

Avoid language like "detecting your location" or "tracking your region." The user is choosing a storefront destination.

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
    Step0StorefrontSelector.vue        # Canada / USA / International product-link destination choice
    Step1ReferenceCategory.vue         # 4 cards: Inline / Roller / Ice / Sports Shoes
    Step2ReferenceBrand.vue            # Dropdown filtered by Step 1 selection
    Step3SizeInput.vue                 # 5-field mutually-exclusive input
    Step4Intent.vue                    # mm range display + "What to buy?" 3-button choice
    Step5TargetBrand.vue               # Carried brand dropdown filtered by Step 4 intent
    Step6Output.vue                    # Recommended size + width disclaimer + product grid
    PriceRevealCard.vue                # Single sample-product card with "Click to find price" CTA
    BrandSizingLink.vue                # Optional extraction if Step 2 trust link needs reuse

composables/
  useCalculator.ts                     # Step state, mm conversion, brand lookup, validation
  useStorefrontSelection.ts            # User-selected storefront destination; replaces IP/CF region detection
  useCalculatorProducts.ts             # Candidate lookup or generated product-link map read
  useCalculatorProductLinks.ts         # Preferred Phase 4 resolver for .ca/.com href selection

types/
  calculator-data.ts                   # AUTO-GENERATED by scripts/build-calculator-data.js (do not edit)
  calculator-product-link.ts           # Normalized product card/link type if generated outside the composable

scripts/
  build-calculator-data.js             # Sheet -> sizing JSON
  build-calculator-product-links.js    # Backend catalog + .ca route/search cache -> product-link map
```

### 7.2 State machine

The calculator is a 6-step linear funnel with backtracking. State shape:

```ts
interface CalculatorState {
  step: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  storefrontChoice: 'canada' | 'usa' | 'international' | null;
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

## 8. Phase 4 - Product Link Resolution & Price Reveal

### 8.1 The real commerce model

There is one WooCommerce / WordPress backend, and it is USD-oriented. The `.ca` site is a headless Canadian storefront that consumes that backend, converts/presents pricing in CAD elsewhere in the app, and builds faster SEO-focused Canadian product URLs.

For the calculator, that means:
- Product identity comes from the single backend or from build/KV/search artifacts generated from that backend.
- The calculator card shows product image, product name, and a button only.
- The button destination depends on the shopper's selected storefront:
  - Canada -> `.ca` product permalink when the headless route map has one.
  - USA/International -> `.com` backend product URL.
- The calculator never shows price, currency, exchange rate, cart state, or checkout state.

### 8.2 Product candidate sources

Use whichever source is most reliable and fastest, but normalize every path into `CalculatorProductLink` from § 3.3.

| Source | Use | Pros | Risk |
|---|---|---|---|
| Live backend GraphQL | Runtime candidate lookup for selected brand + size | Fresh product names/images; already available from `.com` | Runtime dependency; must handle timeout/empty states |
| Build-time catalog JSON | Preferred long-term source for the calculator card grid | Fast, cacheable, no runtime GraphQL delay | Needs a build script and regular refresh |
| `.ca` search/KV/product route data | Canadian URL resolution | Preserves the headless `.ca` SEO permalink structure | Needs matching by stable ID/SKU/slug/name and miss reporting |
| Manual override tab | Only for misses or special redirects | Gives PSP control over edge cases | Should stay small or it becomes a second catalog |

### 8.3 Backend GraphQL lookup

The current backend schema exposes product `attributes`, `categoryIn`, `visibility`, `status`, and related filters. A live check on May 26, 2026 showed `.com` GraphQL accepts CORS from `https://proskatersplace.ca` and supports the precise attribute filter already used by the MVP. The older custom `taxFilter` mu-plugin plan is not required unless a later backend change removes or breaks the existing attribute filter.

The runtime query should:
- Query only the single backend endpoint.
- Filter to calculator-scope categories: inline skates, roller skates, and ski boots.
- Filter by manufacturer/brand and size attribute when available.
- Return only fields needed for cards and link matching: id/databaseId, SKU, slug, name, image, categories, stock/visibility signals.
- Never request or render price.

If live GraphQL is too slow or brittle, move this same query into a build script and serve Step 6 from generated calculator product-link JSON.

### 8.4 Canadian URL resolver

Canadian users should not be sent to a generic search page when a real `.ca` product page exists. The resolver should try these inputs in order:

1. Generated `.ca` product route map or sitemap data.
2. Cached products/search index in the Cloudflare/KV-backed catalog.
3. Local generated product list files created during build.
4. Optional Product Link Overrides sheet tab.
5. Brand/category fallback page on `.ca`.

Matching priority:
1. Backend database ID if present in the `.ca` artifact.
2. SKU.
3. Exact slug.
4. Normalized product name.
5. Brand + category fallback.

Every miss should be captured in a generated report such as `calculator-link-misses.json` so we can fix the mapping without guessing.

### 8.5 Runtime URL contract

Step 6 should not build URLs by concatenating `storeBaseUrl + /product/ + slug` unless the resolver has confirmed that slug is valid for the target storefront.

Expected shape:

```ts
function resolveCalculatorHref(product: CalculatorProductLink, storefront: StorefrontChoice) {
  if (storefront === 'canada') {
    return product.caPath
      ? `https://proskatersplace.ca${product.caPath}`
      : product.comPath
        ? `https://proskatersplace.com${product.comPath}`
        : null;
  }

  return product.comPath ? `https://proskatersplace.com${product.comPath}` : null;
}
```

If this returns `null`, hide that card and show the brand/category fallback CTA. Do not render a broken product link.

### 8.6 The "Click to find price" card

`PriceRevealCard.vue` props should be based on the normalized product link, not raw backend slug concatenation:
- `name`
- `imageUrl`
- `imageAlt`
- `href`
- `source`

Render:
- Image.
- Product name.
- No price.
- Button text: **"Click to find price"**.
- `target="_blank" rel="noopener"`.

The primary calculator tab remains intact so the shopper does not lose their size recommendation.

### 8.7 Error & empty states

The product-link flow can fail in several ways. Each needs an explicit UI state:

| Failure | UI behavior |
|---|---|
| Storefront is not selected | Keep the product grid hidden and ask the shopper to choose Canada, USA, or International |
| Backend GraphQL request times out or returns 5xx | Show "Live product data unavailable" with a selected-storefront brand/category browse link |
| No matching products for the selected size | Show "No live results for size {recommendedLabel}" with a browse-all link for the target brand/category |
| `.ca` URL mapping missing for a Canadian shopper | Use `.ca` brand/category fallback first; log the miss. Use `.com` product link only if that is the only real product destination available |
| Image URL is missing or 404s | Render a placeholder; broken images must not block click-through |

All failure paths must still allow the user to reach a useful destination. **The calculator must never dead-end.**

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
4. Verify the storefront selector defaults cleanly, can be changed without losing the calculator state, persists only as a storefront preference, and never touches cart/session/add-to-cart behavior.
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
| Q1 | Cross-domain product linking | Query or cache product candidates from the single USD Woo backend, then resolve the outbound button URL from the shopper's explicit storefront choice: `.ca` SEO permalink for Canada when mapped, `.com` product URL for USA/International (see § 8) |
| Q2 | New calculator URL | `/roller-skates-size-calculator` + 301 from old. Slug treated as config (see § 9.1) |
| Q3 | Reference-brand dropdown lists | Pre-populate proposed § 5.2 lists in the Sheet; client edits/extends during Phase 1 review |
| Q4 | Google Sheet access | **Public CSV export URL** — Sheet set to "anyone with link can view", build script reads via the exported CSV link. No OAuth, no credentials. **Sheet URL provided**: see § 13 |
| Q5 | Storefront choice | No IP/Cloudflare/header-based detection. The first screen asks the shopper to choose Canada, USA, or International. That choice changes only the outbound product link, not sizing math, product lookup, cart, or price display. |
| Q6 | Size not in reference table | **Snap to nearest table row + show warning** — e.g. _"Snapped to EU 42 — your entered size was between charted values"_. User sees the snap and can adjust |
| Q7 | Sample products source | Live backend GraphQL for MVP, with a build-time catalog/search-KV resolver as the preferred hardened launch path |
| Q8 | Localization at launch | **English-only v1**. French (fr-CA) is a Phase 1.5 follow-up. UI string count is small (~30); retrofit is cheap. Calculator page still emits hreflang via `useCanadianSEO()` even before French content exists |
| Q9 | Analytics | Track **all four** event categories — see § 11.3 below |

### 11.2 Technical audit items (blocking, dev-owned — not client decisions)

These audits should run before launch hardening. Q11 decides the Canadian URL resolver source; Q12 decides whether the current backend attribute filter is enough or whether a fallback query/build path is needed.

| # | Question | Blocks | Owner | Test |
|---|---|---|---|---|
| Q10 | Does `proskatersplace.com`'s WPGraphQL endpoint allow CORS from `proskatersplace.ca` origin? | Phase 4 (runtime GraphQL option) | Dev | Live check on May 26, 2026: yes, response includes `Access-Control-Allow-Origin: https://proskatersplace.ca`. Re-check before launch. If blocked later, move candidate lookup to build time or proxy through a server route. |
| Q11 | Which artifact gives the most reliable `.ca` product permalink map? | Phase 4 URL resolver | Dev | Compare product identity across generated routes, sitemap data, cached product data, and search/KV data. Pick the source with stable ID/SKU/slug coverage and emit a miss report. |
| Q12 | Does the backend support precise manufacturer + size filtering without a custom plugin? | Phase 4 candidate lookup | Dev | Live check on May 26, 2026: backend schema exposes `attributes` and the current MVP attribute query returns product nodes. Keep the custom `taxFilter` plugin as a contingency only if this filter breaks or produces unreliable matches. |

### 11.3 Analytics event schema (Q9 resolution)

All four event categories tracked. Use existing analytics layer (confirm wiring during Phase 3).

| Event name | Fires when | Payload |
|---|---|---|
| `calc_step_advance` | User moves from step N to step N+1 | `{ from: N, to: N+1, durationMs }` |
| `calc_reference_selected` | Step 2 brand chosen | `{ category, brandId, brandName }` |
| `calc_target_selected` | Step 5 brand chosen | `{ intent, brandId, brandName, resolvedMm }` |
| `calc_recommendation` | Step 6 result rendered | `{ referenceBrandId, referenceSize, resolvedMm, targetBrandId, recommendedLabel }` |
| `calc_storefront_selected` | Shopper chooses Canada, USA, or International | `{ storefrontChoice }` |
| `calc_price_reveal_click` | "Click to find price" badge clicked | `{ storefrontChoice, storeBaseUrl, targetBrandId, productSlug }` |

Privacy note: no PII in any payload. The storefront choice is user-selected and must not include IP address, inferred location, cart session, or checkout identifiers.

---

## 12. Phase Timeline (Rough)

| Phase | Work | Estimate |
|---|---|---|
| 0 | Planning (this doc) + client sign-off | ✅ done (in review) |
| 0.5 | **Q10 + Q11 + Q12 technical audits** | 0.5-1 day |
| 1 | Chart extraction + backend catalog pull + Sheet scaffold + import script | **3-6 dev days** + client mm/fit review turnaround |
| 2 | Storefront selector + `useStorefrontSelection()` composable | 0.5 day |
| 3 | Component rewrite (6 step components + state machine) | 3-4 days |
| 4 | Product candidate resolver + `.ca` URL map + PriceRevealCard + error states + miss reports | 1.5-2.5 days |
| 5 | Migration + SEO + a11y + OG asset + launch | 1 day |
| **Total dev** | | **~10-14 dev days** |
| **Wall-clock** | | gated by client Sheet-fill turnaround (Phase 1 gap-fill) and asset design (OG image) |

**Critical path**: Phase 1 extraction and review. The client is working on mm values in the Sheet, but the engineering path should aggressively prefill from chart vision/OCR and backend catalog pulls so client review is correction-focused, not blank-sheet transcription. Phases 2 + 3 can run in parallel against partial validated JSON.

**Out-of-band work to start early**:
- Confirm error-monitoring wiring (Sentry or equivalent — TBD whether this project has it). The Step 6 GraphQL failures need somewhere to log.
- Design 1200×630 OG image for `/images/roller-skates-size-calculator.jpg`.

---

## 13. Source of Truth References

- **PRD / spec / UX flow**: [`docs/size-calulator-2-upgrade.md`](./size-calulator-2-upgrade.md) — June 2026 user path is canonical
- **Client Google Sheet (data entry)**: [Master Sizing Sheet](https://docs.google.com/spreadsheets/d/1j4XDYpStEpGmhGGlV9aTJmL9BD3iQfBCk0IwRsx_LNg/edit?usp=sharing) — two tabs (Reference Brands + Carried Brands), public-read CSV exports feed the importer
- **Current MVP implementation**: `pages/roller-skates-size-calculator.vue`, `components/SizeCalculator/`, `composables/useCalculator.ts`, `composables/useRegion.ts`, and `composables/useCalculatorProducts.ts`
- **Launch correction**: replace `useRegion.ts` / `/api/region.json` calculator usage with `useStorefrontSelection()` and a Canada / USA / International selector. Keep IP middleware out of the calculator flow.
- **Legacy implementation / migration target**: `pages/inline-skates-size-calculator.vue` — to be redirected or removed during Phase 5
- **Raw sizing chart source files**: [`data/calculator-data/`](../data/calculator-data/) — 17 files
- **Existing JSON patterns**: [`data/brand-master-list.json`](../data/brand-master-list.json), [`data/product-routes.json`](../data/product-routes.json)
- **Routing reference**: [`pages/search.vue`](../pages/search.vue)
- **SEO composable**: [`composables/useCanadianSEO.ts`](../composables/useCanadianSEO.ts)
- **Build config**: [`nuxt.config.ts`](../nuxt.config.ts) (route rules at L246-L275)
