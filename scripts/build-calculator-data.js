const fs = require('fs');
const path = require('path');

const SHEET_ID = process.env.CALCULATOR_SHEET_ID || '1j4XDYpStEpGmhGGlV9aTJmL9BD3iQfBCk0IwRsx_LNg';
const REFERENCE_SHEET_NAME = process.env.CALCULATOR_REFERENCE_SHEET_NAME || 'Reference Brands';
const CARRIED_SHEET_NAME = process.env.CALCULATOR_CARRIED_SHEET_NAME || 'Carried Brands';
const REFERENCE_GID = process.env.CALCULATOR_REFERENCE_GID || '0';
const CARRIED_GID = process.env.CALCULATOR_CARRIED_GID || '902001';

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'calculator-data');
const TYPES_DIR = path.join(process.cwd(), 'types');
const FIT_OFFSETS_FILE = path.join(OUTPUT_DIR, 'brand-fit-offsets.json');

// Per-brand fit offset (mm) applied to the user's foot length before matching the target
// brand's ranges. Sourced from a committed fallback file (chart-derived, vetted) and
// overridable per-row via the optional "Fit Offset (mm)" sheet column. Positive = runs small.
function loadFitOffsets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FIT_OFFSETS_FILE, 'utf8'));
    return parsed.offsets || {};
  } catch {
    return {};
  }
}

const REFERENCE_CATEGORIES = new Set(['inline_skates', 'roller_skates', 'ice_skates', 'sports_shoes']);
const CARRIED_CATEGORIES = new Set(['inline_skates', 'roller_skates', 'ski_boots']);
const WIDTH_PROFILES = new Set(['narrow', 'average', 'wide']);

const requiredReferenceHeaders = ['Brand Name', 'Category', 'mm', 'EU', 'US Men', 'US Women', 'UK'];
const requiredCarriedHeaders = [
  'Brand Name',
  'Product Category',
  'Width Profile',
  'GraphQL Brand Slug',
  'GraphQL Category Slug',
  'mm Min',
  'mm Max',
  'Recommended Label',
  'Size Attribute Value',
];

function csvExportUrl(gid, sheetName) {
  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }

  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchCsv(gid, sheetName) {
  const response = await fetch(csvExportUrl(gid, sheetName));
  const text = await response.text();

  if (!response.ok || /^<!doctype html|^<html/i.test(text.trim())) {
    throw new Error(`Could not read "${sheetName}" from the calculator spreadsheet. Confirm it is shared for CSV export.`);
  }

  return text;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = '';
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (insideQuotes && character === '"' && nextCharacter === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (!insideQuotes && character === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += character;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normaliseHeader(header) {
  return header.trim().replace(/\s+/g, ' ');
}

function rowsFromCsv(csvText, requiredHeaders, sheetName) {
  const parsedRows = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (!parsedRows.length) {
    throw new Error(`"${sheetName}" has no rows.`);
  }

  const headers = parsedRows[0].map(normaliseHeader);
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`"${sheetName}" is missing required header "${header}".`);
    }
  }

  return parsedRows
    .slice(1)
    .map((row, rowIndex) => {
      const record = {__rowNumber: rowIndex + 2};
      headers.forEach((header, columnIndex) => {
        record[header] = (row[columnIndex] || '').trim();
      });
      return record;
    })
    .filter((record) => Object.entries(record).some(([key, value]) => key !== '__rowNumber' && value !== ''));
}

function numberValue(value, label, rowNumber, required = true) {
  if (value === '' || value === undefined) {
    if (!required) return undefined;
    throw new Error(`Row ${rowNumber}: "${label}" is required.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: "${label}" must be numeric.`);
  }

  return parsed;
}

function integerValue(value, label, rowNumber) {
  const parsed = numberValue(value, label, rowNumber);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Row ${rowNumber}: "${label}" must be an integer.`);
  }
  return parsed;
}

// US Youth sizes are alphanumeric (US kids scale): "8C".."13C" for toddler/child
// and "1Y".."13Y" for youth. Stored as a normalized uppercase string. A bare number
// (e.g. "3") is accepted and normalized as a youth size ("3Y").
function youthValue(value, rowNumber) {
  if (value === '' || value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d+(?:\.5)?)(C|Y)?$/);
  if (!match) {
    throw new Error(`Row ${rowNumber}: "US Youth" must be a US kids size like "8C", "1Y", or "3".`);
  }
  return match[2] ? normalized : `${match[1]}Y`;
}

function slugForId(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildBrandId(prefix, brandName, index) {
  return `${prefix}_${slugForId(brandName)}_${String(index + 1).padStart(3, '0')}`;
}

// Groups rows by `nameField`, optionally also splitting on `extraKeyFields`. Carried brands
// are grouped by Brand Name + Product Category so a brand we sell in two forms (e.g. Powerslide
// or MYFIT in both inline and roller skates) becomes one entry per category, not a merged group.
function groupedRows(rows, nameField, extraKeyFields = []) {
  const groups = [];
  const indexByKey = new Map();

  for (const row of rows) {
    const name = row[nameField];
    if (!name) {
      throw new Error(`Row ${row.__rowNumber}: "${nameField}" is required.`);
    }

    const key = [name.toLowerCase(), ...extraKeyFields.map((field) => (row[field] || '').toLowerCase())].join('||');
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({name, rows: []});
    }

    groups[indexByKey.get(key)].rows.push(row);
  }

  return groups;
}

function buildReferenceData(rows) {
  const brandGroups = groupedRows(rows, 'Brand Name');

  const brands = brandGroups.map((group, brandIndex) => {
    const firstRow = group.rows[0];
    const category = firstRow.Category;

    if (!REFERENCE_CATEGORIES.has(category)) {
      throw new Error(`Row ${firstRow.__rowNumber}: Category "${category}" is not valid.`);
    }

    const sizes = group.rows
      .map((row) => {
        if (row.Category !== category) {
          throw new Error(`Row ${row.__rowNumber}: A reference brand cannot mix categories.`);
        }

        const mm = integerValue(row.mm, 'mm', row.__rowNumber);
        const eu = numberValue(row.EU, 'EU', row.__rowNumber, false);
        const usMen = numberValue(row['US Men'], 'US Men', row.__rowNumber, false);
        const usWomen = numberValue(row['US Women'], 'US Women', row.__rowNumber, false);
        // US Youth uses the alphanumeric US kids scale (e.g. "8C"..."13C", "1Y"), so it is
        // stored as a normalized string rather than a number.
        const usYouth = youthValue(row['US Youth'], row.__rowNumber);
        const uk = numberValue(row.UK, 'UK', row.__rowNumber, false);

        if ([eu, usMen, usWomen, usYouth, uk].every((value) => value === undefined)) {
          throw new Error(`Row ${row.__rowNumber}: at least one of EU, US Men, US Women, US Youth, or UK is required.`);
        }

        return {
          mm,
          ...(eu !== undefined ? {eu} : {}),
          ...(usMen !== undefined ? {usMen} : {}),
          ...(usWomen !== undefined ? {usWomen} : {}),
          ...(usYouth !== undefined ? {usYouth} : {}),
          ...(uk !== undefined ? {uk} : {}),
        };
      })
      .sort((first, second) => first.mm - second.mm);

    return {
      id: buildBrandId('ref', group.name, brandIndex),
      name: group.name,
      category,
      ...(firstRow['Official Sizing URL'] ? {officialSizingUrl: firstRow['Official Sizing URL']} : {}),
      sizes,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    brands,
  };
}

function buildCarriedData(rows) {
  const brandGroups = groupedRows(rows, 'Brand Name', ['Product Category']);
  const fitOffsets = loadFitOffsets();

  const brands = brandGroups.map((group, brandIndex) => {
    const firstRow = group.rows[0];
    const productCategory = firstRow['Product Category'];
    const widthProfile = firstRow['Width Profile'];
    const brandSlug = firstRow['GraphQL Brand Slug'];
    const categorySlug = firstRow['GraphQL Category Slug'];

    // Optional per-row "Fit Offset (mm)" sheet column overrides the committed fallback.
    const sheetOffsetRaw = firstRow['Fit Offset (mm)'];
    const sheetOffset = sheetOffsetRaw === undefined || sheetOffsetRaw === '' ? undefined : Number(sheetOffsetRaw);
    if (sheetOffset !== undefined && !Number.isFinite(sheetOffset)) {
      throw new Error(`Row ${firstRow.__rowNumber}: "Fit Offset (mm)" must be numeric.`);
    }
    const fitOffsetMm = sheetOffset !== undefined ? sheetOffset : fitOffsets[`${brandSlug}|${productCategory}`] || 0;

    if (!CARRIED_CATEGORIES.has(productCategory)) {
      throw new Error(`Row ${firstRow.__rowNumber}: Product Category "${productCategory}" is not valid.`);
    }
    if (!WIDTH_PROFILES.has(widthProfile)) {
      throw new Error(`Row ${firstRow.__rowNumber}: Width Profile "${widthProfile}" is not valid.`);
    }
    if (!brandSlug || !categorySlug) {
      throw new Error(`Row ${firstRow.__rowNumber}: GraphQL brand and category slugs are required.`);
    }

    const sizeRanges = group.rows
      .map((row) => {
        if (
          row['Product Category'] !== productCategory ||
          row['Width Profile'] !== widthProfile ||
          row['GraphQL Brand Slug'] !== brandSlug ||
          row['GraphQL Category Slug'] !== categorySlug
        ) {
          throw new Error(`Row ${row.__rowNumber}: carried brand metadata must stay consistent across all rows for "${group.name}".`);
        }

        const mmMin = integerValue(row['mm Min'], 'mm Min', row.__rowNumber);
        const mmMax = integerValue(row['mm Max'], 'mm Max', row.__rowNumber);
        if (mmMin > mmMax) {
          throw new Error(`Row ${row.__rowNumber}: mm Min must be less than or equal to mm Max.`);
        }

        if (!row['Recommended Label'] || !row['Size Attribute Value']) {
          throw new Error(`Row ${row.__rowNumber}: Recommended Label and Size Attribute Value are required.`);
        }

        return {
          mmMin,
          mmMax,
          recommendedLabel: row['Recommended Label'],
          sizeAttributeValue: row['Size Attribute Value'],
        };
      })
      .sort((first, second) => first.mmMin - second.mmMin);

    for (let index = 1; index < sizeRanges.length; index += 1) {
      if (sizeRanges[index].mmMin <= sizeRanges[index - 1].mmMax) {
        throw new Error(`"${group.name}" has overlapping ranges around ${sizeRanges[index].mmMin}mm.`);
      }
    }

    return {
      id: buildBrandId('car', group.name, brandIndex),
      name: group.name,
      productCategory,
      widthProfile,
      widthDisclaimer: firstRow['Width Disclaimer Text'] || '',
      fitOffsetMm,
      graphqlLookup: {
        productAttributeBrandSlug: brandSlug,
        categorySlug,
      },
      sizeRanges,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    brands,
  };
}

function validateMinimumDataset(referenceData, carriedData) {
  for (const category of REFERENCE_CATEGORIES) {
    if (!referenceData.brands.some((brand) => brand.category === category)) {
      throw new Error(`Reference data must include at least one "${category}" brand.`);
    }
  }

  for (const category of CARRIED_CATEGORIES) {
    if (!carriedData.brands.some((brand) => brand.productCategory === category)) {
      throw new Error(`Carried data must include at least one "${category}" brand.`);
    }
  }

  const sportsShoeRows = referenceData.brands.filter((brand) => brand.category === 'sports_shoes').flatMap((brand) => brand.sizes.map((size) => size.mm));

  if (!sportsShoeRows.includes(165) || !sportsShoeRows.includes(335)) {
    throw new Error('Sports-shoe reference data must cover the 165-335mm range.');
  }
}

function writeJson(fileName, data) {
  fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function writeTypesFile() {
  fs.mkdirSync(TYPES_DIR, {recursive: true});
  fs.writeFileSync(
    path.join(TYPES_DIR, 'calculator-data.ts'),
    `export type ReferenceCategory = 'inline_skates' | 'roller_skates' | 'ice_skates' | 'sports_shoes';
export type ProductCategory = 'inline_skates' | 'roller_skates' | 'ski_boots';
export type WidthProfile = 'narrow' | 'average' | 'wide';

export interface CalculatorReferenceSize {
  mm: number;
  eu?: number;
  usMen?: number;
  usWomen?: number;
  usYouth?: string;
  uk?: number;
}

export interface CalculatorReferenceBrand {
  id: string;
  name: string;
  category: ReferenceCategory;
  officialSizingUrl?: string;
  sizes: CalculatorReferenceSize[];
}

export interface CalculatorCarriedSizeRange {
  mmMin: number;
  mmMax: number;
  recommendedLabel: string;
  sizeAttributeValue: string;
}

export interface CalculatorCarriedBrand {
  id: string;
  name: string;
  productCategory: ProductCategory;
  widthProfile: WidthProfile;
  widthDisclaimer: string;
  /** Foot-length adjustment (mm) for brand fit. Positive = brand runs small (recommend larger). */
  fitOffsetMm: number;
  graphqlLookup: {
    productAttributeBrandSlug: string;
    categorySlug: string;
  };
  sizeRanges: CalculatorCarriedSizeRange[];
}

export interface CalculatorReferenceBrandsData {
  schemaVersion: 1;
  generatedAt: string;
  brands: CalculatorReferenceBrand[];
}

export interface CalculatorCarriedBrandsData {
  schemaVersion: 1;
  generatedAt: string;
  brands: CalculatorCarriedBrand[];
}
`,
  );
}

async function main() {
  const [referenceCsv, carriedCsv] = await Promise.all([fetchCsv(REFERENCE_GID, REFERENCE_SHEET_NAME), fetchCsv(CARRIED_GID, CARRIED_SHEET_NAME)]);

  const referenceRows = rowsFromCsv(referenceCsv, requiredReferenceHeaders, REFERENCE_SHEET_NAME);
  const carriedRows = rowsFromCsv(carriedCsv, requiredCarriedHeaders, CARRIED_SHEET_NAME);
  const referenceData = buildReferenceData(referenceRows);
  const carriedData = buildCarriedData(carriedRows);

  validateMinimumDataset(referenceData, carriedData);
  writeJson('reference-brands.json', referenceData);
  writeJson('carried-brands.json', carriedData);
  writeTypesFile();

  console.log(`[calculator-data] Wrote ${referenceData.brands.length} reference brands and ${carriedData.brands.length} carried brands.`);
}

main().catch((error) => {
  console.error(`[calculator-data] ${error.message}`);
  process.exit(1);
});
