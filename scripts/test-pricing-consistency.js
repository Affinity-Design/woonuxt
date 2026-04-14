#!/usr/bin/env node
/**
 * Pricing Consistency Test
 *
 * Verifies that the same CAD price is shown across all surfaces:
 *   1. Source backend GraphQL (test.proskatersplace.com)
 *   2. Authority API response (production-backed overlay)
 *   3. PDP SSR payload (__NUXT_DATA__)
 *   4. PDP rendered HTML (text-4xl price display)
 *   5. Category page payload (prerendered data)
 *
 * NEW: Also detects source-vs-authority price divergence — when the test backend
 * has a different USD base price than production, the authority overlay will
 * overwrite the correct price with the wrong one.
 *
 * Usage:
 *   node scripts/test-pricing-consistency.js
 *   TEST_URL=https://test.proskatersplace.ca node scripts/test-pricing-consistency.js
 *
 * Exit code 0 = all pass, 1 = at least one failure.
 */

const https = require('https');
const http = require('http');

const BASE_URL = (process.env.TEST_URL || 'https://test.proskatersplace.ca').replace(/\/$/, '');
const IS_HTTPS = BASE_URL.startsWith('https');
const httpLib = IS_HTTPS ? https : http;

// Source and authority GraphQL endpoints for cross-backend comparison
const SOURCE_GQL = process.env.SOURCE_GQL || 'https://test.proskatersplace.com/graphql';
const AUTHORITY_GQL = 'https://proskatersplace.com/graphql';

// ─── Test products ──────────────────────────────────────────────────────────
const TEST_PRODUCTS = [
  {
    slug: 'fr-ufr-street-diako-diaby-skates',
    databaseId: 170249,
    label: 'Variable product — tests source vs authority price divergence',
    expectSale: false,
    expectedUsdBase: 309.97,
    category: 'inline-skates',
  },
  {
    slug: 'usd-aeon-80-salvia-aggressive-inline-skates',
    databaseId: 169786,
    label: 'SEO-fallback (test-only product, not on production)',
    expectSale: false,
  },
  {
    slug: 'powerslide-swell-bolt-3d-adapt-inline-boots',
    databaseId: 171135,
    label: 'Sale-price product (production)',
    expectSale: true,
  },
  {
    slug: 'powerslide-ubc-large-wheel-cover',
    databaseId: 173244,
    label: 'Regular-price product (production)',
    expectSale: false,
  },
];

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function fetchGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({status: res.statusCode, body: data}));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function fetchPost(url, body) {
  const payload = JSON.stringify(body);
  const parsed = new URL(url);
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (url.startsWith('https') ? 443 : 80),
        path: parsed.pathname,
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({status: res.statusCode, body: data}));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── GraphQL helper for direct backend queries ──────────────────────────────

async function gqlQuery(endpoint, slug) {
  const query = `{
    product(id: "${slug}", idType: SLUG) {
      databaseId name
      ... on ProductWithPricing {
        price regularPrice
        rawPrice: price(format: RAW)
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        onSale
      }
      ... on VariableProduct {
        price regularPrice
        rawPrice: price(format: RAW)
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        onSale
        variations(first: 3) {
          nodes {
            databaseId price regularPrice
            rawRegularPrice: regularPrice(format: RAW)
          }
        }
      }
    }
  }`;
  const res = await fetchPost(endpoint, {query});
  if (res.status !== 200) return null;
  try {
    const data = JSON.parse(res.body);
    return data?.data?.product || null;
  } catch {
    return null;
  }
}

async function fetchExchangeRate() {
  try {
    const res = await fetchGet(`${BASE_URL}/api/exchange-rate`);
    const data = JSON.parse(res.body);
    return data?.data?.rate || data?.rate || null;
  } catch {
    return null;
  }
}

// ─── Price extraction helpers ───────────────────────────────────────────────

/** Extract the first numeric price from a string like "$315.99&nbsp;CAD" → "315.99" */
function extractNumeric(str) {
  if (!str) return null;
  const m = String(str)
    .replace(/&nbsp;/g, ' ')
    .match(/(\d+\.\d{2})/);
  return m ? m[1] : null;
}

/** Check if string is explicitly tagged as CAD */
function isCADTagged(str) {
  if (!str) return false;
  const s = String(str)
    .replace(/&nbsp;/g, ' ')
    .toUpperCase();
  return s.includes('CAD') || s.includes('CA$');
}

/**
 * Parse the Nuxt dehydrated __NUXT_DATA__ array and resolve objects with price fields.
 * Returns an array of resolved price objects.
 */
function parseNuxtPayload(html) {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const priceObjects = [];

  for (let i = 0; i < parsed.length; i++) {
    const val = parsed[i];
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;

    // Check if any key resolves to a price field name
    const entries = Object.entries(val);
    const resolved = {};
    let hasPrice = false;

    for (const [k, v] of entries) {
      const keyIdx = parseInt(k, 10);
      const keyName = Number.isFinite(keyIdx) && parsed[keyIdx] !== undefined ? parsed[keyIdx] : k;
      if (typeof keyName !== 'string') continue;

      const valIdx = typeof v === 'number' ? v : null;
      const value = valIdx !== null && parsed[valIdx] !== undefined ? parsed[valIdx] : v;

      if (['price', 'rawPrice', 'regularPrice', 'rawRegularPrice', 'salePrice', 'rawSalePrice', 'onSale', 'slug', 'databaseId'].includes(keyName)) {
        resolved[keyName] = value;
        if (keyName === 'price' || keyName === 'regularPrice' || keyName === 'rawPrice') {
          hasPrice = true;
        }
      }
    }

    if (hasPrice) {
      priceObjects.push({index: i, ...resolved});
    }
  }

  return priceObjects;
}

/** Extract the big price display from rendered HTML (text-4xl area) */
function extractRenderedPrice(html) {
  // The product page renders price in a text-4xl font-bold div via <ProductPrice>
  const m = html.match(/text-4xl[^"]*"[^>]*>([\s\S]{0,300}?)<\/div>/);
  if (!m) return null;
  const chunk = m[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const priceMatch = chunk.match(/\$(\d+\.\d{2})/);
  return priceMatch ? priceMatch[1] : null;
}

// ─── Test runner ────────────────────────────────────────────────────────────

async function testProduct(product) {
  const {slug, databaseId, label, expectSale, expectedUsdBase, category} = product;
  const results = {pass: true, errors: [], warnings: []};

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Testing: ${slug}`);
  console.log(`  Label:   ${label}`);
  console.log(`${'═'.repeat(70)}`);

  // ── 0. Cross-backend comparison (source vs authority GraphQL) ─────────
  let sourcePrice = null;
  let authorityDirectPrice = null;

  try {
    const [srcProduct, authProduct] = await Promise.all([gqlQuery(SOURCE_GQL, slug), gqlQuery(AUTHORITY_GQL, slug)]);

    if (srcProduct) {
      sourcePrice = extractNumeric(srcProduct.rawPrice) || extractNumeric(srcProduct.price);
      const srcFormatted = extractNumeric(srcProduct.price);
      console.log(`  Source GQL: price=${srcProduct.price} | rawPrice=${srcProduct.rawPrice} (numeric: ${sourcePrice})`);
    } else {
      console.log(`  Source GQL: Product not found (may be test-only or schema mismatch)`);
    }

    if (authProduct) {
      authorityDirectPrice = extractNumeric(authProduct.rawPrice) || extractNumeric(authProduct.price);
      console.log(`  Auth GQL:   price=${authProduct.price} | rawPrice=${authProduct.rawPrice} (numeric: ${authorityDirectPrice})`);
    } else {
      console.log(`  Auth GQL:   Product not found on production`);
    }

    // Cross-backend divergence check
    if (sourcePrice && authorityDirectPrice && sourcePrice !== authorityDirectPrice) {
      console.log(`  ⚠ BACKEND DIVERGENCE: Source=${sourcePrice} vs Production=${authorityDirectPrice}`);
      results.warnings.push(
        `Backend price divergence: source=${sourcePrice} vs production=${authorityDirectPrice} — authority overlay will use production price`,
      );

      if (expectedUsdBase) {
        const rate = await fetchExchangeRate();
        if (rate) {
          const expectedCad = (Math.floor(expectedUsdBase * rate) + 0.99).toFixed(2);
          console.log(`  Expected: USD $${expectedUsdBase} × ${rate} = CAD $${expectedCad}`);
          if (sourcePrice === expectedCad) {
            console.log(`  ✓ Source GQL matches expected conversion`);
          } else {
            console.log(`  ✗ Source GQL (${sourcePrice}) ≠ expected (${expectedCad})`);
          }
          if (authorityDirectPrice !== expectedCad) {
            console.log(`  ✗ Production GQL (${authorityDirectPrice}) ≠ expected (${expectedCad}) — PRODUCTION HAS DIFFERENT BASE PRICE`);
            const impliedUsd = (parseFloat(authorityDirectPrice) / rate).toFixed(2);
            console.log(`    Implied production USD: $${impliedUsd} (vs test USD: $${expectedUsdBase})`);
            results.errors.push(
              `Production base price (~$${impliedUsd} USD) differs from test ($${expectedUsdBase} USD) — authority overlay applies wrong CAD price`,
            );
            results.pass = false;
          }
        }
      }
    } else if (sourcePrice && authorityDirectPrice) {
      console.log(`  ✓ Source and production backends agree: $${sourcePrice}`);
    }
  } catch (e) {
    results.warnings.push(`Cross-backend check failed: ${e.message}`);
  }

  // ── 1. Authority API ──────────────────────────────────────────────────
  let authorityRawPrice = null;
  let authorityIsCAD = false;
  let authorityVariationPrices = [];

  try {
    const authRes = await fetchPost(`${BASE_URL}/api/authoritative-product-prices`, {
      products: [{slug, databaseId}],
    });

    if (authRes.status !== 200) {
      results.errors.push(`Authority API returned ${authRes.status}`);
      results.pass = false;
    } else {
      const authData = JSON.parse(authRes.body);
      if (!authData.enabled) {
        results.warnings.push('Authority pricing is disabled');
      } else {
        const ap = authData.products?.[slug];
        if (!ap) {
          results.errors.push(`Authority has no data for slug "${slug}"`);
          results.pass = false;
        } else {
          authorityRawPrice = extractNumeric(ap.rawPrice) || extractNumeric(ap.price);
          authorityIsCAD = isCADTagged(ap.price) || isCADTagged(ap.regularPrice);
          console.log(`  Authority:  rawPrice=${authorityRawPrice}, price="${ap.price}", CAD=${authorityIsCAD}`);

          // Check variations
          if (ap.variations?.nodes?.length) {
            for (const v of ap.variations.nodes) {
              const vPrice = extractNumeric(v.rawPrice) || extractNumeric(v.price);
              authorityVariationPrices.push({databaseId: v.databaseId, rawPrice: vPrice, isCAD: isCADTagged(v.price)});
            }
          }
        }
      }
    }
  } catch (e) {
    results.errors.push(`Authority API error: ${e.message}`);
    results.pass = false;
  }

  // ── 2. PDP page fetch ─────────────────────────────────────────────────
  let pdpRawPrice = null;
  let pdpVariationPrices = [];
  let renderedPrice = null;
  let isClientRenderedPage = false;

  try {
    const pdpRes = await fetchGet(`${BASE_URL}/product/${slug}`);

    if (pdpRes.status !== 200) {
      results.errors.push(`PDP page returned ${pdpRes.status}`);
      results.pass = false;
    } else {
      // 2a. Parse NUXT_DATA payload
      const priceObjects = parseNuxtPayload(pdpRes.body);

      // Detect client-only rendered pages (small payload, no product data in SSR)
      // These pages load product data asynchronously on the client via GraphQL/KV cache
      if (priceObjects.length === 0 && pdpRes.body.length < 40000) {
        isClientRenderedPage = true;
        console.log(`  PDP:        Client-rendered page (no SSR product data, ${pdpRes.body.length} bytes)`);
        console.log(`              Pricing validated via authority API only`);
      } else {
        // Find the main product object (matches our slug)
        const mainProduct = priceObjects.find((o) => o.slug === slug);
        if (mainProduct) {
          pdpRawPrice = extractNumeric(mainProduct.rawPrice) || extractNumeric(mainProduct.price);
          console.log(`  PDP payload: rawPrice=${pdpRawPrice}, price="${mainProduct.price}", CAD=${isCADTagged(mainProduct.price)}`);

          if (!isCADTagged(mainProduct.price)) {
            results.warnings.push('PDP payload product price not CAD-tagged — may indicate stale cache');
          }
        } else if (priceObjects.length > 0) {
          results.warnings.push('Could not match main product in NUXT_DATA payload (price objects exist but slug mismatch)');
        }

        // Find variation objects that share a slug prefix with the main product
        for (const v of priceObjects) {
          if (v === mainProduct) continue;
          if (v.databaseId && v.price && v.slug && v.slug.startsWith(slug.substring(0, slug.lastIndexOf('-')))) {
            pdpVariationPrices.push({databaseId: v.databaseId, rawPrice: extractNumeric(v.rawPrice) || extractNumeric(v.price), isCAD: isCADTagged(v.price)});
          }
        }

        // 2b. Rendered HTML price
        renderedPrice = extractRenderedPrice(pdpRes.body);
        if (renderedPrice) {
          console.log(`  PDP HTML:   rendered=$${renderedPrice}`);
        } else {
          console.log(`  PDP HTML:   no server-rendered price found`);
        }
      }
    }
  } catch (e) {
    results.errors.push(`PDP fetch error: ${e.message}`);
    results.pass = false;
  }

  // ── 2b. Category payload check ─────────────────────────────────────
  let categoryPrice = null;
  if (category) {
    try {
      const catRes = await fetchGet(`${BASE_URL}/product-category/${category}/_payload.json`);
      if (catRes.status === 200) {
        // Search for this product's price in the prerendered category payload
        const body = catRes.body;
        const slugIdx = body.indexOf(`"${slug}"`);
        if (slugIdx > -1) {
          // Find price near the slug — look for $XXX.99 CAD pattern
          const searchStart = Math.max(0, slugIdx - 500);
          const searchEnd = Math.min(body.length, slugIdx + 1000);
          const chunk = body.substring(searchStart, searchEnd);
          const priceMatch = chunk.match(/\$(\d+\.\d{2})(?:&nbsp;|\s*)CAD/);
          if (priceMatch) {
            categoryPrice = priceMatch[1];
            console.log(`  Category:   $${categoryPrice} CAD (prerendered payload for /${category}/)`);
          } else {
            // Try raw numeric near slug
            const rawMatch = chunk.match(/"(\d{3,}\.\d{2}),\s*\d+\.\d{2}/);
            if (rawMatch) {
              categoryPrice = rawMatch[1];
              console.log(`  Category:   $${categoryPrice} CAD (raw from payload for /${category}/)`);
            }
          }
        }
      }
    } catch (e) {
      results.warnings.push(`Category payload check failed: ${e.message}`);
    }
  }

  // ── 3. Cross-surface comparison ───────────────────────────────────────
  console.log(`\n  Cross-surface comparison:`);

  // Source backend vs authority overlay
  if (sourcePrice && authorityRawPrice && sourcePrice !== authorityRawPrice) {
    console.log(`  ✗ Source GQL (${sourcePrice}) ≠ Authority API (${authorityRawPrice}) — authority is OVERWRITING source price`);
    results.errors.push(`Authority overlay overwrites source price: source=${sourcePrice} → authority=${authorityRawPrice}`);
    results.pass = false;
  } else if (sourcePrice && authorityRawPrice) {
    console.log(`  ✓ Source GQL (${sourcePrice}) === Authority API (${authorityRawPrice})`);
  }

  // Category vs authority
  if (categoryPrice && authorityRawPrice && categoryPrice !== authorityRawPrice) {
    console.log(`  ✗ Category (${categoryPrice}) ≠ Authority API (${authorityRawPrice}) — stale prerender`);
    results.errors.push(`Category prerender stale: category=${categoryPrice} vs authority=${authorityRawPrice}`);
    results.pass = false;
  } else if (categoryPrice && authorityRawPrice) {
    console.log(`  ✓ Category (${categoryPrice}) === Authority API (${authorityRawPrice})`);
  }

  if (isClientRenderedPage) {
    console.log(`  ⊘ PDP is client-rendered — SSR checks skipped`);
    if (authorityRawPrice) {
      console.log(`  ✓ Authority returns ${authorityRawPrice} CAD=${authorityIsCAD} — client will use this`);
    } else {
      console.log(`  ✗ No authority price available for client-rendered page`);
      results.errors.push('No authority price for client-rendered product — client will fall back to raw USD conversion');
      results.pass = false;
    }
  } else {
    // Compare authority vs PDP payload
    if (authorityRawPrice && pdpRawPrice) {
      if (authorityRawPrice === pdpRawPrice) {
        console.log(`  ✓ Authority (${authorityRawPrice}) === PDP payload (${pdpRawPrice})`);
      } else {
        console.log(`  ✗ Authority (${authorityRawPrice}) !== PDP payload (${pdpRawPrice})`);
        results.errors.push(`Price mismatch: Authority=${authorityRawPrice} vs PDP-payload=${pdpRawPrice} — possible stale KV cache`);
        results.pass = false;
      }
    }

    // Compare authority vs rendered HTML
    if (authorityRawPrice && renderedPrice) {
      if (authorityRawPrice === renderedPrice) {
        console.log(`  ✓ Authority (${authorityRawPrice}) === PDP HTML (${renderedPrice})`);
      } else {
        console.log(`  ✗ Authority (${authorityRawPrice}) !== PDP HTML (${renderedPrice})`);
        results.errors.push(`Price mismatch: Authority=${authorityRawPrice} vs PDP-HTML=${renderedPrice}`);
        results.pass = false;
      }
    }

    // Compare PDP payload vs rendered HTML
    if (pdpRawPrice && renderedPrice) {
      if (pdpRawPrice === renderedPrice) {
        console.log(`  ✓ PDP payload (${pdpRawPrice}) === PDP HTML (${renderedPrice})`);
      } else {
        console.log(`  ✗ PDP payload (${pdpRawPrice}) !== PDP HTML (${renderedPrice})`);
        results.errors.push(`Price mismatch: PDP-payload=${pdpRawPrice} vs PDP-HTML=${renderedPrice}`);
        results.pass = false;
      }
    }
  }

  // Check CAD tagging
  if (authorityRawPrice && !authorityIsCAD) {
    results.warnings.push('Authority price not CAD-tagged — exchange rate conversion will be applied client-side');
  }

  // Check variation consistency (for uniform-priced products)
  if (authorityRawPrice && pdpVariationPrices.length > 0) {
    const mismatchedVariations = pdpVariationPrices.filter((v) => v.rawPrice !== authorityRawPrice);
    if (mismatchedVariations.length === 0) {
      console.log(`  ✓ All ${pdpVariationPrices.length} variation(s) match authority price`);
    } else {
      for (const v of mismatchedVariations) {
        console.log(`  ✗ Variation ${v.databaseId}: ${v.rawPrice} !== authority ${authorityRawPrice}`);
      }
      results.errors.push(`${mismatchedVariations.length} variation(s) have mismatched prices`);
      results.pass = false;
    }
  }

  // Summary
  console.log(`\n  Result: ${results.pass ? '✓ PASS' : '✗ FAIL'}`);
  if (results.errors.length) console.log(`  Errors: ${results.errors.join('; ')}`);
  if (results.warnings.length) console.log(`  Warnings: ${results.warnings.join('; ')}`);

  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Pricing Consistency Test`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Products: ${TEST_PRODUCTS.length}`);
  console.log(`Time: ${new Date().toISOString()}`);

  let allPass = true;
  const productResults = [];

  for (const product of TEST_PRODUCTS) {
    const result = await testProduct(product);
    productResults.push({slug: product.slug, label: product.label, ...result});
    if (!result.pass) allPass = false;
  }

  // ── Final summary ─────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  FINAL SUMMARY`);
  console.log(`${'═'.repeat(70)}`);

  for (const r of productResults) {
    const status = r.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${r.slug} (${r.label})`);
    if (r.errors.length) {
      for (const e of r.errors) console.log(`         Error: ${e}`);
    }
    if (r.warnings.length) {
      for (const w of r.warnings) console.log(`         Warn:  ${w}`);
    }
  }

  const passed = productResults.filter((r) => r.pass).length;
  const failed = productResults.filter((r) => !r.pass).length;
  console.log(`\n  Total: ${passed} passed, ${failed} failed out of ${productResults.length}`);

  if (!allPass) {
    console.log('\n  NOTE: Failures may indicate stale Cloudflare KV cache (72h TTL).');
    console.log('  Run `npm run warm-cache` to refresh cached pages.');
    process.exit(1);
  } else {
    console.log('\n  All pricing surfaces consistent. ✓');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
