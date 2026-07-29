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

const SITE = 'https://proskatersplace.ca';
const GQL_HOST = process.env.GQL_HOST || 'https://proskatersplace.com/graphql';
const OUTPUT_DIR = resolve(process.cwd(), 'data');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'merchant-feed-ca.json');

const BATCH_SIZE = 100; // products per GraphQL page
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

/** True when a recent enough feed already exists and we can skip the rebuild. */
function existingFeedIsFresh() {
  if (argForce || argLimit) return false;
  try {
    const {readFileSync} = require('fs');
    const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
    if (!existing?.generatedAt || !existing?.itemCount) return false;
    const ageHours = (Date.now() - new Date(existing.generatedAt).getTime()) / 36e5;
    if (ageHours < MAX_AGE_HOURS) {
      console.log(`Merchant feed is ${ageHours.toFixed(1)}h old (< ${MAX_AGE_HOURS}h) with ${existing.itemCount} items — skipping rebuild.`);
      console.log('Use --force or set FEED_MAX_AGE_HOURS=0 to rebuild anyway.');
      return true;
    }
  } catch {
    /* no usable existing feed — build it */
  }
  return false;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 1. Catalogue metadata from WPGraphQL ────────────────────────────────────

// NOTE: the explicit orderby is REQUIRED, not cosmetic. Without a stable sort,
// WPGraphQL's cursor pagination silently terminates early — an earlier run of
// this script collected only 351 of 1,707 products because of exactly that.
const PRODUCTS_QUERY = `
  query FeedProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, where: {orderby: {field: DATE, order: DESC}, typeIn: [SIMPLE, VARIABLE, GROUPED, EXTERNAL]}) {
      found
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId
        slug
        name
        sku
        type
        shortDescription
        productCategories { nodes { name } }
        terms(first: 60) { nodes { taxonomyName name } }
        ... on SimpleProduct {
          image { sourceUrl }
          galleryImages(first: 9) { nodes { sourceUrl } }
        }
        ... on VariableProduct {
          image { sourceUrl }
          galleryImages(first: 9) { nodes { sourceUrl } }
        }
        ... on ExternalProduct {
          image { sourceUrl }
        }
      }
    }
  }
`;

async function fetchCatalogue() {
  const products = [];
  let after = null;
  let hasNextPage = true;
  let page = 0;
  let reportedTotal = null;

  while (hasNextPage) {
    page++;
    const res = await fetch(GQL_HOST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...BROWSER_HEADERS,
        Accept: 'application/json',
        Origin: SITE,
        Referer: SITE,
      },
      body: JSON.stringify({query: PRODUCTS_QUERY, variables: {first: BATCH_SIZE, after}}),
    });

    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status} on page ${page}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`GraphQL error: ${json.errors[0].message}`);

    const data = json.data?.products;
    if (!data) throw new Error('GraphQL returned no products payload');

    if (reportedTotal === null && typeof data.found === 'number') reportedTotal = data.found;

    products.push(...data.nodes);
    hasNextPage = data.pageInfo.hasNextPage;
    after = data.pageInfo.endCursor;
    process.stdout.write(`\r  fetched ${products.length}${reportedTotal ? '/' + reportedTotal : ''} products from GraphQL...`);

    if (argLimit && products.length >= argLimit) break;
    if (hasNextPage) await sleep(200);
  }

  process.stdout.write('\n');

  // Guard against the silent-truncation failure mode: if pagination stops well
  // short of what the server says exists, we would publish a feed that reads as
  // a mass product removal in Merchant Center.
  if (!argLimit && reportedTotal && products.length < reportedTotal * 0.95) {
    throw new Error(`pagination truncated: collected ${products.length} of ${reportedTotal} products (cursor likely unstable)`);
  }

  return argLimit ? products.slice(0, argLimit) : products;
}

// ─── 2. Authoritative price/availability from the live product page ──────────

/** Pull the Product node out of a page's JSON-LD blocks. */
function extractProductJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
    const product = candidates.find((node) => node && node['@type'] === 'Product');
    if (product) return product;
  }
  return null;
}

async function fetchLivePricing(slug) {
  const url = `${SITE}/product/${slug}`;

  for (let attempt = 0; attempt <= PAGE_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {headers: BROWSER_HEADERS});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      const product = extractProductJsonLd(html);
      const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
      if (!offer?.price) throw new Error('no price in JSON-LD');

      const price = Number(String(offer.price).replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(price) || price <= 0) throw new Error(`bad price "${offer.price}"`);

      return {
        price,
        currency: offer.priceCurrency || 'CAD',
        availability: /InStock/i.test(offer.availability || '') ? 'in_stock' : 'out_of_stock',
        description: typeof product.description === 'string' ? product.description : '',
      };
    } catch (err) {
      if (attempt === PAGE_RETRIES) return {error: err.message};
      await sleep(500 * (attempt + 1));
    }
  }
}

/** Run an async mapper over items with a fixed worker pool. */
async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({length: Math.min(concurrency, items.length)}, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
        done++;
        if (done % 25 === 0 || done === items.length) {
          process.stdout.write(`\r  priced ${done}/${items.length} products...`);
        }
      }
    }),
  );

  process.stdout.write('\n');
  return results;
}

// ─── 3. Shape items ──────────────────────────────────────────────────────────

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

// ─── 4. Publish to Cloudflare KV ─────────────────────────────────────────────

/**
 * Upload to the NUXT_SCRIPT_DATA namespace so the feed can be refreshed WITHOUT
 * a redeploy — Merchant Center fetches daily, deploys are far less frequent.
 * Mirrors the KV upload in scripts/build-sitemap.js.
 */
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

  if (existingFeedIsFresh()) return;

  console.log('Building Merchant Center feed for proskatersplace.ca');
  console.log(`  GraphQL: ${GQL_HOST}`);
  console.log(`  concurrency: ${PAGE_CONCURRENCY}`);
  if (argLimit) console.log(`  LIMIT: ${argLimit} (smoke test)`);

  const catalogue = await fetchCatalogue();
  console.log(`  catalogue: ${catalogue.length} products`);

  const pricings = await pool(catalogue, PAGE_CONCURRENCY, (product) => fetchLivePricing(product.slug));

  const items = [];
  const skipped = [];

  catalogue.forEach((product, i) => {
    const pricing = pricings[i];
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
