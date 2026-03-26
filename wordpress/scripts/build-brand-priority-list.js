#!/usr/bin/env node
/**
 * build-brand-priority-list.js
 *
 * TARGET: proskatersplace.com (US site) — primary market: USA, secondary: worldwide
 * NOTE:   The Nuxt/Vue frontend (proskatersplace.ca) is a separate Canadian project.
 *
 * Phase 1, Script 3 — Build the prioritized master list using DataForSEO as
 * primary data source (live keyword data) with the Semrush CSV as historical
 * baseline. This is the single source of truth for optimize-brand-page.js.
 *
 * Run order: 9 (requires Script 1 output: brand-pages-raw.json)
 * Tier: 1 — read-only, no WordPress writes
 *
 * Usage:
 *   node wordpress/scripts/build-brand-priority-list.js --dry-run
 *   node wordpress/scripts/build-brand-priority-list.js
 *   node wordpress/scripts/build-brand-priority-list.js --skip-dataforseo
 *   node wordpress/scripts/build-brand-priority-list.js --limit=20
 *   node wordpress/scripts/build-brand-priority-list.js --csv=path/to/alt.csv
 *
 * Input:  wordpress/data/brand-pages-raw.json (from Script 1)
 *         wordpress/docs/proskatersplace.com-us-2026-02-27-full.csv
 * Output: wordpress/data/brand-master-list.json
 *         wordpress/data/brand-master-list.csv
 *         wordpress/data/brand-keywords-full.json
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const {relatedKeywords, keywordsForSite} = require('./lib/dataforseo');

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error('ERROR: Missing BASE_URL in .env');
  process.exit(1);
}

// ─── Flags ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_DATAFORSEO = process.argv.includes('--skip-dataforseo');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const MAX_BRANDS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const CSV_ARG = process.argv.find((a) => a.startsWith('--csv='));
const OUTPUT_DIR_ARG = process.argv.find((a) => a.startsWith('--output-dir='));

const INPUT_PATH = path.resolve(__dirname, '../../data/brand-pages-raw.json');
const CSV_PATH = CSV_ARG ? path.resolve(process.cwd(), CSV_ARG.split('=')[1]) : path.resolve(__dirname, '../docs/proskatersplace.com-us-2026-02-27-full.csv');
const OUT_DIR = OUTPUT_DIR_ARG ? path.resolve(process.cwd(), OUTPUT_DIR_ARG.split('=')[1]) : path.resolve(__dirname, '../../data');

const OUTPUT_JSON = path.join(OUT_DIR, 'brand-master-list.json');
const OUTPUT_CSV = path.join(OUT_DIR, 'brand-master-list.csv');
const OUTPUT_KEYWORDS = path.join(OUT_DIR, 'brand-keywords-full.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hr() {
  console.log('─'.repeat(60));
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Safe string quote for CSV cells */
function csvCell(val) {
  const str = String(val === null || val === undefined ? '' : val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Step 1: Parse the Semrush CSV ───────────────────────────────────────────

function parseCSV(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.warn(`  ⚠️  CSV not found at ${csvPath} — skipping historical baseline`);
    return {rows: [], bySlug: {}};
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  const idx = {
    keyword: headers.indexOf('Keyword'),
    position: headers.indexOf('Position'),
    prevPosition: headers.indexOf('Previous position'),
    volume: headers.indexOf('Search Volume'),
    kd: headers.indexOf('Keyword Difficulty'),
    cpc: headers.indexOf('CPC'),
    url: headers.indexOf('URL'),
    traffic: headers.indexOf('Traffic'),
    intent: headers.indexOf('Keyword Intents'),
    posType: headers.indexOf('Position Type'),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;

    const getValue = (index) => (index >= 0 && cols[index] ? cols[index].replace(/^"|"$/g, '').trim() : '');

    rows.push({
      keyword: getValue(idx.keyword),
      position: parseInt(getValue(idx.position)) || 0,
      prevPosition: parseInt(getValue(idx.prevPosition)) || 0,
      volume: parseInt(getValue(idx.volume).replace(/,/g, '')) || 0,
      kd: parseInt(getValue(idx.kd)) || 0,
      cpc: parseFloat(getValue(idx.cpc)) || 0,
      url: getValue(idx.url),
      traffic: parseFloat(getValue(idx.traffic).replace(/,/g, '')) || 0,
      intent: getValue(idx.intent),
      posType: getValue(idx.posType),
    });
  }

  // Build index by brand slug (extract from /brand/slug/ URL pattern)
  const bySlug = {};
  for (const row of rows) {
    const brandMatch = row.url.match(/\/brand\/([^/?#]+)/);
    if (brandMatch) {
      const slug = brandMatch[1];
      if (!bySlug[slug]) bySlug[slug] = [];
      bySlug[slug].push(row);
    }
  }

  console.log(`  ✅  CSV parsed: ${rows.length} rows, ${Object.keys(bySlug).length} brand URLs found`);
  return {rows, bySlug, headerCount: headers.length};
}

// ─── Step 2: Extract brand name keywords from full CSV ────────────────────────

/**
 * Find all CSV rows where the keyword contains the brand name but
 * the ranking URL is NOT the brand page (cannibalization candidates).
 */
function findCannibalizationInCSV(brandSlug, brandName, allCsvRows) {
  if (!allCsvRows || allCsvRows.length === 0) return [];

  const brandKeywords = brandName
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 3); // e.g. ["chaya", "skates"]

  const brandUrl = `/brand/${brandSlug}`;

  return allCsvRows.filter((row) => {
    const kw = row.keyword.toLowerCase();
    // Keyword must contain at least one brand name word
    const matchesBrand = brandKeywords.some((word) => kw.includes(word));
    // URL must NOT be the brand page
    const isNotBrandPage = !row.url.includes(brandUrl);
    // Must have reasonable volume
    return matchesBrand && isNotBrandPage && row.volume > 0;
  });
}

// ─── Step 3: DataForSEO opportunity discovery ──────────────────────────────────

async function discoverOpportunityKeywords(brand) {
  const brandName = brand.name;
  const slug = brand.slug;

  const allItems = [];
  let totalCost = 0;

  // 1. Related keywords for the brand name
  try {
    const seedKeyword =
      brandName
        .toLowerCase()
        .replace(/\s+skates?$/i, '')
        .trim() + ' skates';
    process.stdout.write(`    🔍 Related keywords for "${seedKeyword}"...`);

    const related = await relatedKeywords(seedKeyword, {
      locationCode: 2840,
      depth: 1, // Keep depth low to avoid huge costs
      limit: 100,
      includeSerpInfo: true,
      orderBy: ['keyword_data.keyword_info.search_volume,desc'],
    });

    process.stdout.write(` ${related.items.length} found\n`);
    allItems.push(...related.items.map((item) => ({...item, source: 'related'})));
    totalCost += related.cost;

    await sleep(300);
  } catch (err) {
    process.stdout.write(` ⚠️  ${err.message}\n`);
  }

  // 2. Site-level keywords filtered for this brand
  try {
    process.stdout.write(`    🔍 Site keywords for "${brandName}"...`);

    const siteKws = await keywordsForSite('proskatersplace.com', {
      locationCode: 2840,
      limit: 100,
      includeSerpInfo: true,
      // Filter to keywords containing the brand name
      filters: ['keyword_data.keyword', 'like', `%${brandName.toLowerCase().split(' ')[0]}%`],
      orderBy: ['keyword_data.keyword_info.search_volume,desc'],
    });

    process.stdout.write(` ${siteKws.items.length} found\n`);
    allItems.push(...siteKws.items.map((item) => ({...item, source: 'site_keywords'})));
    totalCost += siteKws.cost;

    await sleep(300);
  } catch (err) {
    process.stdout.write(` ⚠️  ${err.message}\n`);
  }

  // Deduplicate by keyword
  const seen = new Set();
  const deduped = allItems.filter((item) => {
    const kw = item.keyword_data?.keyword || item.keyword;
    if (!kw || seen.has(kw)) return false;
    seen.add(kw);
    return true;
  });

  return {
    items: deduped.map((item) => ({
      keyword: item.keyword_data?.keyword || item.keyword,
      searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
      keywordDifficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || 0,
      cpc: item.keyword_data?.keyword_info?.cpc || 0,
      intent: item.keyword_data?.search_intent_info?.main_intent || 'unknown',
      source: item.source || 'unknown',
    })),
    cost: totalCost,
  };
}

// ─── Step 4: Find lost keywords (CSV vs live) ─────────────────────────────────

function findLostKeywords(slug, csvRows, liveKeywords) {
  const csvForBrand = csvRows[slug] || [];
  const liveSet = new Set((liveKeywords || []).map((k) => (k.keyword || '').toLowerCase()));

  // Keywords in CSV for this brand but NOT in live DataForSEO data
  const lost = csvForBrand.filter((row) => {
    const isInLive = liveSet.has(row.keyword.toLowerCase());
    return !isInLive && row.volume > 0;
  });

  return lost.map((row) => ({
    keyword: row.keyword,
    csvPosition: row.position,
    volume: row.volume,
    url: row.url,
    traffic: row.traffic,
  }));
}

// ─── Step 5: Compute priority score ───────────────────────────────────────────

/**
 * Priority score — higher = fix this brand first.
 * Factors: total keyword volume, traffic gap, lost keywords, content gaps, KD ease
 *
 * All factors normalized to 0-100 before weighting.
 */
function computePriorityScore(brand, allBrands) {
  // Gather raw metrics
  const ranked = brand.liveKeywords?.keywords || [];
  const opportunities = brand.opportunityKeywords?.items || [];
  const cannibalization = brand.cannibalizationKeywords || [];
  const lost = brand.lostKeywords || [];

  // ── Volume ───────────────────────────────────────────────────────────────
  const ownVolume = ranked.reduce((s, k) => s + (k.searchVolume || 0), 0);
  const oppVolume = opportunities.reduce((s, k) => s + (k.searchVolume || 0), 0);
  const lostVolume = lost.reduce((s, k) => s + (k.volume || 0), 0);
  const cannibalVolume = cannibalization.reduce((s, k) => s + (k.volume || 0), 0);

  const totalAddressableVolume = ownVolume + oppVolume + cannibalVolume;
  const trafficGap = oppVolume + cannibalVolume + lostVolume;

  // ── Content penalty ───────────────────────────────────────────────────────
  const contentPenalty =
    brand.contentScore === 'empty'
      ? 100
      : brand.contentScore === 'very thin'
        ? 70
        : brand.contentScore === 'thin'
          ? 40
          : brand.contentScore === 'good'
            ? 0
            : 20;

  // ── Keyword difficulty ease ───────────────────────────────────────────────
  const kdValues = [...ranked, ...opportunities].map((k) => k.keywordDifficulty || k.kd || 50).filter((kd) => kd > 0);
  const avgKD = kdValues.length > 0 ? kdValues.reduce((s, v) => s + v, 0) / kdValues.length : 50;
  const kdEase = 100 - avgKD; // Lower KD = higher ease score

  // ── Normalise to 0-100 for consistent weighting ──────────────────────────
  // Find max values across all brands for normalization
  const maxVolume = Math.max(
    ...allBrands.map((b) => {
      const r = b.liveKeywords?.keywords || [];
      const o = b.opportunityKeywords?.items || [];
      const c = b.cannibalizationKeywords || [];
      return r.reduce((s, k) => s + (k.searchVolume || 0), 0) + o.reduce((s, k) => s + (k.searchVolume || 0), 0) + c.reduce((s, k) => s + (k.volume || 0), 0);
    }),
    1,
  );

  const maxGap = Math.max(
    ...allBrands.map((b) => {
      const o = b.opportunityKeywords?.items || [];
      const c = b.cannibalizationKeywords || [];
      const l = b.lostKeywords || [];
      return o.reduce((s, k) => s + (k.searchVolume || 0), 0) + c.reduce((s, k) => s + (k.volume || 0), 0) + l.reduce((s, k) => s + (k.volume || 0), 0);
    }),
    1,
  );

  const maxLost = Math.max(...allBrands.map((b) => (b.lostKeywords || []).length), 1);

  const normVolume = Math.min((totalAddressableVolume / maxVolume) * 100, 100);
  const normGap = Math.min((trafficGap / maxGap) * 100, 100);
  const normLost = Math.min((lost.length / maxLost) * 100, 100);
  const normContent = contentPenalty; // already 0-100
  const normKDease = Math.max(kdEase, 0); // already 0-100

  // Weighted sum
  const priorityScore = Math.round(normVolume * 0.3 + normGap * 0.25 + normLost * 0.15 + normContent * 0.15 + normKDease * 0.15);

  return {
    priorityScore,
    metrics: {
      totalAddressableVolume,
      trafficGap,
      lostKeywordCount: lost.length,
      lostVolume,
      cannibalKeywordCount: cannibalization.length,
      cannibalVolume,
      ownVolume,
      oppVolume,
      avgKD: Math.round(avgKD),
      contentPenalty,
      // Norm components (for debugging)
      _norm: {
        normVolume: Math.round(normVolume),
        normGap: Math.round(normGap),
        normLost: Math.round(normLost),
        normContent,
        normKDease: Math.round(normKDease),
      },
    },
  };
}

// ─── Step 6: SEO score rollup ─────────────────────────────────────────────────

function computeSEOScore(brand) {
  // Re-use the seoScore from Script 1 if available
  if (typeof brand.seoScore === 'number') return brand.seoScore;

  const page = brand.pageAudit || {};
  let score = 0;
  if (page.title) score += 20;
  if (page.metaDescription || brand.seoMeta?.seoDescription) score += 20;
  if (page.h1) score += 15;
  if (page.hasSchema) score += 20;
  if (page.hasFAQ) score += 10;
  const words = brand.contentWordCount || 0;
  if (words >= 300) score += 15;
  else if (words >= 100) score += 8;
  return Math.min(score, 100);
}

// ─── Step 7: Generate CSV output ─────────────────────────────────────────────

function buildCSVOutput(brands) {
  const headers = [
    'Priority Rank',
    'Brand',
    'Slug',
    'URL',
    'Products',
    'Content Words',
    'Content Score',
    'SEO Score',
    'Top Keyword',
    'Best Position',
    'Total Volume',
    'Est Traffic',
    'Traffic Gap',
    'Lost Keywords',
    'Cannibal Keywords',
    'Cannibal Volume',
    'Avg KD',
    'Rank Trend',
    'Schema Present',
    'Meta Description',
    'Has FAQ',
  ];

  const rows = brands.map((brand, i) => {
    const ranked = brand.liveKeywords?.keywords || [];
    const best = ranked.sort((a, b) => (a.position || 999) - (b.position || 999))[0];
    const topKw = best?.keyword || brand.csvTopKeyword?.keyword || '';
    const bestPos = best?.position || brand.csvTopKeyword?.position || '';
    const trend = brand.historicalRank?.trend || 'unknown';
    const hasSchema = brand.pageAudit?.hasSchema ? 'Y' : 'N';
    const hasMeta = brand.pageAudit?.metaDescription || brand.seoMeta?.seoDescription ? 'Y' : 'N';
    const hasFAQ = brand.pageAudit?.hasFAQ ? 'Y' : 'N';

    return [
      i + 1,
      brand.name,
      brand.slug,
      `${BASE}/brand/${brand.slug}/`,
      brand.taxonomy?.count || 0,
      brand.contentWordCount || 0,
      brand.contentScore || 'unknown',
      computeSEOScore(brand),
      topKw,
      bestPos,
      brand.priorityMetrics?.totalAddressableVolume || 0,
      Math.round(brand.liveKeywords?.estimatedTrafficTotal || 0),
      brand.priorityMetrics?.trafficGap || 0,
      brand.priorityMetrics?.lostKeywordCount || 0,
      brand.priorityMetrics?.cannibalKeywordCount || 0,
      brand.priorityMetrics?.cannibalVolume || 0,
      brand.priorityMetrics?.avgKD || 0,
      trend,
      hasSchema,
      hasMeta,
      hasFAQ,
    ].map(csvCell);
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n📊  Brand Priority List Builder');
  hr();
  console.log(`  Target:     ${BASE}`);
  console.log(`  Mode:       ${DRY_RUN ? 'DRY RUN (no file write)' : 'LIVE'}`);
  console.log(`  DataForSEO: ${SKIP_DATAFORSEO ? 'SKIPPED (using Script 1 data + CSV only)' : 'ENABLED'}`);
  console.log(`  CSV:        ${CSV_PATH}`);
  hr();

  // ── Load Script 1 output ──────────────────────────────────────────────────
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`\n❌  ${INPUT_PATH} not found. Run discover-brand-taxonomy.js first.\n`);
    process.exit(1);
  }

  console.log(`\n1. Loading brand data from Script 1 output...`);
  const rawData = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  let brands = rawData.brands || [];
  console.log(`  Loaded ${brands.length} brands`);

  if (brands.length > MAX_BRANDS) {
    console.log(`  Limiting to ${MAX_BRANDS} brands`);
    brands = brands.slice(0, MAX_BRANDS);
  }

  // ── Parse CSV ─────────────────────────────────────────────────────────────
  console.log('\n2. Parsing historical CSV baseline...');
  const {rows: csvRows, bySlug: csvBySlug} = parseCSV(CSV_PATH);

  // ── DataForSEO opportunity discovery ─────────────────────────────────────
  let totalDFSCost = 0;

  if (!SKIP_DATAFORSEO) {
    console.log(`\n3. Discovering opportunity keywords via DataForSEO (${brands.length} brands)...\n`);
    console.log('   This step makes ~2 API calls per brand. Estimated cost: ~$0.10/brand\n');

    for (let i = 0; i < brands.length; i++) {
      const brand = brands[i];
      console.log(`  [${i + 1}/${brands.length}] ${brand.name}`);

      // Only call for brands where we want the data (skip 0-product brands)
      if ((brand.taxonomy?.count || 0) === 0 && !DRY_RUN) {
        console.log('    ⏭️  Skipping — 0 products');
        brand.opportunityKeywords = {items: [], cost: 0};
        continue;
      }

      brand.opportunityKeywords = await discoverOpportunityKeywords(brand);
      totalDFSCost += brand.opportunityKeywords.cost;

      // Small delay to stay within rate limits
      await sleep(1000);
    }
  } else {
    console.log('\n3. Skipped DataForSEO opportunity discovery (--skip-dataforseo)');
    brands.forEach((b) => {
      b.opportunityKeywords = {items: [], cost: 0};
    });
  }

  // ── Find cannibalization & lost keywords ──────────────────────────────────
  console.log('\n4. Detecting cannibalization + lost keywords from CSV...');

  for (const brand of brands) {
    // Cannibalization: brand keywords ranking on non-brand URLs
    brand.cannibalizationKeywords = findCannibalizationInCSV(brand.slug, brand.name, csvRows);

    // Lost keywords: were in CSV, not in live DataForSEO data
    brand.lostKeywords = findLostKeywords(brand.slug, csvBySlug, brand.liveKeywords?.keywords);

    // CSV top keyword (for brands with no DataForSEO data)
    const csvForBrand = csvBySlug[brand.slug] || [];
    if (csvForBrand.length > 0) {
      const topCsv = [...csvForBrand].sort((a, b) => b.volume - a.volume)[0];
      brand.csvTopKeyword = topCsv ? {keyword: topCsv.keyword, position: topCsv.position, volume: topCsv.volume} : null;
    }
  }

  const totalCannibal = brands.reduce((s, b) => s + b.cannibalizationKeywords.length, 0);
  const totalLost = brands.reduce((s, b) => s + b.lostKeywords.length, 0);
  console.log(`  Found ${totalCannibal} cannibalization instances across all brands`);
  console.log(`  Found ${totalLost} lost keywords (were ranking in CSV, no longer live)`);

  // ── Calculate priority scores ─────────────────────────────────────────────
  console.log('\n5. Computing priority scores...');

  for (const brand of brands) {
    const {priorityScore, metrics} = computePriorityScore(brand, brands);
    brand.priorityScore = priorityScore;
    brand.priorityMetrics = metrics;
    brand.seoScore = computeSEOScore(brand);
  }

  // Sort by priority score
  brands.sort((a, b) => b.priorityScore - a.priorityScore);

  // Assign priority rank
  brands.forEach((brand, i) => {
    brand.priorityRank = i + 1;
  });

  // ── Build flat keyword list for Script 4 ─────────────────────────────────
  const allKeywords = [];
  for (const brand of brands) {
    const ranked = (brand.liveKeywords?.keywords || []).map((k) => ({...k, brandSlug: brand.slug, brandName: brand.name, keywordSource: 'ranked'}));
    const opp = (brand.opportunityKeywords?.items || []).map((k) => ({
      ...k,
      searchVolume: k.searchVolume,
      brandSlug: brand.slug,
      brandName: brand.name,
      keywordSource: 'opportunity',
    }));
    const cannibal = (brand.cannibalizationKeywords || []).map((k) => ({
      keyword: k.keyword,
      searchVolume: k.volume,
      keywordDifficulty: k.kd,
      brandSlug: brand.slug,
      brandName: brand.name,
      keywordSource: 'cannibalization',
    }));
    allKeywords.push(...ranked, ...opp, ...cannibal);
  }

  // ── Print top 20 ──────────────────────────────────────────────────────────
  const top20 = brands.slice(0, 20);

  console.log('\n');
  hr();
  console.log('🏆  Top 20 Priority Brands');
  hr();
  console.log('  #   Brand                    Score  Vol      Gap      Lost  KD   Trend      SEO');
  console.log('  ' + '─'.repeat(80));

  top20.forEach((brand) => {
    const m = brand.priorityMetrics;
    const rank = String(brand.priorityRank).padStart(3);
    const name = brand.name.padEnd(24);
    const score = String(brand.priorityScore).padStart(5);
    const vol = String(m?.totalAddressableVolume || 0).padStart(7);
    const gap = String(m?.trafficGap || 0).padStart(8);
    const lost = String(m?.lostKeywordCount || 0).padStart(5);
    const kd = String(m?.avgKD || 0).padStart(4);
    const trend = (brand.historicalRank?.trend || 'unknown').padEnd(10);
    const seo = String(brand.seoScore).padStart(3);
    console.log(`  ${rank} ${name} ${score}  ${vol}  ${gap}  ${lost}  ${kd}  ${trend}  ${seo}/100`);
  });

  // ── Summary stats ─────────────────────────────────────────────────────────
  const grandVolume = brands.reduce((s, b) => s + (b.priorityMetrics?.totalAddressableVolume || 0), 0);
  const grandGap = brands.reduce((s, b) => s + (b.priorityMetrics?.trafficGap || 0), 0);

  console.log('\n');
  hr();
  console.log('📊  Summary');
  hr();
  console.log(`  Total brands processed:          ${brands.length}`);
  console.log(`  Total addressable keyword volume: ${grandVolume.toLocaleString()}`);
  console.log(`  Total traffic gap (opportunity):  ${grandGap.toLocaleString()}`);
  console.log(`  Total cannibalization instances:  ${totalCannibal}`);
  console.log(`  Total lost keywords:              ${totalLost}`);
  console.log(`  Total unique keywords in dataset: ${allKeywords.length}`);
  if (!SKIP_DATAFORSEO) {
    console.log(`  DataForSEO API spend this run:    ~$${totalDFSCost.toFixed(4)}`);
  }
  hr();

  if (DRY_RUN) {
    console.log('\n⚠️   DRY RUN — no files written. Remove --dry-run to save output.\n');
    return;
  }

  // ── Write outputs ─────────────────────────────────────────────────────────
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, {recursive: true});

  // JSON master list
  const masterList = {
    meta: {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      totalBrands: brands.length,
      csvPath: CSV_PATH,
      dataForSeoUsed: !SKIP_DATAFORSEO,
      estimatedApiCost: parseFloat(totalDFSCost.toFixed(4)),
    },
    brands,
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(masterList, null, 2));
  const jsonKB = Math.round(fs.statSync(OUTPUT_JSON).size / 1024);
  console.log(`\n✅  ${OUTPUT_JSON} (${jsonKB}KB)`);

  // CSV master list
  const csvContent = buildCSVOutput(brands);
  fs.writeFileSync(OUTPUT_CSV, csvContent);
  console.log(`✅  ${OUTPUT_CSV}`);

  // Keywords flat list
  const keywordFile = {
    meta: {generatedAt: new Date().toISOString(), totalKeywords: allKeywords.length},
    keywords: allKeywords,
  };
  fs.writeFileSync(OUTPUT_KEYWORDS, JSON.stringify(keywordFile, null, 2));
  const kwKB = Math.round(fs.statSync(OUTPUT_KEYWORDS).size / 1024);
  console.log(`✅  ${OUTPUT_KEYWORDS} (${kwKB}KB, ${allKeywords.length} keywords)\n`);
})().catch((err) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
