/**
 * fix-shipping-threshold.js
 *
 * Audits and fixes free shipping threshold inconsistency across the site.
 * Common issue: site shows "$99 free shipping" in some places and "$150" in others.
 *
 * Step 1 (--audit mode, default): Finds every mention of both thresholds across:
 *   - WooCommerce shipping zone methods (WC REST)
 *   - WC notices/settings
 *   - WordPress widgets
 *   - All pages and posts body copy
 *
 * Step 2 (--fix mode): Replaces all instances of the WRONG value with the CORRECT value.
 *
 * ⚠️  PREREQUISITE: Confirm correct threshold before running --fix.
 *     Set CORRECT_THRESHOLD and WRONG_THRESHOLD below, or pass:
 *       --correct=150  --wrong=99
 *
 * Run order: 4 (confirm correct value first)
 * Tier: 1 — no content generation
 *
 * Usage:
 *   node wordpress/scripts/fix-shipping-threshold.js              # audit only (safe)
 *   node wordpress/scripts/fix-shipping-threshold.js --audit      # same as above
 *   node wordpress/scripts/fix-shipping-threshold.js --fix --dry-run   # preview fixes
 *   node wordpress/scripts/fix-shipping-threshold.js --fix             # apply fixes
 */

require('dotenv').config();
const fetch = require('node-fetch');

// ─────────────────────────────────────────────────────────────────
// Config — SET THESE before running --fix
// ─────────────────────────────────────────────────────────────────
const correctArg = process.argv.find(function (a) {
  return a.startsWith('--correct=');
});
const wrongArg = process.argv.find(function (a) {
  return a.startsWith('--wrong=');
});
const CORRECT_THRESHOLD = correctArg ? correctArg.split('=')[1] : '150'; // The right value
const WRONG_THRESHOLD = wrongArg ? wrongArg.split('=')[1] : '99'; // The value to replace

const BASE = process.env.BASE_URL;
const WP_USER = process.env.WP_ADMIN_USERNAME;
const WP_PASS = process.env.WP_ADMIN_APP_PASSWORD;
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SEC = process.env.WC_CONSUMER_SECRET;

if (!BASE || !WP_USER || !WP_PASS || !WC_KEY || !WC_SEC) {
  console.error('ERROR: Missing required env vars. Check .env');
  process.exit(1);
}

const WP_AUTH = 'Basic ' + Buffer.from(WP_USER + ':' + WP_PASS).toString('base64');
const WC_AUTH = 'Basic ' + Buffer.from(WC_KEY + ':' + WC_SEC).toString('base64');

const FIX_MODE = process.argv.includes('--fix');
const DRY_RUN = process.argv.includes('--dry-run');

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

// ─────────────────────────────────────────────────────────────────
// Audit helpers
// ─────────────────────────────────────────────────────────────────
function mentionsThreshold(text, value) {
  // Match "$99", "99$", "99 CAD", "$99 free", "free shipping over $99", etc.
  const patterns = [
    new RegExp('\\$\\s*' + value + '(?![0-9])', 'i'),
    new RegExp('(?<![0-9])' + value + '\\s*\\$', 'i'),
    new RegExp('(?<![0-9])' + value + '\\s*(CAD|USD)?\\s*free', 'i'),
    new RegExp('free\\s+shipping\\s+(on orders\\s+)?(over\\s+)?\\$?\\s*' + value + '(?![0-9])', 'i'),
  ];
  return patterns.some(function (p) {
    return p.test(text);
  });
}

// ─────────────────────────────────────────────────────────────────
// Section: WooCommerce shipping zones + methods
// ─────────────────────────────────────────────────────────────────
async function auditShippingZones() {
  console.log('\n─── WooCommerce Shipping Zones ───');
  const res = await fetch(`${BASE}/wp-json/wc/v3/shipping/zones`, {headers: {Authorization: WC_AUTH}});
  if (!res.ok) {
    console.log('  Could not fetch zones:', res.status);
    return [];
  }
  const zones = await res.json();

  const findings = [];
  for (const zone of zones) {
    const mRes = await fetch(`${BASE}/wp-json/wc/v3/shipping/zones/${zone.id}/methods`, {headers: {Authorization: WC_AUTH}});
    if (!mRes.ok) continue;
    const methods = await mRes.json();
    for (const method of methods) {
      if (method.method_id === 'free_shipping') {
        const min = method.settings && method.settings.min_amount ? method.settings.min_amount.value : '(not set)';
        console.log(`  Zone "${zone.name}" — free_shipping min_amount: $${min}`);
        findings.push({zone: zone.name, zoneId: zone.id, methodId: method.id, current: min});
        if (min === WRONG_THRESHOLD) {
          console.log(`    ⚠️  WRONG: should be $${CORRECT_THRESHOLD}`);
        } else if (min === CORRECT_THRESHOLD) {
          console.log(`    ✅ Correct`);
        }
      }
    }
  }
  if (!findings.length) console.log('  No WC free_shipping methods found in zones.');
  return findings;
}

// ─────────────────────────────────────────────────────────────────
// Section: WordPress widgets
// ─────────────────────────────────────────────────────────────────
async function auditWidgets() {
  console.log('\n─── WordPress Widgets ───');
  const res = await fetch(`${BASE}/wp-json/wp/v2/widgets?_fields=id,content`, {headers: {Authorization: WP_AUTH}});
  if (!res.ok) {
    console.log('  Could not fetch widgets:', res.status);
    return;
  }
  const widgets = await res.json();
  let found = 0;
  for (const w of widgets) {
    const text = w.content && w.content.rendered ? w.content.rendered : '';
    const hasCorrect = mentionsThreshold(text, CORRECT_THRESHOLD);
    const hasWrong = mentionsThreshold(text, WRONG_THRESHOLD);
    if (hasCorrect || hasWrong) {
      found++;
      console.log(`  Widget id:${w.id}`);
      if (hasCorrect) console.log(`    ✅ mentions $${CORRECT_THRESHOLD}`);
      if (hasWrong) console.log(`    ⚠️  mentions $${WRONG_THRESHOLD} (WRONG)`);
    }
  }
  if (!found) console.log(`  No widgets mention either threshold.`);
}

// ─────────────────────────────────────────────────────────────────
// Section: Pages + Posts body copy
// ─────────────────────────────────────────────────────────────────
async function auditAndFixContent(type) {
  console.log(`\n─── ${type} body copy ───`);
  let page = 1;
  let foundCount = 0;
  let fixedCount = 0;

  while (true) {
    const res = await fetch(`${BASE}/wp-json/wp/v2/${type}?per_page=50&page=${page}&context=edit&_fields=id,slug,title,content`, {
      headers: {Authorization: WP_AUTH},
    });
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error(`${type} fetch page ${page} failed: ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;

    for (const post of batch) {
      const raw = post.content && post.content.raw ? post.content.raw : '';
      const rendered = post.content && post.content.rendered ? post.content.rendered : '';
      const title = post.title && post.title.rendered ? post.title.rendered : post.slug;

      const hasCorrect = mentionsThreshold(rendered, CORRECT_THRESHOLD);
      const hasWrong = mentionsThreshold(rendered, WRONG_THRESHOLD);

      if (!hasCorrect && !hasWrong) continue;
      foundCount++;

      console.log(`  ${type} id:${post.id} "${title}"`);
      if (hasCorrect) console.log(`    ✅ mentions $${CORRECT_THRESHOLD}`);
      if (hasWrong) console.log(`    ⚠️  mentions $${WRONG_THRESHOLD} (WRONG)`);

      if (FIX_MODE && hasWrong) {
        // Replace wrong threshold in raw (Gutenberg) content
        // Be careful to only replace the shipping context, not unrelated prices
        const fixedRaw = raw
          .replace(new RegExp('(free\\s+shipping[^$]*\\$\\s*)' + WRONG_THRESHOLD + '(?![0-9])', 'gi'), '$1' + CORRECT_THRESHOLD)
          .replace(new RegExp('(\\$\\s*)' + WRONG_THRESHOLD + '(\\s*(free|CAD|USD)?\\s*shipping)', 'gi'), '$1' + CORRECT_THRESHOLD + '$2');

        if (fixedRaw === raw) {
          console.log(`    ℹ️  Pattern matches rendered but not raw — may be in shortcode/widget, skipping`);
          continue;
        }

        if (DRY_RUN) {
          console.log(`    → DRY RUN: would patch content`);
        } else {
          const pRes = await fetch(`${BASE}/wp-json/wp/v2/${type}/${post.id}`, {
            method: 'POST',
            headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
            body: JSON.stringify({content: fixedRaw}),
          });
          if (!pRes.ok) {
            console.error(`    ✗ FAILED: ${pRes.status}`);
          } else {
            console.log(`    ✓ Patched`);
            fixedCount++;
          }
          await sleep(300);
        }
      }
    }

    if (batch.length < 50) break;
    page++;
    await sleep(150);
  }

  if (!foundCount) console.log(`  No ${type} mention either threshold.`);
  return fixedCount;
}

// ─────────────────────────────────────────────────────────────────
// Section: WC notices/announcement options
// ─────────────────────────────────────────────────────────────────
async function auditWCNotices() {
  console.log('\n─── WooCommerce Notices / Cart Messages ───');
  // Check WC settings groups for any free-shipping messages
  const res = await fetch(`${BASE}/wp-json/wc/v3/settings/advanced`, {headers: {Authorization: WC_AUTH}});
  if (!res.ok) {
    console.log('  Could not fetch WC advanced settings:', res.status);
    return;
  }
  const settings = await res.json();
  let found = 0;
  for (const s of settings) {
    const val = String(s.value || '');
    if (mentionsThreshold(val, CORRECT_THRESHOLD) || mentionsThreshold(val, WRONG_THRESHOLD)) {
      found++;
      console.log(`  WC setting "${s.id}": ${val}`);
    }
  }
  if (!found) console.log('  No WC advanced settings mention either threshold.');
}

// ─────────────────────────────────────────────────────────────────
// Section: Elementor meta (_elementor_data) for pages
// Homepage on this site uses Elementor — threshold may live in JSON meta
// ─────────────────────────────────────────────────────────────────
async function auditAndFixElementorPages() {
  console.log('\n─── Elementor page meta (_elementor_data) ───');
  let page = 1;
  let found = 0;
  let fixed = 0;

  while (true) {
    const res = await fetch(`${BASE}/wp-json/wp/v2/pages?per_page=50&page=${page}&context=edit&_fields=id,slug,title,meta`, {
      headers: {Authorization: WP_AUTH},
    });
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;

    for (const post of batch) {
      const el = (post.meta && post.meta['_elementor_data']) || '';
      if (!el) continue;

      const hasCorrect = mentionsThreshold(el, CORRECT_THRESHOLD);
      const hasWrong = mentionsThreshold(el, WRONG_THRESHOLD);
      if (!hasCorrect && !hasWrong) continue;

      const title = post.title && post.title.rendered ? post.title.rendered : post.slug;
      found++;
      console.log(`  Page id:${post.id} "${title}" (Elementor meta)`);
      if (hasCorrect) console.log(`    ✅ mentions $${CORRECT_THRESHOLD}`);
      if (hasWrong) console.log(`    ⚠️  mentions $${WRONG_THRESHOLD} (WRONG)`);

      if (FIX_MODE && hasWrong) {
        const fixedEl = el
          .replace(new RegExp('(free\\\\u00a0shipping[^$]*\\\\u0024\\\\u00a0*)' + WRONG_THRESHOLD + '(?![0-9])', 'gi'), '$1' + CORRECT_THRESHOLD)
          .replace(new RegExp('\\\\u0024' + WRONG_THRESHOLD + '(?![0-9])', 'g'), '\\u0024' + CORRECT_THRESHOLD)
          .replace(new RegExp('(\\$)' + WRONG_THRESHOLD + '(?![0-9])', 'g'), '$1' + CORRECT_THRESHOLD)
          .replace(new RegExp('(?<![0-9])' + WRONG_THRESHOLD + '(\\+)', 'g'), CORRECT_THRESHOLD + '$1');

        if (DRY_RUN) {
          console.log(`    → DRY RUN: would patch _elementor_data`);
        } else {
          const pRes = await fetch(`${BASE}/wp-json/wp/v2/pages/${post.id}`, {
            method: 'POST',
            headers: {Authorization: WP_AUTH, 'Content-Type': 'application/json'},
            body: JSON.stringify({meta: {_elementor_data: fixedEl}}),
          });
          if (!pRes.ok) {
            console.error(`    ✗ FAILED: ${pRes.status}`);
          } else {
            console.log(`    ✓ Elementor meta patched`);
            fixed++;
          }
          await sleep(300);
        }
      }
    }

    if (batch.length < 50) break;
    page++;
    await sleep(150);
  }

  if (!found) console.log('  No Elementor pages mention either threshold.');
  return fixed;
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('fix-shipping-threshold.js');
  console.log(`Target:  ${BASE}`);
  console.log(`Looking: $${WRONG_THRESHOLD} (wrong) vs $${CORRECT_THRESHOLD} (correct)`);
  console.log(`Mode:    ${FIX_MODE ? (DRY_RUN ? 'FIX + DRY RUN (no changes)' : 'FIX — will patch content') : 'AUDIT ONLY (read-only)'}`);
  console.log('='.repeat(60));

  if (FIX_MODE && !DRY_RUN) {
    console.log(`\n⚠️  FIX MODE: Will replace $${WRONG_THRESHOLD} → $${CORRECT_THRESHOLD} in page/post content`);
    console.log('   Correct value confirmed? If not, Ctrl+C now and re-run with --dry-run first.');
    await sleep(2000);
  }

  await auditShippingZones();
  await auditWCNotices();
  await auditWidgets();
  await auditAndFixContent('pages');
  await auditAndFixContent('posts');
  await auditAndFixElementorPages();

  console.log('\n' + '='.repeat(60));
  console.log('Audit complete.');
  if (!FIX_MODE) {
    console.log(`\nTo fix: node wordpress/scripts/fix-shipping-threshold.js --fix --dry-run`);
    console.log(`To change which value is "correct": --correct=150 --wrong=99`);
  }
  console.log('='.repeat(60));
}

main().catch(function (err) {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
