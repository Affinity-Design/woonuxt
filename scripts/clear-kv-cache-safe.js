/**
 * SAFE Cloudflare KV Cache Clearer
 *
 * This script clears KV cache with environment protection.
 * Prevents accidental production cache clearing.
 *
 * ⚠️  CRITICAL: Test and Production MUST use separate KV namespaces!
 *
 * Usage:
 *   # Clear TEST environment (safe)
 *   node scripts/clear-kv-cache-safe.js --env=test --all
 *
 *   # Clear PRODUCTION (requires --confirm)
 *   node scripts/clear-kv-cache-safe.js --env=prod --all --confirm
 *
 * Environment Variables Required:
 *   CF_ACCOUNT_ID - Cloudflare account ID
 *   CF_API_TOKEN - Cloudflare API token with KV permissions
 *
 *   For TEST:
 *     CF_KV_NAMESPACE_ID_CACHE_TEST
 *     CF_KV_NAMESPACE_ID_SCRIPT_DATA_TEST
 *
 *   For PRODUCTION:
 *     CF_KV_NAMESPACE_ID_CACHE_PROD
 *     CF_KV_NAMESPACE_ID_SCRIPT_DATA_PROD
 */

require('dotenv').config();
const https = require('https');
const readline = require('readline');

// Parse arguments
const args = process.argv.slice(2);
const envArg = args.find((arg) => arg.startsWith('--env='))?.split('=')[1] || 'test';
const clearAll = args.includes('--all');
const requireConfirm = args.includes('--confirm');
const namespaceArg = args.find((arg) => arg.startsWith('--namespace='))?.split('=')[1];

// Validate environment
if (!['test', 'prod', 'production'].includes(envArg)) {
  console.error('❌ Invalid environment. Use --env=test or --env=prod');
  process.exit(1);
}

const isProd = envArg === 'prod' || envArg === 'production';

// Get credentials
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

// Get environment-specific namespace IDs
let CF_KV_NAMESPACE_ID_CACHE, CF_KV_NAMESPACE_ID_SCRIPT_DATA;

if (isProd) {
  CF_KV_NAMESPACE_ID_CACHE = process.env.CF_KV_NAMESPACE_ID_CACHE_PROD || process.env.CF_KV_NAMESPACE_ID_CACHE;
  CF_KV_NAMESPACE_ID_SCRIPT_DATA = process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA_PROD || process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA;
} else {
  CF_KV_NAMESPACE_ID_CACHE = process.env.CF_KV_NAMESPACE_ID_CACHE_TEST || process.env.CF_KV_NAMESPACE_ID_CACHE;
  CF_KV_NAMESPACE_ID_SCRIPT_DATA = process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA_TEST || process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA;
}

// Validation
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('❌ Missing Cloudflare credentials');
  console.error('Required: CF_ACCOUNT_ID, CF_API_TOKEN');
  process.exit(1);
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
 * List all keys in a KV namespace
 */
async function listKeys(namespaceId) {
  const path = `/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys`;
  const response = await makeRequest(path);
  return response.result || [];
}

/**
 * Delete a single key from KV namespace
 */
async function deleteKey(namespaceId, keyName) {
  const path = `/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`;
  await makeRequest(path, 'DELETE');
}

/**
 * Key prefixes this script must NEVER delete, even with --all.
 *
 * These namespaces hold route/build cache that is safe to rebuild, but a few features fall back to
 * them for durable records when their own KV binding is not bound yet. Deleting those keys is
 * silent data loss, not a cache miss:
 *   - `calc-stats:`  size-calculator funnel telemetry + day rollups (server/utils/statsStorage.ts)
 */
const PROTECTED_KEY_PREFIXES = ['calc-stats:'];

const isProtectedKey = (keyName) => PROTECTED_KEY_PREFIXES.some((prefix) => keyName.startsWith(prefix));

/**
 * Clear all keys from a KV namespace
 */
async function clearNamespace(namespaceId, namespaceName) {
  try {
    console.log(`\n🔍 Listing keys in ${namespaceName}...`);
    const allKeys = await listKeys(namespaceId);
    const protectedKeys = allKeys.filter((key) => isProtectedKey(key.name));
    const keys = allKeys.filter((key) => !isProtectedKey(key.name));

    if (protectedKeys.length > 0) {
      console.log(`🛡️  Preserving ${protectedKeys.length} protected key(s) (${PROTECTED_KEY_PREFIXES.join(', ')})`);
    }

    if (keys.length === 0) {
      console.log(`✓ ${namespaceName} has nothing clearable`);
      return;
    }

    console.log(`📦 Found ${keys.length} keys to delete`);

    let deleted = 0;
    let failed = 0;

    for (const key of keys) {
      try {
        await deleteKey(namespaceId, key.name);
        deleted++;
        process.stdout.write(`\r🗑️  Deleting... ${deleted}/${keys.length}`);
      } catch (error) {
        failed++;
        console.error(`\n❌ Failed to delete key "${key.name}": ${error.message}`);
      }
    }

    console.log(`\n✅ Cleared ${deleted} keys from ${namespaceName}`);
    if (failed > 0) {
      console.warn(`⚠️  Failed to delete ${failed} keys`);
    }
  } catch (error) {
    console.error(`❌ Error clearing ${namespaceName}:`, error.message);
  }
}

/**
 * Prompt user for confirmation
 */
function promptConfirm(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 SAFE Cloudflare KV Cache Clearer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Environment: ${isProd ? '🔴 PRODUCTION' : '🟢 TEST'}`);
  console.log(`🔑 Account ID: ${CF_ACCOUNT_ID}`);

  // PRODUCTION WARNING
  if (isProd && !requireConfirm) {
    console.log('');
    console.log('⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
    console.log('You are about to clear PRODUCTION cache!');
    console.log('This will affect live users on proskatersplace.ca');
    console.log('');
    console.log('Add --confirm flag to proceed:');
    console.log('  node scripts/clear-kv-cache-safe.js --env=prod --all --confirm');
    console.log('');
    process.exit(1);
  }

  const namespaces = [];

  if (clearAll || namespaceArg === 'cache') {
    if (!CF_KV_NAMESPACE_ID_CACHE) {
      console.warn('⚠️  Cache namespace not configured, skipping');
    } else {
      namespaces.push({
        id: CF_KV_NAMESPACE_ID_CACHE,
        name: `NUXT_CACHE (${isProd ? 'PROD' : 'TEST'})`,
      });
    }
  }

  if (clearAll || namespaceArg === 'script_data') {
    if (!CF_KV_NAMESPACE_ID_SCRIPT_DATA) {
      console.warn('⚠️  Script data namespace not configured, skipping');
    } else {
      namespaces.push({
        id: CF_KV_NAMESPACE_ID_SCRIPT_DATA,
        name: `NUXT_SCRIPT_DATA (${isProd ? 'PROD' : 'TEST'})`,
      });
    }
  }

  if (namespaces.length === 0) {
    console.error('❌ No namespaces to clear');
    process.exit(1);
  }

  console.log(`\n📋 Namespaces to clear:`);
  namespaces.forEach((ns) => console.log(`   - ${ns.name} (${ns.id})`));

  // Final confirmation for production
  if (isProd && requireConfirm) {
    console.log('');
    const confirmed = await promptConfirm('⚠️  Are you ABSOLUTELY SURE you want to clear PRODUCTION cache?');
    if (!confirmed) {
      console.log('❌ Cancelled');
      process.exit(0);
    }
  }

  console.log('\n🚀 Starting cache clear...');

  for (const namespace of namespaces) {
    await clearNamespace(namespace.id, namespace.name);
  }

  console.log('\n✨ Cache clearing complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Rebuild cache: npm run setup-cache');
  console.log('2. Warm cache: npm run warm-cache');
  console.log('3. Deploy to Cloudflare Pages');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
