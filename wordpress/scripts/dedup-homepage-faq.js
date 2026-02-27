/**
 * dedup-homepage-faq.js
 *
 * Removes the duplicate FAQ entry from the WordPress homepage.
 * "Are roller skates better tight or loose?" appears twice — dilutes content signal.
 *
 * Strategy:
 *   1. Fetch homepage via WP REST (context=edit for raw Gutenberg blocks)
 *   2. Find all FAQ blocks — supports Yoast FAQ, Rank Math FAQ, and plain
 *      Gutenberg accordion/group blocks containing the question
 *   3. Remove the second (duplicate) occurrence, keep the first
 *   4. PATCH homepage content via REST
 *
 * Run order: 3 (no dependencies)
 * Tier: 1 — no content generation
 *
 * Usage:
 *   node wordpress/scripts/dedup-homepage-faq.js --dry-run   # preview only
 *   node wordpress/scripts/dedup-homepage-faq.js              # apply fix
 *   node wordpress/scripts/dedup-homepage-faq.js --search="tight or loose"  # custom search string
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

const searchArg = process.argv.find(function(a) { return a.startsWith('--search='); });
// Default: search for the duplicate FAQ question from the SEO audit
const SEARCH_STRING = searchArg ? searchArg.split('=').slice(1).join('=') : 'roller skates better tight';

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ─────────────────────────────────────────────────────────────────
// Find homepage
// ─────────────────────────────────────────────────────────────────
async function findHomepage() {
  // Try common home slugs
  const slugs = ['home', 'home-2', 'homepage', 'front-page'];
  for (const slug of slugs) {
    const res = await fetch(
      `${BASE}/wp-json/wp/v2/pages?slug=${slug}&context=edit&_fields=id,slug,title,content,link`,
      { headers: { Authorization: AUTH } }
    );
    if (!res.ok) continue;
    const pages = await res.json();
    if (pages.length) {
      console.log(`  Found homepage: id:${pages[0].id} slug:"${pages[0].slug}" url:${pages[0].link}`);
      return pages[0];
    }
  }

  // Fall back: check WP reading settings for front page ID
  const settingsRes = await fetch(`${BASE}/wp-json/wp/v2/settings`, { headers: { Authorization: AUTH } });
  if (settingsRes.ok) {
    const settings = await settingsRes.json();
    const pageOnFront = settings.page_on_front;
    if (pageOnFront) {
      const res = await fetch(
        `${BASE}/wp-json/wp/v2/pages/${pageOnFront}?context=edit&_fields=id,slug,title,content,link`,
        { headers: { Authorization: AUTH } }
      );
      if (res.ok) {
        const page = await res.json();
        console.log(`  Found homepage via settings: id:${page.id} slug:"${page.slug}" url:${page.link}`);
        return page;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// Detect FAQ block type and remove duplicate
// ─────────────────────────────────────────────────────────────────
function removeDuplicateFaqBlock(raw, searchStr) {
  const lowerSearch = searchStr.toLowerCase();
  const lowerRaw = raw.toLowerCase();

  // Find all positions of the search string
  const positions = [];
  let idx = 0;
  while (true) {
    const pos = lowerRaw.indexOf(lowerSearch, idx);
    if (pos === -1) break;
    positions.push(pos);
    idx = pos + 1;
  }

  console.log(`  Search string "${searchStr}" found ${positions.length} time(s) in raw content`);
  if (positions.length < 2) return null; // Nothing to dedup

  // Strategy: find the Gutenberg block containing the 2nd occurrence and remove it
  // Gutenberg blocks open with <!-- wp:... --> and close with <!-- /wp:... -->
  // We look backwards from the 2nd occurrence to find the opening comment
  const secondPos = positions[1];

  // Look backwards for the nearest block open comment
  const rawBefore = raw.substring(0, secondPos);
  const lastOpenIdx = rawBefore.lastIndexOf('<!-- wp:');
  if (lastOpenIdx === -1) {
    console.log('  ⚠️  Could not find opening block comment before 2nd occurrence');
    return null;
  }

  // Extract block name to find matching close tag
  const blockNameMatch = raw.substring(lastOpenIdx).match(/<!-- (wp:[a-z0-9-/]+)/);
  if (!blockNameMatch) {
    console.log('  ⚠️  Could not parse block name');
    return null;
  }

  const blockName = blockNameMatch[1]; // e.g. "wp:yoast/faq-block" or "wp:group"
  // The close tag for "wp:foo/bar" is "<!-- /wp:foo/bar -->"
  const closeTag = '<!-- /' + blockName.substring(3) + ' -->'; // strip "wp:" then prepend "/wp:"
  // Actually the close format is <!-- /wp:blockname -->
  const closeFull = '<!-- /' + blockName.slice(3) + ' -->'; // wrong approach
  // Correct: "<!-- wp:group -->" closes as "<!-- /wp:group -->"
  // blockName is "wp:group" so close is "<!-- /wp:group -->"
  const closeComment = '<!-- /' + blockName.substring(3) + ' -->';

  // Find close tag after the 2nd occurrence
  const closeIdx = raw.indexOf(closeComment, secondPos);
  if (closeIdx === -1) {
    console.log(`  ⚠️  Could not find closing tag "${closeComment}" after 2nd occurrence`);
    // Try self-closing or fallback: remove from opening to next FAQ-like block start
    // Last resort: find next block open after the 2nd occurrence
    const nextBlockIdx = raw.indexOf('<!-- wp:', secondPos + 1);
    if (nextBlockIdx === -1) {
      console.log('  ⚠️  Could not determine block boundaries — manual fix needed');
      return null;
    }
    const duplicateBlock = raw.substring(lastOpenIdx, nextBlockIdx);
    console.log(`  Block to remove (${duplicateBlock.length} chars, self-closing assumed):`);
    console.log('  ' + duplicateBlock.substring(0, 150) + (duplicateBlock.length > 150 ? '...' : ''));
    return raw.substring(0, lastOpenIdx) + raw.substring(nextBlockIdx);
  }

  const blockEnd = closeIdx + closeComment.length;
  const duplicateBlock = raw.substring(lastOpenIdx, blockEnd);

  console.log(`  Block to remove (${duplicateBlock.length} chars, block: ${blockName}):`);
  console.log('  ' + duplicateBlock.substring(0, 200) + (duplicateBlock.length > 200 ? '...' : ''));

  // Remove it — strip any leading whitespace/newline too
  const before = raw.substring(0, lastOpenIdx).replace(/\s+$/, '');
  const after = raw.substring(blockEnd).replace(/^\s+/, '\n\n');
  return before + after;
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('dedup-homepage-faq.js');
  console.log(`Target: ${BASE}`);
  console.log(`Mode:   ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE — will patch homepage content'}`);
  console.log(`Search: "${SEARCH_STRING}"`);
  console.log('='.repeat(60));

  console.log('\nLocating homepage...');
  const homepage = await findHomepage();
  if (!homepage) {
    console.error('ERROR: Could not find homepage. Try a different slug with --search= or check WP reading settings.');
    process.exit(1);
  }

  const raw = homepage.content && homepage.content.raw ? homepage.content.raw : '';
  console.log(`  Raw content length: ${raw.length} chars`);

  if (!raw) {
    console.log('  ⚠️  Raw content is empty. Homepage may be built with a page builder (not Gutenberg).');
    console.log('       The duplicate FAQ may be in a theme template — check WP Admin → Appearance → Theme Editor.');
    return;
  }

  console.log('\nSearching for duplicate FAQ block...');
  const fixed = removeDuplicateFaqBlock(raw, SEARCH_STRING);

  if (!fixed) {
    console.log('\n✅ No duplicate found — either the issue is on the live site, or the block');
    console.log('   boundaries could not be determined. Raw content preview:');
    console.log('   ' + raw.substring(0, 500));
    return;
  }

  const removedChars = raw.length - fixed.length;
  console.log(`\n  Removed ${removedChars} chars from raw content.`);

  // Verify search string now appears exactly once in fixed content
  const remaining = (fixed.toLowerCase().match(new RegExp(SEARCH_STRING.toLowerCase(), 'g')) || []).length;
  console.log(`  Search string occurrences after fix: ${remaining} (expected: 1)`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes made. Remove --dry-run to apply.');
    return;
  }

  console.log('\nPatching homepage content...');
  const res = await fetch(`${BASE}/wp-json/wp/v2/pages/${homepage.id}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: fixed }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`FAILED: ${res.status} ${body}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✓ Homepage id:${result.id} patched successfully`);

  console.log('\n' + '='.repeat(60));
  console.log('Done.');
  console.log('='.repeat(60));

  console.log('\nVisual verification:');
  console.log(`  1. ${BASE} → scroll to FAQ section → Ctrl+F "${SEARCH_STRING}"`);
  console.log('     → confirm it appears exactly ONCE');
  console.log('  2. View page source → confirm no duplicate block markup');
}

main().catch(function(err) { console.error('\nFATAL:', err.message); process.exit(1); });
