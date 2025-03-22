// scripts/post-deploy.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Configuration
const CONFIG = {
  // Base URL for the frontend site
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://proskatersplace.ca',
  // GraphQL endpoint for WooCommerce
  WP_GRAPHQL_URL: process.env.GQL_HOST || 'https://admin.proskatersplace.ca/graphql',
  // Secret token for revalidation
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET || 'your-secret-key',
  // Whether to run cache warming after deployment
  RUN_CACHE_WARMING: process.env.RUN_CACHE_WARMING !== 'false',
  // Whether to warm only critical pages
  WARM_CRITICAL_ONLY: process.env.WARM_CRITICAL_ONLY === 'true'
};

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Warm a specific URL
 */
async function warmUrl(url) {
  try {
    console.log(`Warming: ${url}`);
    const startTime = Date.now();
    const response = await fetch(url);
    const timeElapsed = Date.now() - startTime;
    
    console.log(`✅ ${url} - ${response.status} (${timeElapsed}ms)`);
    return true;
  } catch (error) {
    console.error(`❌ Error warming ${url}: ${error.message}`);
    return false;
  }
}

/**
 * Warm critical pages that should be immediately available
 */
async function warmCriticalPages() {
  const criticalUrls = [
    `${CONFIG.FRONTEND_URL}/`,                   // Homepage
    `${CONFIG.FRONTEND_URL}/categories`,         // Categories list
    `${CONFIG.FRONTEND_URL}/products`,           // All products
    `${CONFIG.FRONTEND_URL}/contact`,            // Contact page
    `${CONFIG.FRONTEND_URL}/terms`,              // Terms page
    `${CONFIG.FRONTEND_URL}/privacy`,            // Privacy page
    // Add any other critical pages here
  ];
  
  console.log(`Warming ${criticalUrls.length} critical pages...`);
  
  for (const url of criticalUrls) {
    await warmUrl(url);
    await delay(500); // Small delay between requests
  }
}

/**
 * Trigger the full cache warming process in the background
 */
async function triggerFullCacheWarming() {
  try {
    console.log('Triggering full page cache warming in the background...');
    
    // First warm categories since they're fewer
    fetch(`${CONFIG.FRONTEND_URL}/api/trigger-cache-warming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: CONFIG.REVALIDATION_SECRET,
        type: 'categories'
      }),
    }).catch(error => {
      console.error('Error triggering category cache warming:', error);
    });
    
    // Slight delay before starting products to avoid overwhelming the server
    await delay(10000);
    
    // Then trigger product cache warming
    fetch(`${CONFIG.FRONTEND_URL}/api/trigger-cache-warming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: CONFIG.REVALIDATION_SECRET,
        type: 'products'
      }),
    }).catch(error => {
      console.error('Error triggering product cache warming:', error);
    });
    
    console.log('Cache warming processes triggered in the background');
  } catch (error) {
    console.error('Error triggering cache warming:', error);
  }
}

/**
 * Complete the full product cache building in the background
 */
async function triggerFullProductCacheBuilding() {
  try {
    console.log('Triggering full product cache building in the background...');
    
    fetch(`${CONFIG.FRONTEND_URL}/api/trigger-cache-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: CONFIG.REVALIDATION_SECRET
      }),
    }).catch(error => {
      console.error('Error triggering product cache building:', error);
    });
    
    console.log('Product cache building triggered in the background');
  } catch (error) {
    console.error('Error triggering product cache building:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Post-deployment script started');
  
  try {
    // Always warm critical pages immediately after deployment
    await warmCriticalPages();
    
    // Check if we need to warm the full cache
    if (CONFIG.RUN_CACHE_WARMING) {
      if (CONFIG.WARM_CRITICAL_ONLY) {
        console.log('Only warming critical pages as specified in configuration');
      } else {
        // Trigger full cache warming
        await triggerFullProductCacheBuilding();
        await delay(5000); // Wait a bit before starting page warming
        await triggerFullCacheWarming();
      }
    } else {
      console.log('Full cache warming disabled by configuration');
    }
    
    console.log('✅ Post-deployment script completed');
  } catch (error) {
    console.error('❌ Error in post-deployment script:', error);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error in post-deployment script:', error);
});
