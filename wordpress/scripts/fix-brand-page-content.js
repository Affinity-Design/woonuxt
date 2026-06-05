#!/usr/bin/env node
/**
 * fix-brand-page-content.js
 *
 * Remote (REST API) twin of one-time-fix-brand-pages.php — use this when you
 * cannot run WP-CLI on the box and want to patch a site over the WordPress REST
 * API instead (target comes from BASE_URL in .env, e.g. test.proskatersplace.com).
 *
 * Applies the same safe, deterministic fixes to ALREADY-published brand content:
 *   1. info@proskatersplace.com → customerservice@proskatersplace.com
 *   2. lowercase brand names in visible copy → canonical casing ("twincam skates"
 *      → "Twincam skates"), text nodes only — never URLs/slugs/emails.
 * Flags (does not edit) component-brand pages that still mention sizing.
 *
 * Dry run by default. Pass --apply to write. --brand=<slug> limits to one brand.
 */

require('dotenv').config();
const fetch = require('node-fetch');
const {CONTACT_EMAIL, SIZE_CALCULATOR_URL} = require('./lib/brand-prompts');

const BASE = process.env.BASE_URL;
const WP_USER = process.env.WP_ADMIN_USERNAME;
const WP_PASS = process.env.WP_ADMIN_APP_PASSWORD;
const WP_AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

const APPLY = process.argv.includes('--apply');
const BRAND_ARG = process.argv.find((a) => a.startsWith('--brand='));
const TARGET_SLUG = BRAND_ARG?.split('=')[1] || null;

const OLD_EMAIL_RE = /info@proskatersplace\.com/g; // .com only — never touches the Canadian info@proskatersplace.ca
const SIZING_RE = /\b(sizing|size chart|what size|shoe size|boot fit|fitting|find your size|true to size)\b/i;
// Old brand pages link to either the inline- or roller- calculator slug on .com.
// Replace the whole anchor so href, title, and text all become canonical, then
// mop up any bare URL occurrences. Both are idempotent against the new .ca link.
const CALC_ANCHOR_RE = /<a\s+href="https?:\/\/proskatersplace\.(?:com|ca)\/(?:inline-skates|roller-skates)-size-calculator\/?"[^>]*>[\s\S]*?<\/a>/gi;
const CALC_URL_RE = /https?:\/\/proskatersplace\.(?:com|ca)\/(?:inline-skates|roller-skates)-size-calculator\/?(?=["'\s)<])/gi;
const CALC_ANCHOR = `<a href="${SIZE_CALCULATOR_URL}" title="Find your perfect skate size">Skate Size Calculator</a>`;

// ─── Pure transforms (unit-tested) ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function canonicalBase(name) {
  return name.replace(/\s+(skates?|skate|wheels?|bearings?|frames?|protection|brand|skis?)$/i, '').trim();
}

function fixEmail(text) {
  if (!text) return text;
  return text.replace(OLD_EMAIL_RE, CONTACT_EMAIL);
}

function fixCalculator(text) {
  if (!text) return text;
  return text.replace(CALC_ANCHOR_RE, CALC_ANCHOR).replace(CALC_URL_RE, SIZE_CALCULATOR_URL);
}

function fixBrandCasing(text, termName) {
  if (!text) return text;
  const variants = uniq([termName, canonicalBase(termName)])
    .filter((v) => v && v.toLowerCase() !== v)
    .sort((a, b) => b.length - a.length);
  if (variants.length === 0) return text;

  return text.replace(/>([^<]+)</g, (full, textNode) => {
    let t = textNode;
    for (const variant of variants) {
      const lower = variant.toLowerCase();
      const re = new RegExp(`(?<![A-Za-z-])${escapeRegExp(lower)}(?![A-Za-z-])`, 'g');
      t = t.replace(re, variant);
    }
    return '>' + t + '<';
  });
}

function countReplacements(before, after) {
  if (before === after) return 0;
  let diffs = 0;
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i++) {
    if (before[i] !== after[i]) diffs++;
  }
  return diffs;
}

// ─── WP REST plumbing (mirrors optimize-brand-page.js) ─────────────────────────

async function discoverTaxonomyEndpoint() {
  const res = await fetch(`${BASE}/wp-json/`, {headers: {Authorization: WP_AUTH}});
  if (!res.ok) throw new Error(`WP root index failed: HTTP ${res.status}`);
  const json = await res.json();
  const routes = json.routes || {};
  const candidates = ['/wp/v2/pwb-brand', '/wp/v2/brand'];
  for (const c of candidates) {
    if (routes[c]) return `${BASE}/wp-json${c}`;
  }
  const brandRoute = Object.keys(routes).find((r) => r.toLowerCase().includes('brand') && !r.includes('{') && r.startsWith('/wp/v2/'));
  if (brandRoute) return `${BASE}/wp-json${brandRoute}`;
  throw new Error('pwb-brand taxonomy endpoint not found.');
}

async function fetchAllTerms(endpoint) {
  const all = [];
  let page = 1;
  while (true) {
    const url = `${endpoint}?per_page=100&page=${page}&_fields=id,name,slug,description,meta&context=edit`;
    const res = await fetch(url, {headers: {Authorization: WP_AUTH}});
    if (res.status === 400) break;
    if (!res.ok) throw new Error(`Fetch terms page ${page} failed: HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
    if (page >= totalPages) break;
    page++;
    await sleep(150);
  }
  return all;
}

async function fetchSingleTerm(endpoint, slug) {
  const url = `${endpoint}?slug=${encodeURIComponent(slug)}&_fields=id,name,slug,description,meta&context=edit`;
  const res = await fetch(url, {headers: {Authorization: WP_AUTH}});
  if (!res.ok) throw new Error(`Fetch term ${slug} failed: HTTP ${res.status}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : null;
}

async function updateDescription(endpoint, termId, description) {
  const res = await fetch(`${endpoint}/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({description}),
  });
  if (!res.ok) throw new Error(`Update description failed: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
}

async function updateMeta(endpoint, termId, meta) {
  const res = await fetch(`${endpoint}/${termId}`, {
    method: 'POST',
    headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify({meta}),
  });
  if (!res.ok) throw new Error(`Update meta failed: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
}

// ─── Per-term processing ────────────────────────────────────────────────────────

function computeFixes(term) {
  const fields = {
    description: term.description || '',
    psp_brand_content: term.meta?.psp_brand_content || '',
    psp_brand_schema: term.meta?.psp_brand_schema || '',
  };

  const fixed = {};
  const changes = {};
  for (const [key, original] of Object.entries(fields)) {
    let next = fixEmail(original);
    next = fixCalculator(next);
    next = fixBrandCasing(next, term.name);
    fixed[key] = next;
    if (next !== original) {
      OLD_EMAIL_RE.lastIndex = 0;
      changes[key] = {emailFixed: OLD_EMAIL_RE.test(original), charsChanged: countReplacements(original, next)};
      OLD_EMAIL_RE.lastIndex = 0;
    }
  }

  const combined = `${fields.description}\n${fields.psp_brand_content}\n${fields.psp_brand_schema}`;
  const mentionsSizing = SIZING_RE.test(combined);

  return {fixed, changes, mentionsSizing, hasChanges: Object.keys(changes).length > 0};
}

async function processTerm(endpoint, term, stats) {
  const {fixed, changes, mentionsSizing, hasChanges} = computeFixes(term);
  if (mentionsSizing) stats.sizingFlagged.push(term.slug);

  if (!hasChanges) {
    if (mentionsSizing) console.log(`  •  ${term.name} (${term.slug}) — no email/casing fix; ⚠️ mentions sizing (review for regen)`);
    return;
  }

  const summary = Object.entries(changes)
    .map(([f, c]) => `${f}${c.emailFixed ? ' [email]' : ''} (${c.charsChanged} chars)`)
    .join(', ');
  console.log(`  ${APPLY ? '✏️ ' : '👁️ '} ${term.name} (${term.slug}) — ${summary}${mentionsSizing ? ' | ⚠️ mentions sizing' : ''}`);

  if (!APPLY) {
    stats.wouldChange++;
    return;
  }

  try {
    if (changes.description) {
      await updateDescription(endpoint, term.id, fixed.description);
      await sleep(150);
    }
    const metaPayload = {};
    if (changes.psp_brand_content) metaPayload.psp_brand_content = fixed.psp_brand_content;
    if (changes.psp_brand_schema) metaPayload.psp_brand_schema = fixed.psp_brand_schema;
    if (Object.keys(metaPayload).length > 0) {
      await updateMeta(endpoint, term.id, metaPayload);
      await sleep(150);
    }
    console.log(`      ✅  written`);
    stats.changed++;
  } catch (err) {
    console.error(`      ❌  ${err.message}`);
    stats.errors++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!BASE || !WP_USER || !WP_PASS) {
    console.error('ERROR: Missing BASE_URL, WP_ADMIN_USERNAME, or WP_ADMIN_APP_PASSWORD in .env');
    process.exit(1);
  }

  console.log('\n🧼  Brand Page Content Fixer (email + brand casing) — REST');
  console.log('─'.repeat(60));
  console.log(`  Target: ${BASE}`);
  console.log(`  Mode:   ${APPLY ? 'APPLY ⚠️  (writing to WordPress)' : 'DRY RUN (no writes)'}`);
  console.log(`  Scope:  ${TARGET_SLUG ? `brand=${TARGET_SLUG}` : 'all brands'}`);
  console.log(`  Email:  info@proskatersplace.com → ${CONTACT_EMAIL}`);
  console.log('─'.repeat(60));

  const endpoint = await discoverTaxonomyEndpoint();
  console.log(`  Endpoint: ${endpoint}\n`);

  let terms;
  if (TARGET_SLUG) {
    const t = await fetchSingleTerm(endpoint, TARGET_SLUG);
    if (!t) {
      console.error(`❌  Brand "${TARGET_SLUG}" not found.`);
      process.exit(1);
    }
    terms = [t];
  } else {
    terms = await fetchAllTerms(endpoint);
    console.log(`  ${terms.length} brand terms loaded\n`);
  }

  const stats = {wouldChange: 0, changed: 0, errors: 0, sizingFlagged: []};
  for (const term of terms) {
    await processTerm(endpoint, term, stats);
  }

  console.log('\n' + '─'.repeat(60));
  if (APPLY) {
    console.log(`✅  Done. ${stats.changed} term(s) updated, ${stats.errors} error(s).`);
  } else {
    console.log(`👁️  Dry run complete. ${stats.wouldChange} term(s) would change. Re-run with --apply to write.`);
  }
  if (stats.sizingFlagged.length > 0) {
    console.log(`\n⚠️  ${stats.sizingFlagged.length} page(s) mention sizing/fit — verify these are skate/boot brands.`);
    console.log(`    Component-only brands (bearings/wheels/frames) should be regenerated:`);
    console.log(`    ${stats.sizingFlagged.map((s) => `--brand=${s}`).join('  ')}`);
    console.log(`    e.g. node wordpress/scripts/optimize-brand-page.js --brand=<slug> --force`);
  }
  console.log('');
}

module.exports = {fixEmail, fixBrandCasing, canonicalBase, computeFixes, CONTACT_EMAIL};

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n❌  Fatal: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
