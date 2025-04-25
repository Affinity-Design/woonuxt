// scripts/post-deploy.js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { execSync, spawn } = require("child_process");

// Configuration
const CONFIG = {
  // Base URL for the frontend site
  FRONTEND_URL: process.env.FRONTEND_URL || "https://localhost:3000",
  // GraphQL endpoint for WooCommerce
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  // Secret token for revalidation
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
  // Whether to run cache warming after deployment
  RUN_CACHE_WARMING: process.env.RUN_CACHE_WARMING !== "false",
  // Whether to warm only critical pages
  WARM_CRITICAL_ONLY: process.env.WARM_CRITICAL_ONLY === "true",
};

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    `${CONFIG.FRONTEND_URL}/`, // Homepage
    `${CONFIG.FRONTEND_URL}/categories`, // Categories list
    `${CONFIG.FRONTEND_URL}/products`, // All products
    `${CONFIG.FRONTEND_URL}/contact`, // Contact page
    `${CONFIG.FRONTEND_URL}/terms`, // Terms page
    `${CONFIG.FRONTEND_URL}/privacy`, // Privacy page
    // Add any other critical pages here
  ];

  console.log(`Warming ${criticalUrls.length} critical pages...`);

  // Process critical pages one at a time to avoid rate limits
  for (const url of criticalUrls) {
    await warmUrl(url);
    // Add a delay between requests to avoid rate limiting
    await delay(1500);
  }
}

/**
 * Run the product cache builder directly as a promise
 */
function buildProductCache() {
  return new Promise((resolve) => {
    console.log("🔄 Building full product cache...");
    try {
      execSync("node scripts/build-products-cache.js", {
        stdio: "inherit",
        env: {
          ...process.env,
          LIMIT_PRODUCTS: "false", // Ensure full product build
        },
      });
      console.log("✅ Product cache build completed");
      resolve(true);
    } catch (error) {
      console.error("❌ Product cache build failed:", error.message);
      resolve(false);
    }
  });
}

/**
 * Run the category cache builder directly as a promise
 */
function buildCategoryCache() {
  return new Promise((resolve) => {
    console.log("🔄 Building category cache...");
    try {
      execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });
      console.log("✅ Category cache build completed");
      resolve(true);
    } catch (error) {
      console.error("❌ Category cache build failed:", error.message);
      resolve(false);
    }
  });
}

/**
 * Run the cache warmer directly in the background
 * This runs in a detached process so it can continue after this script exits
 */
function runCacheWarmer(type = "all") {
  console.log(`🔄 Starting cache warmer for ${type} in background...`);
  try {
    // Create a detached process that will continue after script exits
    const warmerProcess = spawn("node", ["scripts/cache-warmer.js", type], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });

    // Unref the child process so parent can exit
    warmerProcess.unref();

    console.log(
      `✅ Cache warmer for ${type} started with PID: ${warmerProcess.pid}`
    );
    return true;
  } catch (error) {
    console.error(`❌ Error starting cache warmer for ${type}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Post-deployment script started");

  try {
    // 1. First warm critical pages immediately after deployment
    await warmCriticalPages();

    // 2. Check if we need to do full cache warming
    if (CONFIG.RUN_CACHE_WARMING) {
      if (CONFIG.WARM_CRITICAL_ONLY) {
        console.log(
          "Only warming critical pages as specified in configuration"
        );
      } else {
        console.log("Running full cache processes in sequence...");

        // 3. First build category cache (this is smaller and faster)
        await buildCategoryCache();

        // 4. Add a delay to avoid rate limiting
        console.log("Waiting 3 seconds before building product cache...");
        await delay(3000);

        // 5. Then build product cache
        await buildProductCache();

        // 6. Add another delay before starting page warming
        console.log("Waiting 5 seconds before starting page warming...");
        await delay(5000);

        // 7. Finally, start cache warmer in the background
        // This will continue running after this script exits
        runCacheWarmer("all");
      }
    } else {
      console.log("Full cache warming disabled by configuration");
    }

    console.log("✅ Post-deployment script completed successfully");

    // Give a moment for any final console output to be flushed
    await delay(500);

    // Exit with success code
    process.exit(0);
  } catch (error) {
    console.error("❌ Error in post-deployment script:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error in post-deployment script:", error);
  process.exit(1);
});
