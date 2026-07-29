/**
 * lib/product-harvest.js
 * Single shared catalogue harvest for every build-time consumer.
 *
 * WHY
 * ---
 * build-sitemap.js and build-merchant-feed.js each used to run their own full
 * GraphQL pagination (~18 round trips over ~1,700 products, twice per build) and
 * the feed additionally scraped every product page. This module collapses that
 * into one GraphQL pass and one page-price pass, cached on disk so any consumer
 * running later in the same build gets a hit instead of re-fetching.
 *
 * Two harvests, deliberately separate because they have very different costs:
 *
 *   harvestProducts()     ~18 GraphQL requests   (~40s)   — catalogue metadata
 *   harvestLivePrices()   ~1,700 page fetches    (~4 min) — customer-facing price
 *
 * WHY PRICES NEED THEIR OWN PASS
 * ------------------------------
 * WPGraphQL's server-side price and the price the storefront actually displays
 * disagree on roughly HALF the catalogue — measured 2026-07-29 across a 60
 * product sample: 15/30 simple and 11/30 variable matched, with drifts of +$1 to
 * +$6 in no consistent ratio (Woo's stored CAD price and the converted price the
 * page renders are maintained independently). Google Merchant Center disapproves
 * items whose feed price differs from the landing page, so the feed must read
 * what the page renders. That is what harvestLivePrices() does.
 *
 * Cache files live in data/.harvest-cache/ (gitignored) and are keyed by TTL,
 * so a rebuild inside the same window is free while a fresh build re-fetches.
 */

const {readFileSync, writeFileSync, existsSync, mkdirSync} = require('fs');
const {resolve} = require('path');

const SITE = 'https://proskatersplace.ca';
const CACHE_DIR = resolve(process.cwd(), 'data', '.harvest-cache');
const PRODUCTS_CACHE = resolve(CACHE_DIR, 'products.json');
const PRICES_CACHE = resolve(CACHE_DIR, 'prices.json');

// Default TTL covers a single CI build comfortably without letting a stale
// harvest leak into tomorrow's build.
const DEFAULT_TTL_MIN = Number(process.env.HARVEST_TTL_MIN || 45);

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Union of every field any consumer needs, fetched once.
 *
 * The explicit orderby is REQUIRED: without a stable sort WPGraphQL's cursor
 * pagination terminates early and silently (an early feed run collected 351 of
 * 1,707 products because of exactly that).
 */
const PRODUCTS_QUERY = `
  query HarvestProducts($first: Int!, $after: String) {
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
        modified
        productCategories { nodes { name slug } }
        terms(first: 60) { nodes { taxonomyName name } }
        ... on SimpleProduct {
          price(format: RAW)
          regularPrice(format: RAW)
          onSale
          stockStatus
          image { sourceUrl altText }
          galleryImages(first: 9) { nodes { sourceUrl } }
        }
        ... on VariableProduct {
          price(format: RAW)
          regularPrice(format: RAW)
          onSale
          stockStatus
          image { sourceUrl altText }
          galleryImages(first: 9) { nodes { sourceUrl } }
        }
        ... on ExternalProduct {
          price(format: RAW)
          regularPrice(format: RAW)
          onSale
          image { sourceUrl altText }
        }
      }
    }
  }
`;

function readCache(file, ttlMinutes) {
  try {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    const ageMin = (Date.now() - new Date(cached.harvestedAt).getTime()) / 6e4;
    if (ageMin < ttlMinutes) return {...cached, ageMin};
  } catch {
    /* no usable cache */
  }
  return null;
}

function writeCache(file, payload) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, {recursive: true});
  writeFileSync(file, JSON.stringify(payload));
}

/** Fixed-size worker pool over an async mapper. */
async function pool(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({length: Math.min(concurrency, items.length)}, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
        done++;
        if (onProgress && (done % 25 === 0 || done === items.length)) onProgress(done, items.length);
      }
    }),
  );

  return results;
}

/**
 * Full product catalogue from WPGraphQL, cached for the build.
 * @returns {Promise<Array>} product nodes
 */
async function harvestProducts({gqlHost = process.env.GQL_HOST, ttlMinutes = DEFAULT_TTL_MIN, force = false} = {}) {
  if (!force) {
    const cached = readCache(PRODUCTS_CACHE, ttlMinutes);
    if (cached?.products?.length) {
      console.log(`   ↻ product harvest cache hit (${cached.products.length} products, ${cached.ageMin.toFixed(1)}m old) — no GraphQL calls`);
      return cached.products;
    }
  }

  if (!gqlHost) throw new Error('GQL_HOST is not defined — cannot harvest products');

  const products = [];
  let after = null;
  let hasNextPage = true;
  let reportedTotal = null;

  while (hasNextPage) {
    const res = await fetch(gqlHost, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...BROWSER_HEADERS, Accept: 'application/json', Origin: SITE, Referer: SITE},
      body: JSON.stringify({query: PRODUCTS_QUERY, variables: {first: 100, after}}),
    });

    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length && !json.data?.products) throw new Error(`GraphQL error: ${json.errors[0].message}`);

    const data = json.data?.products;
    if (!data) throw new Error('GraphQL returned no products payload');
    if (reportedTotal === null && typeof data.found === 'number') reportedTotal = data.found;

    products.push(...data.nodes);
    hasNextPage = data.pageInfo.hasNextPage;
    after = data.pageInfo.endCursor;
    process.stdout.write(`\r   harvesting ${products.length}${reportedTotal ? '/' + reportedTotal : ''} products...`);

    if (hasNextPage) await sleep(150);
  }
  process.stdout.write('\n');

  // Guard the silent-truncation failure mode.
  if (reportedTotal && products.length < reportedTotal * 0.95) {
    throw new Error(`harvest truncated: ${products.length} of ${reportedTotal} products (unstable cursor)`);
  }

  writeCache(PRODUCTS_CACHE, {harvestedAt: new Date().toISOString(), total: reportedTotal, products});
  return products;
}

/** Pull the Product node out of a page's JSON-LD blocks. */
function extractProductJsonLd(html) {
  for (const [, raw] of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
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

async function fetchOnePrice(slug, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${SITE}/product/${slug}`, {headers: BROWSER_HEADERS});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const product = extractProductJsonLd(await res.text());
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
      if (attempt === retries) return {error: err.message};
      await sleep(500 * (attempt + 1));
    }
  }
}

/**
 * Customer-facing price/availability for each slug, read from the live product
 * page's Product JSON-LD. Cached for the build.
 *
 * @param {string[]} slugs
 * @returns {Promise<Record<string, {price?:number,currency?:string,availability?:string,description?:string,error?:string}>>}
 */
async function harvestLivePrices(slugs, {concurrency = Number(process.env.FEED_CONCURRENCY || 16), ttlMinutes = DEFAULT_TTL_MIN, retries = 2, force = false} = {}) {
  if (!force) {
    const cached = readCache(PRICES_CACHE, ttlMinutes);
    // Only reuse when it covers everything we were asked for.
    if (cached?.prices && slugs.every((slug) => cached.prices[slug])) {
      console.log(`   ↻ price harvest cache hit (${Object.keys(cached.prices).length} prices, ${cached.ageMin.toFixed(1)}m old) — no page fetches`);
      return cached.prices;
    }
  }

  console.log(`   pricing ${slugs.length} products from live pages (concurrency ${concurrency})...`);
  const results = await pool(slugs, concurrency, (slug) => fetchOnePrice(slug, retries), (done, total) =>
    process.stdout.write(`\r   priced ${done}/${total}...`),
  );
  process.stdout.write('\n');

  const prices = {};
  slugs.forEach((slug, i) => {
    prices[slug] = results[i];
  });

  writeCache(PRICES_CACHE, {harvestedAt: new Date().toISOString(), prices});
  return prices;
}

module.exports = {harvestProducts, harvestLivePrices, extractProductJsonLd, pool, SITE};
