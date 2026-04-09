#!/usr/bin/env node
/**
 * audit-brand-template.js
 *
 * TARGET: proskatersplace.com (US site) — primary market: USA, secondary: worldwide
 * NOTE:   The Nuxt/Vue frontend (proskatersplace.ca) is a separate Canadian project.
 *
 * Phase 1, Script 2 — Analyze the shared WooCommerce template rendering all
 * brand pages. Identify structural improvements that apply globally (theme-level
 * fixes), and distinguish them from per-brand content issues.
 *
 * Uses DataForSEO OnPage Instant API for automated technical SEO audit +
 * direct HTML scraping for template structure analysis.
 *
 * Run order: 8 (requires Script 1 output OR works standalone with --brands flag)
 * Tier: 1 — read-only, no WordPress writes
 *
 * Usage:
 *   node wordpress/scripts/audit-brand-template.js --dry-run
 *   node wordpress/scripts/audit-brand-template.js
 *   node wordpress/scripts/audit-brand-template.js --brands=chaya-skates,powerslide,rollerblade
 *   node wordpress/scripts/audit-brand-template.js --skip-dataforseo
 *
 * Input:  wordpress/data/brand-pages-raw.json (optional — auto-selects sample brands)
 * Output: wordpress/data/brand-template-audit.json
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {onPageInstant} = require('./lib/dataforseo');

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE = process.env.BASE_URL;
const WP_USER = process.env.WP_ADMIN_USERNAME;
const WP_PASS = process.env.WP_ADMIN_APP_PASSWORD;

if (!BASE || !WP_USER || !WP_PASS) {
  console.error('ERROR: Missing BASE_URL, WP_ADMIN_USERNAME, or WP_ADMIN_APP_PASSWORD in .env');
  process.exit(1);
}

const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

// ─── Flags ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_DATAFORSEO = process.argv.includes('--skip-dataforseo');
const BRANDS_ARG = process.argv.find((a) => a.startsWith('--brands='));
const OVERRIDE_BRANDS = BRANDS_ARG
  ? BRANDS_ARG.split('=')[1]
      .split(',')
      .map((s) => s.trim())
  : null;

const INPUT_PATH = path.resolve(__dirname, '../../data/brands/brand-pages-raw.json');
const OUTPUT_PATH = path.resolve(__dirname, '../../data/brands/brand-template-audit.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hr() {
  console.log('─'.repeat(60));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Select representative sample brands ──────────────────────────────────────

function selectSampleBrands(allBrands) {
  if (OVERRIDE_BRANDS) {
    const selected = OVERRIDE_BRANDS.map((slug) => {
      const found = allBrands.find((b) => b.slug === slug);
      return found || {slug, name: slug, taxonomy: {count: 0}};
    });
    console.log(`  Using --brands override: ${selected.map((b) => b.slug).join(', ')}`);
    return selected;
  }

  // Pick 3 with high/medium/low product count
  const sorted = [...allBrands].filter((b) => b.taxonomy?.count > 0).sort((a, b) => b.taxonomy.count - a.taxonomy.count);

  if (sorted.length === 0) {
    console.warn('  ⚠️  No brands with products found — using first 3 brands');
    return allBrands.slice(0, 3);
  }

  const high = sorted[0];
  const mid = sorted[Math.floor(sorted.length / 2)];
  const low = sorted[sorted.length - 1];

  // Deduplicate
  const selected = [high, mid, low].filter((b, i, arr) => arr.findIndex((x) => x.slug === b.slug) === i);
  console.log(`  Auto-selected brands: ${selected.map((b) => `${b.name} (${b.taxonomy.count} products)`).join(', ')}`);
  return selected;
}

// ─── Fetch rendered HTML for deep template analysis ───────────────────────────

async function fetchTemplateHTML(slug) {
  const url = `${BASE}/brand/${slug}/`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ProSkatersBot/1.0; SEO audit)',
      Accept: 'text/html',
    },
    follow: 3,
    timeout: 20000,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return {html: await res.text(), url};
}

// ─── Deep HTML structure analysis ────────────────────────────────────────────

function analyzeTemplateStructure(html, slug, brandName) {
  const lower = html.toLowerCase();

  // ── Heading structure ────────────────────────────────────────────────────
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => stripHtml(m[1]).trim());
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripHtml(m[1]).trim()).filter(Boolean);
  const h3s = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => stripHtml(m[1]).trim()).filter(Boolean);

  const h1MatchesBrand = h1s.some((h) => h.toLowerCase().includes(brandName.toLowerCase().split(' ')[0]));

  // ── Description block position ───────────────────────────────────────────
  const descriptionPos = (() => {
    const descArea = lower.indexOf('term-description') !== -1 ? lower.indexOf('term-description') : lower.indexOf('woocommerce-term-description');
    const productGrid = lower.indexOf('products ') !== -1 ? lower.indexOf('products ') : lower.indexOf('woocommerce-loop');
    if (descArea === -1) return 'none';
    if (productGrid === -1) return 'only-description';
    return descArea < productGrid ? 'above-products' : 'below-products';
  })();

  // ── Content blocks detection ─────────────────────────────────────────────
  const hasBreadcrumbs = lower.includes('breadcrumb') || lower.includes('woocommerce-breadcrumb') || lower.includes('schema.org/breadcrumb');

  const hasBrandLogo = lower.includes('brand-logo') || lower.includes('vendor-logo') || (lower.includes('<img') && lower.includes(`${slug}`));

  const hasFAQ = lower.includes('faq') || lower.includes('frequently asked') || lower.includes('"@type":"FAQPage"') || lower.includes('"@type": "FAQPage"');

  const hasRelatedBrands = lower.includes('related-brand') || lower.includes('other brand') || lower.includes('also carry');

  const hasBuyingGuide = lower.includes('buying guide') || lower.includes('how to choose') || lower.includes('size guide');

  const hasAuthorizedBadge = lower.includes('authorized') || lower.includes('official retailer') || lower.includes('official dealer');

  // ── Product listing format ───────────────────────────────────────────────
  const hasProductGrid = lower.includes('products-per-row') || lower.includes('woocommerce') || lower.includes('product-grid');

  // Count visible products (li.product or article.product elements)
  const productCount = (html.match(/class=["'][^"']*\bproduct\b[^"']*["']/gi) || []).length;

  // ── Internal link patterns ───────────────────────────────────────────────
  const internalLinks = [...html.matchAll(/<a[^>]+href=["']([^"']*proskatersplace[^"']*|\/[^"'#][^"']*)["']/gi)]
    .map((m) => m[1])
    .filter((href) => !href.includes('#') && !href.includes('wp-login') && !href.includes('wp-admin'))
    .slice(0, 30);

  const categoryLinks = internalLinks.filter((h) => h.includes('/product-category/'));
  const productLinks = internalLinks.filter((h) => h.includes('/product/'));
  const blogLinks = internalLinks.filter((h) => h.includes('/blog/') || h.includes('/?p='));

  // ── Schema detection ─────────────────────────────────────────────────────
  const schemaBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemas = [];
  schemaBlocks.forEach((m) => {
    try {
      const parsed = JSON.parse(m[1]);
      const types = Array.isArray(parsed['@graph']) ? parsed['@graph'].map((n) => n['@type']) : [parsed['@type']];
      schemas.push(...types.filter(Boolean));
    } catch {
      schemas.push('(invalid JSON-LD)');
    }
  });

  // ── Title tag analysis ───────────────────────────────────────────────────
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  const titlePattern = title
    ? title.replace(new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '{BRAND}').replace(/proskatersplace/gi, '{SITE}')
    : null;

  // ── Meta description ─────────────────────────────────────────────────────
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
  const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : null;

  // ── Pagination ───────────────────────────────────────────────────────────
  const hasPagination = lower.includes('woocommerce-pagination') || lower.includes('page/2') || lower.includes('?paged=');

  // ── Noindex check ────────────────────────────────────────────────────────
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) || lower.includes('x-robots-tag: noindex');

  return {
    headings: {h1s, h1MatchesBrand, h2Count: h2s.length, h3Count: h3s.length, h2Samples: h2s.slice(0, 5)},
    templateLayout: {descriptionPosition: descriptionPos, hasProductGrid, visibleProductCount: productCount, hasPagination},
    contentBlocks: {hasBreadcrumbs, hasBrandLogo, hasFAQ, hasRelatedBrands, hasBuyingGuide, hasAuthorizedBadge},
    seoElements: {
      title,
      titlePattern,
      titleLength: title?.length || 0,
      metaDesc,
      metaDescLength: metaDesc?.length || 0,
      schemas,
      hasSchema: schemas.length > 0,
      noindex,
    },
    internalLinking: {
      totalInternalLinks: internalLinks.length,
      categoryLinks: categoryLinks.length,
      productLinks: productLinks.length,
      blogLinks: blogLinks.length,
      sampleLinks: internalLinks.slice(0, 5),
    },
  };
}

// ─── DataForSEO OnPage audit ──────────────────────────────────────────────────

async function runOnPageAudit(slug) {
  const url = `${BASE}/brand/${slug}/`;
  try {
    const result = await onPageInstant(url, {enableJavascript: false});
    const item = result.items?.[0];

    if (!item) return {url, error: 'No data returned'};

    // Normalize the key fields we care about
    const page = item;
    return {
      url,
      httpStatus: page.status_code,
      title: page.meta?.title,
      titleLength: page.meta?.title?.length || 0,
      metaDescription: page.meta?.description,
      metaDescLength: page.meta?.description?.length || 0,
      h1: page.meta?.htags?.h1?.[0] || null,
      h1Count: page.meta?.htags?.h1?.length || 0,
      h2Count: page.meta?.htags?.h2?.length || 0,
      wordCount: page.meta?.content?.plain_text_word_count || 0,
      internalLinksCount: page.meta?.internal_links_count || 0,
      externalLinksCount: page.meta?.external_links_count || 0,
      imagesCount: page.resource_type === 'html' ? page.meta?.images_count || 0 : 0,
      hasCanonical: !!page.meta?.canonical,
      canonical: page.meta?.canonical || null,
      hasHreflang: !!page.meta?.hreflang,
      noindex: page.meta?.robots_instructions?.includes('noindex') || false,
      schemas: page.meta?.structured_data?.map((s) => s['@type']).filter(Boolean) || [],
      pageLoadMs: page.fetch_time || null,
      hasDuplicateTitle: page.checks?.duplicate_title || false,
      hasDuplicateMeta: page.checks?.duplicate_meta_description || false,
      checks: page.checks || {},
      cost: result.cost,
    };
  } catch (err) {
    return {url, error: err.message};
  }
}

// ─── Compare pages to find template-level issues ──────────────────────────────

function findTemplateIssues(analyses) {
  const templateIssues = [];
  const perBrandIssues = [];

  // Check title patterns — if they all follow the same pattern, it's template-level
  const titlePatterns = analyses.map((a) => a.structure?.seoElements?.titlePattern).filter(Boolean);
  const uniquePatterns = [...new Set(titlePatterns)];
  if (uniquePatterns.length === 1) {
    const pattern = uniquePatterns[0];
    // Evaluate the pattern quality
    if (!pattern.includes('{BRAND}')) {
      templateIssues.push({
        severity: 'high',
        category: 'title',
        issue: `Title template does not include brand name`,
        pattern,
        fix: 'Update WooCommerce/SEO plugin title template to include {term}',
      });
    } else if (pattern.length > 65) {
      templateIssues.push({
        severity: 'medium',
        category: 'title',
        issue: `Title template is too long (${pattern.length} chars). All brand pages affected.`,
        pattern,
        fix: 'Shorten title template — ideal: "{BRAND} Skates & Gear | ProSkaters Place" (≤60 chars)',
      });
    }
  }

  // Check meta descriptions across brands
  const hasMetaAll = analyses.every((a) => a.structure?.seoElements?.metaDesc || a.onPage?.metaDescription);
  const missingMetaAll = analyses.every((a) => !a.structure?.seoElements?.metaDesc && !a.onPage?.metaDescription);
  if (missingMetaAll) {
    templateIssues.push({
      severity: 'high',
      category: 'meta',
      issue: 'No meta descriptions on any brand page — SEO plugin not configured for taxonomy terms',
      fix: 'Configure Yoast/Rank Math taxonomy meta description template. Use: "Shop {term} at ProSkaters Place — authorized US {term} dealer. Free shipping on orders over $150 USD."',
    });
  }

  // Check schema across brands
  const hasSchemaAll = analyses.every((a) => (a.structure?.seoElements?.schemas || []).length > 0);
  const missingSchemaAll = analyses.every((a) => (a.structure?.seoElements?.schemas || []).length === 0);
  if (missingSchemaAll) {
    templateIssues.push({
      severity: 'high',
      category: 'schema',
      issue: 'No schema markup on any brand page',
      fix: 'Add BreadcrumbList + ItemList schema. Consider FAQPage schema per brand.',
    });
  } else if (!hasSchemaAll) {
    perBrandIssues.push({category: 'schema', issue: 'Some brand pages missing schema markup'});
  }

  // Check H1 consistency
  const h1MatchesBrandAll = analyses.every((a) => a.structure?.headings?.h1MatchesBrand);
  const h1MatchesBrandNone = analyses.every((a) => !a.structure?.headings?.h1MatchesBrand);
  if (h1MatchesBrandNone) {
    templateIssues.push({
      severity: 'high',
      category: 'h1',
      issue: 'H1 does not contain brand name on any page — template issue',
      fix: 'Update WooCommerce archive title template to use term name as H1',
    });
  }

  // Check description position
  const descPositions = [...new Set(analyses.map((a) => a.structure?.templateLayout?.descriptionPosition))];
  if (descPositions.every((p) => p === 'below-products' || p === 'none')) {
    templateIssues.push({
      severity: 'medium',
      category: 'content-position',
      issue: `Brand description renders ${descPositions.includes('none') ? 'nowhere' : 'BELOW the product grid'}`,
      fix: 'Move description block above products — search engines read top-of-page content first. Use WooCommerce hook woocommerce_before_shop_loop.',
    });
  }

  // Check breadcrumbs
  const hasBreadcrumbsAll = analyses.every((a) => a.structure?.contentBlocks?.hasBreadcrumbs);
  if (!hasBreadcrumbsAll) {
    templateIssues.push({
      severity: 'medium',
      category: 'breadcrumbs',
      issue: 'Breadcrumbs missing on brand pages',
      fix: 'Enable breadcrumbs in WooCommerce / theme settings. Add BreadcrumbList schema.',
    });
  }

  // Check FAQ
  const hasFAQAll = analyses.every((a) => a.structure?.contentBlocks?.hasFAQ);
  if (!hasFAQAll) {
    templateIssues.push({
      severity: 'medium',
      category: 'faq',
      issue: 'No FAQ section on brand pages — missing FAQ rich result opportunity',
      fix: 'Add FAQPage section to brand page template or inject per-brand via description field.',
    });
  }

  // Check authorized retailer badge
  const hasAuthAll = analyses.every((a) => a.structure?.contentBlocks?.hasAuthorizedBadge);
  if (!hasAuthAll) {
    perBrandIssues.push({
      category: 'trust',
      issue: 'Authorized retailer badge missing — trust signal opportunity',
      fix: 'Inject "✓ Authorized Canadian Retailer" badge in description via optimize-brand-page.js',
    });
  }

  // Internal linking check
  const avgCategoryLinks = analyses.reduce((s, a) => s + (a.structure?.internalLinking?.categoryLinks || 0), 0) / analyses.length;
  if (avgCategoryLinks < 2) {
    perBrandIssues.push({
      category: 'internal-links',
      issue: `Low internal links to categories (avg: ${avgCategoryLinks.toFixed(1)})`,
      fix: 'Add links to related categories (inline skates, roller skates, protective gear) in brand descriptions.',
    });
  }

  return {templateIssues, perBrandIssues};
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🔍  Brand Template Audit');
  hr();
  console.log(`  Target:     ${BASE}`);
  console.log(`  Mode:       ${DRY_RUN ? 'DRY RUN (no file write)' : 'LIVE'}`);
  console.log(`  DataForSEO: ${SKIP_DATAFORSEO ? 'SKIPPED' : 'ENABLED'}`);
  hr();

  // ── Load brand list (from Script 1 output if available) ───────────────────
  let allBrands = [];
  if (fs.existsSync(INPUT_PATH)) {
    console.log(`\n📂  Loading brand list from ${INPUT_PATH}`);
    const raw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    allBrands = raw.brands || [];
    console.log(`  Loaded ${allBrands.length} brands`);
  } else {
    console.log(`\n⚠️  ${INPUT_PATH} not found. Run discover-brand-taxonomy.js first, or use --brands flag.`);
    if (!OVERRIDE_BRANDS) {
      console.error('  No brand data available. Exiting.');
      process.exit(1);
    }
    // Minimal stubs when --brands is used without Script 1 data
    allBrands = OVERRIDE_BRANDS.map((slug) => ({slug, name: slug, taxonomy: {count: 5}}));
  }

  // ── Select sample brands ──────────────────────────────────────────────────
  console.log('\n1. Selecting representative sample brands...');
  const sampleBrands = selectSampleBrands(allBrands);

  // ── Run analysis on each sample ───────────────────────────────────────────
  console.log(`\n2. Auditing ${sampleBrands.length} sample brand pages...\n`);
  const analyses = [];

  for (const brand of sampleBrands) {
    const slug = brand.slug;
    const name = brand.name || slug;
    console.log(`  ── ${name} (/brand/${slug}/) ──`);

    const analysis = {slug, name, productCount: brand.taxonomy?.count || 0};

    // Fetch HTML for structural analysis
    try {
      process.stdout.write('    Fetching HTML...');
      const {html, url} = await fetchTemplateHTML(slug);
      process.stdout.write(` ✅ (${Math.round(html.length / 1024)}KB)\n`);
      analysis.structure = analyzeTemplateStructure(html, slug, name);
      analysis.url = url;
    } catch (err) {
      process.stdout.write(` ❌ ${err.message}\n`);
      analysis.structure = null;
      analysis.htmlError = err.message;
    }

    await sleep(500); // respectful delay between page fetches

    // DataForSEO OnPage audit
    if (!SKIP_DATAFORSEO) {
      process.stdout.write('    DataForSEO OnPage audit...');
      analysis.onPage = await runOnPageAudit(slug);
      if (analysis.onPage.error) {
        process.stdout.write(` ⚠️  ${analysis.onPage.error}\n`);
      } else {
        process.stdout.write(` ✅ (${analysis.onPage.wordCount} words, ${analysis.onPage.internalLinksCount} internal links)\n`);
      }
    }

    // Print key findings per brand
    if (analysis.structure) {
      const s = analysis.structure;
      console.log(`    H1: ${s.headings.h1s[0] || '(none)'} | matches brand: ${s.headings.h1MatchesBrand ? '✅' : '❌'}`);
      console.log(`    Title pattern: "${s.seoElements.titlePattern || s.seoElements.title || '(none)'}"`);
      console.log(`    Meta desc: ${s.seoElements.metaDesc ? `✅ ${s.seoElements.metaDescLength}ch` : '❌ missing'}`);
      console.log(`    Description position: ${s.templateLayout.descriptionPosition}`);
      console.log(`    Schema types: ${s.seoElements.schemas.join(', ') || 'none'}`);
      console.log(`    FAQs: ${s.contentBlocks.hasFAQ ? '✅' : '❌'} | Breadcrumbs: ${s.contentBlocks.hasBreadcrumbs ? '✅' : '❌'}`);
      console.log(`    Internal links: ${s.internalLinking.totalInternalLinks} total, ${s.internalLinking.categoryLinks} to categories`);
    }
    console.log('');

    analyses.push(analysis);
  }

  // ── Identify template vs per-brand issues ─────────────────────────────────
  console.log('\n3. Identifying template-level vs per-brand issues...');
  const {templateIssues, perBrandIssues} = findTemplateIssues(analyses);

  // ── Print findings ────────────────────────────────────────────────────────
  hr();
  console.log('🔧  Template Issues (affect ALL brand pages)');
  hr();
  if (templateIssues.length === 0) {
    console.log('  ✅  No critical template issues found');
  } else {
    templateIssues.forEach((issue, i) => {
      const icon = issue.severity === 'high' ? '🔴' : '🟡';
      console.log(`\n  ${icon} [${issue.severity.toUpperCase()}] ${issue.category.toUpperCase()}: ${issue.issue}`);
      if (issue.fix) console.log(`     Fix: ${issue.fix}`);
      if (issue.pattern) console.log(`     Pattern: "${issue.pattern}"`);
    });
  }

  console.log('\n');
  hr();
  console.log('📝  Per-Brand Issues (vary by brand)');
  hr();
  if (perBrandIssues.length === 0) {
    console.log('  ✅  No per-brand pattern issues found');
  } else {
    perBrandIssues.forEach((issue) => {
      console.log(`\n  🟠 ${issue.category.toUpperCase()}: ${issue.issue}`);
      if (issue.fix) console.log(`     Fix: ${issue.fix}`);
    });
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      brandsAudited: sampleBrands.map((b) => b.slug),
      dataForSeoUsed: !SKIP_DATAFORSEO,
    },
    summary: {
      templateIssueCount: templateIssues.length,
      perBrandIssueCount: perBrandIssues.length,
      highPriorityFixes: templateIssues.filter((i) => i.severity === 'high').length,
    },
    templateIssues,
    perBrandIssues,
    brandAnalyses: analyses,
  };

  if (DRY_RUN) {
    console.log('\n\n⚠️   DRY RUN — no file written. Remove --dry-run to save output.\n');
    return;
  }

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, {recursive: true});

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n\n✅  Written: ${OUTPUT_PATH}\n`);
  console.log(`   ${templateIssues.length} template issue(s) to fix globally`);
  console.log(`   ${perBrandIssues.length} per-brand issue type(s) to fix in optimize-brand-page.js\n`);
})().catch((err) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
