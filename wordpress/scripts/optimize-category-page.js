#!/usr/bin/env node
/**
 * optimize-category-page.js
 *
 * TARGET: proskatersplace.com (US site) — primary market: USA, secondary: worldwide
 * NOTE:   The Nuxt/Vue frontend (proskatersplace.ca) is a separate Canadian project.
 *
 * Phase 2 — Comprehensive WooCommerce product category page optimization.
 * For each target category: fetches live data, researches keywords via DataForSEO,
 * generates SEO-optimized content via Gemini, and applies updates to WordPress REST API.
 *
 * Key differences from optimize-brand-page.js:
 *   - Taxonomy: product_cat (WC standard) instead of pwb-brand
 *   - Content focuses on WHAT products ARE (buying guides, use cases)
 *   - Can rename category display name to match higher-volume keyword (never slug)
 *   - Below-products content uses a theme-specific meta field such as
 *     "below_category_content" or "second_desc"
 *   - FAQ schema stored in psp_cat_schema term meta
 *
 * Run order: Requires discover-category-taxonomy.js output first
 * Tier: 2 — writes to WordPress (description, below content, SEO meta, name)
 *
 * Usage:
 *   # Single category — dry run
 *   node wordpress/scripts/optimize-category-page.js --category=inline-skates --dry-run
 *
 *   # Single category — apply
 *   node wordpress/scripts/optimize-category-page.js --category=inline-skates
 *
 *   # Top 5 priority categories (first batch test)
 *   node wordpress/scripts/optimize-category-page.js --top=5 --dry-run
 *   node wordpress/scripts/optimize-category-page.js --top=5
 *
 *   # All categories in priority order (resume-safe)
 *   node wordpress/scripts/optimize-category-page.js --all --dry-run
 *   node wordpress/scripts/optimize-category-page.js --all
 *
 *   # Batch file
 *   node wordpress/scripts/optimize-category-page.js --batch=cats.json --dry-run
 *
 *   # Skip content generation (update meta only)
 *   node wordpress/scripts/optimize-category-page.js --category=inline-skates --skip-content
 *
 *   # Force re-optimize already-done categories
 *   node wordpress/scripts/optimize-category-page.js --all --force
 *
 *   # Skip DataForSEO (use master list keywords only)
 *   node wordpress/scripts/optimize-category-page.js --top=5 --skip-dataforseo
 *
 *   # Skip category name changes
 *   node wordpress/scripts/optimize-category-page.js --all --skip-rename
 *
 * Input:  data/category-master-list.json (from discover-category-taxonomy.js)
 * Output: data/category-optimization-log.json (append)
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {generateContent} = require('./lib/gemini');
const {relatedKeywords, keywordSuggestions, searchVolume} = require('./lib/dataforseo');
const {
  categoryDescriptionPrompt,
  categoryBelowContentPrompt,
  categoryFAQPrompt,
  categoryMetaPrompt,
  suggestCategoryNamePrompt,
  extractCategoryContext,
  extractCategoryFAQQuestions,
  buildCategoryInternalLinks,
  buildFAQSchema,
  CATEGORY_RELATIONS,
  SITE_URL,
} = require('./lib/category-prompts');

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

// ─── Flags ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const SKIP_CONTENT = process.argv.includes('--skip-content');
const SKIP_SCHEMA = process.argv.includes('--skip-schema');
const SKIP_DATAFORSEO = process.argv.includes('--skip-dataforseo');
const SKIP_RENAME = process.argv.includes('--skip-rename');

const CAT_ARG = process.argv.find((a) => a.startsWith('--category='));
const TOP_ARG = process.argv.find((a) => a.startsWith('--top='));
const BATCH_ARG = process.argv.find((a) => a.startsWith('--batch='));
const RUN_ALL = process.argv.includes('--all');

const TARGET_SLUG = CAT_ARG?.split('=')[1];
const TOP_N = TOP_ARG ? parseInt(TOP_ARG.split('=')[1], 10) : null;
const BATCH_FILE = BATCH_ARG?.split('=')[1];

if (!TARGET_SLUG && !RUN_ALL && !TOP_N && !BATCH_FILE) {
  console.error('ERROR: Specify --category=slug, --all, --top=N, or --batch=file.json');
  console.error('       Add --dry-run to preview without writing to WordPress');
  process.exit(1);
}

const MASTER_LIST_PATH = path.resolve(__dirname, '../../data/categories/category-master-list.json');
const LOG_PATH = path.resolve(__dirname, '../../data/categories/category-optimization-log.json');

// ─── Known below-content field names ──────────────────────────────────────────
// Theme implementations vary. We probe all known keys and use whichever exists.
const BELOW_CONTENT_FIELD_CANDIDATES = [
  'below_category_content', // Theme field rendered on the current test site
  'second_desc', // Shoptimizer standard
  'seconddesc', // Alternative
  'cat_second_desc', // Older Shoptimizer versions
  'bottom_description', // Some themes
];

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

function parseGeminiJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Optimization log ─────────────────────────────────────────────────────────

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

// ─── Step A: Fetch WP category term via REST API ──────────────────────────────

async function fetchCategoryTerm(termId) {
  // Try WC REST API first (richer data)
  if (WC_AUTH) {
    const res = await fetch(`${BASE}/wp-json/wc/v3/products/categories/${termId}`, {
      headers: {Authorization: WC_AUTH},
    });
    if (res.ok) {
      const data = await res.json();
      return {data, source: 'wc'};
    }
  }

  // Fallback to WP taxonomy endpoint
  const res = await fetch(`${BASE}/wp-json/wp/v2/product_cat/${termId}`, {
    headers: {Authorization: WP_AUTH},
  });
  if (!res.ok) throw new Error(`Fetch category ${termId} failed: HTTP ${res.status}`);
  const data = await res.json();
  return {data, source: 'wp'};
}

// ─── Step A2: Discover the below-content field name ───────────────────────────

let _belowContentField = null;

async function discoverBelowContentField(termId) {
  if (_belowContentField) return _belowContentField;

  // Query all term meta via our custom endpoint (if available)
  try {
    const res = await fetch(`${BASE}/wp-json/psp/v1/category-meta/${termId}`, {
      headers: {Authorization: WP_AUTH},
    });
    if (res.ok) {
      const body = await res.json();
      const metaKeys = Object.keys(body.meta || {});
      for (const candidate of BELOW_CONTENT_FIELD_CANDIDATES) {
        if (metaKeys.includes(candidate)) {
          _belowContentField = candidate;
          console.log(`       Below-content field discovered: "${candidate}"`);
          return candidate;
        }
      }
    }
  } catch {}

  // Default to the field currently rendered on the test site.
  _belowContentField = 'below_category_content';
  console.log(`       Below-content field: using default "below_category_content"`);
  return _belowContentField;
}

// ─── Step B: Get DataForSEO keywords for category ─────────────────────────────

async function getKeywordsForCategory(category) {
  if (SKIP_DATAFORSEO) {
    return buildKeywordsFromMasterList(category);
  }

  const searchTerm = category.name.toLowerCase();
  const allItems = [];

  try {
    const related = await relatedKeywords(searchTerm, {
      locationCode: 2840,
      depth: 1,
      limit: 50,
      orderBy: ['keyword_data.keyword_info.search_volume,desc'],
    });
    allItems.push(...(related.items || []));
    await sleep(500);
  } catch (err) {
    console.warn(`    ⚠️  relatedKeywords failed: ${err.message}`);
  }

  try {
    const suggestions = await keywordSuggestions(searchTerm, {
      locationCode: 2840,
      limit: 50,
    });
    allItems.push(...(suggestions.items || []));
  } catch (err) {
    console.warn(`    ⚠️  keywordSuggestions failed: ${err.message}`);
  }

  if (allItems.length === 0) return buildKeywordsFromMasterList(category);

  // Filter & deduplicate
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

  // Primary keyword — the highest-volume keyword relevant to this category
  const catWords = searchTerm.split(/\s+/).filter((w) => w.length > 2);
  const relevantKws = filtered.filter((k) => {
    const kw = (k.keyword_data?.keyword || '').toLowerCase();
    return catWords.some((w) => kw.includes(w));
  });

  const primary = relevantKws[0]?.keyword_data?.keyword || filtered[0]?.keyword_data?.keyword || searchTerm;

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

  // Determine dominant intent
  const intentCounts = {};
  filtered.forEach((k) => {
    const intent = k.keyword_data?.search_intent_info?.main_intent || 'unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  });
  const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'commercial';

  const faqQuestions = extractCategoryFAQQuestions(
    filtered.map((k) => ({
      keyword: k.keyword_data?.keyword,
      intent: k.keyword_data?.search_intent_info?.main_intent,
      searchVolume: k.keyword_data?.keyword_info?.search_volume,
    })),
    category.name,
  );

  return {primary, secondary, longtail, intent: dominantIntent, faqQuestions, rawItems: filtered};
}

function buildKeywordsFromMasterList(category) {
  const kw = category.keywords || {};
  return {
    primary: kw.primary || category.name.toLowerCase(),
    secondary: kw.secondary || [],
    longtail: kw.longtail || [],
    intent: 'commercial',
    faqQuestions: [],
    rawItems: kw.rawItems || [],
  };
}

// ─── Step C: Generate content via Gemini ──────────────────────────────────────

async function generateCategoryContent(category, keywords, categoryContext, options = {}) {
  const results = {};

  if (SKIP_CONTENT) {
    console.log('    ⏭️  --skip-content: Skipping content generation');
    return results;
  }

  // 1. SEO title + meta description
  console.log('    🤖 Generating SEO meta...');
  try {
    const metaPrompt = categoryMetaPrompt(category, keywords.primary, {
      productCount: category.count,
    });
    const metaRaw = await generateContent(metaPrompt);
    results.meta = parseGeminiJSON(metaRaw);
    console.log(`       Title: "${results.meta.title}" (${results.meta.title?.length || 0}ch)`);
    console.log(`       Desc:  "${results.meta.metaDescription?.slice(0, 80)}..." (${results.meta.metaDescription?.length || 0}ch)`);
  } catch (err) {
    console.warn(`    ⚠️  Meta generation failed: ${err.message}`);
  }

  await sleep(6500); // Respect Gemini 10 RPM rate limit

  // 2. Short description (above products)
  console.log('    🤖 Generating short description (above products)...');
  try {
    const descPrompt = categoryDescriptionPrompt(category, keywords, categoryContext, {
      subcategories: category.subcategories || [],
      parentName: category.parentName,
    });
    results.shortDescription = await generateContent(descPrompt);
    const wc = wordCount(stripHtml(results.shortDescription));
    console.log(`       ${wc} words generated`);
  } catch (err) {
    console.warn(`    ⚠️  Short description generation failed: ${err.message}`);
  }

  await sleep(6500);

  // 3. Below-products content (buying guide, types, why shop)
  console.log('    🤖 Generating below-products content...');
  try {
    const belowPrompt = categoryBelowContentPrompt(category, keywords, categoryContext, {
      subcategories: category.subcategories || [],
      parentName: category.parentName,
      topBrands: options.topBrands || [],
    });
    results.belowContent = await generateContent(belowPrompt);
    const wc = wordCount(stripHtml(results.belowContent));
    console.log(`       ${wc} words generated`);
  } catch (err) {
    console.warn(`    ⚠️  Below content generation failed: ${err.message}`);
  }

  await sleep(6500);

  // 4. FAQs
  console.log('    🤖 Generating FAQs...');
  try {
    const faqPrompt = categoryFAQPrompt(category, keywords.faqQuestions, categoryContext);
    const faqRaw = await generateContent(faqPrompt);
    results.faqs = parseGeminiJSON(faqRaw);
    if (!Array.isArray(results.faqs)) throw new Error('Expected array');
    console.log(`       ${results.faqs.length} FAQ pairs generated`);
  } catch (err) {
    console.warn(`    ⚠️  FAQ generation failed: ${err.message}`);
    results.faqs = [];
  }

  // 5. Category name suggestion (if enabled)
  if (!SKIP_RENAME && keywords.rawItems && keywords.rawItems.length > 0) {
    await sleep(6500);
    console.log('    🤖 Evaluating category name...');
    try {
      const namePrompt = suggestCategoryNamePrompt(category, keywords);
      const nameRaw = await generateContent(namePrompt);
      results.nameSuggestion = parseGeminiJSON(nameRaw);
      if (results.nameSuggestion.changed) {
        console.log(`       📝 Name change: "${category.name}" → "${results.nameSuggestion.suggestedName}"`);
        console.log(`          Reason: ${results.nameSuggestion.reason}`);
        console.log(`          Target: "${results.nameSuggestion.targetKeyword}" (${results.nameSuggestion.targetVolume}/mo)`);
      } else {
        console.log(`       ✓ Name "${category.name}" is already optimal`);
      }
    } catch (err) {
      console.warn(`    ⚠️  Name suggestion failed: ${err.message}`);
    }
  }

  return results;
}

// ─── Step D: Assemble content for WP fields ───────────────────────────────────

/**
 * Assemble the full below-products content (description + internal links + FAQs).
 */
function assembleBelowContent(category, generated, allCategories) {
  const parts = [];

  // 1. Full below-products content body
  if (generated.belowContent) {
    parts.push(generated.belowContent);
  }

  // 2. Internal links (subcategories + related)
  const relations = CATEGORY_RELATIONS[category.slug] || {};
  const relatedSlugs = relations.related || [];
  const relatedCategories = relatedSlugs
    .map((slug) => allCategories.find((c) => c.slug === slug))
    .filter(Boolean)
    .map((c) => ({name: c.name, slug: c.slug, url: c.url}));

  const subcategories = (category.subcategories || []).map((s) => ({
    name: s.name,
    slug: s.slug,
    count: s.count,
    url: s.url,
  }));

  const internalLinksHtml = buildCategoryInternalLinks(category.name, subcategories, relatedCategories);
  if (internalLinksHtml) {
    parts.push(internalLinksHtml);
  }

  // 3. FAQ section (plain HTML for display)
  if (!SKIP_SCHEMA && generated.faqs && generated.faqs.length > 0) {
    parts.push('\n<div class="category-faq">');
    parts.push(`<h2>${category.name} — Frequently Asked Questions</h2>`);
    generated.faqs.forEach((faq) => {
      parts.push(`<h3>${faq.question}</h3>\n<p>${faq.answer}</p>`);
    });
    parts.push('</div>');
  }

  return parts.join('\n');
}

// ─── Step E: Update WordPress ─────────────────────────────────────────────────

async function updateCategoryDescription(termId, description) {
  // Use WC REST API if available (preferred for product_cat)
  if (WC_AUTH) {
    const res = await fetch(`${BASE}/wp-json/wc/v3/products/categories/${termId}`, {
      method: 'PUT',
      headers: {Authorization: WC_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({description}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WC update description failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  // Fallback: WP REST API
  const res = await fetch(`${BASE}/wp-json/wp/v2/product_cat/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({description}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP update description failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function updateCategoryName(termId, name) {
  if (WC_AUTH) {
    const res = await fetch(`${BASE}/wp-json/wc/v3/products/categories/${termId}`, {
      method: 'PUT',
      headers: {Authorization: WC_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({name}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WC update name failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  const res = await fetch(`${BASE}/wp-json/wp/v2/product_cat/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({name}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WP update name failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function updateBelowContent(termId, content, fieldName) {
  // Use our custom PSP REST endpoint to keep supported below-content fields in sync.
  const res = await fetch(`${BASE}/wp-json/psp/v1/category-below-content/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({content, field: fieldName}),
  });

  if (!res.ok) {
    // Fallback: try writing directly as term meta via WP REST for every known alias.
    const fallbackMeta = Object.fromEntries(BELOW_CONTENT_FIELD_CANDIDATES.map((candidate) => [candidate, content]));
    const fallbackRes = await fetch(`${BASE}/wp-json/wp/v2/product_cat/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({meta: fallbackMeta}),
    });
    if (!fallbackRes.ok) {
      const body = await fallbackRes.text();
      throw new Error(`Update below content failed: HTTP ${fallbackRes.status} — ${body.slice(0, 300)}`);
    }
    return fallbackRes.json();
  }
  return res.json();
}

async function updateCategorySchema(termId, schemaJson) {
  try {
    const routeRes = await fetch(`${BASE}/wp-json/psp/v1/category-seo/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({schema: schemaJson}),
    });

    if (routeRes.ok) {
      return routeRes.json();
    }
  } catch {}

  const res = await fetch(`${BASE}/wp-json/wp/v2/product_cat/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({meta: {psp_cat_schema: schemaJson}}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update category schema failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function updateSEOMeta(termId, metaTitle, metaDescription, focusKeyword) {
  if (!metaTitle && !metaDescription) return {plugin: 'none', success: false};

  try {
    const routeRes = await fetch(`${BASE}/wp-json/psp/v1/category-seo/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        title: metaTitle || '',
        description: metaDescription || '',
        ...(focusKeyword ? {focus_keyword: focusKeyword} : {}),
      }),
    });

    if (routeRes.ok) {
      const body = await routeRes.json();
      if (body?.updated?.rank_math_title || body?.updated?.rank_math_description || body?.updated?.rank_math_focus_keyword) {
        return {plugin: 'psp_category_seo_route', success: true};
      }
    }
  } catch {}

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
      if (body?.success === true) {
        return {plugin: 'rankmath_endpoint', success: true};
      }
    }
  } catch {}

  // Strategy B: Direct term meta via WP REST API
  try {
    const metaPayload = {
      meta: {
        rank_math_title: metaTitle || '',
        rank_math_description: metaDescription || '',
        ...(focusKeyword ? {rank_math_focus_keyword: focusKeyword} : {}),
      },
    };

    const metaRes = await fetch(`${BASE}/wp-json/wp/v2/product_cat/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify(metaPayload),
    });

    if (metaRes.ok) {
      const body = await metaRes.json();
      if (body?.meta?.rank_math_title !== undefined) {
        return {plugin: 'rankmath_rest_meta', success: true};
      }
      return {
        plugin: 'none',
        success: false,
        warning:
          'rank_math_title not in REST response — Rank Math may not support product_cat meta via REST. Install psp-category-content-field.php mu-plugin.',
      };
    }
  } catch {}

  return {
    plugin: 'none',
    success: false,
    warning: 'Could not update Rank Math SEO meta. Set title/description manually in WordPress admin.',
  };
}

// ─── Step F: Scrape top brands from the category page ─────────────────────────

async function scrapeCategoryPageBrands(category) {
  const url = category?.url || `${BASE.replace(/\/$/, '')}/products/${category.slug}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PSP-CategoryOptimizer/1.0)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Extract brand names from product listings (if brand appears in CSS class or product names)
    const brandClasses = html.match(/product_brand-([a-z0-9-]+)/gi) || [];
    const brandCounts = {};
    for (const cls of brandClasses) {
      const brand = cls.replace('product_brand-', '');
      brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    }

    return Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([slug]) => slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()));
  } catch {
    return [];
  }
}

// ─── Process a single category ────────────────────────────────────────────────

async function processCategory(category, allCategories) {
  const startTime = Date.now();
  const log = loadLog();
  const catLog = log[category.slug] || [];
  const lastRun = catLog[catLog.length - 1];

  // Resume-safe: skip if already optimized (unless --force)
  if (lastRun && !FORCE) {
    console.log(`  ⏭️  ${category.name} — already optimized on ${lastRun.timestamp.split('T')[0]}. Use --force to re-run.`);
    return {skipped: true};
  }

  console.log(`\n  🔧  ${category.name} (${category.slug}) — priority #${category.priorityRank || '?'}`);
  console.log(`       Products: ${category.count} | Content: ${category.descriptionWordCount || 0} words | Parent: ${category.parentName || 'none'}`);

  // ── A. Fetch current WP state ────────────────────────────────────────────
  let currentTerm;
  try {
    const {data} = await fetchCategoryTerm(category.id);
    currentTerm = data;
    console.log(`       Current description: ${wordCount(stripHtml(currentTerm.description || ''))} words`);
  } catch (err) {
    console.error(`    ❌  Could not fetch category ${category.id}: ${err.message}`);
    return {success: false, error: err.message};
  }

  // ── A2. Discover below-content field name ────────────────────────────────
  const belowField = await discoverBelowContentField(category.id);

  // ── A3. Extract category context ─────────────────────────────────────────
  const categoryContext = extractCategoryContext(currentTerm.description || '', category.slug);
  if (categoryContext.hasExistingContent) {
    console.log(`       Existing content found: ${categoryContext.rawText.length} chars`);
  } else {
    console.log(`       No existing description content`);
  }

  // ── B. Get top brands from the category page ─────────────────────────────
  console.log('       Scraping category page for top brands...');
  const topBrands = await scrapeCategoryPageBrands(category);
  if (topBrands.length > 0) {
    console.log(`       Brands found: ${topBrands.join(', ')}`);
  }

  // ── C. Get DataForSEO keywords ───────────────────────────────────────────
  let keywords;
  try {
    keywords = await getKeywordsForCategory(category);
    console.log(`       Primary keyword: "${keywords.primary}"`);
    console.log(`       Secondary count: ${keywords.secondary.length} | FAQ questions: ${keywords.faqQuestions?.length || 0}`);
  } catch (err) {
    console.warn(`    ⚠️  Keyword fetch failed: ${err.message}. Using fallback.`);
    keywords = buildKeywordsFromMasterList(category);
  }

  // ── D. Generate content via Gemini ───────────────────────────────────────
  const generated = await generateCategoryContent(category, keywords, categoryContext, {
    topBrands,
  });

  // ── D2. Validate Rank Math meta lengths ──────────────────────────────────
  if (generated.meta) {
    const titleLen = (generated.meta.title || '').length;
    const descLen = (generated.meta.metaDescription || '').length;
    if (titleLen < 50 || titleLen > 60) {
      console.warn(`    ⚠️  SEO title is ${titleLen} chars — Rank Math wants 50–60.`);
    }
    if (descLen < 150 || descLen > 160) {
      console.warn(`    ⚠️  Meta description is ${descLen} chars — Rank Math wants 150–160.`);
    }
    const kwInTitle = (generated.meta.title || '').toLowerCase().includes(keywords.primary.toLowerCase());
    if (!kwInTitle) {
      console.warn(`    ⚠️  Primary keyword "${keywords.primary}" not found in SEO title.`);
    }
  }

  // ── E. Assemble content for WP fields ────────────────────────────────────
  const shortDesc = !SKIP_CONTENT && generated.shortDescription ? generated.shortDescription : currentTerm.description || '';
  const belowContent = !SKIP_CONTENT ? assembleBelowContent(category, generated, allCategories) : '';
  const faqSchema = !SKIP_CONTENT && !SKIP_SCHEMA && generated.faqs?.length > 0 ? buildFAQSchema(generated.faqs) : null;

  const shortWordCount = wordCount(stripHtml(shortDesc));
  const belowWordCount = wordCount(stripHtml(belowContent));
  const oldWordCount = wordCount(stripHtml(currentTerm.description || ''));

  // Name change
  const nameChanged = generated.nameSuggestion?.changed && generated.nameSuggestion?.suggestedName;
  const newName = nameChanged ? generated.nameSuggestion.suggestedName : null;

  console.log(`       Before: ${oldWordCount} words in description`);
  console.log(`       After:  ${shortWordCount} words (above) + ${belowWordCount} words (below)`);
  if (nameChanged) {
    console.log(`       Name:   "${category.name}" → "${newName}"`);
  }

  // ── DRY RUN OUTPUT ───────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n       ── DRY RUN PREVIEW ──');
    if (nameChanged) {
      console.log(`       🏷️  Name change: "${category.name}" → "${newName}"`);
      console.log(`          Reason: ${generated.nameSuggestion.reason}`);
    }
    if (generated.meta) {
      const tLen = (generated.meta.title || '').length;
      const dLen = (generated.meta.metaDescription || '').length;
      const tFlag = tLen < 50 || tLen > 60 ? ` ⚠️  ${tLen}ch` : ` ✓ ${tLen}ch`;
      const dFlag = dLen < 150 || dLen > 160 ? ` ⚠️  ${dLen}ch` : ` ✓ ${dLen}ch`;
      console.log(`       SEO Title:    ${generated.meta.title}${tFlag}`);
      console.log(`       SEO Desc:     ${generated.meta.metaDescription}${dFlag}`);
      console.log(`       Focus KW:     ${keywords.primary}`);
    }
    console.log(`       Short description (above products):`);
    console.log('       ' + stripHtml(shortDesc).slice(0, 300).replace(/\n/g, '\n       '));
    console.log(`\n       Below content preview (first 400 chars):`);
    console.log('       ' + stripHtml(belowContent).slice(0, 400).replace(/\n/g, '\n       '));
    if (generated.faqs && generated.faqs.length > 0) {
      console.log(`\n       FAQs: ${generated.faqs.map((f) => f.question).join(' | ')}`);
    }
    return {success: true, dryRun: true, oldWordCount, shortWordCount, belowWordCount};
  }

  // ── F. Write to WordPress ────────────────────────────────────────────────

  let descWritten = false;
  let belowWritten = false;
  let schemaWritten = false;
  let nameWritten = false;
  let metaResult = {plugin: 'none', success: false};

  // F0. Rename category if suggested
  if (nameChanged) {
    try {
      await updateCategoryName(category.id, newName);
      nameWritten = true;
      console.log(`    ✅  Category renamed: "${category.name}" → "${newName}"`);
      await sleep(300);
    } catch (err) {
      console.error(`    ❌  Category rename failed: ${err.message}`);
    }
  }

  // F1. Short description (above products)
  try {
    await updateCategoryDescription(category.id, shortDesc);
    descWritten = true;
    console.log(`    ✅  Description updated (${shortWordCount} words, above products)`);
    await sleep(300);
  } catch (err) {
    console.error(`    ❌  Description update failed: ${err.message}`);
  }

  // F2. Below-products content (Shoptimizer second_desc)
  if (belowContent) {
    try {
      await updateBelowContent(category.id, belowContent, belowField);
      belowWritten = true;
      console.log(`    ✅  Below content updated (${belowWordCount} words, field: ${belowField})`);
      await sleep(300);
    } catch (err) {
      console.error(`    ❌  Below content update failed: ${err.message}`);
      console.error(`        Ensure psp-category-content-field.php is installed in wp-content/mu-plugins/`);
    }
  }

  // F3. FAQPage schema
  if (faqSchema) {
    try {
      await updateCategorySchema(category.id, faqSchema);
      schemaWritten = true;
      console.log(`    ✅  FAQPage schema updated (${generated.faqs?.length || 0} Q&As)`);
      await sleep(300);
    } catch (err) {
      console.error(`    ❌  Schema update failed: ${err.message}`);
    }
  }

  // F4. SEO meta (Rank Math title, description, focus keyword)
  if (generated.meta) {
    metaResult = await updateSEOMeta(category.id, generated.meta.title, generated.meta.metaDescription, keywords.primary);

    if (metaResult.success) {
      console.log(`    ✅  SEO meta updated via ${metaResult.plugin}`);
    } else {
      console.warn(`    ⚠️  SEO meta: ${metaResult.warning || 'not updated'}`);
    }
    await sleep(300);
  }

  // ── G. Log result ────────────────────────────────────────────────────────
  const duration = Math.round((Date.now() - startTime) / 1000);
  const logEntry = {
    categoryName: nameChanged ? newName : category.name,
    originalName: nameChanged ? category.name : undefined,
    priorityRank: category.priorityRank,
    descriptionUpdated: descWritten,
    belowContentUpdated: belowWritten,
    schemaUpdated: schemaWritten,
    nameUpdated: nameWritten,
    metaPlugin: metaResult.plugin,
    metaUpdated: metaResult.success,
    beforeWordCount: oldWordCount,
    shortDescWordCount: shortWordCount,
    belowContentWordCount: belowWordCount,
    primaryKeyword: keywords.primary,
    faqCount: generated.faqs?.length || 0,
    belowContentField: belowField,
    durationSeconds: duration,
  };

  appendLog(category.slug, logEntry);

  return {success: descWritten || belowWritten, ...logEntry};
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n⚡  Category Page Optimizer');
  hr();
  console.log(`  Target:       ${BASE}`);
  console.log(`  Mode:         ${DRY_RUN ? 'DRY RUN (no WordPress writes)' : 'LIVE ⚠️'}`);
  console.log(`  Skip content: ${SKIP_CONTENT ? 'YES (meta only)' : 'NO'}`);
  console.log(`  Skip schema:  ${SKIP_SCHEMA ? 'YES' : 'NO'}`);
  console.log(`  Skip rename:  ${SKIP_RENAME ? 'YES' : 'NO'}`);
  console.log(`  DataForSEO:   ${SKIP_DATAFORSEO ? 'SKIPPED' : 'ENABLED'}`);
  console.log(`  Force re-run: ${FORCE ? 'YES' : 'NO (resume-safe)'}`);
  if (DRY_RUN) console.log('\n  ⚠️  Dry run — showing preview only. Nothing will be written to WordPress.');
  hr();

  // ── Load master list ──────────────────────────────────────────────────────
  if (!fs.existsSync(MASTER_LIST_PATH)) {
    console.error(`\n❌  ${MASTER_LIST_PATH} not found.`);
    console.error('    Run the discovery script first:\n');
    console.error('    node wordpress/scripts/discover-category-taxonomy.js\n');
    process.exit(1);
  }

  console.log('\n1. Loading category master list...');
  const masterData = JSON.parse(fs.readFileSync(MASTER_LIST_PATH, 'utf8'));
  const allCategories = masterData.categories || [];
  console.log(`   ${allCategories.length} categories loaded`);

  // ── Select target categories ──────────────────────────────────────────────
  let targetCategories;

  if (TARGET_SLUG) {
    const found = allCategories.find((c) => c.slug === TARGET_SLUG);
    if (!found) {
      console.error(`\n❌  Category "${TARGET_SLUG}" not found in master list.`);
      console.error(
        `    Available slugs: ${allCategories
          .slice(0, 10)
          .map((c) => c.slug)
          .join(', ')}...\n`,
      );
      process.exit(1);
    }
    targetCategories = [found];
  } else if (BATCH_FILE) {
    const batchPath = path.resolve(process.cwd(), BATCH_FILE);
    const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const slugs = Array.isArray(batchData) ? batchData : batchData.slugs || [];
    targetCategories = slugs.map((s) => allCategories.find((c) => c.slug === s)).filter(Boolean);
    console.log(`   Batch file: ${targetCategories.length} categories loaded from ${BATCH_FILE}`);
  } else if (TOP_N) {
    targetCategories = allCategories.slice(0, TOP_N);
    console.log(`\n2. Processing top ${TOP_N} categories by priority score...`);
  } else {
    targetCategories = allCategories;
    console.log(`\n2. Processing all ${allCategories.length} categories in priority order...`);
  }

  // Filter out utility categories unless forced
  if (!FORCE && !TARGET_SLUG) {
    const utilityCategories = new Set(['uncategorized', 'clearance-items', 'discount-products', 'new-arrivals', '2023-products']);
    const before = targetCategories.length;
    targetCategories = targetCategories.filter((c) => !utilityCategories.has(c.slug) && c.count > 0);
    if (before !== targetCategories.length) {
      console.log(`   Skipped ${before - targetCategories.length} utility/empty categories (use --force to include)`);
    }
  }

  // ── Estimate time ─────────────────────────────────────────────────────────
  const log = loadLog();
  const alreadyDone = targetCategories.filter((c) => log[c.slug] && !FORCE).length;
  const toProcess = targetCategories.length - alreadyDone;
  const estMinutes = Math.ceil((toProcess * 35) / 60); // ~35s per category (5 Gemini calls vs 3 for brands)
  console.log(`\n   ${targetCategories.length} total | ${alreadyDone} already done | ${toProcess} to process`);
  if (toProcess > 1) console.log(`   Estimated time: ~${estMinutes} minute${estMinutes !== 1 ? 's' : ''}`);

  // ── Process categories ────────────────────────────────────────────────────
  hr();

  let processed = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targetCategories.length; i++) {
    const cat = targetCategories[i];

    try {
      const result = await processCategory(cat, allCategories);

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
      console.error(`\n  ❌  ${cat.name}: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
      failed++;
      processed++;
    }

    // Rate limiting between categories
    if (i < targetCategories.length - 1) {
      const delay = SKIP_CONTENT ? 500 : 2000;
      await sleep(delay);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n');
  hr();
  console.log(`✅  Category optimization complete`);
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
    console.log('  1. Visit 2-3 category pages and verify content renders correctly');
    console.log('  2. Check WordPress admin > Products > Categories to confirm descriptions');
    console.log('  3. Verify below-products content appears on the public category page');
    console.log('  4. View page source to confirm FAQPage schema is present');
    console.log('  5. Submit updated category pages to Google Search Console\n');
  }
})().catch((err) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
