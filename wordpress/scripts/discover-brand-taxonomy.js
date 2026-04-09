#!/usr/bin/env node
/**
 * discover-brand-taxonomy.js
 *
 * TARGET: proskatersplace.com (US site) — primary market: USA, secondary: worldwide
 * NOTE:   The Nuxt/Vue frontend (proskatersplace.ca) is a separate Canadian project.
 *
 * Phase 1, Script 1 — Auto-discover and dump every brand page with live
 * ranking data from DataForSEO. Foundation for all other brand page scripts.
 *
 * Run order: 7 (no dependencies)
 * Tier: 1 — read-only, no WordPress writes
 *
 * Usage:
 *   node wordpress/scripts/discover-brand-taxonomy.js --dry-run
 *   node wordpress/scripts/discover-brand-taxonomy.js
 *   node wordpress/scripts/discover-brand-taxonomy.js --limit=10
 *   node wordpress/scripts/discover-brand-taxonomy.js --skip-dataforseo  # WP data only, no API spend
 *   node wordpress/scripts/discover-brand-taxonomy.js --output=data/custom.json
 *
 * Output: wordpress/data/brand-pages-raw.json
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {checkBalance, rankedKeywords, historicalRankOverview} = require('./lib/dataforseo');

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
const SKIP_DATAFORSEO = process.argv.includes('--skip-dataforseo');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const MAX_BRANDS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const OUTPUT_ARG = process.argv.find((a) => a.startsWith('--output='));
const OUTPUT_PATH = OUTPUT_ARG ? path.resolve(process.cwd(), OUTPUT_ARG.split('=')[1]) : path.resolve(__dirname, '../../data/brands/brand-pages-raw.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hr() {
  console.log('─'.repeat(60));
}

/** Strip HTML tags and collapse whitespace to get plain text */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Count words in a string */
function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Extract the domain segment for DataForSEO target (without https:// or trailing slash) */
function toDataForSEOurl(slug) {
  const domain = BASE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `${domain}/brand/${slug}/`;
}

// ─── Step 1: Discover brand taxonomy endpoint ─────────────────────────────────

async function discoverTaxonomyEndpoint() {
  console.log('\n1. Discovering brand taxonomy endpoint...');

  const res = await fetch(`${BASE}/wp-json/`, {headers: {Authorization: WP_AUTH}});
  if (!res.ok) throw new Error(`WP root index failed: HTTP ${res.status}`);
  const json = await res.json();

  const routes = json.routes || {};

  // Ordered probe list
  const candidates = [
    {key: '/wp/v2/brand', label: 'custom taxonomy: brand'},
    {key: '/wp/v2/pwb-brand', label: 'Perfect WooCommerce Brands'},
    {key: '/wc/v3/products/brands', label: 'YITH / WC Brands (official)'},
  ];

  for (const candidate of candidates) {
    if (routes[candidate.key] || routes[`${BASE}/wp-json${candidate.key}`]) {
      console.log(`  ✅  Found: ${candidate.label} → ${BASE}/wp-json${candidate.key}`);
      return `${BASE}/wp-json${candidate.key}`;
    }
  }

  // Fallback: scan routes object for any key containing 'brand'
  const brandRoute = Object.keys(routes).find((r) => r.toLowerCase().includes('brand') && !r.includes('{'));
  if (brandRoute) {
    const endpoint = `${BASE}/wp-json${brandRoute}`;
    console.log(`  ✅  Found via scan: ${brandRoute} → ${endpoint}`);
    return endpoint;
  }

  throw new Error(
    'Could not auto-discover brand taxonomy endpoint. ' +
      'Checked: /wp/v2/brand, /wp/v2/pwb-brand, /wc/v3/products/brands. ' +
      'Is a brand plugin installed and active?',
  );
}

// ─── Step 2: Fetch all brand terms ────────────────────────────────────────────

async function fetchAllBrandTerms(endpoint) {
  console.log('\n2. Fetching all brand taxonomy terms...');
  const terms = [];
  let page = 1;
  let totalPages = null;

  while (true) {
    const url = `${endpoint}?per_page=100&page=${page}`;
    // WC endpoints use different auth
    const authHeader = endpoint.includes('/wc/') && WC_AUTH ? WC_AUTH : WP_AUTH;
    const res = await fetch(url, {headers: {Authorization: authHeader}});

    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error(`Brand terms fetch page ${page} failed: HTTP ${res.status}`);

    if (totalPages === null) {
      const tp = res.headers.get('X-WP-TotalPages');
      if (tp) {
        totalPages = parseInt(tp, 10);
        const total = res.headers.get('X-WP-Total');
        console.log(`  Total brands: ${total ?? '?'} across ${totalPages} page(s)`);
      }
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    terms.push(...batch);

    if (batch.length < 100) break;
    if (totalPages !== null && page >= totalPages) break;
    page++;
    await sleep(150);
  }

  console.log(`  ✅  Fetched ${terms.length} brand terms`);
  return terms;
}

// ─── Step 3: Scrape rendered page HTML ────────────────────────────────────────

async function scrapeRenderedPage(slug) {
  const url = `${BASE}/brand/${slug}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProSkatersBot/1.0; SEO audit)',
        Accept: 'text/html',
      },
      follow: 3,
      timeout: 15000,
    });

    if (!res.ok) {
      return {url, httpStatus: res.status, error: `HTTP ${res.status}`};
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Extract meta description
    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;

    // Extract H1
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1 = h1Match ? stripHtml(h1Match[1]).trim() : null;

    // Extract H2s
    const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    const h2s = h2Matches
      .map((m) => stripHtml(m[1]).trim())
      .filter(Boolean)
      .slice(0, 10);

    // Count words in body content (rough estimate — strip nav/header/footer)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyText = bodyMatch ? stripHtml(bodyMatch[1]) : '';
    const words = wordCount(bodyText);

    // Schema.org blocks
    const schemaMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const schemas = schemaMatches.map((m) => {
      try {
        const parsed = JSON.parse(m[1]);
        return parsed['@type'] || '(unknown type)';
      } catch {
        return '(invalid JSON)';
      }
    });

    // FAQ section detection
    const hasFAQ = html.toLowerCase().includes('faq') || html.toLowerCase().includes('frequently asked') || schemas.includes('FAQPage');

    // OG image
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i);
    const ogImage = ogImageMatch ? ogImageMatch[1].trim() : null;

    // Canonical URL
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i);
    const canonical = canonicalMatch ? canonicalMatch[1].trim() : null;

    // Check for noindex
    const noindex =
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) ||
      /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots/i.test(html);

    return {
      url,
      httpStatus: res.status,
      title,
      metaDescription,
      h1,
      h2s,
      wordCount: words,
      schemas,
      hasFAQ,
      hasSchema: schemas.length > 0,
      hasMetaDescription: !!metaDescription,
      hasTitleWithBrand: title ? true : false,
      ogImage,
      canonical,
      noindex,
    };
  } catch (err) {
    return {url, httpStatus: 0, error: err.message};
  }
}

// ─── Step 4: Get live ranked keywords from DataForSEO ─────────────────────────

async function getLiveKeywords(slug) {
  const target = toDataForSEOurl(slug);
  try {
    const data = await rankedKeywords(target, {
      locationCode: 2840, // United States
      limit: 200,
      orderBy: ['ranked_serp_element.serp_item.etv,desc'], // sort by estimated traffic
    });

    const items = data.items.map((item) => ({
      keyword: item.keyword_data?.keyword,
      position: item.ranked_serp_element?.serp_item?.rank_absolute,
      searchVolume: item.keyword_data?.keyword_info?.search_volume,
      keywordDifficulty: item.keyword_data?.keyword_properties?.keyword_difficulty,
      cpc: item.keyword_data?.keyword_info?.cpc,
      estimatedTraffic: item.ranked_serp_element?.serp_item?.etv,
      intent: item.keyword_data?.search_intent_info?.main_intent,
      rankChange: item.ranked_serp_element?.serp_item?.rank_changes?.previous_rank_absolute
        ? (item.ranked_serp_element.serp_item.rank_changes.previous_rank_absolute || 0) - (item.ranked_serp_element?.serp_item?.rank_absolute || 0)
        : 0,
      serpFeatures: item.keyword_data?.serp_info?.serp_item_types || [],
      positionType: item.ranked_serp_element?.serp_item?.type,
    }));

    return {
      target,
      totalKeywords: data.totalCount,
      fetchedKeywords: items.length,
      estimatedTrafficTotal: items.reduce((sum, k) => sum + (k.estimatedTraffic || 0), 0),
      keywords: items,
      cost: data.cost,
    };
  } catch (err) {
    console.warn(`    ⚠️  DataForSEO ranked keywords failed for ${slug}: ${err.message}`);
    return {target, totalKeywords: 0, fetchedKeywords: 0, estimatedTrafficTotal: 0, keywords: [], error: err.message};
  }
}

// ─── Step 5: Get historical rank overview ─────────────────────────────────────

async function getHistoricalRank(slug) {
  const target = toDataForSEOurl(slug);
  try {
    const data = await historicalRankOverview(target, {locationCode: 2840});

    const items = (data.items || []).map((item) => ({
      date: item.date,
      organicKeywordsCount: item.metrics?.organic?.count || 0,
      organicEtv: item.metrics?.organic?.etv || 0,
      pos1to3: item.metrics?.organic?.pos_1 + item.metrics?.organic?.pos_2_3 || 0,
      pos4to10: item.metrics?.organic?.pos_4_10 || 0,
      pos11to20: item.metrics?.organic?.pos_11_20 || 0,
      pos21plus: (item.metrics?.organic?.pos_21_30 || 0) + (item.metrics?.organic?.pos_31_40 || 0) + (item.metrics?.organic?.pos_41_50 || 0),
    }));

    // Compute trend: compare most recent vs 3 months ago
    let trend = 'unknown';
    if (items.length >= 2) {
      const latest = items[items.length - 1];
      const older = items[Math.max(0, items.length - 4)]; // ~3 months back
      const etv_diff = latest.organicEtv - older.organicEtv;
      if (etv_diff > 5) trend = 'improving';
      else if (etv_diff < -5) trend = 'declining';
      else trend = 'stable';
    }

    return {target, trend, months: items, cost: data.cost};
  } catch (err) {
    console.warn(`    ⚠️  DataForSEO historical rank failed for ${slug}: ${err.message}`);
    return {target, trend: 'unknown', months: [], error: err.message};
  }
}

// ─── Step 6: Extract SEO meta from taxonomy term ──────────────────────────────

function extractSeoMeta(term) {
  const meta = term.meta || {};

  // Yoast SEO
  const yoastTitle = meta._yoast_wpseo_title || meta.yoast_title || null;
  const yoastDesc = meta._yoast_wpseo_metadesc || meta.yoast_metadesc || null;

  // Rank Math
  const rmTitle = meta.rank_math_title || null;
  const rmDesc = meta.rank_math_description || null;

  // All In One SEO
  const aioseoTitle = meta._aioseop_title || null;
  const aioseoDesc = meta._aioseop_description || null;

  return {
    seoPlugin: yoastTitle || yoastDesc ? 'yoast' : rmTitle || rmDesc ? 'rankmath' : aioseoTitle || aioseoDesc ? 'aioseo' : 'none',
    seoTitle: yoastTitle || rmTitle || aioseoTitle || null,
    seoDescription: yoastDesc || rmDesc || aioseoDesc || null,
  };
}

// ─── Step 7: Score each brand page ────────────────────────────────────────────

function scoreBrand(brand) {
  const page = brand.pageAudit || {};
  let seoScore = 0;
  const issues = [];

  // Title check
  if (page.title) {
    if (page.title.length >= 30 && page.title.length <= 60) seoScore += 20;
    else {
      issues.push(`Title length ${page.title.length} (ideal 30-60)`);
      seoScore += 10;
    }
  } else {
    issues.push('Missing page title');
  }

  // Meta description
  if (page.metaDescription) {
    if (page.metaDescription.length >= 120 && page.metaDescription.length <= 155) seoScore += 20;
    else {
      issues.push(`Meta desc length ${page.metaDescription.length} (ideal 120-155)`);
      seoScore += 10;
    }
  } else if (brand.seoMeta?.seoDescription) {
    seoScore += 15; // Has meta via SEO plugin
  } else {
    issues.push('Missing meta description');
  }

  // H1
  if (page.h1) seoScore += 15;
  else issues.push('Missing H1');

  // Schema
  if (page.hasSchema) seoScore += 20;
  else issues.push('No schema markup');

  // FAQ
  if (page.hasFAQ) seoScore += 10;
  else issues.push('No FAQ section');

  // Description content
  const words = brand.taxonomy?.description ? wordCount(stripHtml(brand.taxonomy.description)) : 0;
  if (words >= 300) {
    seoScore += 15;
    brand.contentScore = 'good';
  } else if (words >= 100) {
    seoScore += 8;
    brand.contentScore = 'thin';
    issues.push(`Thin description: ${words} words (want 300+)`);
  } else if (words > 0) {
    seoScore += 3;
    brand.contentScore = 'very thin';
    issues.push(`Very thin description: ${words} words`);
  } else {
    brand.contentScore = 'empty';
    issues.push('No description content');
  }

  brand.contentWordCount = words;
  return {seoScore: Math.min(seoScore, 100), issues};
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🔍  Brand Taxonomy Discovery');
  hr();
  console.log(`  Target:  ${BASE}`);
  console.log(`  Mode:    ${DRY_RUN ? 'DRY RUN (no file write)' : 'LIVE'}`);
  console.log(`  DataForSEO: ${SKIP_DATAFORSEO ? 'SKIPPED' : 'ENABLED'}`);
  console.log(`  Output:  ${OUTPUT_PATH}`);
  if (MAX_BRANDS !== Infinity) console.log(`  Limit:   ${MAX_BRANDS} brands`);
  hr();

  // ── Check DataForSEO balance ──────────────────────────────────────────────
  if (!SKIP_DATAFORSEO) {
    try {
      const balance = await checkBalance();
      console.log(`\n💳  DataForSEO balance: $${balance.balance} (account: ${balance.login})`);
      if (balance.balance < 1) {
        console.error('  ❌  Balance too low (< $1). Use --skip-dataforseo or top up account.');
        process.exit(1);
      }
    } catch (err) {
      console.warn(`  ⚠️  Could not check DataForSEO balance: ${err.message}`);
      console.warn('  Continuing without balance check. Use --skip-dataforseo to bypass DataForSEO entirely.');
    }
  }

  // ── Discover endpoint ─────────────────────────────────────────────────────
  const taxonomyEndpoint = await discoverTaxonomyEndpoint();

  // ── Fetch all terms ───────────────────────────────────────────────────────
  let terms = await fetchAllBrandTerms(taxonomyEndpoint);
  if (terms.length > MAX_BRANDS) {
    console.log(`  Limiting to ${MAX_BRANDS} brands (--limit flag)`);
    terms = terms.slice(0, MAX_BRANDS);
  }

  // ── Process each brand ────────────────────────────────────────────────────
  console.log(`\n3. Processing ${terms.length} brands...\n`);

  const brands = [];
  let totalDFSCost = 0;
  let decliningCount = 0;

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const slug = term.slug;
    const name = term.name || slug;

    process.stdout.write(`  [${i + 1}/${terms.length}] ${name.padEnd(30)} `);

    try {
      const brand = {
        id: term.id,
        name,
        slug,
        url: `${BASE}/brand/${slug}/`,
        taxonomy: {
          description: term.description || '',
          count: term.count || 0,
          link: term.link || `${BASE}/brand/${slug}/`,
          parent: term.parent || 0,
        },
        seoMeta: extractSeoMeta(term),
      };

      // Scrape rendered page HTML
      brand.pageAudit = await scrapeRenderedPage(slug);
      process.stdout.write(brand.pageAudit.httpStatus === 200 ? '🌐 ' : `⚠️(${brand.pageAudit.httpStatus}) `);
      await sleep(200); // respectful crawl delay

      // DataForSEO live keywords
      if (!SKIP_DATAFORSEO) {
        brand.liveKeywords = await getLiveKeywords(slug);
        totalDFSCost += brand.liveKeywords.cost || 0;

        brand.historicalRank = await getHistoricalRank(slug);
        totalDFSCost += brand.historicalRank.cost || 0;

        if (brand.historicalRank.trend === 'declining') decliningCount++;
        process.stdout.write(`📊 ${brand.liveKeywords.fetchedKeywords}kws ${brand.historicalRank.trend} `);
      }

      // Score the brand
      const {seoScore, issues} = scoreBrand(brand);
      brand.seoScore = seoScore;
      brand.seoIssues = issues;

      process.stdout.write(`score:${seoScore}/100\n`);
      brands.push(brand);
    } catch (err) {
      process.stdout.write(`❌ ERROR: ${err.message}\n`);
      // Still add a stub entry so we know it exists but couldn't be processed
      brands.push({
        id: term.id,
        name,
        slug,
        url: `${BASE}/brand/${slug}/`,
        taxonomy: {description: term.description || '', count: term.count || 0},
        seoMeta: {},
        pageAudit: {httpStatus: 0, error: err.message},
        seoScore: 0,
        seoIssues: [`Processing error: ${err.message}`],
        contentScore: 'error',
        error: err.message,
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const totalKeywords = brands.reduce((s, b) => s + (b.liveKeywords?.fetchedKeywords || 0), 0);
  const totalTraffic = brands.reduce((s, b) => s + (b.liveKeywords?.estimatedTrafficTotal || 0), 0);
  const emptyContent = brands.filter((b) => b.contentScore === 'empty').length;
  const thinContent = brands.filter((b) => b.contentScore === 'thin' || b.contentScore === 'very thin').length;
  const noMeta = brands.filter((b) => !b.pageAudit?.metaDescription && !b.seoMeta?.seoDescription).length;
  const noSchema = brands.filter((b) => !b.pageAudit?.hasSchema).length;

  console.log('\n');
  hr();
  console.log('📊  Discovery Summary');
  hr();
  console.log(`  Total brands found:        ${brands.length}`);
  console.log(`  Brands with 0 products:    ${brands.filter((b) => b.taxonomy.count === 0).length}`);
  console.log(`  Empty description:         ${emptyContent}`);
  console.log(`  Thin description (<100w):  ${thinContent}`);
  console.log(`  Missing meta description:  ${noMeta}`);
  console.log(`  No schema markup:          ${noSchema}`);
  if (!SKIP_DATAFORSEO) {
    console.log(`  Total live keywords:       ${totalKeywords}`);
    console.log(`  Est. total organic traffic:${Math.round(totalTraffic)}/mo`);
    console.log(`  Declining rank trend:      ${decliningCount}`);
    console.log(`  DataForSEO API spend:      ~$${totalDFSCost.toFixed(4)}`);
  }
  hr();

  // Top 10 brands by live keyword count
  if (!SKIP_DATAFORSEO) {
    const top = [...brands].sort((a, b) => (b.liveKeywords?.fetchedKeywords || 0) - (a.liveKeywords?.fetchedKeywords || 0)).slice(0, 10);

    console.log('\n  Top 10 brands by live keyword count:');
    top.forEach((b, i) => {
      const kws = b.liveKeywords?.fetchedKeywords || 0;
      const trend = b.historicalRank?.trend || '?';
      const score = b.seoScore;
      console.log(`  ${String(i + 1).padStart(2)}. ${b.name.padEnd(28)} ${String(kws).padStart(4)} kws  trend:${trend.padEnd(10)} SEO:${score}/100`);
    });
  }

  // Brands with declining rankings
  if (!SKIP_DATAFORSEO && decliningCount > 0) {
    const declining = brands.filter((b) => b.historicalRank?.trend === 'declining');
    console.log(`\n  ⚠️  ${decliningCount} brand(s) with declining rankings:`);
    declining.forEach((b) =>
      console.log(`     - ${b.name} (${b.liveKeywords?.fetchedKeywords || 0} kws, ${b.brand?.taxonomy?.count || b.taxonomy?.count || '?'} products)`),
    );
  }

  // ── Write output ──────────────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log('\n⚠️   DRY RUN — no file written. Remove --dry-run to save output.\n');
    return;
  }

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      taxonomyEndpoint,
      totalBrands: brands.length,
      dataForSeoUsed: !SKIP_DATAFORSEO,
      estimatedApiCost: parseFloat(totalDFSCost.toFixed(4)),
    },
    brands,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅  Written: ${OUTPUT_PATH} (${brands.length} brands, ${Math.round(fs.statSync(OUTPUT_PATH).size / 1024)}KB)\n`);
})().catch((err) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
