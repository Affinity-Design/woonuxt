#!/usr/bin/env node
/**
 * seed-brand-no-products.js
 *
 * TARGET: proskatersplace.com (US site).
 *
 * Hydrates a NEW WordPress brand (pwb-brand term) that has no products tagged yet.
 * Bypasses optimize-brand-page.js's product-grid scrape (which would default to a
 * "skates" focus keyword for any zero-product brand) and instead:
 *
 *   1. Fetches the official brand website (about page) for grounding context
 *   2. Takes the primary keyword + secondary keywords from CLI args
 *   3. Reuses the existing brand-prompts.js Gemini templates + WP REST writers
 *
 * Use this once a brand is created in WP but BEFORE its products are imported.
 * After products land, run optimize-brand-page.js --brand=<slug> --force to refresh.
 *
 * Usage:
 *   node wordpress/scripts/seed-brand-no-products.js \
 *     --brand=kastle \
 *     --primary-keyword="kastle skis" \
 *     --secondary-keywords="kästle skis,kastle rollerski,austrian skis,kästle ski" \
 *     --website=https://kaestle.com/en-us/pages/about-us \
 *     --dry-run
 *
 *   Add --apply (or remove --dry-run) to write to WordPress.
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {generateContent} = require('./lib/gemini');
const {brandDescriptionPrompt, brandFAQPrompt, brandMetaPrompt, buildAuthorizedBadge, BRAND_WEBSITE_MAP} = require('./lib/brand-prompts');

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

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--apply');
const SKIP_FAQ = args.includes('--skip-faq');
const SKIP_BODY = args.includes('--skip-body');
const SKIP_META = args.includes('--skip-meta');

function getArg(name) {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const SLUG = getArg('brand');
const PRIMARY_KEYWORD = getArg('primary-keyword');
const SECONDARY_KEYWORDS_RAW = getArg('secondary-keywords') || '';
const WEBSITE_URL = getArg('website') || BRAND_WEBSITE_MAP[SLUG] || null;
const AUTHORIZED = args.includes('--authorized');
const LOCATION_HINT = getArg('location-hint') || ''; // optional category hint, e.g. "skis"

if (!SLUG || !PRIMARY_KEYWORD) {
  console.error('ERROR: --brand=<slug> and --primary-keyword="..." are required');
  console.error('Example: --brand=kastle --primary-keyword="kastle skis"');
  process.exit(1);
}

const SECONDARY_KEYWORDS = SECONDARY_KEYWORDS_RAW.split(',')
  .map((k) => k.trim())
  .filter(Boolean);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function parseGeminiJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Fetch external website context ───────────────────────────────────────────

async function fetchBrandSiteContext(url) {
  if (!url) return '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProSkatersPlace-Brand-Bot/1.0)',
        Accept: 'text/html',
      },
      redirect: 'follow',
      timeout: 20000,
    });
    if (!res.ok) {
      console.warn(`    ⚠️  Could not fetch ${url}: HTTP ${res.status}`);
      return '';
    }
    const html = await res.text();
    // Extract <title>, <meta description>, and body text
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] || '';
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
    const text = bodyMatch
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = [];
    if (title) parts.push(`PAGE TITLE: ${title.trim()}`);
    if (metaDesc) parts.push(`META: ${metaDesc.trim()}`);
    if (text) parts.push(`BODY: ${text.slice(0, 2500)}`);
    return parts.join(' | ');
  } catch (err) {
    console.warn(`    ⚠️  Fetch error for ${url}: ${err.message}`);
    return '';
  }
}

// ─── WP REST writers ──────────────────────────────────────────────────────────

async function fetchTerm(slug) {
  const res = await fetch(`${BASE}/wp-json/wp/v2/pwb-brand?slug=${encodeURIComponent(slug)}&per_page=1`, {
    headers: {Authorization: WP_AUTH},
  });
  if (!res.ok) throw new Error(`fetchTerm: HTTP ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`Term with slug "${slug}" not found in pwb-brand`);
  return arr[0];
}

async function updateTermDescription(termId, newDescription) {
  const res = await fetch(`${BASE}/wp-json/wp/v2/pwb-brand/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({description: newDescription}),
  });
  if (!res.ok) throw new Error(`updateTermDescription: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function updateBrandMeta(termId, metaObj) {
  const res = await fetch(`${BASE}/wp-json/wp/v2/pwb-brand/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({meta: metaObj}),
  });
  if (!res.ok) throw new Error(`updateBrandMeta: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function updateSEOMeta(termId, metaTitle, metaDescription, focusKeyword) {
  // Strategy A: Rank Math REST
  try {
    const r = await fetch(`${BASE}/wp-json/rankmath/v1/updateMeta`, {
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
    if (r.ok) {
      const body = await r.json();
      if (body?.success === true) return {plugin: 'rankmath_endpoint', success: true};
    }
  } catch {}

  // Strategy B: direct meta
  try {
    const r = await fetch(`${BASE}/wp-json/wp/v2/pwb-brand/${termId}`, {
      method: 'POST',
      headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        meta: {
          rank_math_title: metaTitle || '',
          rank_math_description: metaDescription || '',
          ...(focusKeyword ? {rank_math_focus_keyword: focusKeyword} : {}),
        },
      }),
    });
    if (r.ok) {
      const body = await r.json();
      if (body?.meta?.rank_math_title !== undefined) {
        return {plugin: 'rankmath_rest_meta', success: true};
      }
    }
  } catch {}

  return {plugin: 'none', success: false};
}

// ─── Assemble content ────────────────────────────────────────────────────────

function assembleShortDescription(brandName, slug, descriptionHtml) {
  const parts = [];
  if (AUTHORIZED) parts.push(buildAuthorizedBadge(brandName));
  if (descriptionHtml) {
    const firstPara = descriptionHtml.match(/<p[\s\S]*?<\/p>/i)?.[0] || '';
    if (firstPara) parts.push(firstPara);
  }
  return parts.join('\n');
}

function assembleFullContent(brandName, descriptionHtml, faqs) {
  const parts = [];
  if (descriptionHtml) parts.push(descriptionHtml);
  if (faqs && faqs.length > 0) {
    parts.push('\n<div class="brand-faq">');
    parts.push(`<h2>${brandName} — Frequently Asked Questions</h2>`);
    faqs.forEach((faq) => {
      parts.push(`<h3>${faq.question}</h3>\n<p>${faq.answer}</p>`);
    });
    parts.push('</div>');
  }
  return parts.join('\n');
}

function assembleFAQSchema(faqs) {
  if (!faqs || faqs.length === 0) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {'@type': 'Answer', text: f.answer},
    })),
  };
  return JSON.stringify(schema, null, 2);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n⚡  Seed Brand (no products)');
  hr();
  console.log(`  Target:       ${BASE}`);
  console.log(`  Brand slug:   ${SLUG}`);
  console.log(`  Primary KW:   ${PRIMARY_KEYWORD}`);
  console.log(`  Secondary KW: ${SECONDARY_KEYWORDS.join(', ') || '(none)'}`);
  console.log(`  Website URL:  ${WEBSITE_URL || '(none)'}`);
  console.log(`  Authorized:   ${AUTHORIZED ? 'YES' : 'NO'}`);
  console.log(`  Mode:         ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE ⚠️  WRITING TO WP'}`);
  hr();

  // ── 1. Fetch term from WP ─────────────────────────────────────────────────
  console.log('\n1. Fetching WP term...');
  const term = await fetchTerm(SLUG);
  console.log(`   ${term.name} (id=${term.id}) — current description: ${wordCount(stripHtml(term.description || ''))} words`);

  // ── 2. Fetch external brand site context ──────────────────────────────────
  console.log('\n2. Fetching external brand site for context...');
  const externalText = await fetchBrandSiteContext(WEBSITE_URL);
  if (externalText) {
    console.log(`   Got ${externalText.length} chars of context from ${WEBSITE_URL}`);
  } else {
    console.log(`   No external context — relying on existing WP description.`);
  }

  // Build a brandContext object that brand-prompts.js expects
  // Combine existing WP description text + external site text
  const existingText = stripHtml(term.description || '');
  const combinedRawText = [existingText, externalText].filter(Boolean).join(' || ').slice(0, 2000);

  const brandContext = {
    websiteUrl: WEBSITE_URL,
    origin: null,
    founders: null,
    claims: [],
    rawText: combinedRawText,
    hasExistingContent: combinedRawText.length > 30,
  };

  // ── 3. Build a fake "brand" object shaped like brand-master-list entries ──
  const brand = {
    id: term.id,
    name: term.name,
    slug: term.slug,
    url: `${BASE}/brand/${term.slug}/`,
    taxonomy: {count: 0},
  };

  const keywords = {
    primary: PRIMARY_KEYWORD,
    secondary: SECONDARY_KEYWORDS,
    longtail: SECONDARY_KEYWORDS.filter((k) => k.split(' ').length >= 3).slice(0, 5),
    intent: 'commercial',
    faqQuestions: [
      `Where can I buy ${brand.name} ${LOCATION_HINT || 'products'} in the US?`,
      `Is ProSkaters Place an authorized ${brand.name} dealer?`,
      `Do ${brand.name} ${LOCATION_HINT || 'products'} come with a warranty when bought at ProSkaters Place?`,
      `How do I choose the right size for ${brand.name} ${LOCATION_HINT || 'products'}?`,
      `What makes ${brand.name} ${LOCATION_HINT || 'products'} different from other brands?`,
    ],
  };

  // ── 4. Generate content via Gemini ────────────────────────────────────────
  const generated = {};

  if (!SKIP_META) {
    console.log('\n3. Generating SEO meta...');
    try {
      const prompt = brandMetaPrompt(brand, PRIMARY_KEYWORD, {isAuthorized: AUTHORIZED});
      const raw = await generateContent(prompt);
      generated.meta = parseGeminiJSON(raw);
      console.log(`   Title: "${generated.meta.title}" (${generated.meta.title?.length || 0}ch)`);
      console.log(`   Desc:  "${generated.meta.metaDescription?.slice(0, 80)}..." (${generated.meta.metaDescription?.length || 0}ch)`);
    } catch (err) {
      console.warn(`   ⚠️  Meta generation failed: ${err.message}`);
    }
    await sleep(6500);
  }

  if (!SKIP_BODY) {
    console.log('\n4. Generating brand description body...');
    try {
      // Pass productCategories that match the actual brand vertical so prompt stays coherent
      const productCategories = LOCATION_HINT ? [LOCATION_HINT.charAt(0).toUpperCase() + LOCATION_HINT.slice(1)] : [];
      const prompt = brandDescriptionPrompt(brand, keywords, brandContext, {
        isAuthorized: AUTHORIZED,
        productCount: 0,
        productCategories,
      });
      generated.description = await generateContent(prompt);
      console.log(`   ${wordCount(stripHtml(generated.description))} words generated`);
    } catch (err) {
      console.warn(`   ⚠️  Description generation failed: ${err.message}`);
    }
    await sleep(6500);
  }

  if (!SKIP_FAQ) {
    console.log('\n5. Generating FAQs...');
    try {
      const prompt = brandFAQPrompt(brand, keywords.faqQuestions, brandContext);
      const raw = await generateContent(prompt);
      generated.faqs = parseGeminiJSON(raw);
      if (!Array.isArray(generated.faqs)) throw new Error('Expected array');
      console.log(`   ${generated.faqs.length} FAQ pairs generated`);
    } catch (err) {
      console.warn(`   ⚠️  FAQ generation failed: ${err.message}`);
      generated.faqs = [];
    }
  }

  // ── 5. Assemble final WP payloads ─────────────────────────────────────────
  const shortDesc = assembleShortDescription(brand.name, brand.slug, generated.description || '');
  const fullContent = assembleFullContent(brand.name, generated.description || '', generated.faqs || []);
  const faqSchema = assembleFAQSchema(generated.faqs);

  console.log('\n── Preview ──');
  if (generated.meta) {
    const tLen = (generated.meta.title || '').length;
    const dLen = (generated.meta.metaDescription || '').length;
    console.log(`   SEO Title:    ${generated.meta.title} (${tLen}ch)`);
    console.log(`   SEO Desc:     ${generated.meta.metaDescription} (${dLen}ch)`);
    console.log(`   Focus KW:     ${PRIMARY_KEYWORD}`);
  }
  console.log(`   Short desc:   ${wordCount(stripHtml(shortDesc))} words (renders above products)`);
  console.log(`   Full content: ${wordCount(stripHtml(fullContent))} words (renders below products)`);
  console.log(`   FAQs:         ${generated.faqs?.length || 0} questions`);
  console.log(`   Schema:       ${faqSchema ? 'YES' : 'NO'}`);

  if (DRY_RUN) {
    console.log('\n   ── DRY RUN — body preview (first 500 chars) ──');
    console.log('   ' + stripHtml(fullContent).slice(0, 500).replace(/\n/g, '\n   '));
    if (generated.faqs?.length) {
      console.log('\n   FAQ questions: ' + generated.faqs.map((f) => f.question).join(' | '));
    }

    // Save preview to disk for inspection
    const previewPath = path.resolve(__dirname, `../../data/seed-preview-${SLUG}.json`);
    fs.writeFileSync(
      previewPath,
      JSON.stringify(
        {
          slug: SLUG,
          termId: term.id,
          primaryKeyword: PRIMARY_KEYWORD,
          secondaryKeywords: SECONDARY_KEYWORDS,
          meta: generated.meta || null,
          shortDescriptionHtml: shortDesc,
          fullContentHtml: fullContent,
          faqs: generated.faqs || [],
          faqSchema,
        },
        null,
        2,
      ),
    );
    console.log(`\n   📄  Preview saved: ${previewPath}`);
    console.log('\n   ⚠️  Dry run complete — nothing written to WP. Add --apply to write.');
    return;
  }

  // ── 6. Write to WP ────────────────────────────────────────────────────────
  console.log('\n── Writing to WordPress ──');

  if (shortDesc) {
    try {
      await updateTermDescription(term.id, shortDesc);
      console.log(`   ✅  Term description updated`);
      await sleep(300);
    } catch (err) {
      console.error(`   ❌  Term description failed: ${err.message}`);
    }
  }

  if (fullContent) {
    try {
      await updateBrandMeta(term.id, {psp_brand_content: fullContent});
      console.log(`   ✅  psp_brand_content updated`);
      await sleep(300);
    } catch (err) {
      console.error(`   ❌  psp_brand_content failed: ${err.message}`);
    }
  }

  if (faqSchema) {
    try {
      await updateBrandMeta(term.id, {psp_brand_schema: faqSchema});
      console.log(`   ✅  psp_brand_schema updated`);
      await sleep(300);
    } catch (err) {
      console.error(`   ❌  psp_brand_schema failed: ${err.message}`);
    }
  }

  if (generated.meta) {
    const r = await updateSEOMeta(term.id, generated.meta.title, generated.meta.metaDescription, PRIMARY_KEYWORD);
    if (r.success) {
      console.log(`   ✅  Rank Math meta updated via ${r.plugin}`);
    } else {
      console.warn(`   ⚠️  Rank Math meta NOT updated — set manually in WP admin`);
      console.warn(`       Title: ${generated.meta.title}`);
      console.warn(`       Desc:  ${generated.meta.metaDescription}`);
    }
  }

  console.log('\n✅  Done.');
})().catch((err) => {
  console.error('\n❌  Fatal:', err.message);
  process.exit(1);
});
