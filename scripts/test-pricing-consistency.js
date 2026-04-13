#!/usr/bin/env node
/**
 * Pricing Consistency Test
 *
 * Verifies that the same CAD price is shown across all surfaces:
 *   1. Authority API response
 *   2. PDP SSR payload (__NUXT_DATA__)
 *   3. PDP rendered HTML (text-4xl price display)
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

// ─── Test products ──────────────────────────────────────────────────────────
const TEST_PRODUCTS = [
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
    httpLib.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({status: res.statusCode, body: data}));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchPost(url, body) {
  const payload = JSON.stringify(body);
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpLib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (IS_HTTPS ? 443 : 80),
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
  const s = String(str).replace(/&nbsp;/g, ' ').toUpperCase();
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
  const chunk = m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const priceMatch = chunk.match(/\$(\d+\.\d{2})/);
  return priceMatch ? priceMatch[1] : null;
}

// ─── Test runner ────────────────────────────────────────────────────────────

async function testProduct(product) {
  const {slug, databaseId, label, expectSale} = product;
  const results = {pass: true, errors: [], warnings: []};

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Testing: ${slug}`);
  console.log(`  Label:   ${label}`);
  console.log(`${'═'.repeat(70)}`);

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

  // ── 3. Cross-surface comparison ───────────────────────────────────────
  console.log(`\n  Cross-surface comparison:`);

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
