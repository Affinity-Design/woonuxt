/**
 * fix-footer-menu.js
 *
 * Fixes the "skaterboards-and-longboards" typo in WordPress menu item URLs.
 * Replaces all occurrences of "skaterboards" with "skateboards" across:
 *   1. All WP nav menu items (any menu)
 *   2. Body copy of all pages/posts containing the typo
 *
 * Run order: 2 (no dependencies)
 * Tier: 1 — no content generation
 *
 * ✅ Safe for proskatersplace.ca (verified Feb 27, 2026):
 *   - WC category slug is already correct: skateboards-and-longboards
 *   - Nuxt routes, sitemap, categories.vue all use the correct slug
 *   - This script only fixes the WP menu URL and body copy typos
 *
 * Usage:
 *   node wordpress/scripts/fix-footer-menu.js --dry-run   # preview only
 *   node wordpress/scripts/fix-footer-menu.js              # apply fixes
 */

require('dotenv').config();
const fetch = require('node-fetch');

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────
const BASE = process.env.BASE_URL;
const WP_USER = process.env.WP_ADMIN_USERNAME;
const WP_PASS = process.env.WP_ADMIN_APP_PASSWORD;

if (!BASE || !WP_USER || !WP_PASS) {
  console.error('ERROR: Missing BASE_URL, WP_ADMIN_USERNAME, or WP_ADMIN_APP_PASSWORD in .env');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(WP_USER + ':' + WP_PASS).toString('base64');
const DRY_RUN = process.argv.includes('--dry-run');

const TYPO = 'skaterboards';
const FIXED = 'skateboards';

function fixUrl(url) {
  return url.replace(new RegExp(TYPO, 'gi'), FIXED);
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ─────────────────────────────────────────────────────────────────
// Step 1 — Fix menu items
// ─────────────────────────────────────────────────────────────────
async function fixMenuItems() {
  console.log('\n─── Step 1: Scanning menu items ───');

  let page = 1;
  let allItems = [];
  while (true) {
    const res = await fetch(`${BASE}/wp-json/wp/v2/menu-items?per_page=100&page=${page}&_fields=id,url,title`, {
      headers: { Authorization: AUTH },
    });
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error('menu-items fetch failed: ' + res.status);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    allItems = allItems.concat(batch);
    if (batch.length < 100) break;
    page++;
  }

  console.log(`  Total menu items fetched: ${allItems.length}`);

  const typoRegex = new RegExp(TYPO, 'i');
  const targets = allItems.filter(function(item) { return typoRegex.test(item.url || ''); });

  if (!targets.length) {
    console.log('  ✅ No menu items with typo found.');
    return 0;
  }

  console.log(`  Found ${targets.length} menu item(s) with typo:`);
  targets.forEach(function(item) {
    const fixed = fixUrl(item.url);
    const title = item.title && item.title.rendered ? item.title.rendered : '(no title)';
    console.log(`    id:${item.id} "${title}"`);
    console.log(`      old: ${item.url}`);
    console.log(`      new: ${fixed}`);
  });

  if (DRY_RUN) return targets.length;

  let updated = 0;
  for (const item of targets) {
    const fixed = fixUrl(item.url);
    const res = await fetch(`${BASE}/wp-json/wp/v2/menu-items/${item.id}`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fixed }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`  ✗ id:${item.id} FAILED: ${res.status} ${body}`);
    } else {
      const result = await res.json();
      console.log(`  ✓ id:${item.id} patched → ${result.url}`);
      updated++;
    }
    await sleep(300);
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────────
// Step 2 — Fix page/post body copy
// ─────────────────────────────────────────────────────────────────
async function fixPageContent(type) {
  console.log(`\n─── Step 2: Scanning ${type} body copy ───`);

  let page = 1;
  let found = 0;
  let updated = 0;
  const typoRegex = new RegExp(TYPO, 'gi');

  while (true) {
    const res = await fetch(
      `${BASE}/wp-json/wp/v2/${type}?per_page=50&page=${page}&context=edit&search=${TYPO}&_fields=id,slug,title,content`,
      { headers: { Authorization: AUTH } }
    );
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error(`${type} fetch failed: ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;

    for (const post of batch) {
      const raw = post.content && post.content.raw ? post.content.raw : '';
      if (!typoRegex.test(raw)) { typoRegex.lastIndex = 0; continue; }
      typoRegex.lastIndex = 0;

      const fixedContent = raw.replace(new RegExp(TYPO, 'gi'), FIXED);
      const count = (raw.match(new RegExp(TYPO, 'gi')) || []).length;
      const title = post.title && post.title.rendered ? post.title.rendered : post.slug;
      console.log(`  Found ${count} occurrence(s) in ${type} id:${post.id} "${title}"`);
      found++;

      if (!DRY_RUN) {
        const pRes = await fetch(`${BASE}/wp-json/wp/v2/${type}/${post.id}`, {
          method: 'POST',
          headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: fixedContent }),
        });
        if (!pRes.ok) {
          const body = await pRes.text();
          console.error(`  ✗ id:${post.id} FAILED: ${pRes.status} ${body}`);
        } else {
          console.log(`  ✓ id:${post.id} patched (${count} replacement(s))`);
          updated++;
        }
        await sleep(300);
      }
    }

    if (batch.length < 50) break;
    page++;
  }

  if (!found) console.log(`  ✅ No ${type} body copy with typo found.`);
  return updated;
}

// ─────────────────────────────────────────────────────────────────
// Step 3 — Fix Elementor page builder data (post meta)
// ─────────────────────────────────────────────────────────────────
async function fixElementorMeta(postId, type) {
  // Try to read _elementor_data post meta
  const res = await fetch(
    `${BASE}/wp-json/wp/v2/${type}/${postId}?context=edit&_fields=meta`,
    { headers: { Authorization: AUTH } }
  );
  if (!res.ok) return false;
  const post = await res.json();
  const meta = post.meta || {};
  
  // _elementor_data is a JSON string stored in post meta
  const elementorRaw = meta['_elementor_data'];
  if (!elementorRaw) return false;

  const typoRegex = new RegExp(TYPO, 'gi');
  if (!typoRegex.test(elementorRaw)) {
    typoRegex.lastIndex = 0;
    return false;
  }

  const count = (elementorRaw.match(new RegExp(TYPO, 'gi')) || []).length;
  console.log(`  Found ${count} Elementor occurrence(s) in ${type} id:${postId}`);

  if (DRY_RUN) {
    console.log(`  → DRY RUN: would patch _elementor_data`);
    return true;
  }

  const fixedElementor = elementorRaw.replace(new RegExp(TYPO, 'gi'), FIXED);
  const pRes = await fetch(`${BASE}/wp-json/wp/v2/${type}/${postId}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta: { '_elementor_data': fixedElementor } }),
  });
  if (!pRes.ok) {
    const body = await pRes.text();
    console.error(`  ✗ Elementor meta FAILED: ${pRes.status} ${body}`);
    return false;
  }
  console.log(`  ✓ Elementor meta patched (${count} replacement(s))`);
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Step 3 — Scan all pages for Elementor meta (catches Elementor-only hits)
// ─────────────────────────────────────────────────────────────────
async function fixAllElementorPages() {
  console.log('\n─── Step 3: Scanning pages for Elementor meta ───');
  let page = 1;
  let fixed = 0;

  while (true) {
    const res = await fetch(
      `${BASE}/wp-json/wp/v2/pages?per_page=50&page=${page}&context=edit&_fields=id,slug,title,meta`,
      { headers: { Authorization: AUTH } }
    );
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error('pages meta fetch failed: ' + res.status);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;

    for (const p of batch) {
      const wasfixed = await fixElementorMeta(p.id, 'pages');
      if (wasfixed) fixed++;
    }

    if (batch.length < 50) break;
    page++;
    await sleep(200);
  }

  if (!fixed) console.log('  ✅ No Elementor meta with typo found.');
  return fixed;
}


async function main() {
  console.log('='.repeat(60));
  console.log('fix-footer-menu.js');
  console.log(`Target: ${BASE}`);
  console.log(`Mode:   ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE — will patch WP menu items + page content'}`);
  console.log('='.repeat(60));
  console.log(`Searching for: "${TYPO}" → "${FIXED}"`);

  const menuFixed = await fixMenuItems();
  await fixPageContent('pages');
  await fixPageContent('posts');
  await fixAllElementorPages();

  console.log('\n' + '='.repeat(60));
  if (DRY_RUN) {
    console.log(`DRY RUN complete.`);
    if (menuFixed > 0) console.log(`  ${menuFixed} menu item(s) would be patched.`);
    console.log('  Remove --dry-run to apply fixes.');
  } else {
    console.log('Done.');
  }
  console.log('='.repeat(60));

  console.log('\nVisual verification:');
  console.log(`  1. ${BASE} → footer nav → hover Skateboards link → confirm URL has no typo`);
  console.log(`  2. ${BASE} → any page referencing Skateboards → confirm links resolve`);
}

main().catch(function(err) { console.error('\nFATAL:', err.message); process.exit(1); });
