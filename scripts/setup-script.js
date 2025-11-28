// scripts/setup-script.js
require('dotenv').config(); // Ensure environment variables are loaded
const {execSync} = require('child_process');
const fetch = require('node-fetch');

console.log('🚀 Starting build-time data population for Cloudflare KV...');

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Configuration for build process behavior (e.g., limiting products)
const CONFIG = {
  LIMIT_PRODUCTS: process.env.LIMIT_PRODUCTS === 'true',
  MAX_PRODUCTS: parseInt(process.env.MAX_PRODUCTS || '2000', 10),
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID_SCRIPT_DATA: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA,
  // Add any other relevant build-time configurations here
  // RUN_CACHE_WARMING and WARM_CRITICAL_ONLY might be relevant for a post-deploy trigger,
  // but their data isn't directly handled by this script anymore.
};

console.log('Build Configuration:', JSON.stringify(CONFIG, null, 2));

/**
 * Purge all keys from KV namespace before rebuilding cache
 * This ensures we start with a clean slate
 */
async function purgeKVCache() {
  console.log('🗑️  Purging existing KV cache...');

  if (!CONFIG.CF_ACCOUNT_ID || !CONFIG.CF_API_TOKEN || !CONFIG.CF_KV_NAMESPACE_ID_SCRIPT_DATA) {
    console.warn('⚠️  Cloudflare credentials not set. Skipping cache purge.');
    return false;
  }

  try {
    // List all keys in the namespace
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID_SCRIPT_DATA}/keys`;

    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
      },
    });

    const listData = await listResponse.json();

    if (!listResponse.ok || !listData.success) {
      console.error('Error listing KV keys:', listData);
      return false;
    }

    const keys = listData.result.map((item) => item.name);

    if (keys.length === 0) {
      console.log('✅ KV namespace is already empty.');
      return true;
    }

    console.log(`Found ${keys.length} keys to delete: ${keys.join(', ')}`);

    // Delete all keys
    const bulkDeleteUrl = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID_SCRIPT_DATA}/bulk`;

    const deleteResponse = await fetch(bulkDeleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(keys),
    });

    const deleteData = await deleteResponse.json();

    if (!deleteResponse.ok || !deleteData.success) {
      console.error('Error deleting KV keys:', deleteData);
      return false;
    }

    console.log(`✅ Successfully purged ${keys.length} keys from KV cache.`);
    return true;
  } catch (error) {
    console.error('Error purging KV cache:', error.message);
    return false;
  }
}

/**
 * Run the category data population script (writes to KV).
 */
function populateCategoryData() {
  return new Promise((resolve, reject) => {
    console.log('📦 Populating category data in Cloudflare KV...');
    try {
      // Execute the build-categories-cache.js script
      // It will use environment variables for CF API access.
      execSync('node scripts/build-categories-cache.js', {stdio: 'inherit'});
      console.log('✅ Category data population script finished.');
      resolve(true);
    } catch (error) {
      console.error('⚠️ Error executing script to populate category data in KV:', error.message);
      // Depending on your CI/CD, you might want to reject or resolve(false)
      // to allow the build to continue or fail it.
      reject(error); // Fail the build if category data can't be populated
    }
  });
}

/**
 * Run the product data population script (writes to KV).
 */
function populateProductData() {
  return new Promise((resolve, reject) => {
    console.log('📦 Populating product data in Cloudflare KV...');
    try {
      // Determine if build mode flag should be passed to the products script
      const buildModeFlag = CONFIG.LIMIT_PRODUCTS ? '--build-mode' : '';
      const populateProductsCommand = `node scripts/build-products-cache.js ${buildModeFlag}`;

      // Execute the build-products-cache.js script
      // It will use environment variables for CF API access and LIMIT_PRODUCTS/MAX_PRODUCTS.
      execSync(populateProductsCommand, {
        stdio: 'inherit',
        env: {
          ...process.env, // Pass all existing environment variables
          // Explicitly pass these if the script relies on them directly from process.env
          // (which it does as per its current implementation)
          LIMIT_PRODUCTS: CONFIG.LIMIT_PRODUCTS ? 'true' : 'false',
          MAX_PRODUCTS: CONFIG.MAX_PRODUCTS.toString(),
        },
      });
      console.log('✅ Product data population script finished.');
      resolve(true);
    } catch (error) {
      console.error('⚠️ Error executing script to populate product data in KV:', error.message);
      reject(error); // Fail the build if product data can't be populated
    }
  });
}

/**
 * Generate all routes for prerendering and sitemap
 */
function generateAllRoutes() {
  return new Promise((resolve, reject) => {
    console.log('📦 Generating routes for prerendering and sitemap...');
    try {
      execSync('node scripts/build-all-routes.js', {stdio: 'inherit'});
      console.log('✅ Route generation completed.');
      resolve(true);
    } catch (error) {
      console.error('⚠️ Error generating routes:', error.message);
      reject(error);
    }
  });
}

// Main function to sequence operations
async function main() {
  try {
    // COMMENTED OUT: Do not purge KV cache here.
    // The build process runs 'scripts/build-sitemap.js' BEFORE this script,
    // which uploads 'product-seo-meta' and 'sitemap-data' to KV.
    // If we purge here, we delete that critical data.
    // Individual scripts (build-products-cache, build-categories-cache) will overwrite their specific keys.
    // console.log('🧹 Step 1: Purging existing KV cache...');
    // await purgeKVCache();
    // console.log('');

    console.log('📝 Step 2: Generating routes...');
    await generateAllRoutes();
    console.log('');

    console.log('📦 Step 3: Populating category data...');
    await populateCategoryData();
    console.log('');

    // Optional: Add a small delay if there are concerns about rapid API calls,
    // though each script makes multiple calls already.
    console.log('⏳ Waiting 1 second before populating product data...');
    await delay(1000);

    console.log('📦 Step 4: Populating product data...');
    await populateProductData();
    console.log('');

    // The 'deployment-data.json' file is no longer created here as data goes directly to KV.
    // If you need to signal the post-deploy script (cache warmer) or pass build-time metadata,
    // consider writing a small JSON object to a specific key in your NUXT_SCRIPT_DATA KV
    // namespace here, which the post-deploy script can then read.
    // For example:
    // await storeBuildMetadataInKV({ buildTime: new Date().toISOString(), limitedProducts: CONFIG.LIMIT_PRODUCTS });

    console.log('✅ All build-time data population scripts completed successfully!');
    process.exit(0); // Explicitly exit with success
  } catch (error) {
    console.error('❌ Error during build-time data population process:', error.message || error);
    // Ensure the process exits with a failure code to fail the build
    process.exit(1);
  }
}

// Run the main function
main(); // Errors are caught within main and lead to process.exit(1)

// Example function if you want to store build metadata in KV
// async function storeBuildMetadataInKV(metadata) {
//   if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN || !process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA) {
//     console.warn("CF credentials for KV not set. Skipping storing build metadata in KV.");
//     return;
//   }
//   const key = "build-metadata";
//   console.log(`Storing build metadata in KV under key: ${key}`);
//   const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA}/values/${key}`;
//   try {
//     await fetch(url, { // Make sure 'fetch' is available (e.g., require 'node-fetch')
//       method: "PUT",
//       headers: {
//         "Authorization": `Bearer ${process.env.CF_API_TOKEN}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(metadata),
//     });
//     console.log("Successfully stored build metadata in KV.");
//   } catch (e) {
//     console.error("Failed to store build metadata in KV:", e);
//   }
// }
