// scripts/build-calculator-carried.js
//
// Builds the "Carried Brands" tab for the size calculator from the LIVE WooCommerce backend.
// The product cache (data/products-list.json) does not include attributes, so this queries
// WPGraphQL directly for every inline-skate and roller-skate product, reads each product's
// Brand (pa_manufacturer) and Size (pa_size) attribute terms, and aggregates which EU sizes
// each brand we stock actually carries.
//
// For each (brand, category) it emits one carried size-range row per single EU size:
//   - mm Min / mm Max  -> from the GENERIC EU->mm crosswalk (Generic Sports Shoe in
//                          reference-brands.json), centred on the EU size +/- 2mm. This is the
//                          same mm axis the reference rows use, so baselines line up.
//   - Recommended Label -> "EU n" plus US Men / US Women from the Rollerblade crosswalk when known.
//   - Size Attribute Value -> the pa_size term slug verbatim (e.g. "42eu") — matches the runtime
//                          lookup in server/api/calculator-products.post.ts (sizeVariants()).
//   - Width Profile / Disclaimer -> inferred from brand copy in data/brand-master-list.json
//                          (keywords), defaulting to "average"; every brand is listed in the
//                          review report for human confirmation.
//
// Output:
//   data/calculator-data/carried-brands.import.csv      (paste into the "Carried Brands" tab)
//   data/calculator-data/calculator-carried-review.json (per-brand width inference + flags)
//
// Then paste the CSV into the sheet and run `node scripts/build-calculator-data.js` to rebuild JSON.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'calculator-data');
const REFERENCE_JSON_PATH = path.join(DATA_DIR, 'reference-brands.json');
const EXISTING_CARRIED_PATH = path.join(DATA_DIR, 'carried-brands.json');
const BRAND_MASTER_PATH = path.join(process.cwd(), 'data', 'brand-master-list.json');
const OUT_CSV_PATH = path.join(DATA_DIR, 'carried-brands.import.csv');
const OUT_REVIEW_PATH = path.join(DATA_DIR, 'calculator-carried-review.json');

const GRAPHQL_ENDPOINT =
  process.env.CALCULATOR_GRAPHQL_ENDPOINT || process.env.NUXT_PUBLIC_CALCULATOR_GRAPHQL_ENDPOINT || 'https://proskatersplace.com/graphql';

// WooCommerce category slug -> calculator productCategory enum.
// Use the broad "inline-skating" / "roller-skating" buckets, not the narrow "inline-skates"
// term: real skates are split across sub-buckets (inline-boots, off-road-skates, etc.) and many
// boots are only in the broad bucket. The emitted slug is also what the runtime product lookup
// (server/api/calculator-products.post.ts -> categoryIn) queries, so a broad bucket finds more.
const CATEGORIES = [
  {categorySlug: 'inline-skating', productCategory: 'inline_skates'},
  {categorySlug: 'roller-skating', productCategory: 'roller_skates'},
];

const PAGE_SIZE = 100;
const MAX_PAGES = 60; // safety cap
const MIN_SIZES_PER_BRAND = 4; // a real skate size run — filters out accessories/wheels noise
const CARRIED_HEADERS = [
  'Brand Name',
  'Product Category',
  'Width Profile',
  'Width Disclaimer Text',
  'GraphQL Brand Slug',
  'GraphQL Category Slug',
  'mm Min',
  'mm Max',
  'Recommended Label',
  'Size Attribute Value',
];

// --- GraphQL ------------------------------------------------------------------------------------

const PRODUCTS_QUERY = `
  query CalcCarried($category: [String], $first: Int!, $after: String) {
    products(first: $first, after: $after, where: { categoryIn: $category, status: "publish", orderby: { field: DATE, order: DESC } }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        ... on ProductWithAttributes { attributes { nodes { label options } } }
      }
    }
  }
`;

const MANUFACTURERS_QUERY = `
  query CalcManufacturers($first: Int!, $after: String) {
    allPaManufacturer(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { name slug }
    }
  }
`;

async function gql(query, variables) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: new URL(GRAPHQL_ENDPOINT).origin},
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json();
  if (json.errors) {
    const fatal = json.errors.filter((e) => !/Cannot query field|inline fragment/.test(e.message));
    if (fatal.length) throw new Error(`GraphQL: ${fatal.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

async function fetchManufacturerNames() {
  const map = {};
  let after = null;
  let hasNext = true;
  while (hasNext) {
    const data = await gql(MANUFACTURERS_QUERY, {first: 100, after});
    const conn = data?.allPaManufacturer;
    for (const node of conn?.nodes || []) map[node.slug] = node.name;
    hasNext = conn?.pageInfo?.hasNextPage;
    after = conn?.pageInfo?.endCursor;
  }
  return map;
}

function attrOptions(node, label) {
  const attr = node?.attributes?.nodes?.find((a) => (a.label || '').toLowerCase() === label.toLowerCase());
  return attr?.options || [];
}

// brandSlug -> { category -> Set(sizeSlug) }
async function fetchCarriedSizes() {
  const byBrand = new Map();

  for (const {categorySlug, productCategory} of CATEGORIES) {
    let after = null;
    let hasNext = true;
    let pages = 0;
    let productCount = 0;

    while (hasNext && pages < MAX_PAGES) {
      const data = await gql(PRODUCTS_QUERY, {category: [categorySlug], first: PAGE_SIZE, after});
      const conn = data?.products;
      for (const node of conn?.nodes || []) {
        productCount += 1;
        const brands = attrOptions(node, 'Brand');
        const sizes = attrOptions(node, 'Size').filter((s) => /^\d+(-5)?eu$/.test(s));
        if (!brands.length || !sizes.length) continue;
        for (const brandSlug of brands) {
          if (!byBrand.has(brandSlug)) byBrand.set(brandSlug, new Map());
          const catMap = byBrand.get(brandSlug);
          if (!catMap.has(productCategory)) catMap.set(productCategory, {categorySlug, sizes: new Set()});
          const entry = catMap.get(productCategory);
          for (const s of sizes) entry.sizes.add(s);
        }
      }
      hasNext = conn?.pageInfo?.hasNextPage;
      after = conn?.pageInfo?.endCursor;
      pages += 1;
    }
    console.log(`[carried] ${categorySlug}: scanned ${productCount} products across ${pages} page(s).`);
  }

  return byBrand;
}

// --- Crosswalks (mm + US labels) ----------------------------------------------------------------

function loadCrosswalks() {
  const reference = JSON.parse(fs.readFileSync(REFERENCE_JSON_PATH, 'utf8'));
  const generic = reference.brands.find((b) => b.name === 'Generic Sports Shoe');
  const usSource = reference.brands.find((b) => b.name === 'Rollerblade') || generic;
  if (!generic) throw new Error('Generic Sports Shoe not found in reference-brands.json. Run build-calculator-data.js first.');

  const euMm = generic.sizes
    .filter((s) => typeof s.eu === 'number' && typeof s.mm === 'number')
    .map((s) => ({eu: s.eu, mm: s.mm}))
    .sort((a, b) => a.eu - b.eu);

  const euUs = new Map();
  for (const s of usSource?.sizes || []) {
    if (typeof s.eu === 'number' && !euUs.has(s.eu)) euUs.set(s.eu, {usMen: s.usMen, usWomen: s.usWomen});
  }

  return {euMm, euUs};
}

function mmForEu(euMm, eu) {
  let best = null;
  let bestDist = Infinity;
  for (const pair of euMm) {
    const dist = Math.abs(pair.eu - eu);
    if (dist < bestDist) {
      best = pair;
      bestDist = dist;
    }
  }
  return best ? {mm: best.mm, snapped: bestDist > 0.001} : null;
}

// "42eu" -> 42, "35-5eu" -> 35.5
function euFromSlug(slug) {
  const m = slug.match(/^(\d+)(?:-(\d))?eu$/);
  if (!m) return null;
  return parseInt(m[1], 10) + (m[2] ? 0.5 : 0);
}

function recommendedLabel(eu, euUs) {
  const us = euUs.get(eu);
  const parts = [`EU ${eu}`];
  if (us && us.usMen !== undefined) parts.push(`US Men ${us.usMen}`);
  if (us && us.usWomen !== undefined) parts.push(`US Women ${us.usWomen}`);
  return parts.join(' / ');
}

// --- Width profile inference --------------------------------------------------------------------

function normaliseBrandKey(name) {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(skates?|brand|inline|roller)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function buildBrandCopyIndex() {
  if (!fs.existsSync(BRAND_MASTER_PATH)) return new Map();
  const master = JSON.parse(fs.readFileSync(BRAND_MASTER_PATH, 'utf8'));
  const index = new Map();
  for (const brand of master.brands || []) {
    const description = (brand.taxonomy && brand.taxonomy.description) || brand.description || '';
    if (brand.name) index.set(normaliseBrandKey(brand.name), description);
    if (brand.slug) index.set(normaliseBrandKey(brand.slug), description);
  }
  return index;
}

const WIDE_RE = /\b(wide|wider|roomy|generous|spacious|high[- ]?volume)\b/i;
const NARROW_RE = /\b(narrow|snug|slim|low[- ]?volume|tight[- ]?fit|tapered)\b/i;

// Width profiles the boss already set in the live carried-brands.json are authoritative —
// they reflect PSP retail knowledge that the generic SEO brand copy does not contain.
function loadExistingProfiles() {
  if (!fs.existsSync(EXISTING_CARRIED_PATH)) return new Map();
  const existing = JSON.parse(fs.readFileSync(EXISTING_CARRIED_PATH, 'utf8'));
  const map = new Map();
  for (const brand of existing.brands || []) {
    map.set(normaliseBrandKey(brand.name), {
      widthProfile: brand.widthProfile,
      widthDisclaimer: brand.widthDisclaimer || '',
    });
  }
  return map;
}

function inferWidth(brandName, brandSlug, copyIndex, existingProfiles) {
  const existing = existingProfiles.get(normaliseBrandKey(brandName));
  if (existing && existing.widthProfile) {
    return {widthProfile: existing.widthProfile, widthDisclaimer: existing.widthDisclaimer, confidence: 'existing-sheet', source: 'existing-sheet'};
  }
  const copy = copyIndex.get(normaliseBrandKey(brandName)) || copyIndex.get(normaliseBrandKey(brandSlug)) || '';
  if (WIDE_RE.test(copy)) return {widthProfile: 'wide', widthDisclaimer: '', confidence: 'inferred', source: 'brand-copy'};
  if (NARROW_RE.test(copy)) return {widthProfile: 'narrow', widthDisclaimer: '', confidence: 'inferred', source: 'brand-copy'};
  return {widthProfile: 'average', widthDisclaimer: '', confidence: 'default', source: copy ? 'brand-copy' : 'none'};
}

// --- CSV ----------------------------------------------------------------------------------------

function csvCell(value) {
  if (value === undefined || value === null || value === '') return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
const csvRow = (cells) => cells.map(csvCell).join(',');

// --- Main ---------------------------------------------------------------------------------------

async function main() {
  console.log(`[carried] Backend: ${GRAPHQL_ENDPOINT}`);
  const [manufacturerNames, byBrand, {euMm, euUs}, copyIndex, existingProfiles] = await Promise.all([
    fetchManufacturerNames(),
    fetchCarriedSizes(),
    Promise.resolve(loadCrosswalks()),
    Promise.resolve(buildBrandCopyIndex()),
    Promise.resolve(loadExistingProfiles()),
  ]);

  const csvLines = [csvRow(CARRIED_HEADERS)];
  const review = [];
  let brandCount = 0;
  let rowCount = 0;

  // Stable order: brand name, then category.
  const brandSlugs = [...byBrand.keys()].sort((a, b) =>
    (manufacturerNames[a] || a).localeCompare(manufacturerNames[b] || b),
  );

  for (const brandSlug of brandSlugs) {
    const brandName = manufacturerNames[brandSlug] || brandSlug;
    const catMap = byBrand.get(brandSlug);

    for (const [productCategory, {categorySlug, sizes}] of catMap) {
      const euList = [...sizes]
        .map((slug) => ({slug, eu: euFromSlug(slug)}))
        .filter((x) => x.eu !== null)
        .sort((a, b) => a.eu - b.eu);

      if (euList.length < MIN_SIZES_PER_BRAND) {
        review.push({brand: brandName, slug: brandSlug, productCategory, skipped: true, reason: `only ${euList.length} EU size(s) — below ${MIN_SIZES_PER_BRAND} threshold (likely accessory)`});
        continue;
      }

      const width = inferWidth(brandName, brandSlug, copyIndex, existingProfiles);
      const flags = [];
      brandCount += 1;

      for (const {slug, eu} of euList) {
        const mm = mmForEu(euMm, eu);
        if (!mm) {
          flags.push(`no mm for EU ${eu}`);
          continue;
        }
        if (mm.snapped) flags.push(`EU ${eu} snapped to nearest charted EU`);
        csvLines.push(
          csvRow([
            brandName,
            productCategory,
            width.widthProfile,
            width.widthDisclaimer || '', // blank => calculator generates default copy from the profile
            brandSlug,
            categorySlug,
            mm.mm - 2,
            mm.mm + 2,
            recommendedLabel(eu, euUs),
            slug,
          ]),
        );
        rowCount += 1;
      }

      review.push({
        brand: brandName,
        slug: brandSlug,
        productCategory,
        sizes: euList.length,
        widthProfile: width.widthProfile,
        widthConfidence: width.confidence,
        widthSource: width.source,
        flags,
      });
    }
  }

  fs.writeFileSync(OUT_CSV_PATH, `${csvLines.join('\n')}\n`);
  fs.writeFileSync(
    OUT_REVIEW_PATH,
    `${JSON.stringify({generatedAt: new Date().toISOString(), backend: GRAPHQL_ENDPOINT, brandsEmitted: brandCount, rows: rowCount, review}, null, 2)}\n`,
  );

  console.log(`[carried] Wrote ${rowCount} size rows for ${brandCount} brand/category pairs -> ${path.relative(process.cwd(), OUT_CSV_PATH)}`);
  const defaulted = review.filter((r) => !r.skipped && r.widthConfidence === 'default').length;
  const skipped = review.filter((r) => r.skipped).length;
  const kept = review.filter((r) => r.widthConfidence === 'existing-sheet').length;
  const inferred = review.filter((r) => r.widthConfidence === 'inferred').length;
  console.log(`[carried] Width: ${kept} kept from existing sheet, ${inferred} inferred from copy, ${defaulted} defaulted to "average" (confirm in the sheet).`);
  console.log(`[carried] Skipped ${skipped} brand/category pair(s) below the size threshold. See ${path.relative(process.cwd(), OUT_REVIEW_PATH)}.`);
}

main().catch((error) => {
  console.error(`[carried] ${error.message}`);
  process.exit(1);
});
