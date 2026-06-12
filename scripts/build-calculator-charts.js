// scripts/build-calculator-charts.js
//
// Turns the brand sizing-chart assets in data/calculator-data/ into Reference-tab rows
// for the size calculator's Google Sheet.
//
// Pipeline:
//   chart-extractions.json (vision-transcribed cross-unit data, committed + auditable)
//     + reference-brands.json (the generic EU->mm crosswalk = "Generic Sports Shoe")
//     -> data/calculator-data/reference-brands.import.csv   (paste into the "Reference Brands" tab)
//     -> data/calculator-data/brand-size-map.json           (per-brand EU->chart-mm, audit/byproduct)
//     -> data/calculator-data/chart-extractions.review.json (confidence + flags for human review)
//
// Why mm comes from the GENERIC crosswalk and not each chart's own mm:
//   The reference mm axis must line up with the carried-brand mm ranges (scripts/build-calculator-carried.js
//   builds those off the same generic EU->mm table). Anchoring every brand on EU -> generic mm guarantees
//   "EU 42 in brand X" resolves to the same millimetre baseline the carried ranges were built on.
//   Each chart still contributes its own EU<->US/UK mapping, which is the real per-brand value.
//
// Default run uses the committed chart-extractions.json (free, reproducible, offline).
// `--rescan` re-reads the .jpg/.png chart images through the Anthropic vision API and rewrites
// chart-extractions.json (PDF/XLSX/committed entries are preserved). Requires ANTHROPIC_API_KEY.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'calculator-data');
const EXTRACTIONS_PATH = path.join(DATA_DIR, 'chart-extractions.json');
const REFERENCE_JSON_PATH = path.join(DATA_DIR, 'reference-brands.json');
const OUT_CSV_PATH = path.join(DATA_DIR, 'reference-brands.import.csv');
const OUT_SIZE_MAP_PATH = path.join(DATA_DIR, 'brand-size-map.json');
const OUT_REVIEW_PATH = path.join(DATA_DIR, 'chart-extractions.review.json');

const REFERENCE_CATEGORIES = new Set(['inline_skates', 'roller_skates', 'ice_skates', 'sports_shoes']);
const REFERENCE_HEADERS = ['Brand Name', 'Category', 'Official Sizing URL', 'mm', 'EU', 'US Men', 'US Women', 'US Youth', 'UK'];

// --- Generic EU -> mm crosswalk (single mm axis, shared with carried-brand ranges) ----------------

function loadGenericCrosswalk() {
  const reference = JSON.parse(fs.readFileSync(REFERENCE_JSON_PATH, 'utf8'));
  const source =
    reference.brands.find((b) => b.name === 'Generic Sports Shoe') ||
    reference.brands.find((b) => b.category === 'inline_skates'); // Rollerblade fallback

  if (!source) {
    throw new Error('Could not find a generic EU->mm source ("Generic Sports Shoe") in reference-brands.json. Run `node scripts/build-calculator-data.js` first.');
  }

  const pairs = source.sizes
    .filter((s) => typeof s.eu === 'number' && typeof s.mm === 'number')
    .map((s) => ({eu: s.eu, mm: s.mm}))
    .sort((a, b) => a.eu - b.eu);

  if (!pairs.length) {
    throw new Error(`Generic crosswalk source "${source.name}" has no usable EU/mm rows.`);
  }

  return {sourceName: source.name, pairs};
}

// mm for an EU value: exact match if charted, else the nearest charted EU.
function mmForEu(crosswalk, eu) {
  let best = null;
  let bestDist = Infinity;
  for (const pair of crosswalk.pairs) {
    const dist = Math.abs(pair.eu - eu);
    if (dist < bestDist) {
      best = pair;
      bestDist = dist;
    }
  }
  return best ? {mm: best.mm, snapped: bestDist > 0.001, chartedEu: best.eu} : null;
}

// --- CSV helpers ----------------------------------------------------------------------------------

function csvCell(value) {
  if (value === undefined || value === null || value === '') return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// --- Build ----------------------------------------------------------------------------------------

function buildReferenceRows(extractions, crosswalk) {
  const csvLines = [csvRow(REFERENCE_HEADERS)];
  const brandSizeMap = {};
  const review = [];
  let rowCount = 0;

  for (const chart of extractions.charts) {
    if (!REFERENCE_CATEGORIES.has(chart.category)) {
      throw new Error(`Chart "${chart.brand}" (${chart.sourceFile}) has invalid category "${chart.category}".`);
    }

    const flags = [];
    if (chart.confidence !== 'high') flags.push(`confidence=${chart.confidence}`);

    const euMm = {};
    let lastEu = -Infinity;

    for (const row of chart.rows) {
      if (typeof row.eu !== 'number') {
        throw new Error(`Chart "${chart.brand}" has a row without a numeric EU value.`);
      }
      if (row.eu <= lastEu) {
        flags.push(`EU not strictly increasing at ${row.eu}`);
      }
      lastEu = row.eu;

      const lookup = mmForEu(crosswalk, row.eu);
      if (!lookup) throw new Error(`No generic mm found for EU ${row.eu} (${chart.brand}).`);
      if (lookup.snapped) flags.push(`EU ${row.eu} snapped to generic EU ${lookup.chartedEu}`);

      const hasCrossUnit = ['usMen', 'usWomen', 'usYouth', 'uk'].some((k) => row[k] !== undefined) || true; // EU always present
      if (!hasCrossUnit) continue;

      csvLines.push(
        csvRow([
          chart.brand,
          chart.category,
          chart.officialSizingUrl || '',
          lookup.mm,
          row.eu,
          row.usMen,
          row.usWomen,
          row.usYouth,
          row.uk,
        ]),
      );
      rowCount += 1;

      if (row.mmChart !== undefined) euMm[row.eu] = row.mmChart;
    }

    if (Object.keys(euMm).length) {
      brandSizeMap[chart.brand] = {category: chart.category, sourceFile: chart.sourceFile, euToChartMm: euMm};
    }

    review.push({
      brand: chart.brand,
      category: chart.category,
      sourceFile: chart.sourceFile,
      confidence: chart.confidence,
      rows: chart.rows.length,
      notes: chart.notes || '',
      flags,
    });
  }

  return {csvLines, brandSizeMap, review, rowCount};
}

// --- Optional vision re-scan ----------------------------------------------------------------------

async function rescanImages(extractions) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('--rescan requires ANTHROPIC_API_KEY to be set.');
  const model = process.env.CALCULATOR_VISION_MODEL || 'claude-haiku-4-5-20251001';

  const prompt =
    'This image is a skate/footwear sizing chart. Extract every size row as strict JSON: ' +
    '{"rows":[{"eu":<number>,"usMen":<number|null>,"usWomen":<number|null>,"usYouth":<string|null>,"uk":<number|null>,"mmChart":<number|null>}]}. ' +
    'EU is the European size. mmChart is the foot length / mondopoint in millimetres (multiply cm by 10). ' +
    'Omit a field if the chart does not list it. Respond with JSON only, no prose.';

  for (const chart of extractions.charts) {
    const ext = path.extname(chart.sourceFile).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      console.log(`[charts] --rescan: skipping ${chart.sourceFile} (only .jpg/.png are re-scanned; keeping committed rows).`);
      continue;
    }
    const filePath = path.join(DATA_DIR, chart.sourceFile);
    const base64 = fs.readFileSync(filePath).toString('base64');
    const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {type: 'image', source: {type: 'base64', media_type: mediaType, data: base64}},
              {type: 'text', text: prompt},
            ],
          },
        ],
      }),
    });

    const json = await res.json();
    const text = json?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(`[charts] --rescan: no JSON returned for ${chart.sourceFile}, keeping committed rows.`);
      continue;
    }
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.rows) && parsed.rows.length) {
        chart.rows = parsed.rows.map((r) => {
          const clean = {eu: Number(r.eu)};
          for (const k of ['usMen', 'usWomen', 'uk', 'mmChart']) if (r[k] != null) clean[k] = Number(r[k]);
          if (r.usYouth != null) clean.usYouth = String(r.usYouth);
          return clean;
        });
        chart.confidence = 'rescanned';
        console.log(`[charts] --rescan: ${chart.sourceFile} -> ${chart.rows.length} rows.`);
      }
    } catch (e) {
      console.warn(`[charts] --rescan: failed to parse ${chart.sourceFile}: ${e.message}`);
    }
  }

  fs.writeFileSync(EXTRACTIONS_PATH, `${JSON.stringify(extractions, null, 2)}\n`);
  console.log(`[charts] --rescan: rewrote ${path.relative(process.cwd(), EXTRACTIONS_PATH)}.`);
}

async function main() {
  const extractions = JSON.parse(fs.readFileSync(EXTRACTIONS_PATH, 'utf8'));

  if (process.argv.includes('--rescan')) {
    await rescanImages(extractions);
  }

  const crosswalk = loadGenericCrosswalk();
  const {csvLines, brandSizeMap, review, rowCount} = buildReferenceRows(extractions, crosswalk);

  fs.writeFileSync(OUT_CSV_PATH, `${csvLines.join('\n')}\n`);
  fs.writeFileSync(OUT_SIZE_MAP_PATH, `${JSON.stringify(brandSizeMap, null, 2)}\n`);
  fs.writeFileSync(
    OUT_REVIEW_PATH,
    `${JSON.stringify({generatedAt: new Date().toISOString(), crosswalkSource: crosswalk.sourceName, brands: review}, null, 2)}\n`,
  );

  const flagged = review.filter((r) => r.flags.length);
  console.log(`[charts] Wrote ${rowCount} reference rows for ${extractions.charts.length} brands -> ${path.relative(process.cwd(), OUT_CSV_PATH)}`);
  console.log(`[charts] Generic mm axis: "${crosswalk.sourceName}".`);
  if (flagged.length) {
    console.log(`[charts] ${flagged.length} brand(s) need review:`);
    for (const r of flagged) console.log(`         - ${r.brand}: ${r.flags.join('; ')}`);
  }
}

main().catch((error) => {
  console.error(`[charts] ${error.message}`);
  process.exit(1);
});
