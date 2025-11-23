/**
 * Clear Cloudflare KV Cache
 *
 * This script clears ALL keys from the Cloudflare KV namespaces.
 * Use this when you need to completely reset the cache after major updates.
 *
 * Usage:
 *   node scripts/clear-kv-cache.js
 *   node scripts/clear-kv-cache.js --namespace cache
 *   node scripts/clear-kv-cache.js --namespace script_data
 *   node scripts/clear-kv-cache.js --all
 */

require('dotenv').config();
const https = require('https');

// Cloudflare API credentials
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_KV_NAMESPACE_ID_CACHE = process.env.CF_KV_NAMESPACE_ID_CACHE;
const CF_KV_NAMESPACE_ID_SCRIPT_DATA = process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA;

// Parse command line arguments
const args = process.argv.slice(2);
const namespaceArg = args.find((arg) => arg.startsWith('--namespace='));
const clearAll = args.includes('--all');

let namespaceToClear = clearAll ? 'all' : 'cache'; // Default to cache
if (namespaceArg) {
  namespaceToClear = namespaceArg.split('=')[1];
}

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('❌ Missing Cloudflare credentials in environment variables');
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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
 * Clear all keys from a KV namespace
 */
async function clearNamespace(namespaceId, namespaceName) {
  console.log(`\n🗑️  Clearing namespace: ${namespaceName}`);
  console.log(`   Namespace ID: ${namespaceId}`);

  try {
    // List all keys
    const keys = await listKeys(namespaceId);
    console.log(`   Found ${keys.length} keys to delete`);

    if (keys.length === 0) {
      console.log('   ✅ Namespace is already empty');
      return;
    }

    // Delete each key
    let deleted = 0;
    for (const key of keys) {
      try {
        await deleteKey(namespaceId, key.name);
        deleted++;
        process.stdout.write(`\r   Deleted ${deleted}/${keys.length} keys...`);
      } catch (error) {
        console.error(`\n   ⚠️  Failed to delete key "${key.name}":`, error.message);
      }
    }

    console.log(`\n   ✅ Successfully cleared ${deleted} keys from ${namespaceName}`);
  } catch (error) {
    console.error(`   ❌ Error clearing namespace ${namespaceName}:`, error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Cloudflare KV Cache Clearer');
  console.log('================================\n');

  const namespaces = [];

  if (namespaceToClear === 'all' || namespaceToClear === 'cache') {
    if (!CF_KV_NAMESPACE_ID_CACHE) {
      console.warn('⚠️  CF_KV_NAMESPACE_ID_CACHE not set, skipping cache namespace');
    } else {
      namespaces.push({
        id: CF_KV_NAMESPACE_ID_CACHE,
        name: 'NUXT_CACHE (Route/Page Cache)',
      });
    }
  }

  if (namespaceToClear === 'all' || namespaceToClear === 'script_data') {
    if (!CF_KV_NAMESPACE_ID_SCRIPT_DATA) {
      console.warn('⚠️  CF_KV_NAMESPACE_ID_SCRIPT_DATA not set, skipping script_data namespace');
    } else {
      namespaces.push({
        id: CF_KV_NAMESPACE_ID_SCRIPT_DATA,
        name: 'NUXT_SCRIPT_DATA (Products/Categories)',
      });
    }
  }

  if (namespaces.length === 0) {
    console.error('❌ No namespaces to clear. Check your environment variables.');
    process.exit(1);
  }

  console.log(`Clearing ${namespaces.length} namespace(s)...\n`);

  for (const namespace of namespaces) {
    await clearNamespace(namespace.id, namespace.name);
  }

  console.log('\n✨ Cache clearing complete!\n');
  console.log('💡 Next steps:');
  console.log('   1. Run: npm run setup-cache (to repopulate product/category data)');
  console.log('   2. Deploy your site to regenerate cached pages');
  console.log('   3. Run: npm run warm-cache (to warm the page cache)\n');
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
