#!/usr/bin/env node
/**
 * optimize-brand-page.js
 *
 * TARGET: proskatersplace.com (US site) — primary market: USA, secondary: worldwide
 * NOTE:   The Nuxt/Vue frontend (proskatersplace.ca) is a separate Canadian project.
 *
 * Phase 2 — The comprehensive brand page optimization script.
 * For each target brand: fetches live data, generates SEO-optimized content
 * via Gemini, and applies updates to WordPress via REST API.
 *
 * Run order: 10 (requires Scripts 1-3 outputs in wordpress/data/)
 * Tier: 2 — writes to WordPress (description + SEO meta)
 *
 * Usage:
 *   # Single brand — dry run
 *   node wordpress/scripts/optimize-brand-page.js --brand=chaya-skates --dry-run
 *
 *   # Single brand — apply
 *   node wordpress/scripts/optimize-brand-page.js --brand=chaya-skates
 *
 *   # Top 10 priority brands
 *   node wordpress/scripts/optimize-brand-page.js --top=10 --dry-run
 *   node wordpress/scripts/optimize-brand-page.js --top=10
 *
 *   # All brands in priority order (resume-safe)
 *   node wordpress/scripts/optimize-brand-page.js --all --dry-run
 *   node wordpress/scripts/optimize-brand-page.js --all
 *
 *   # Skip content generation (update meta only)
 *   node wordpress/scripts/optimize-brand-page.js --brand=chaya-skates --skip-content
 *
 *   # Force re-optimize brands already in the log
 *   node wordpress/scripts/optimize-brand-page.js --all --force
 *
 * Input:  wordpress/data/brand-master-list.json (from Scripts 1-3)
 * Output: wordpress/data/brand-optimization-log.json (append)
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {generateContent, generateContentWithSystem} = require('./lib/gemini');
const {relatedKeywords, keywordSuggestions} = require('./lib/dataforseo');
const {
  brandDescriptionPrompt,
  brandFAQPrompt,
  brandMetaPrompt,
  buildFAQSchema,
  buildAuthorizedBadge,
  buildInternalLinks,
  extractBrandContext,
  extractFAQQuestionsFromKeywords,
  BRAND_WEBSITE_MAP,
  SITE_URL,
} = require('./lib/brand-prompts');

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

// Brands that are confirmed authorized dealers — gets the badge
// Add/remove as needed
const AUTHORIZED_BRANDS = new Set([
  'chaya-skates',
  'powerslide',
  'rollerblade',
  'seba',
  'fr-skates',
  'flying-eagle',
  'usd-skates',
  'luminous',
  'ennui',
  'adapt',
  'iqon',
  'undercover-wheels',
  'gawds',
  'kizer',
  'myfit',
  'twincam',
  'rekd',
  'playlife',
  'micro',
  'daehlie',
  'rossignol-ski',
  'fischer',
  'swix',
  'toko',
  'summit-skiboards',
  'mini-logo',
  'dream-wheels',
  'sidas',
  'lang-boots',
  'nn-skates',
  'anarchy-aggressive',
  'epic-grindshoes',
  'endless-blading',
]);

// v2: CATEGORY_LINKS no longer used — categories are now extracted from scraped products
// Kept for reference only
const CATEGORY_LINKS = [
  {name: 'Inline Skates', slug: 'inline-skates'},
  {name: 'Roller Skates', slug: 'roller-skates'},
  {name: 'Protective Gear', slug: 'protective-gear'},
  {name: 'Skate Wheels', slug: 'skate-wheels'},
  {name: 'Skate Accessories', slug: 'skate-accessories'},
];

// Guide / resource pages — non-category internal links always included
const GUIDE_LINKS = [
  {
    name: 'Inline Skate Size Guide',
    url: '/inline-skates-size-calculator/',
    title: 'Find your perfect inline skate size',
  },
];

/**
 * Normalized authorized brand check — handles slug variations.
 * Brand slugs on the site sometimes have suffixes like "-brand", "-skates".
 */
function isAuthorizedBrand(slug) {
  if (AUTHORIZED_BRANDS.has(slug)) return true;
  // Try normalized versions
  const normalized = slug.replace(/-brand$/, '').replace(/-skates$/, '');
  if (AUTHORIZED_BRANDS.has(normalized)) return true;
  // Try with suffix
  if (AUTHORIZED_BRANDS.has(slug + '-skates')) return true;
  return false;
}

// ─── Flags ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const SKIP_CONTENT = process.argv.includes('--skip-content');
const SKIP_SCHEMA = process.argv.includes('--skip-schema');
const SKIP_DATAFORSEO = process.argv.includes('--skip-dataforseo');

const BRAND_ARG = process.argv.find((a) => a.startsWith('--brand='));
const TOP_ARG = process.argv.find((a) => a.startsWith('--top='));
const BATCH_ARG = process.argv.find((a) => a.startsWith('--batch='));
const RUN_ALL = process.argv.includes('--all');

const TARGET_SLUG = BRAND_ARG?.split('=')[1];
const TOP_N = TOP_ARG ? parseInt(TOP_ARG.split('=')[1], 10) : null;
const BATCH_FILE = BATCH_ARG?.split('=')[1];

if (!TARGET_SLUG && !RUN_ALL && !TOP_N && !BATCH_FILE) {
  console.error('ERROR: Specify --brand=slug, --all, --top=N, or --batch=file.json');
  console.error('       Add --dry-run to preview without writing to WordPress');
  process.exit(1);
}

const MASTER_LIST_PATH = path.resolve(__dirname, '../../data/brands/brand-master-list.json');
const LOG_PATH = path.resolve(__dirname, '../../data/brands/brand-optimization-log.json');

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

/** Safely parse JSON from a Gemini response, stripping markdown fences */
function parseGeminiJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Load optimization log ────────────────────────────────────────────────────

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function appendLog(slug, entry) {
  const log = loadLog();
  if (!log[slug]) log[slug] = [];
  log[slug].push({...entry, timestamp: new Date().toISOString()});
  fs.mkdirSync(path.dirname(LOG_PATH), {recursive: true});
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ─── Step A: Discover taxonomy endpoint ───────────────────────────────────────

async function discoverTaxonomyEndpoint() {
  const res = await fetch(`${BASE}/wp-json/`, {headers: {Authorization: WP_AUTH}});
  if (!res.ok) throw new Error(`WP root index failed: HTTP ${res.status}`);
  const json = await res.json();
  const routes = json.routes || {};

  const candidates = ['/wp/v2/brand', '/wp/v2/pwb-brand', '/wc/v3/products/brands'];
  for (const c of candidates) {
    if (routes[c]) return {endpoint: `${BASE}/wp-json${c}`, isWC: c.startsWith('/wc/')};
  }

  const brandRoute = Object.keys(routes).find((r) => r.toLowerCase().includes('brand') && !r.includes('{'));
  if (brandRoute) return {endpoint: `${BASE}/wp-json${brandRoute}`, isWC: brandRoute.startsWith('/wc/')};

  throw new Error('Brand taxonomy endpoint not found. Is a brand plugin installed?');
}

// ─── Step B: Fetch WP taxonomy term ───────────────────────────────────────────

async function fetchTerm(endpoint, isWC, termId) {
  const authHeader = isWC && WC_AUTH ? WC_AUTH : WP_AUTH;
  const res = await fetch(`${endpoint}/${termId}`, {headers: {Authorization: authHeader}});
  if (!res.ok) throw new Error(`Fetch term ${termId} failed: HTTP ${res.status}`);
  return res.json();
}

// ─── Step C: Fetch top products for this brand ────────────────────────────────

// v1 legacy — WC API brand filter is unreliable (silently ignores pwb-brand param).
// Kept as fallback only; primary method is now scrapeBrandPageProducts().
async function fetchBrandProducts(endpoint, isWC, termId, brandName, count = 5) {
  if (!WC_AUTH) return [];
  try {
    const taxParam = isWC ? 'brand' : 'pwb-brand';
    const url = `${BASE}/wp-json/wc/v3/products?${taxParam}=${termId}&per_page=${count}&orderby=popularity&order=desc&_fields=id,name,permalink,price,regular_price,images`;
    const res = await fetch(url, {headers: {Authorization: WC_AUTH}});
    if (res.ok) {
      const products = await res.json();
      return Array.isArray(products) ? products : [];
    }
  } catch {}
  return [];
}

// ─── Step C2: Scrape real products from the live brand archive page ───────────
//
// Fetches the public-facing brand page HTML and extracts product names + URLs
// from the WooCommerce product grid. This is far more reliable than the WC API
// brand filter, which silently fails and returns products from OTHER brands.

async function scrapeBrandPageProducts(brandSlug) {
  const url = `${BASE}/brand/${brandSlug}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PSP-BrandOptimizer/2.0)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`    ⚠️  Brand page scrape failed: HTTP ${res.status} for ${url}`);
      return [];
    }
    const html = await res.text();
    return parseProductGridHTML(html, brandSlug);
  } catch (err) {
    console.warn(`    ⚠️  Brand page scrape error: ${err.message}`);
    return [];
  }
}

/**
 * Parse WooCommerce product grid HTML to extract product data.
 * Targets the standard WC product loop markup with Shoptimizer theme structure.
 *
 * Instead of matching full <li> blocks (which fails with nested lists),
 * we match WC product links directly by their distinctive class names:
 *   <a ... class="woocommerce-LoopProduct-link" ... href="URL"> ... </a>
 *   <h2 class="woocommerce-loop-product__title">NAME</h2>
 *
 * Returns products verified to belong to this brand (name contains brand slug words).
 */
function parseProductGridHTML(html, brandSlug) {
  const products = [];
  const genericWords = new Set(['skates', 'skate', 'wheels', 'wheel', 'brand', 'gear', 'roller', 'inline', 'hockey', 'ski', 'boots', 'aggressive']);
  const brandWords = brandSlug
    .replace(/-/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 2 && !genericWords.has(w));

  // Strategy 1: Match WC product links by their distinctive class name
  // Find all <a> tags with woocommerce-LoopProduct-link class
  const productLinkPattern = /<a\s[^>]*class="[^"]*woocommerce-LoopProduct-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const seen = new Set();

  while ((match = productLinkPattern.exec(html)) !== null) {
    const fullTag = match[0];
    const innerContent = match[1];

    // Extract href from the opening <a> tag
    const hrefMatch = fullTag.match(/href="([^"]+)"/i);
    if (!hrefMatch) continue;
    const rawUrl = hrefMatch[1];

    // Skip duplicates (WC sometimes renders the same product link twice — image + text)
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    // Extract product name from the title attribute or inner <h2>
    let rawName = '';
    const titleAttr = fullTag.match(/title="([^"]+)"/i);
    const h2Match = innerContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);

    if (h2Match) {
      rawName = h2Match[1].replace(/<[^>]+>/g, '').trim();
    } else if (titleAttr) {
      rawName = titleAttr[1].trim();
    }

    if (!rawName) continue;

    // Extract categories from the nearest parent <li> class (look backwards in HTML)
    const liPos = html.lastIndexOf('<li ', html.indexOf(fullTag));
    const liTag = liPos >= 0 ? html.slice(liPos, liPos + 500) : '';
    const catMatches = liTag.match(/product_cat-([a-z0-9-]+)/gi) || [];
    const categories = catMatches.map((c) => c.replace('product_cat-', ''));

    products.push({
      name: rawName,
      url: rawUrl,
      price: null, // prices parsed below
      categories: categories,
    });
  }

  // Strategy 2: Extract prices — look for price spans near each product URL
  for (const p of products) {
    // Find the product URL in the HTML and look for the nearest price after it
    const urlIdx = html.indexOf(p.url);
    if (urlIdx < 0) continue;
    const after = html.slice(urlIdx, urlIdx + 2000);

    // Current price (sale price in <ins>, or regular price)
    const salePrice = after.match(/<ins[^>]*>[\s\S]*?<bdi>([\s\S]*?)<\/bdi>/i);
    const regPrice = after.match(/<span[^>]+class="[^"]*woocommerce-Price-amount[^"]*"[^>]*>[\s\S]*?<bdi>([\s\S]*?)<\/bdi>/i);
    const priceEl = salePrice || regPrice;
    if (priceEl) {
      p.price = priceEl[1]
        .replace(/<[^>]+>/g, '')
        .replace(/[^0-9.,]/g, '')
        .trim();
    }
  }

  console.log(`       Raw products parsed from grid: ${products.length}`);

  // Brand-validate: keep only products whose name plausibly belongs to this brand
  // This prevents cross-contamination (the bug we're fixing — brand pages showing other brands' products)
  const validated = products.filter((p) => {
    const nameLower = p.name.toLowerCase();
    return brandWords.some((w) => nameLower.includes(w));
  });

  console.log(`       After brand-name validation: ${validated.length} of ${products.length}`);

  // If validation filtered everything out, the brand name might not appear in product names
  // (e.g., some brands use model names only). Return top products unfiltered with a warning.
  if (validated.length === 0 && products.length > 0) {
    console.warn(`    ⚠️  No products matched brand words [${brandWords.join(', ')}] — returning top ${Math.min(products.length, 8)} unfiltered`);
    return products.slice(0, 8);
  }

  return validated.slice(0, 12);
}

/**
 * Extract unique product categories from a scraped product list.
 * Maps WC CSS class slugs to human-readable category names.
 */
function extractProductCategories(products) {
  const CATEGORY_NAME_MAP = {
    'inline-skates': 'Inline Skates',
    'roller-skates': 'Roller Skates',
    'protective-gear': 'Protective Gear',
    'skate-wheels': 'Skate Wheels',
    'skate-accessories': 'Skate Accessories',
    'skate-frames': 'Skate Frames',
    'skate-bearings': 'Skate Bearings',
    'skate-boots': 'Skate Boots',
    helmets: 'Helmets',
    pads: 'Pads',
    'cross-country-skis': 'Cross Country Skis',
    'ski-boots': 'Ski Boots',
    'ski-poles': 'Ski Poles',
    'ski-wax': 'Ski Wax',
    skiboards: 'Skiboards',
    scooters: 'Scooters',
    'grind-shoes': 'Grind Shoes',
  };

  const catSlugs = new Set();
  for (const p of products) {
    for (const c of p.categories || []) {
      catSlugs.add(c);
    }
  }

  return [...catSlugs]
    .map((slug) => ({
      slug,
      name: CATEGORY_NAME_MAP[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    }))
    .slice(0, 6);
}

// ─── Step D: Get DataForSEO keyword data for content targeting ─────────────────

async function getKeywordsForContent(brand) {
  if (SKIP_DATAFORSEO) {
    // Fall back to keywords already in master list
    return buildKeywordsFromMasterList(brand);
  }

  const brandKeyword =
    brand.name
      .toLowerCase()
      .replace(/\s+skates?$/i, '')
      .trim() + ' skates';
  const allItems = [];

  try {
    const related = await relatedKeywords(brandKeyword, {
      locationCode: 2840,
      depth: 1,
      limit: 50,
      orderBy: ['keyword_data.keyword_info.search_volume,desc'],
    });
    allItems.push(...related.items);
    await sleep(500);
  } catch (err) {
    console.warn(`    ⚠️  relatedKeywords failed: ${err.message}`);
  }

  try {
    const suggestions = await keywordSuggestions(brandKeyword, {
      locationCode: 2840,
      limit: 50,
      // note: keyword_suggestions endpoint does not support order_by — sorted client-side below
    });
    allItems.push(...suggestions.items);
  } catch (err) {
    console.warn(`    ⚠️  keywordSuggestions failed: ${err.message}`);
  }

  if (allItems.length === 0) return buildKeywordsFromMasterList(brand);

  // Filter for quality: volume > 10, deduplicate
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

  // v2: Primary keyword must be brand-specific — never a generic term like "inline skates"
  const brandNameLower = brand.name.toLowerCase();
  const brandBase = brandNameLower.replace(/\s+skates?$/i, '').trim();

  // Find the highest-volume keyword that actually contains the brand name
  const brandedKeywords = filtered.filter((k) => {
    const kw = (k.keyword_data?.keyword || '').toLowerCase();
    return kw.includes(brandBase);
  });

  const primary =
    brandedKeywords[0]?.keyword_data?.keyword ||
    filtered.find((k) => (k.keyword_data?.keyword || '').toLowerCase().includes(brandBase))?.keyword_data?.keyword ||
    `${brandBase} skates`;

  const secondary = filtered
    .filter((k) => k.keyword_data?.keyword !== primary)
    .slice(0, 10)
    .map((k) => k.keyword_data?.keyword)
    .filter(Boolean);
  const longtail = filtered
    .filter((k) => (k.keyword_data?.keyword_properties?.keyword_difficulty || 100) < 40)
    .slice(0, 5)
    .map((k) => k.keyword_data?.keyword)
    .filter(Boolean);

  const intentCounts = {};
  filtered.forEach((k) => {
    const intent = k.keyword_data?.search_intent_info?.main_intent || 'unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  });
  const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'commercial';

  const faqQuestions = extractFAQQuestionsFromKeywords(
    filtered.map((k) => ({
      keyword: k.keyword_data?.keyword,
      intent: k.keyword_data?.search_intent_info?.main_intent,
      searchVolume: k.keyword_data?.keyword_info?.search_volume,
    })),
    brand.name,
  );

  return {primary, secondary, longtail, intent: dominantIntent, faqQuestions, rawItems: filtered};
}

/** Build keyword targeting from master list data (no DataForSEO call) */
function buildKeywordsFromMasterList(brand) {
  const ranked = brand.liveKeywords?.keywords || [];
  const opps = brand.opportunityKeywords?.items || [];
  const cannibal = brand.cannibalizationKeywords || [];

  const allKws = [...ranked, ...opps, ...cannibal].sort((a, b) => (b.searchVolume || b.volume || 0) - (a.searchVolume || a.volume || 0));

  // v2: Primary keyword must mention the brand name — never a generic term
  const brandBase = brand.name
    .toLowerCase()
    .replace(/\s+skates?$/i, '')
    .trim();
  const brandedKw = allKws.find((k) => (k.keyword || '').toLowerCase().includes(brandBase));
  const primary = brandedKw?.keyword || `${brandBase} skates`;

  const secondary = allKws
    .filter((k) => k.keyword !== primary)
    .slice(0, 10)
    .map((k) => k.keyword)
    .filter(Boolean);
  const longtail = allKws
    .slice(0, 20)
    .filter((k) => (k.keyword || '').split(' ').length >= 3)
    .slice(0, 5)
    .map((k) => k.keyword);

  const faqQuestions = extractFAQQuestionsFromKeywords(allKws, brand.name);

  return {primary, secondary, longtail, intent: 'commercial', faqQuestions, rawItems: allKws};
}

// ─── Step E: Generate content via Gemini ──────────────────────────────────────

async function generateBrandContent(brand, keywords, brandContext, options = {}) {
  const results = {};
  const isAuthorized = isAuthorizedBrand(brand.slug);

  if (SKIP_CONTENT) {
    console.log('    ⏭️  --skip-content: Skipping content generation');
    return results;
  }

  // 1. SEO title + meta description
  console.log('    🤖 Generating SEO meta...');
  try {
    const metaPrompt = brandMetaPrompt(brand, keywords.primary, {isAuthorized});
    const metaRaw = await generateContent(metaPrompt);
    results.meta = parseGeminiJSON(metaRaw);
    console.log(`       Title: "${results.meta.title}" (${results.meta.title?.length || 0}ch)`);
    console.log(`       Desc:  "${results.meta.metaDescription?.slice(0, 80)}..." (${results.meta.metaDescription?.length || 0}ch)`);
  } catch (err) {
    console.warn(`    ⚠️  Meta generation failed: ${err.message}`);
  }

  await sleep(6500); // Respect Gemini 10 RPM rate limit

  // 2. Brand description (main body content) — no product section, uses brandContext
  console.log('    🤖 Generating brand description...');
  try {
    const descPrompt = brandDescriptionPrompt(brand, keywords, brandContext, {
      isAuthorized,
      productCount: options.productCount || 0,
      productCategories: options.productCategories || [],
    });
    results.description = await generateContent(descPrompt);
    const wc = wordCount(stripHtml(results.description));
    console.log(`       ${wc} words generated`);
  } catch (err) {
    console.warn(`    ⚠️  Description generation failed: ${err.message}`);
  }

  await sleep(6500);

  // 3. FAQ questions and answers — with brand context for grounding
  console.log('    🤖 Generating FAQs...');
  try {
    const faqPrompt = brandFAQPrompt(brand, keywords.faqQuestions, brandContext);
    const faqRaw = await generateContent(faqPrompt);
    results.faqs = parseGeminiJSON(faqRaw);
    if (!Array.isArray(results.faqs)) throw new Error('Expected array');
    console.log(`       ${results.faqs.length} FAQ pairs generated`);
  } catch (err) {
    console.warn(`    ⚠️  FAQ generation failed: ${err.message}`);
    results.faqs = [];
  }

  return results;
}

// ─── Step F: Assemble content for each WP field ───────────────────────────────

/**
 * SHORT description — goes in `description` field (renders ABOVE products).
 * WordPress default: ~80-100 words max. Badge + first intro sentence only.
 */
function assembleShortDescription(brand, generated) {
  const parts = [];
  const isAuthorized = isAuthorizedBrand(brand.slug);

  // 1. Authorized retailer badge
  if (isAuthorized) {
    parts.push(buildAuthorizedBadge(brand.name));
  }

  // 2. First paragraph of the generated description only
  if (generated.description) {
    const firstPara = generated.description.match(/<p[\s\S]*?<\/p>/i)?.[0] || '';
    if (firstPara) parts.push(firstPara);
  }

  return parts.join('\n');
}

/**
 * FULL content — goes in `psp_brand_content` meta field (renders BELOW products).
 *
 * v2: Product links now come from real scrape data (not Gemini hallucinations).
 *     Gemini description no longer includes a "Products" section.
 *     Internal links use buildInternalLinks() with verified products + real categories.
 */
function assembleFullContent(brand, generated, scrapedProducts, productCategories) {
  const parts = [];

  // 1. Full description body (About + Why Buy + Expert Advice — no products section)
  if (generated.description) {
    parts.push(generated.description);
  }

  // 2. Featured products from live scrape + relevant categories
  const categoryLinks = productCategories.map((c) => ({
    slug: c.slug,
    name: c.name,
    title: `Shop ${c.name} from ${brand.name}`,
  }));
  const internalLinksHtml = buildInternalLinks(brand.name, scrapedProducts, categoryLinks);
  if (internalLinksHtml) {
    parts.push(internalLinksHtml);
  }

  // 3. FAQ section (plain HTML — wp_kses_post allows h2/h3/p/div)
  if (!SKIP_SCHEMA && generated.faqs && generated.faqs.length > 0) {
    parts.push('\n<div class="brand-faq">');
    parts.push(`<h2>${brand.name} — Frequently Asked Questions</h2>`);
    generated.faqs.forEach((faq) => {
      parts.push(`<h3>${faq.question}</h3>\n<p>${faq.answer}</p>`);
    });
    parts.push('</div>');
  }

  return parts.join('\n');
}

/**
 * FAQ schema JSON string — goes in `psp_brand_schema` meta field.
 * PHP mu-plugin outputs this in <head> via wp_head hook (bypasses wp_kses_post).
 * Returns null if no FAQs or schema is disabled.
 * Returns raw JSON only — PHP wraps it in <script type="application/ld+json">.
 */
function assembleFAQSchema(generated) {
  if (SKIP_SCHEMA || !generated.faqs || generated.faqs.length === 0) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: generated.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {'@type': 'Answer', text: faq.answer},
    })),
  };
  return JSON.stringify(schema, null, 2);
}

// ─── Step G: Update WP taxonomy term description ──────────────────────────────

async function updateTermDescription(endpoint, isWC, termId, newDescription) {
  const authHeader = isWC && WC_AUTH ? WC_AUTH : WP_AUTH;
  const payload = {description: newDescription};

  const res = await fetch(`${endpoint}/${termId}`, {
    method: 'POST',
    headers: {Authorization: authHeader, 'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update description failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  return res.json();
}

// ─── Step G2: Update psp_brand_content meta (below products) ─────────────────

async function updateBrandContent(termId, content) {
  const res = await fetch(`${BASE}/wp-json/wp/v2/pwb-brand/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({meta: {psp_brand_content: content}}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update brand content failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  return res.json();
}

// ─── Step G3: Update psp_brand_schema meta (FAQPage JSON-LD via wp_head) ─────

async function updateBrandSchema(termId, schemaJson) {
  const res = await fetch(`${BASE}/wp-json/wp/v2/pwb-brand/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({meta: {psp_brand_schema: schemaJson}}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update brand schema failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  return res.json();
}

// ─── Step H: Update SEO meta fields ──────────────────────────────────────────
//
// Rank Math stores three term meta keys (registered with show_in_rest: true):
//   rank_math_title          → SEO title (overrides the template)
//   rank_math_description    → Meta description
//   rank_math_focus_keyword  → Focus keyword (drives the content analysis score)
//
// Strategy A: Rank Math's own REST endpoint (/wp-json/rankmath/v1/updateMeta)
//   - Used internally by the block editor panel
//   - Returns 200 even on soft errors, so we verify `data.success` in the body
// Strategy B: Direct term meta via WP REST (/wp/v2/pwb-brand/{id})
//   - Most reliable when Strategy A is unavailable or returns no confirmation
//   - Verified by checking the response body includes `rank_math_title`

async function updateSEOMeta(taxonomySlug, termId, metaTitle, metaDescription, focusKeyword) {
  if (!metaTitle && !metaDescription) return {plugin: 'none', success: false};

  // Strategy A: Rank Math REST endpoint
  try {
    const rmRes = await fetch(`${BASE}/wp-json/rankmath/v1/updateMeta`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        objectID: termId,
        objectType: 'term',
        title: metaTitle || '',
        description: metaDescription || '',
        ...(focusKeyword ? {focusKeyword} : {}),
      }),
    });

    if (rmRes.ok) {
      const body = await rmRes.json();
      // Rank Math returns {success: true} on a real write; an empty {} means it silently failed
      if (body?.success === true) {
        return {plugin: 'rankmath_endpoint', success: true};
      }
    }
  } catch {}

  // Strategy B: Direct term meta via WP REST API
  // rank_math_title / rank_math_description / rank_math_focus_keyword are registered
  // by Rank Math with show_in_rest:true — they appear in the response meta object on success.
  try {
    const metaPayload = {
      meta: {
        rank_math_title: metaTitle || '',
        rank_math_description: metaDescription || '',
        ...(focusKeyword ? {rank_math_focus_keyword: focusKeyword} : {}),
      },
    };

    const metaRes = await fetch(`${BASE}/wp-json/wp/v2/${taxonomySlug}/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify(metaPayload),
    });

    if (metaRes.ok) {
      const body = await metaRes.json();
      // Verify the key actually landed — unregistered meta is silently dropped by WP
      if (body?.meta?.rank_math_title !== undefined) {
        return {plugin: 'rankmath_rest_meta', success: true};
      }
      // Key not in response — meta likely not registered (Rank Math not active or old version)
      return {
        plugin: 'none',
        success: false,
        warning: 'rank_math_title not present in REST response — Rank Math may not be active or is below v1.0.73. Set meta manually in WP Admin.',
      };
    }
  } catch {}

  return {
    plugin: 'none',
    success: false,
    warning: 'Could not update Rank Math SEO meta. Set title/description manually in WP Admin > Brands > Edit brand > Rank Math panel.',
  };
}

// ─── Step I: Inspect all termmeta (diagnostic) ───────────────────────────────
//
// Calls our custom PSP REST endpoint to list every meta key on the brand term.
// Used to identify old/orphaned content fields that need clearing.

async function inspectBrandMeta(termId) {
  try {
    const res = await fetch(`${BASE}/wp-json/psp/v1/brand-meta/${termId}`, {
      headers: {Authorization: WP_AUTH},
    });
    if (!res.ok) {
      console.warn(`    ⚠️  Meta inspect failed: HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`    ⚠️  Meta inspect error: ${err.message}`);
    return null;
  }
}

// ─── Step J: Clear old brand content meta keys ───────────────────────────────
//
// Calls our PSP cleanup endpoint which deletes all known old PWB/Yoast fields.
// Also probes termmeta for any large text fields that might be old content.

async function clearOldBrandContent(termId) {
  const results = {cleared: [], errors: []};

  // 1. Call the batch-clear endpoint (handles known PWB + Yoast keys)
  try {
    const res = await fetch(`${BASE}/wp-json/psp/v1/brand-clear-old/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    });
    if (res.ok) {
      const body = await res.json();
      if (body.count > 0) {
        results.cleared.push(...body.cleared);
        console.log(`    🧹  Cleared ${body.count} old meta key(s): ${body.cleared.join(', ')}`);
      }
    }
  } catch (err) {
    results.errors.push(`batch-clear: ${err.message}`);
  }

  // 2. Probe for any additional large text meta (possible old SEO content)
  try {
    const meta = await inspectBrandMeta(termId);
    if (meta?.meta) {
      const suspicious = Object.entries(meta.meta).filter(([key, info]) => {
        // Skip our own fields
        if (key.startsWith('psp_') || key.startsWith('rank_math_')) return false;
        // Flag any text fields over 200 chars that might be old content
        return info.length && info.length > 200;
      });

      if (suspicious.length > 0) {
        console.log(`    ⚠️  Found ${suspicious.length} suspicious large meta field(s):`);
        for (const [key, info] of suspicious) {
          console.log(`         ${key}: ${info.length} chars — "${String(info.value).slice(0, 80)}..."`);
        }
        console.log(`         → Use DELETE /wp-json/psp/v1/brand-meta/${termId}/<key> to clear manually.`);
      }
    }
  } catch {}

  return results;
}

// ─── Process a single brand ───────────────────────────────────────────────────

async function processBrand(brand, taxEndpoint, taxSlug, isWC) {
  const startTime = Date.now();
  const log = loadLog();
  const brandLog = log[brand.slug] || [];
  const lastRun = brandLog[brandLog.length - 1];

  // Resume-safe: skip if already optimized (unless --force)
  if (lastRun && !FORCE) {
    console.log(`  ⏭️  ${brand.name} — already optimized on ${lastRun.timestamp.split('T')[0]}. Use --force to re-run.`);
    return {skipped: true};
  }

  console.log(`\n  🔧  ${brand.name} (${brand.slug}) — priority #${brand.priorityRank || '?'}`);
  console.log(`       Products: ${brand.taxonomy?.count || 0} | SEO score: ${brand.seoScore || '?'}/100 | Content: ${brand.contentScore || 'unknown'}`);

  // ── A. Fetch current WP state ────────────────────────────────────────────
  let currentTerm;
  try {
    currentTerm = await fetchTerm(taxEndpoint, isWC, brand.id);
    console.log(`       Current description: ${wordCount(stripHtml(currentTerm.description || ''))} words`);
  } catch (err) {
    console.error(`    ❌  Could not fetch term ${brand.id}: ${err.message}`);
    return {success: false, error: err.message};
  }

  // ── A2. Extract brand context from existing WP description ───────────────
  const brandContext = extractBrandContext(currentTerm.description || '', brand.slug);
  if (brandContext.hasExistingContent) {
    console.log(
      `       Brand context: website=${brandContext.websiteUrl || 'none'}, origin=${brandContext.origin || 'unknown'}, founders=${brandContext.founders || 'unknown'}`,
    );
  } else {
    console.log(`       Brand context: no existing description. Website fallback: ${brandContext.websiteUrl || 'none'}`);
  }

  // ── B. Scrape real products from live brand page (replaces WC API) ───────
  console.log('       Scraping live brand page for products...');
  const scrapedProducts = await scrapeBrandPageProducts(brand.slug);
  console.log(`       Products scraped: ${scrapedProducts.length}`);
  if (scrapedProducts.length > 0) {
    console.log(
      `       Sample: ${scrapedProducts
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ')}`,
    );
  }

  // Extract product categories from the scraped products
  const productCategories = extractProductCategories(scrapedProducts);
  if (productCategories.length > 0) {
    console.log(`       Categories found: ${productCategories.map((c) => c.name).join(', ')}`);
  }

  // ── C. Get DataForSEO keywords ───────────────────────────────────────────
  let keywords;
  try {
    keywords = await getKeywordsForContent(brand);
    console.log(`       Primary keyword: "${keywords.primary}"`);
    console.log(`       Secondary count: ${keywords.secondary.length} | FAQ questions: ${keywords.faqQuestions.length}`);
  } catch (err) {
    console.warn(`    ⚠️  Keyword fetch failed: ${err.message}. Using fallback.`);
    keywords = buildKeywordsFromMasterList(brand);
  }

  // ── D. Generate content via Gemini (with brand context) ──────────────────
  const generated = await generateBrandContent(brand, keywords, brandContext, {
    productCount: scrapedProducts.length || brand.taxonomy?.count || 0,
    productCategories: productCategories.map((c) => c.name),
  });

  // ── D2. Validate Rank Math meta lengths (warn before write, not after) ──
  if (generated.meta) {
    const titleLen = (generated.meta.title || '').length;
    const descLen = (generated.meta.metaDescription || '').length;
    if (titleLen < 50 || titleLen > 60) {
      console.warn(`    ⚠️  SEO title is ${titleLen} chars — Rank Math wants 50–60. Gemini may need another pass.`);
    }
    if (descLen < 150 || descLen > 160) {
      console.warn(`    ⚠️  Meta description is ${descLen} chars — Rank Math wants 150–160. Gemini may need another pass.`);
    }
    const kwInTitle = (generated.meta.title || '').toLowerCase().includes(keywords.primary.toLowerCase());
    if (!kwInTitle) {
      console.warn(`    ⚠️  Primary keyword "${keywords.primary}" not found in SEO title — Rank Math will flag this.`);
    }
  }

  // ── E. Assemble content for each WP field ───────────────────────────────
  // Keep existing content in all fields if --skip-content
  const shortDesc = !SKIP_CONTENT ? assembleShortDescription(brand, generated) : currentTerm.description || '';
  const fullContent = !SKIP_CONTENT ? assembleFullContent(brand, generated, scrapedProducts, productCategories) : '';
  const faqSchema = !SKIP_CONTENT ? assembleFAQSchema(generated) : null;

  const shortWordCount = wordCount(stripHtml(shortDesc));
  const fullWordCount = wordCount(stripHtml(fullContent));
  const oldWordCount = wordCount(stripHtml(currentTerm.description || ''));

  console.log(`       Before: ${oldWordCount} words in description`);
  console.log(`       After:  ${shortWordCount} words (short desc above) + ${fullWordCount} words (content below)`);

  if (DRY_RUN) {
    console.log('\n       ── DRY RUN PREVIEW ──');
    if (generated.meta) {
      const tLen = (generated.meta.title || '').length;
      const dLen = (generated.meta.metaDescription || '').length;
      const tFlag = tLen < 50 || tLen > 60 ? ` ⚠️  ${tLen} chars — Rank Math wants 50–60` : ` ✓ ${tLen} chars`;
      const dFlag = dLen < 150 || dLen > 160 ? ` ⚠️  ${dLen} chars — Rank Math wants 150–160` : ` ✓ ${dLen} chars`;
      console.log(`       SEO Title:    ${generated.meta.title}${tFlag}`);
      console.log(`       SEO Desc:     ${generated.meta.metaDescription}${dFlag}`);
      console.log(`       Focus KW:     ${keywords.primary}`);
    }
    console.log(`       Short description (above products):`);
    console.log('       ' + stripHtml(shortDesc).slice(0, 300).replace(/\n/g, '\n       '));
    console.log(`\n       Full content preview (below products, first 400 chars):`);
    console.log('       ' + stripHtml(fullContent).slice(0, 400).replace(/\n/g, '\n       '));
    if (generated.faqs && generated.faqs.length > 0) {
      console.log(`\n       FAQs: ${generated.faqs.map((f) => f.question).join(' | ')}`);
    }
    return {success: true, dryRun: true, oldWordCount, shortWordCount, fullWordCount};
  }

  // ── F. Write to WordPress ────────────────────────────────────────────────

  // F0. Clear old brand content meta (before writing new)
  try {
    await clearOldBrandContent(brand.id);
    await sleep(200);
  } catch (err) {
    console.warn(`    ⚠️  Old content cleanup failed: ${err.message} (continuing)`);
  }

  let descWritten = false;
  let contentWritten = false;
  let schemaWritten = false;
  let oldContentCleared = false;
  let metaResult = {plugin: 'none', success: false};

  // F1. Short description (above products)
  try {
    await updateTermDescription(taxEndpoint, isWC, brand.id, shortDesc);
    descWritten = true;
    console.log(`    ✅  Short description updated (${shortWordCount} words, above products)`);
    await sleep(300);
  } catch (err) {
    console.error(`    ❌  Short description update failed: ${err.message}`);
  }

  // F2. Full content (below products via psp_brand_content meta)
  if (fullContent) {
    try {
      await updateBrandContent(brand.id, fullContent);
      contentWritten = true;
      console.log(`    ✅  Brand content updated (${fullWordCount} words, below products)`);
      await sleep(300);
    } catch (err) {
      console.error(`    ❌  Brand content update failed: ${err.message}`);
      console.error(`        Ensure psp-brand-content-field.php is installed in wp-content/mu-plugins/`);
    }
  }

  // F3. FAQPage schema (output in <head> via psp_brand_schema meta)
  if (faqSchema) {
    try {
      await updateBrandSchema(brand.id, faqSchema);
      schemaWritten = true;
      console.log(`    ✅  FAQPage schema updated (${generated.faqs?.length || 0} Q&As, output in <head>)`);
      await sleep(300);
    } catch (err) {
      console.error(`    ❌  Schema update failed: ${err.message}`);
    }
  }

  // Update SEO meta (title, description, focus keyword)
  if (generated.meta) {
    const taxRouteSlug = taxEndpoint.split('/').pop();
    metaResult = await updateSEOMeta(
      taxRouteSlug,
      brand.id,
      generated.meta.title,
      generated.meta.metaDescription,
      keywords.primary, // Sets rank_math_focus_keyword
    );

    if (metaResult.success) {
      console.log(`    ✅  SEO meta updated via ${metaResult.plugin}`);
    } else {
      console.warn(`    ⚠️  SEO meta: ${metaResult.warning || 'not updated'}`);
      console.warn('        Manual fix: set these in WordPresssadmin > Taxonomy page editor');
      console.warn(`        Title:       ${generated.meta.title}`);
      console.warn(`        Description: ${generated.meta.metaDescription}`);
    }
    await sleep(300);
  }

  // ── G. Log result ────────────────────────────────────────────────────────
  const duration = Math.round((Date.now() - startTime) / 1000);
  const logEntry = {
    brandName: brand.name,
    priorityRank: brand.priorityRank,
    descriptionUpdated: descWritten,
    contentUpdated: contentWritten,
    schemaUpdated: schemaWritten,
    metaPlugin: metaResult.plugin,
    metaUpdated: metaResult.success,
    beforeWordCount: oldWordCount,
    shortDescWordCount: shortWordCount,
    fullContentWordCount: fullWordCount,
    primaryKeyword: keywords.primary,
    faqCount: generated.faqs?.length || 0,
    hasBadge: isAuthorizedBrand(brand.slug),
    hasSchema: !SKIP_SCHEMA && (generated.faqs?.length || 0) > 0,
    durationSeconds: duration,
  };

  appendLog(brand.slug, logEntry);

  return {success: descWritten || contentWritten, ...logEntry};
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n⚡  Brand Page Optimizer');
  hr();
  console.log(`  Target:       ${BASE}`);
  console.log(`  Mode:         ${DRY_RUN ? 'DRY RUN (no WordPress writes)' : 'LIVE ⚠️'}`);
  console.log(`  Skip content: ${SKIP_CONTENT ? 'YES (meta only)' : 'NO'}`);
  console.log(`  Skip schema:  ${SKIP_SCHEMA ? 'YES' : 'NO'}`);
  console.log(`  DataForSEO:   ${SKIP_DATAFORSEO ? 'SKIPPED' : 'ENABLED'}`);
  console.log(`  Force re-run: ${FORCE ? 'YES' : 'NO (resume-safe)'}`);
  if (DRY_RUN) console.log('\n  ⚠️  Dry run — showing preview only. Nothing will be written to WordPress.');
  hr();

  // ── Load master list ──────────────────────────────────────────────────────
  if (!fs.existsSync(MASTER_LIST_PATH)) {
    console.error(`\n❌  ${MASTER_LIST_PATH} not found.`);
    console.error('    Run Phase 1 scripts first:\n');
    console.error('    node wordpress/scripts/discover-brand-taxonomy.js');
    console.error('    node wordpress/scripts/build-brand-priority-list.js\n');
    process.exit(1);
  }

  console.log('\n1. Loading master brand list...');
  const masterData = JSON.parse(fs.readFileSync(MASTER_LIST_PATH, 'utf8'));
  const allBrands = masterData.brands || [];
  console.log(`   ${allBrands.length} brands loaded`);

  // ── Discover taxonomy endpoint ────────────────────────────────────────────
  console.log('\n2. Discovering taxonomy endpoint...');
  const {endpoint: taxEndpoint, isWC} = await discoverTaxonomyEndpoint();
  const taxSlug = taxEndpoint.split('/wp-json/')[1]?.replace(/\/$/, '').split('/').pop() || 'brand';
  console.log(`   Endpoint: ${taxEndpoint}`);
  console.log(`   Type:     ${isWC ? 'WooCommerce' : 'WP taxonomy'}`);

  // ── Select target brands ──────────────────────────────────────────────────
  let targetBrands;

  if (TARGET_SLUG) {
    const found = allBrands.find((b) => b.slug === TARGET_SLUG);
    if (!found) {
      console.error(`\n❌  Brand "${TARGET_SLUG}" not found in master list.`);
      console.error(
        `    Available slugs: ${allBrands
          .slice(0, 10)
          .map((b) => b.slug)
          .join(', ')}...\n`,
      );
      process.exit(1);
    }
    targetBrands = [found];
  } else if (BATCH_FILE) {
    const batchPath = path.resolve(process.cwd(), BATCH_FILE);
    const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const slugs = Array.isArray(batchData) ? batchData : batchData.slugs || [];
    targetBrands = slugs.map((s) => allBrands.find((b) => b.slug === s)).filter(Boolean);
    console.log(`   Batch file: ${targetBrands.length} brands loaded from ${BATCH_FILE}`);
  } else if (TOP_N) {
    targetBrands = allBrands.slice(0, TOP_N);
    console.log(`\n3. Processing top ${TOP_N} brands by priority score...`);
  } else {
    targetBrands = allBrands;
    console.log(`\n3. Processing all ${allBrands.length} brands in priority order...`);
  }

  // Filter out 0-product brands unless forced
  if (!FORCE && !TARGET_SLUG) {
    const before = targetBrands.length;
    targetBrands = targetBrands.filter((b) => (b.taxonomy?.count || 0) > 0);
    if (before !== targetBrands.length) {
      console.log(`   Skipped ${before - targetBrands.length} brands with 0 products (use --force to include)`);
    }
  }

  // ── Estimate time ─────────────────────────────────────────────────────────
  const log = loadLog();
  const alreadyDone = targetBrands.filter((b) => log[b.slug] && !FORCE).length;
  const toProcess = targetBrands.length - alreadyDone;
  const estMinutes = Math.ceil((toProcess * 25) / 60); // ~25s per brand
  console.log(`\n   ${targetBrands.length} total | ${alreadyDone} already done | ${toProcess} to process`);
  if (toProcess > 1) console.log(`   Estimated time: ~${estMinutes} minute${estMinutes !== 1 ? 's' : ''}`);

  // ── Process brands ────────────────────────────────────────────────────────
  hr();

  let processed = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targetBrands.length; i++) {
    const brand = targetBrands[i];

    try {
      const result = await processBrand(brand, taxEndpoint, taxSlug, isWC);

      if (result.skipped) {
        skipped++;
      } else if (result.success || result.dryRun) {
        succeeded++;
        processed++;
      } else {
        failed++;
        processed++;
      }
    } catch (err) {
      console.error(`\n  ❌  ${brand.name}: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
      failed++;
      processed++;
    }

    // Rate limiting between brands
    if (i < targetBrands.length - 1 && !targetBrands[i + 1]?.skipped) {
      const delay = SKIP_CONTENT ? 500 : 2000; // Less wait if no Gemini calls
      await sleep(delay);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n');
  hr();
  console.log(`✅  Brand optimization complete`);
  hr();
  console.log(`  Processed: ${processed}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Skipped:   ${skipped} (already done)`);
  console.log(`  Failed:    ${failed}`);
  if (!DRY_RUN) {
    console.log(`  Log:       ${LOG_PATH}`);
  }
  if (DRY_RUN) {
    console.log('\n  ⚠️  Dry run complete — no changes written to WordPress.');
    console.log('  Remove --dry-run to apply changes.\n');
  } else {
    console.log('\n  Next steps:');
    console.log('  1. Visit 2-3 brand pages in browser and verify content renders correctly');
    console.log('  2. Check WordPress admin > Brand taxonomy to confirm descriptions saved');
    console.log('  3. View page source and verify FAQPage schema is present');
    console.log('  4. Submit updated brand pages to Google Search Console\n');
  }
})().catch((err) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
