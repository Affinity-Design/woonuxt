/**
 * Pre-build KV Cache Purge Script
 *
 * Purges BOTH KV namespaces before rebuilding:
 * - CF_KV_NAMESPACE_ID_CACHE (proskatersplace_cache) - Page/route cache
 * - CF_KV_NAMESPACE_ID_SCRIPT_DATA - Product/category data
 *
 * This ensures a clean slate before each build.
 *
 * Usage:
 *   node scripts/prebuild-cache-purge.js
 *
 * Environment Variables Required:
 *   CF_ACCOUNT_ID - Cloudflare account ID
 *   CF_API_TOKEN - Cloudflare API token with KV permissions
 *   CF_KV_NAMESPACE_ID_CACHE - Page cache namespace (proskatersplace_cache)
 *   CF_KV_NAMESPACE_ID_SCRIPT_DATA - Script data namespace
 */

require('dotenv').config();
const https = require('https');

// Configuration
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_KV_NAMESPACE_ID_CACHE = process.env.CF_KV_NAMESPACE_ID_CACHE;
const CF_KV_NAMESPACE_ID_SCRIPT_DATA = process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA;

// Test environment cache namespace (proskatersplace-test-cache)
const CF_KV_NAMESPACE_ID_TEST_CACHE = process.env.CF_KV_NAMESPACE_ID_TEST_CACHE || '2c8dcc19b1e1448e935542c3438db362';

// Detect test environment from Cloudflare Pages branch or explicit env var
const CF_PAGES_BRANCH = process.env.CF_PAGES_BRANCH || '';
const IS_TEST_ENV = process.env.IS_TEST_ENV === 'true' || CF_PAGES_BRANCH === 'test' || CF_PAGES_BRANCH.startsWith('test-') || CF_PAGES_BRANCH.includes('test');

// Skip purge in CI/CD unless explicitly enabled
const SKIP_PURGE = process.env.SKIP_KV_PURGE === 'true';
const PURGE_PAGE_CACHE = process.env.PURGE_PAGE_CACHE !== 'false'; // Default: true
const PURGE_SCRIPT_DATA = process.env.PURGE_SCRIPT_DATA !== 'false'; // Default: true
const PURGE_TEST_CACHE = IS_TEST_ENV && process.env.PURGE_TEST_CACHE !== 'false'; // Default: true if test env

/**
 * Validate UUID format (32 hex chars, with or without hyphens)
 */
function isValidUUID(str) {
  if (!str) return false;
  // Remove hyphens and check if it's 32 hex characters
  const cleaned = str.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(cleaned);
}

console.log('🧹 Pre-build KV Cache Purge');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Show environment detection
if (CF_PAGES_BRANCH) {
  console.log(`🌿 Branch: ${CF_PAGES_BRANCH}`);
}
if (IS_TEST_ENV) {
  console.log('🧪 TEST ENVIRONMENT DETECTED - Will purge test cache namespace');
}

if (SKIP_PURGE) {
  console.log('⏭️  SKIP_KV_PURGE=true - Skipping cache purge');
  process.exit(0);
}

// Validate credentials
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('❌ Missing Cloudflare credentials (CF_ACCOUNT_ID, CF_API_TOKEN)');
  console.log('⏭️  Skipping cache purge (build will continue)');
  process.exit(0);
}

// Validate namespace IDs upfront
if (CF_KV_NAMESPACE_ID_CACHE && !isValidUUID(CF_KV_NAMESPACE_ID_CACHE)) {
  console.error(`❌ CF_KV_NAMESPACE_ID_CACHE is invalid UUID: "${CF_KV_NAMESPACE_ID_CACHE}" (length: ${CF_KV_NAMESPACE_ID_CACHE.length})`);
  console.error('   Expected: 32 hex characters (e.g., e342d11a4ddf421485846a1086ad3523)');
  console.log('⚠️  Skipping PAGE_CACHE purge due to invalid UUID');
}

if (CF_KV_NAMESPACE_ID_SCRIPT_DATA && !isValidUUID(CF_KV_NAMESPACE_ID_SCRIPT_DATA)) {
  console.error(`❌ CF_KV_NAMESPACE_ID_SCRIPT_DATA is invalid UUID: "${CF_KV_NAMESPACE_ID_SCRIPT_DATA}" (length: ${CF_KV_NAMESPACE_ID_SCRIPT_DATA.length})`);
  console.error('   Expected: 32 hex characters (e.g., abc123def456789012345678901234ab)');
  console.log('⚠️  Skipping SCRIPT_DATA purge due to invalid UUID');
}

/**
 * Make HTTPS request to Cloudflare API
 */
function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4${path}`,
      method: method,
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API Error: ${parsed.errors?.[0]?.message || data}`));
          }
        } catch (e) {
          reject(new Error(`Parse Error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * List all keys in a KV namespace (handles pagination)
 */
async function listAllKeys(namespaceId) {
  const allKeys = [];
  let cursor = null;

  do {
    const cursorParam = cursor ? `&cursor=${cursor}` : '';
    const path = `/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000${cursorParam}`;
    const response = await makeRequest(path);

    if (response.result) {
      allKeys.push(...response.result);
    }

    cursor = response.result_info?.cursor;
  } while (cursor);

  return allKeys;
}

/**
 * Bulk delete keys from KV namespace
 */
async function bulkDeleteKeys(namespaceId, keyNames) {
  const path = `/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`;
  // Cloudflare expects an array of key names as the body
  return makeRequest(path, 'DELETE', keyNames);
}

/**
 * Delete a single key from KV namespace
 */
async function deleteKey(namespaceId, keyName) {
  const encodedKey = encodeURIComponent(keyName);
  const path = `/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`;
  return makeRequest(path, 'DELETE');
}

/**
 * Purge all keys from a KV namespace
 */
async function purgeNamespace(namespaceId, namespaceName) {
  if (!namespaceId) {
    console.log(`⏭️  ${namespaceName}: Not configured (skipping)`);
    return {success: true, count: 0, skipped: true};
  }

  // Validate UUID format before making API calls
  if (!isValidUUID(namespaceId)) {
    console.log(`❌ ${namespaceName}: Invalid UUID format (length: ${namespaceId.length}, expected: 32)`);
    return {success: false, error: `Invalid UUID: ${namespaceId}`};
  }

  try {
    console.log(`🔍 ${namespaceName}: Listing keys...`);
    const keys = await listAllKeys(namespaceId);

    if (keys.length === 0) {
      console.log(`✅ ${namespaceName}: Already empty`);
      return {success: true, count: 0};
    }

    console.log(`📦 ${namespaceName}: Found ${keys.length} keys to delete`);

    // Delete in batches of 10000 (Cloudflare limit)
    const keyNames = keys.map((k) => k.name);
    const batchSize = 10000;

    try {
      // Try bulk delete first
      for (let i = 0; i < keyNames.length; i += batchSize) {
        const batch = keyNames.slice(i, i + batchSize);
        await bulkDeleteKeys(namespaceId, batch);
        console.log(`🗑️  ${namespaceName}: Deleted ${Math.min(i + batchSize, keyNames.length)}/${keyNames.length}`);
      }
    } catch (bulkError) {
      // Fallback to individual deletes
      console.log(`⚠️  ${namespaceName}: Bulk delete failed, trying individual deletes...`);
      let deleted = 0;
      for (const keyName of keyNames) {
        try {
          await deleteKey(namespaceId, keyName);
          deleted++;
          if (deleted % 10 === 0 || deleted === keyNames.length) {
            process.stdout.write(`\r🗑️  ${namespaceName}: Deleted ${deleted}/${keyNames.length}`);
          }
        } catch (err) {
          // Continue on individual key failures
        }
      }
      console.log('');
    }

    console.log(`✅ ${namespaceName}: Purged ${keys.length} keys`);
    return {success: true, count: keys.length};
  } catch (error) {
    console.error(`❌ ${namespaceName}: Error - ${error.message}`);
    return {success: false, error: error.message};
  }
}

/**
 * Main execution
 */
async function main() {
  const results = [];

  // Purge page cache (proskatersplace_cache)
  if (PURGE_PAGE_CACHE) {
    console.log('\n📄 Purging Page Cache (NUXT_CACHE / proskatersplace_cache)...');
    const cacheResult = await purgeNamespace(CF_KV_NAMESPACE_ID_CACHE, 'PAGE_CACHE');
    results.push({name: 'PAGE_CACHE', ...cacheResult});
  } else {
    console.log('\n⏭️  PAGE_CACHE: Skipped (PURGE_PAGE_CACHE=false)');
  }

  // Purge script data
  if (PURGE_SCRIPT_DATA) {
    console.log('\n📊 Purging Script Data (NUXT_SCRIPT_DATA)...');
    const scriptResult = await purgeNamespace(CF_KV_NAMESPACE_ID_SCRIPT_DATA, 'SCRIPT_DATA');
    results.push({name: 'SCRIPT_DATA', ...scriptResult});
  } else {
    console.log('\n⏭️  SCRIPT_DATA: Skipped (PURGE_SCRIPT_DATA=false)');
  }

  // Purge test cache (proskatersplace-test-cache) - ONLY in test environment
  if (PURGE_TEST_CACHE) {
    console.log('\n🧪 Purging TEST Cache (proskatersplace-test-cache)...');
    const testCacheResult = await purgeNamespace(CF_KV_NAMESPACE_ID_TEST_CACHE, 'TEST_CACHE');
    results.push({name: 'TEST_CACHE', ...testCacheResult});
  } else if (IS_TEST_ENV) {
    console.log('\n⏭️  TEST_CACHE: Skipped (PURGE_TEST_CACHE=false)');
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Purge Summary:');
  results.forEach((r) => {
    if (r.skipped) {
      console.log(`   ${r.name}: Skipped (not configured)`);
    } else if (r.success) {
      console.log(`   ${r.name}: ✅ ${r.count} keys deleted`);
    } else {
      console.log(`   ${r.name}: ❌ Failed - ${r.error}`);
    }
  });

  const failed = results.filter((r) => !r.success && !r.skipped);
  if (failed.length > 0) {
    console.log('\n⚠️  Some namespaces failed to purge. Build will continue.');
  } else {
    console.log('\n✅ Cache purge complete. Ready for rebuild.');
  }

  // Always exit 0 - don't fail the build if purge fails
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  // Don't fail the build, just warn
  console.log('⚠️  Cache purge failed, but build will continue.');
  process.exit(0);
});
