#!/usr/bin/env node
/**
 * discover-category-taxonomy.js
 *
 * Phase 1, Script 1 — Discover all WooCommerce product categories,
 * enrich with DataForSEO keyword data, and build a priority-ordered
 * master list for optimize-category-page.js.
 *
 * TARGET: proskatersplace.com (US .com site)
 * Tier: 1 — read-only, no WordPress writes
 *
 * Usage:
 *   # Full discovery with DataForSEO enrichment
 *   node wordpress/scripts/discover-category-taxonomy.js
 *
 *   # Skip DataForSEO (fast, just fetch categories from WP)
 *   node wordpress/scripts/discover-category-taxonomy.js --skip-dataforseo
 *
 *   # Limit to top N by product count
 *   node wordpress/scripts/discover-category-taxonomy.js --top=20
 *
 * Output: data/category-master-list.json
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Optional: DataForSEO enrichment
let dataforseo;
try {
  dataforseo = require('./lib/dataforseo');
} catch {
  console.warn('⚠️  DataForSEO lib not available — keyword enrichment will be skipped');
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE = process.env.BASE_URL;
const WP_USER = process.env.WP_ADMIN_USERNAME;
const WP_PASS = process.env.WP_ADMIN_APP_PASSWORD;
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;

if (!BASE || !WP_USER || !WP_PASS) {
  console.error('ERROR: Missing BASE_URL, WP_ADMIN_USERNAME, or WP_ADMIN_APP_PASSWORD in .env');
  process.exit(1);
}

const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const WC_AUTH = WC_KEY && WC_SECRET ? 'Basic ' + Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64') : null;

const SKIP_DATAFORSEO = process.argv.includes('--skip-dataforseo');
const TOP_ARG = process.argv.find((a) => a.startsWith('--top='));
const TOP_N = TOP_ARG ? parseInt(TOP_ARG.split('=')[1], 10) : null;

const OUTPUT_PATH = path.resolve(__dirname, '../../data/categories/category-master-list.json');
const PRODUCT_CAT_SITEMAP_URL = `${BASE.replace(/\/$/, '')}/product_cat-sitemap.xml`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hr() {
  console.log('─'.repeat(60));
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizePathname(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '/') || '/';
  } catch {
    return null;
  }
}

function buildExpectedCategoryPath(category, categoryMap) {
  const segments = [];
  const visited = new Set();
  let current = category;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(current.slug);

    if (!current.parent) break;
    current = categoryMap.get(current.parent);
  }

  return `/products/${segments.join('/')}/`;
}

async function fetchCanonicalCategoryUrlIndex() {
  const res = await fetch(PRODUCT_CAT_SITEMAP_URL, {
    headers: {Authorization: WP_AUTH},
  });

  if (!res.ok) {
    throw new Error(`Fetch product_cat sitemap failed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim()).filter((url) => url.includes('/products/'));

  const byPath = new Map();
  const slugCounts = new Map();
  for (const url of urls) {
    const pathname = normalizePathname(url);
    if (pathname) byPath.set(pathname, url);

    const parts = pathname?.split('/').filter(Boolean) || [];
    const slug = parts[parts.length - 1];
    if (slug) slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
  }

  const byUniqueSlug = new Map();
  for (const url of urls) {
    const pathname = normalizePathname(url);
    const parts = pathname?.split('/').filter(Boolean) || [];
    const slug = parts[parts.length - 1];
    if (slug && slugCounts.get(slug) === 1) {
      byUniqueSlug.set(slug, url);
    }
  }

  return {byPath, byUniqueSlug};
}

function assignCanonicalCategoryUrls(categories, categoryMap, urlIndex) {
  let resolved = 0;

  for (const category of categories) {
    const expectedPath = buildExpectedCategoryPath(category, categoryMap);
    const canonicalUrl = urlIndex.byPath.get(expectedPath) || urlIndex.byUniqueSlug.get(category.slug) || null;
    category.url = canonicalUrl;
    if (canonicalUrl) resolved++;
  }

  return resolved;
}

// ─── Fetch all product categories ─────────────────────────────────────────────

async function fetchAllCategories() {
  const allCats = [];
  let page = 1;
  const perPage = 100;

  // Prefer WC REST API (includes product count natively)
  const useWC = !!WC_AUTH;
  const baseUrl = useWC ? `${BASE}/wp-json/wc/v3/products/categories` : `${BASE}/wp-json/wp/v2/product_cat`;
  const auth = useWC ? WC_AUTH : WP_AUTH;

  console.log(`   Endpoint: ${baseUrl} (${useWC ? 'WooCommerce' : 'WP taxonomy'})`);

  while (true) {
    const url = `${baseUrl}?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {headers: {Authorization: auth}});

    if (!res.ok) {
      if (res.status === 400 && page > 1) break; // Past last page
      throw new Error(`Fetch categories page ${page} failed: HTTP ${res.status}`);
    }

    const cats = await res.json();
    if (!Array.isArray(cats) || cats.length === 0) break;

    allCats.push(...cats);
    console.log(`   Page ${page}: ${cats.length} categories`);

    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '0', 10);
    if (totalPages && page >= totalPages) break;
    if (cats.length < perPage) break;

    page++;
    await sleep(300);
  }

  return allCats;
}

// ─── Normalize category data ──────────────────────────────────────────────────

function normalizeCategory(raw, isWC) {
  if (isWC) {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      parent: raw.parent || 0,
      parentName: null, // resolved later
      count: raw.count || 0,
      description: raw.description || '',
      descriptionWordCount: wordCount(stripHtml(raw.description || '')),
      display: raw.display || 'default',
      image: raw.image?.src || null,
      menuOrder: raw.menu_order || 0,
      url: null,
    };
  }

  // WP taxonomy endpoint
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    parent: raw.parent || 0,
    parentName: null,
    count: raw.count || 0,
    description: raw.description || '',
    descriptionWordCount: wordCount(stripHtml(raw.description || '')),
    display: 'default',
    image: null,
    menuOrder: 0,
    url: null,
  };
}

// ─── DataForSEO keyword enrichment ────────────────────────────────────────────

async function enrichWithKeywords(category) {
  if (SKIP_DATAFORSEO || !dataforseo) {
    return {primary: category.name.toLowerCase(), secondary: [], longtail: [], volume: 0, difficulty: 100};
  }

  // Build search term from category name — add "buy" or context for commercial intent
  const searchTerm = category.name.toLowerCase();

  try {
    // Get search volume for the category name itself
    const volumeData = await dataforseo.searchVolume([searchTerm], {
      locationCode: 2840,
      languageCode: 'en',
    });
    await sleep(500);

    const mainKw = volumeData?.items?.[0];
    const mainVolume = mainKw?.search_volume || 0;
    const mainDifficulty = mainKw?.keyword_properties?.keyword_difficulty || 50;

    // Get related keywords
    let relatedItems = [];
    try {
      const related = await dataforseo.relatedKeywords(searchTerm, {
        locationCode: 2840,
        depth: 1,
        limit: 30,
        orderBy: ['keyword_data.keyword_info.search_volume,desc'],
      });
      relatedItems = related.items || [];
      await sleep(500);
    } catch (err) {
      console.warn(`      ⚠️  relatedKeywords failed for "${searchTerm}": ${err.message}`);
    }

    // Get keyword suggestions
    let suggestionItems = [];
    try {
      const suggestions = await dataforseo.keywordSuggestions(searchTerm, {
        locationCode: 2840,
        limit: 30,
      });
      suggestionItems = suggestions.items || [];
    } catch (err) {
      console.warn(`      ⚠️  keywordSuggestions failed for "${searchTerm}": ${err.message}`);
    }

    // Merge and deduplicate
    const allItems = [...relatedItems, ...suggestionItems];
    const seen = new Set();
    const filtered = allItems
      .filter((item) => {
        const kw = item.keyword_data?.keyword;
        const vol = item.keyword_data?.keyword_info?.search_volume || 0;
        if (!kw || vol < 10 || seen.has(kw)) return false;
        seen.add(kw);
        return true;
      })
      .sort((a, b) => (b.keyword_data?.keyword_info?.search_volume || 0) - (a.keyword_data?.keyword_info?.search_volume || 0));

    // Find the best primary keyword — should match what the category IS
    const catWords = searchTerm.split(/\s+/).filter((w) => w.length > 2);
    const relevantKws = filtered.filter((k) => {
      const kw = (k.keyword_data?.keyword || '').toLowerCase();
      return catWords.some((w) => kw.includes(w));
    });

    const bestPrimary = relevantKws[0]?.keyword_data?.keyword || searchTerm;
    const bestPrimaryVolume = relevantKws[0]?.keyword_data?.keyword_info?.search_volume || mainVolume;

    const secondary = filtered
      .filter((k) => k.keyword_data?.keyword !== bestPrimary)
      .slice(0, 10)
      .map((k) => k.keyword_data?.keyword)
      .filter(Boolean);

    const longtail = filtered
      .filter((k) => (k.keyword_data?.keyword_properties?.keyword_difficulty || 100) < 40)
      .slice(0, 5)
      .map((k) => k.keyword_data?.keyword)
      .filter(Boolean);

    return {
      primary: bestPrimary,
      primaryVolume: bestPrimaryVolume,
      secondary,
      longtail,
      volume: mainVolume,
      difficulty: mainDifficulty,
      rawItems: filtered,
      allKeywordCount: filtered.length,
    };
  } catch (err) {
    console.warn(`      ⚠️  DataForSEO enrichment failed for "${searchTerm}": ${err.message}`);
    return {primary: searchTerm, secondary: [], longtail: [], volume: 0, difficulty: 100};
  }
}

// ─── Build priority score ─────────────────────────────────────────────────────

function calculatePriorityScore(category, keywords) {
  let score = 0;

  // Product count (0-40 points) — more products = more impact
  const countScore = Math.min(category.count / 5, 40);
  score += countScore;

  // Keyword volume (0-30 points) — higher volume = more opportunity
  const volume = keywords.primaryVolume || keywords.volume || 0;
  const volumeScore = Math.min(volume / 500, 30);
  score += volumeScore;

  // Content gap (0-20 points) — less existing content = more opportunity
  const contentGap = category.descriptionWordCount < 50 ? 20 : category.descriptionWordCount < 150 ? 10 : 0;
  score += contentGap;

  // Not a utility category (reduce score for "uncategorized", "clearance", etc.)
  const utilityCategories = ['uncategorized', 'clearance-items', 'discount-products', 'new-arrivals', '2023-products'];
  if (utilityCategories.includes(category.slug)) {
    score -= 50;
  }

  // Boost top-level categories (parent = 0)
  if (category.parent === 0) {
    score += 10;
  }

  return Math.round(score * 10) / 10;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n⚡  Category Taxonomy Discovery');
  hr();
  console.log(`  Target: ${BASE}`);
  console.log(`  DataForSEO: ${SKIP_DATAFORSEO ? 'SKIPPED' : 'ENABLED'}`);
  if (TOP_N) console.log(`  Top N: ${TOP_N}`);
  hr();

  // ── 1. Fetch all categories ───────────────────────────────────────────────
  console.log('\n1. Fetching all product categories...');
  const rawCats = await fetchAllCategories();
  const isWC = !!WC_AUTH;

  // Normalize
  let categories = rawCats.map((c) => normalizeCategory(c, isWC));
  console.log(`   Total categories: ${categories.length}`);

  // Resolve parent names
  const catMap = new Map(categories.map((c) => [c.id, c]));
  for (const cat of categories) {
    if (cat.parent && catMap.has(cat.parent)) {
      cat.parentName = catMap.get(cat.parent).name;
    }
  }

  console.log('\n2. Auditing canonical category URLs from sitemap...');
  const canonicalUrlIndex = await fetchCanonicalCategoryUrlIndex();
  const resolvedUrls = assignCanonicalCategoryUrls(categories, catMap, canonicalUrlIndex);
  console.log(`   Product category sitemap: ${PRODUCT_CAT_SITEMAP_URL}`);
  console.log(`   Canonical URLs resolved: ${resolvedUrls}/${categories.length}`);

  // Find subcategories for each category
  for (const cat of categories) {
    cat.subcategories = categories
      .filter((c) => c.parent === cat.id && c.count > 0)
      .map((c) => ({id: c.id, name: c.name, slug: c.slug, count: c.count, url: c.url}))
      .sort((a, b) => b.count - a.count);
  }

  // Filter to categories with products (skip 0-product categories)
  const withProducts = categories.filter((c) => c.count > 0);
  console.log(`   With products: ${withProducts.length}`);

  // Sort by product count descending
  withProducts.sort((a, b) => b.count - a.count);

  // Apply --top filter
  const targetCats = TOP_N ? withProducts.slice(0, TOP_N) : withProducts;
  console.log(`   Processing: ${targetCats.length} categories`);

  // ── 3. Enrich with DataForSEO keyword data ────────────────────────────────
  if (!SKIP_DATAFORSEO && dataforseo) {
    console.log('\n3. Enriching with DataForSEO keyword data...');
    for (let i = 0; i < targetCats.length; i++) {
      const cat = targetCats[i];
      process.stdout.write(`   [${i + 1}/${targetCats.length}] ${cat.name} (${cat.count} products)...`);
      cat.keywords = await enrichWithKeywords(cat);
      console.log(` primary: "${cat.keywords.primary}" (${cat.keywords.primaryVolume || cat.keywords.volume}/mo)`);

      if (i < targetCats.length - 1) await sleep(1000);
    }
  } else {
    console.log('\n3. Skipping DataForSEO — using category names as keywords...');
    for (const cat of targetCats) {
      cat.keywords = {
        primary: cat.name.toLowerCase(),
        secondary: [],
        longtail: [],
        volume: 0,
        difficulty: 100,
      };
    }
  }

  // ── 4. Calculate priority scores ──────────────────────────────────────────
  console.log('\n4. Calculating priority scores...');
  for (const cat of targetCats) {
    cat.priorityScore = calculatePriorityScore(cat, cat.keywords);
  }

  // Sort by priority score
  targetCats.sort((a, b) => b.priorityScore - a.priorityScore);

  // Assign rank
  targetCats.forEach((cat, i) => {
    cat.priorityRank = i + 1;
  });

  // ── 5. Save master list ───────────────────────────────────────────────────
  console.log('\n5. Saving master list...');
  const output = {
    generatedAt: new Date().toISOString(),
    totalCategories: categories.length,
    processedCategories: targetCats.length,
    dataForSEOEnabled: !SKIP_DATAFORSEO,
    categories: targetCats,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), {recursive: true});
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`   Saved: ${OUTPUT_PATH}`);

  // ── 6. Print summary table ────────────────────────────────────────────────
  console.log('\n');
  hr();
  console.log('Top 20 categories by priority:');
  hr();
  console.log(
    `${'#'.padStart(3)} | ${'Category'.padEnd(30)} | ${'Slug'.padEnd(25)} | ${'Products'.padStart(8)} | ${'Keyword Vol'.padStart(11)} | ${'Content'.padStart(7)} | ${'Score'.padStart(6)}`,
  );
  hr();

  for (const cat of targetCats.slice(0, 20)) {
    const vol = cat.keywords?.primaryVolume || cat.keywords?.volume || 0;
    console.log(
      `${String(cat.priorityRank).padStart(3)} | ${cat.name.slice(0, 30).padEnd(30)} | ${cat.slug.slice(0, 25).padEnd(25)} | ${String(cat.count).padStart(8)} | ${String(vol).padStart(11)} | ${String(cat.descriptionWordCount).padStart(5)}w | ${String(cat.priorityScore).padStart(6)}`,
    );
  }

  hr();
  console.log(`\n✅  Category discovery complete. Master list saved to:`);
  console.log(`   ${OUTPUT_PATH}`);
  console.log(`\nNext step: node wordpress/scripts/optimize-category-page.js --top=5 --dry-run\n`);
})().catch((err) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
