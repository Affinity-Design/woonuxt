#!/usr/bin/env node
/**
 * Build the Google Merchant Center product feed for proskatersplace.ca.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Canadian feed was previously produced by Rex Feed on the .com WordPress
 * backend. Every <g:link> in it pointed at proskatersplace.com, so all Canadian
 * Shopping clicks landed on the US store (and then bounced through the CA
 * geo-redirect). It also emitted the literal string "Shop" as the brand for all
 * 3,006 items, marked everything in_stock, and had no refresh schedule — it was
 * three weeks stale. Generating from the .ca itself removes every one of those
 * failure modes.
 *
 * PRICE INTEGRITY (the important part)
 * ------------------------------------
 * Merchant Center disapproves items whose feed price differs from the landing
 * page price. On this stack those two can disagree: WPGraphQL returns the native
 * Woo CAD price, but the .ca product page renders a price converted from the USD
 * base. Verified 2026-07-29 on FR FR1 80 — GraphQL RAW said 577.99 while the page
 * (and its Product JSON-LD) said 582.99. Simple products happened to agree
 * (52.99), variable ones did not.
 *
 * So price and availability are read from each live product page's Product
 * JSON-LD — the exact values Google will compare against. GraphQL supplies only
 * the things the page does not expose cleanly (sku, brand, gallery, categories).
 * If a page fetch fails, the item is skipped rather than shipped with a price
 * that might not match: a missing item costs one listing, a mismatched item
 * risks account-level disapprovals.
 *
 * Usage:
 *   GQL_HOST=https://proskatersplace.com/graphql node scripts/build-merchant-feed.js
 *   node scripts/build-merchant-feed.js --limit 25      # quick smoke test
 *
 * Output: data/merchant-feed-ca.json  (rendered as XML by server/routes/merchant-feed.xml.ts)
 */

const {writeFileSync, existsSync, mkdirSync} = require('fs');
const {resolve} = require('path');
const {harvestProducts, harvestLivePrices} = require('./lib/product-harvest');

const SITE = 'https://proskatersplace.ca';
const GQL_HOST = process.env.GQL_HOST || 'https://proskatersplace.com/graphql';
const OUTPUT_DIR = resolve(process.cwd(), 'data');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'merchant-feed-ca.json');

const PAGE_CONCURRENCY = Number(process.env.FEED_CONCURRENCY || 16); // simultaneous product-page fetches
const PAGE_RETRIES = 2;

// Runs inside `npm run build`, so don't re-scrape 1,700 pages on back-to-back
// deploys. Rebuild only when the existing feed is older than this.
const MAX_AGE_HOURS = Number(process.env.FEED_MAX_AGE_HOURS || 12);

const argLimit = (() => {
  const i = process.argv.indexOf('--limit');
  return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : null;
})();
const argForce = process.argv.includes('--force');

// Deploys pass --reuse: publish the committed feed as-is and NEVER scrape.
// The ~1,700-page price pass makes build duration hostage to live-site cache
// state (18 min against a warm cache, 35+ min — past the Pages timeout —
// right after a deploy invalidates it). Rebuilds are owned by the scheduled
// .github/workflows/refresh-merchant-feed.yml instead.
const argReuse = process.argv.includes('--reuse');

/**
 * The committed feed, if it is recent enough to reuse. Returns null when a
 * rebuild is needed.
 *
 * Returning the feed rather than a boolean matters: the route reads from KV in
 * production (`fs` is not available in a Cloudflare Worker, so the file fallback
 * never fires there). If the skip path returned early without uploading, a CI
 * build that skipped the rebuild would leave KV empty and the route would answer
 * 503 — which is exactly what happened on the first deploy.
 */
function freshExistingFeed() {
  if (argForce || argLimit) return null;
  try {
    const {readFileSync} = require('fs');
    const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
    if (!existing?.generatedAt || !existing?.itemCount) return null;
    const ageHours = (Date.now() - new Date(existing.generatedAt).getTime()) / 36e5;
    if (ageHours < MAX_AGE_HOURS) {
      console.log(`Merchant feed is ${ageHours.toFixed(1)}h old (< ${MAX_AGE_HOURS}h) with ${existing.itemCount} items — skipping rebuild.`);
      console.log('Use --force or set FEED_MAX_AGE_HOURS=0 to rebuild anyway.');
      return existing;
    }
  } catch {
    /* no usable existing feed — build it */
  }
  return null;
}

// ─── 1. Catalogue + pricing: shared harvest ──────────────────────────────────
//
// Both passes live in scripts/lib/product-harvest.js so build-sitemap.js and
// this script share ONE GraphQL pagination and ONE page-price pass per build,
// instead of each running its own full pagination over ~1,700 products.

// ─── 2. Shape items ──────────────────────────────────────────────────────────

const stripHtml = (input) =>
  String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

const truncate = (text, max) => (text.length <= max ? text : text.slice(0, text.lastIndexOf(' ', max) > 0 ? text.lastIndexOf(' ', max) : max).trim());

/** Brand lives in the pa_manufacturer product attribute (pwb-brand is not exposed to WPGraphQL). */
function brandOf(product) {
  const term = (product.terms?.nodes || []).find((t) => t.taxonomyName === 'pa_manufacturer');
  return term?.name || null;
}

/** Prefer https and the real upload URL; Woo images are hosted on the .com. */
const normalizeImage = (url) => (url ? String(url).replace(/^http:\/\//i, 'https://').trim() : null);

function buildItem(product, pricing) {
  const brand = brandOf(product);
  const categories = (product.productCategories?.nodes || []).map((c) => c.name).filter((n) => !/^(Clearance!|Discount Products)$/i.test(n));

  const description = truncate(stripHtml(pricing.description || product.shortDescription || product.name), 4900);

  const gallery = (product.galleryImages?.nodes || [])
    .map((n) => normalizeImage(n.sourceUrl))
    .filter(Boolean)
    .slice(0, 10);

  return {
    id: product.sku || String(product.databaseId),
    title: truncate(stripHtml(product.name), 150),
    description: description || product.name,
    link: `${SITE}/product/${product.slug}`,
    image_link: normalizeImage(product.image?.sourceUrl),
    additional_image_link: gallery,
    availability: pricing.availability,
    price: `${pricing.price.toFixed(2)} ${pricing.currency}`,
    brand: brand || 'ProSkaters Place',
    mpn: product.sku || undefined,
    // No GTINs in the catalogue; declaring identifier_exists=no with an MPN+brand
    // is the correct signal rather than omitting identifiers silently.
    identifier_exists: product.sku && brand ? undefined : 'no',
    condition: 'new',
    product_type: categories.join(' > ') || undefined,
  };
}

// ─── 3. Advertised-vs-charged direction check ────────────────────────────────

/**
 * The storefront displays USD × a locked exchange rate
 * (NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE, maintained by hand), while checkout
 * bills WooCommerce's own CAD total. Those two numbers differ on roughly half
 * the catalogue — see docs/ca-price-integrity.md.
 *
 * That gap is tolerable in ONE direction only. While the locked rate sits at or
 * above Woo's implied rate we advertise slightly high and the customer is
 * charged slightly less — harmless. If the locked rate drifts BELOW Woo's, we
 * start advertising less than we charge, which is the damaging direction
 * (bait-and-switch exposure and Merchant Center disapprovals).
 *
 * This is purely advisory: it tells you when the rate needs bumping. It only
 * runs when the harvest returned CAD-marked prices — in CI the GraphQL response
 * may be USD-marked, in which case there is nothing to compare and we say so.
 */
function reportPriceDirection(catalogue, prices) {
  let comparable = 0;
  const underAdvertised = [];

  for (const product of catalogue) {
    // markedPrice carries the currency marker; price(format: RAW) strips it.
    const marked = String(product.markedPrice ?? '');
    // Only meaningful when WPGraphQL handed us a CAD price to compare against.
    if (!/CAD/i.test(marked) || /US\$/i.test(marked)) continue;

    const wooCad = parseFloat(String(product.price ?? '').split(',')[0].replace(/[^0-9.]/g, ''));
    const shown = prices[product.slug]?.price;
    if (!Number.isFinite(wooCad) || !Number.isFinite(shown)) continue;

    comparable++;
    if (shown < wooCad - 0.005) underAdvertised.push({slug: product.slug, shown, wooCad, gap: +(wooCad - shown).toFixed(2)});
  }

  if (!comparable) {
    console.log('  price direction: not checked (GraphQL returned USD-marked prices — nothing to compare)');
    return;
  }

  if (!underAdvertised.length) {
    console.log(`  price direction: OK — ${comparable} products compared, none advertised below Woo's charge`);
    return;
  }

  console.warn('\n' + '!'.repeat(70));
  console.warn(`ADVERTISED BELOW CHARGED on ${underAdvertised.length}/${comparable} products.`);
  console.warn('The locked exchange rate has drifted below Woo\'s — customers would be');
  console.warn('billed MORE than the page shows. Raise NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE.');
  underAdvertised
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5)
    .forEach((u) => console.warn(`  ${u.slug}: shown ${u.shown} vs charged ${u.wooCad} (-$${u.gap})`));
  console.warn('!'.repeat(70) + '\n');
}

// ─── 4. Publish to Cloudflare KV ─────────────────────────────────────────────

/**
 * Upload to the NUXT_SCRIPT_DATA namespace so the feed can be refreshed WITHOUT
 * a redeploy — Merchant Center fetches daily, deploys are far less frequent.
 * Mirrors the KV upload in scripts/build-sitemap.js.
 */
/**
 * generatedAt of the feed currently in KV, or null when unreadable. Guards
 * --reuse against overwriting a fresher feed (published straight to KV by a
 * scheduled refresh) with an older committed one.
 */
async function kvFeedGeneratedAt() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA;
  if (!accountId || !apiToken || !namespaceId) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/merchant-feed-ca`;
    const res = await fetch(url, {headers: {Authorization: `Bearer ${apiToken}`}});
    if (!res.ok) return null;
    const body = await res.json();
    return body?.generatedAt || null;
  } catch {
    return null;
  }
}

async function uploadToKV(feed) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA;

  if (!accountId || !apiToken || !namespaceId) {
    console.log('  KV upload skipped (CF_ACCOUNT_ID / CF_API_TOKEN / CF_KV_NAMESPACE_ID_SCRIPT_DATA not set)');
    console.log('  → the route will serve the bundled data/merchant-feed-ca.json until the next deploy');
    return false;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/merchant-feed-ca`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(feed),
    });
    const body = await res.json();

    if (!res.ok || !body.success) {
      console.error(`  KV upload FAILED: ${res.status} ${res.statusText}`, JSON.stringify(body).slice(0, 200));
      return false;
    }

    console.log(`  uploaded to KV (${Math.round(JSON.stringify(feed).length / 1024)} KB) — live immediately`);
    return true;
  } catch (err) {
    console.error('  KV upload error:', err.message);
    return false;
  }
}

// ─── 5. Main ─────────────────────────────────────────────────────────────────

(async () => {
  const startedAt = Date.now();

  if (argReuse) {
    const {readFileSync} = require('fs');
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
      if (!existing?.generatedAt || !existing?.itemCount) throw new Error('committed feed is empty or malformed');
      const ageHours = (Date.now() - new Date(existing.generatedAt).getTime()) / 36e5;
      console.log(`--reuse: committed feed has ${existing.itemCount} items, ${ageHours.toFixed(1)}h old — publishing without a rebuild.`);
      if (ageHours > 48) {
        console.warn('⚠️  Committed feed is over 48h old — check that the refresh-merchant-feed workflow is running and pushing.');
      }
      const kvGeneratedAt = await kvFeedGeneratedAt();
      if (kvGeneratedAt && new Date(kvGeneratedAt) > new Date(existing.generatedAt)) {
        console.log(`--reuse: KV already holds a newer feed (${kvGeneratedAt}) — leaving it in place.`);
      } else {
        await uploadToKV(existing);
      }
      console.log(`\n  Feed URL: ${SITE}/merchant-feed.xml`);
    } catch (err) {
      // Never fail a deploy over the feed: KV keeps whatever it already has.
      console.error(`⚠️  --reuse: no usable committed feed (${err.message}).`);
      console.error('   Run the refresh-merchant-feed workflow (or `npm run build-merchant-feed`) to publish a fresh one.');
    }
    return;
  }

  // Even when the rebuild is skipped, still publish to KV — that is the only
  // source the production route can read.
  const reusable = freshExistingFeed();
  if (reusable) {
    await uploadToKV(reusable);
    console.log(`\n  Feed URL: ${SITE}/merchant-feed.xml`);
    return;
  }

  console.log('Building Merchant Center feed for proskatersplace.ca');
  console.log(`  GraphQL: ${GQL_HOST}`);
  console.log(`  concurrency: ${PAGE_CONCURRENCY}`);
  if (argLimit) console.log(`  LIMIT: ${argLimit} (smoke test)`);

  const harvested = await harvestProducts({gqlHost: GQL_HOST});
  const catalogue = argLimit ? harvested.slice(0, argLimit) : harvested;
  console.log(`  catalogue: ${catalogue.length} products`);

  const prices = await harvestLivePrices(
    catalogue.map((p) => p.slug),
    {concurrency: PAGE_CONCURRENCY, retries: PAGE_RETRIES},
  );

  const items = [];
  const skipped = [];

  catalogue.forEach((product) => {
    const pricing = prices[product.slug];
    if (!pricing || pricing.error) {
      skipped.push({slug: product.slug, reason: pricing?.error || 'unknown'});
      return;
    }
    const item = buildItem(product, pricing);
    if (!item.image_link) {
      skipped.push({slug: product.slug, reason: 'no image'});
      return;
    }
    items.push(item);
  });

  const missingBrand = items.filter((i) => i.brand === 'ProSkaters Place').length;
  const outOfStock = items.filter((i) => i.availability === 'out_of_stock').length;

  reportPriceDirection(catalogue, prices);

  const feed = {
    generatedAt: new Date().toISOString(),
    site: SITE,
    currency: 'CAD',
    itemCount: items.length,
    skippedCount: skipped.length,
    items,
  };

  // Refuse to publish a catastrophically short feed: Merchant Center reads a
  // successful fetch with few/zero items as "these products are gone" and
  // delists them. A partial scrape must never overwrite a good feed.
  const MIN_ITEMS = 100;
  if (items.length < MIN_ITEMS) {
    throw new Error(`only ${items.length} items collected (min ${MIN_ITEMS}) — Merchant Center would read this as a mass product removal`);
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, {recursive: true});
  writeFileSync(OUTPUT_FILE, JSON.stringify(feed, null, 0));

  console.log('');
  console.log(`  items:        ${items.length}`);
  console.log(`  skipped:      ${skipped.length}`);
  console.log(`  out of stock: ${outOfStock}`);
  console.log(`  fallback brand (no pa_manufacturer): ${missingBrand}`);
  console.log(`  wrote ${OUTPUT_FILE}`);

  await uploadToKV(feed);

  console.log(`  took ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`\n  Feed URL: ${SITE}/merchant-feed.xml`);

  if (skipped.length) {
    console.log('\n  first skipped:');
    skipped.slice(0, 8).forEach((s) => console.log(`    - ${s.slug}: ${s.reason}`));
  }
})().catch((err) => {
  console.error('\n' + '='.repeat(70));
  console.error('MERCHANT FEED BUILD FAILED:', err.message);
  console.error('The previously published feed (KV) stays live and unchanged.');
  console.error('='.repeat(70) + '\n');

  // Exit 0 by default so a feed problem can never block a deploy — the route
  // keeps serving the last good KV copy, which is far better than a failed
  // release. Handled here rather than with a shell `|| echo` because `&&`/`||`
  // are left-associative: wrapping it in the npm chain would also have swallowed
  // failures from the EARLIER build steps and let nuxt build run regardless.
  // Use --strict for cron/manual runs where a failure should be surfaced.
  process.exit(process.argv.includes('--strict') ? 1 : 0);
});
