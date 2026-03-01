/**
 * fix-media-alt-text.js
 *
 * Finds WordPress media items whose alt text is "Home 1", "Home 2" etc.
 * (auto-generated when brand logos are uploaded on a page named "Home"),
 * and replaces them with the actual brand name derived from the filename.
 *
 * Run order: 1 (no dependencies)
 * Tier: 1 — no content generation
 *
 * Usage:
 *   node wordpress/scripts/fix-media-alt-text.js --dry-run   # preview only
 *   node wordpress/scripts/fix-media-alt-text.js              # apply fixes
 *   node wordpress/scripts/fix-media-alt-text.js --limit=20  # cap at 20 updates
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
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const MAX_UPDATES = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const MAX_PAGES_ARG = process.argv.find((a) => a.startsWith('--max-pages='));
const MAX_PAGES = MAX_PAGES_ARG ? parseInt(MAX_PAGES_ARG.split('=')[1], 10) : 200; // 200 pages = 20,000 items

// ─────────────────────────────────────────────────────────────────
// Known brand name overrides (filename keyword → brand alt text)
// Add entries here if auto-detection misses or misnames a logo.
// Keys are lowercase fragments that appear in the filename.
// ─────────────────────────────────────────────────────────────────
const BRAND_MAP = {
  rollerblade: 'Rollerblade',
  powerslide: 'Powerslide',
  'k2-skates': 'K2 Skates',
  k2skates: 'K2 Skates',
  seba: 'Seba Skates',
  'fr-skates': 'FR Skates',
  frskates: 'FR Skates',
  usd: 'USD Skates',
  salomon: 'Salomon',
  bauer: 'Bauer',
  roces: 'Roces',
  oxelo: 'Oxelo',
  chaya: 'Chaya',
  playlife: 'PlayLife',
  fila: 'FILA Skates',
  bont: 'Bont Skates',
  ennui: 'Ennui',
  kizer: 'Kizer',
  mindless: 'Mindless',
  atom: 'Atom Skates',
  vanilla: 'Vanilla',
  tour: 'Tour Hockey',
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Pause execution for ms milliseconds */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Derive a brand name from a filename.
 * Strategy:
 *   1. Check BRAND_MAP for any matching substring.
 *   2. Fall back to title-casing the first segment of the filename.
 */
function brandFromFilename(filename) {
  const lower = filename.toLowerCase();

  for (const [key, value] of Object.entries(BRAND_MAP)) {
    if (lower.includes(key)) return value;
  }

  // Generic: strip extension + numbers, title-case first word
  const stem = filename
    .replace(/\.[a-z]+$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  const words = stem.split(' ').filter(Boolean);
  const firstWord = words[0] || 'Brand';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

/** Fetch all media items, paginated */
async function fetchAllMedia() {
  const items = [];
  let page = 1;
  let totalPages = null;

  while (true) {
    if (page > MAX_PAGES) {
      console.log(`  Reached --max-pages=${MAX_PAGES} cap, stopping scan.`);
      break;
    }

    const url = `${BASE}/wp-json/wp/v2/media?per_page=100&page=${page}&_fields=id,alt_text,title,source_url`;
    const res = await fetch(url, {headers: {Authorization: AUTH}});

    // WP returns 400 when page > total pages
    if (res.status === 400 || res.status === 404) break;

    if (!res.ok) {
      throw new Error(`Media fetch page ${page} failed: ${res.status} ${res.statusText}`);
    }

    // Read total pages from header (only on first request)
    if (totalPages === null) {
      const tp = res.headers.get('X-WP-TotalPages');
      if (tp) {
        totalPages = parseInt(tp, 10);
        console.log(`  Total pages in media library: ${totalPages}`);
      }
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    items.push(...batch);
    process.stdout.write(`  Fetched page ${page}/${totalPages || '?'} — ${items.length} items\r`);

    if (batch.length < 100) break;
    if (totalPages !== null && page >= totalPages) break;
    page++;
    await sleep(100); // gentle rate limiting
  }

  process.stdout.write('\n'); // newline after \r progress
  return items;
}

/** PATCH a media item's alt_text */
async function patchAlt(id, newAlt, attempt) {
  attempt = attempt || 1;
  try {
    const res = await fetch(`${BASE}/wp-json/wp/v2/media/${id}`, {
      method: 'POST',
      headers: {
        Authorization: AUTH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({alt_text: newAlt}),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }

    const updated = await res.json();
    return updated.alt_text;
  } catch (err) {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return patchAlt(id, newAlt, attempt + 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('fix-media-alt-text.js');
  console.log(`Target: ${BASE}`);
  console.log(`Mode:   ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE — will patch media items'}`);
  if (MAX_UPDATES !== Infinity) console.log(`Limit:  ${MAX_UPDATES} updates`);
  console.log('='.repeat(60));

  console.log('\nFetching media library...');
  const allMedia = await fetchAllMedia();
  console.log(`\nTotal media items found: ${allMedia.length}`);

  // Filter: alt_text matches "Home N" pattern (case-insensitive)
  const homeAltPattern = /^home[\s-]?\d+$/i;
  const targets = allMedia.filter((item) => homeAltPattern.test(item.alt_text || ''));

  console.log(`\nItems with "Home N" alt text: ${targets.length}`);

  if (targets.length === 0) {
    console.log('\n✅ Nothing to fix — no "Home N" alt text found in media library.');
    console.log('   (If the issue is on the LIVE site, update BASE_URL in .env and re-run)');
    return;
  }

  console.log('\nTargets:');
  targets.forEach((item) => {
    const filename = item.source_url.split('/').pop();
    const brand = brandFromFilename(filename);
    const altText = `${brand} logo`;
    console.log(`  id:${item.id}  cur:"${item.alt_text}"  →  new:"${altText}"  (${filename})`);
  });

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes made. Remove --dry-run to apply.');
    return;
  }

  console.log('\nApplying fixes...');
  let updated = 0;
  let failed = 0;

  for (const item of targets) {
    if (updated >= MAX_UPDATES) {
      console.log(`\nReached --limit=${MAX_UPDATES}, stopping.`);
      break;
    }

    const filename = item.source_url.split('/').pop();
    const brand = brandFromFilename(filename);
    const newAlt = `${brand} logo`;

    try {
      const resultAlt = await patchAlt(item.id, newAlt);
      console.log(`  ✓ id:${item.id}  "${item.alt_text}"  →  "${resultAlt}"`);
      updated++;
    } catch (err) {
      console.error(`  ✗ id:${item.id}  FAILED: ${err.message}`);
      failed++;
    }

    await sleep(300); // gentle rate limiting
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Done. Updated: ${updated}  Failed: ${failed}`);
  console.log('='.repeat(60));

  console.log('\nVisual verification steps:');
  console.log(`  1. Open: ${BASE}`);
  console.log('     → Scroll to "Brands We Carry" section');
  console.log('     → Right-click a logo → Inspect → confirm alt="Rollerblade logo" etc.');
  console.log('  2. Spot-check 3-4 logo images in the section');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
