#!/usr/bin/env node
/**
 * classify-brands.js  (READ-ONLY — no writes)
 *
 * Builds the "fully rewrite" hit list for brand pages by classifying each brand
 * as footwear/protective (sizing FAQs OK) vs component-only (sizing FAQs wrong).
 *
 * Data sources (both reliable — no fragile HTML scraping):
 *   - Brand roster   : WP REST pwb-brand terms (BASE_URL from .env)
 *   - Product types  : data/products-list.json (name + productCategories), the
 *                      build-time catalog. Products are matched to a brand by the
 *                      brand name appearing in the product name, then their real
 *                      category slugs are classified with the SAME keyword logic
 *                      the generator uses (isFittedCategory from brand-prompts).
 *
 * Verdicts:
 *   🟢 sized      → has footwear/protective categories → no rewrite needed
 *   🔴 component  → only components (wheels/bearings/frames/wax/boards) → REWRITE
 *   🟡 review     → no products matched in the catalog → human check
 *
 * Output: console summary + data/brand-category-classification.json
 * Usage:  node wordpress/scripts/classify-brands.js
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {isFittedCategory, COMPONENT_PRODUCT_RE} = require('./lib/brand-prompts');

const BASE = process.env.BASE_URL;
const WP_AUTH = 'Basic ' + Buffer.from(`${process.env.WP_ADMIN_USERNAME}:${process.env.WP_ADMIN_APP_PASSWORD}`).toString('base64');

if (!BASE) {
  console.error('ERROR: BASE_URL missing in .env');
  process.exit(1);
}

const PRODUCTS_PATH = path.resolve(__dirname, '../../data/products-list.json');
const OUT_PATH = path.resolve(__dirname, '../../data/brand-category-classification.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Distinctive brand base — drop one trailing generic product word. */
function canonicalBase(name) {
  return name.replace(/\s+(skates?|skate|wheels?|bearings?|frames?|protection|brand|skis?)$/i, '').trim();
}

async function discoverEndpoint() {
  const res = await fetch(`${BASE}/wp-json/`, {headers: {Authorization: WP_AUTH}});
  const json = await res.json();
  const routes = json.routes || {};
  for (const c of ['/wp/v2/pwb-brand', '/wp/v2/brand']) if (routes[c]) return `${BASE}/wp-json${c}`;
  const r = Object.keys(routes).find((x) => x.includes('brand') && !x.includes('{') && x.startsWith('/wp/v2/'));
  if (r) return `${BASE}/wp-json${r}`;
  throw new Error('brand taxonomy endpoint not found');
}

async function fetchBrands(endpoint) {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${endpoint}?per_page=100&page=${page}&_fields=id,name,slug,count`, {headers: {Authorization: WP_AUTH}});
    if (res.status === 400 || !res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (page >= parseInt(res.headers.get('x-wp-totalpages') || '1', 10)) break;
    page++;
    await sleep(120);
  }
  return all;
}

function loadProducts() {
  const raw = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.products || raw.data || [];
  return arr.map((p) => ({
    name: (p.name || '').toLowerCase(),
    cats: (p.productCategories?.nodes || []).map((c) => c.slug),
  }));
}

function classifyBrand(brand, products) {
  const base = canonicalBase(brand.name).toLowerCase();
  if (base.length < 2) return {verdict: 'review', categories: [], matched: 0, note: 'brand base too short'};

  const re = new RegExp(`\\b${escapeRegExp(base)}\\b`, 'i');
  const matched = products.filter((p) => re.test(p.name));
  if (matched.length === 0) return {verdict: 'review', categories: [], matched: 0, note: 'no products in catalog'};

  const cats = [...new Set(matched.flatMap((p) => p.cats))];
  const sizedCats = cats.filter(isFittedCategory);
  const componentCats = cats.filter((c) => COMPONENT_PRODUCT_RE.test(c));

  let verdict;
  if (sizedCats.length > 0) verdict = 'sized';
  else if (componentCats.length > 0) verdict = 'component';
  else verdict = 'review'; // only marketing/uncategorized slugs

  return {verdict, categories: cats, sizedCats, componentCats, matched: matched.length, note: ''};
}

(async () => {
  console.log(`\n🔎  Brand classification — roster: ${BASE} | types: products-list.json\n${'─'.repeat(72)}`);
  const products = loadProducts();
  console.log(`  ${products.length} catalog products loaded`);

  const endpoint = await discoverEndpoint();
  const brands = (await fetchBrands(endpoint)).filter((b) => (b.count || 0) > 0);
  console.log(`  ${brands.length} brands with products\n`);

  const results = brands
    .map((b) => ({slug: b.slug, name: b.name, count: b.count, ...classifyBrand(b, products)}))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const r of results) {
    const tag = r.verdict === 'component' ? '🔴 REWRITE' : r.verdict === 'review' ? '🟡 REVIEW ' : '🟢 sized  ';
    const detail = r.verdict === 'sized' ? (r.sizedCats || []).slice(0, 3).join(', ') : r.verdict === 'component' ? r.categories.slice(0, 4).join(', ') : r.note;
    console.log(`  ${tag}  ${r.name.padEnd(22)} ${detail}`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

  const rewrite = results.filter((r) => r.verdict === 'component');
  const review = results.filter((r) => r.verdict === 'review');
  const sized = results.filter((r) => r.verdict === 'sized');

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  🟢 sized: ${sized.length}    🔴 component(REWRITE): ${rewrite.length}    🟡 review: ${review.length}`);
  console.log(`  Saved: ${OUT_PATH}`);

  console.log(`\n🔴  HIT LIST — fully rewrite (component-only, sizing FAQs are wrong):`);
  rewrite.forEach((r) => console.log(`     ${r.slug.padEnd(22)} ${r.componentCats.slice(0, 4).join(', ')}`));
  console.log(`\n   batch: ${rewrite.map((r) => `--brand=${r.slug}`).join(' ') || '(none)'}`);

  if (review.length) {
    console.log(`\n🟡  REVIEW (not found in catalog — confirm manually):`);
    console.log(`     ${review.map((r) => r.slug).join('  ')}`);
  }
  console.log('');
})().catch((err) => {
  console.error(`\n❌  ${err.message}`);
  process.exit(1);
});
