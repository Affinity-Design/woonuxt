// scripts/post-deploy.js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { execSync } = require("child_process");

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

  for (const url of criticalUrls) {
    await warmUrl(url);
    await delay(500); // Small delay between requests
  }
}

/**
 * Run the product cache builder directly
 */
function buildProductCache() {
  try {
    console.log("🔄 Building full product cache...");
    execSync("node scripts/build-products-cache.js", {
      stdio: "inherit",
      env: {
        ...process.env,
        LIMIT_PRODUCTS: "false", // Ensure full product build
      },
    });
    console.log("✅ Product cache build completed");
    return true;
  } catch (error) {
    console.error("❌ Product cache build failed:", error.message);
    return false;
  }
}

/**
 * Run the category cache builder directly
 */
function buildCategoryCache() {
  try {
    console.log("🔄 Building category cache...");
    execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });
    console.log("✅ Category cache build completed");
    return true;
  } catch (error) {
    console.error("❌ Category cache build failed:", error.message);
    return false;
  }
}

/**
 * Run the cache warmer directly
 */
function runCacheWarmer(type = "all") {
  try {
    console.log(`🔄 Running cache warmer for ${type}...`);
    execSync(`node scripts/cache-warmer.js ${type}`, { stdio: "inherit" });
    console.log(`✅ Cache warming for ${type} completed`);
    return true;
  } catch (error) {
    console.error(`❌ Cache warming for ${type} failed:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Post-deployment script started");

  try {
    // Always warm critical pages immediately after deployment
    await warmCriticalPages();

    // Check if we need to do full cache warming
    if (CONFIG.RUN_CACHE_WARMING) {
      if (CONFIG.WARM_CRITICAL_ONLY) {
        console.log(
          "Only warming critical pages as specified in configuration"
        );
      } else {
        // Run full caching processes directly
        console.log("Running full cache processes...");

        // Build product cache
        buildProductCache();

        // Build category cache
        buildCategoryCache();

        // Run cache warmer with delay to avoid overwhelming the server
        setTimeout(() => {
          runCacheWarmer("all");
        }, 5000);
      }
    } else {
      console.log("Full cache warming disabled by configuration");
    }

    console.log("✅ Post-deployment script completed");
  } catch (error) {
    console.error("❌ Error in post-deployment script:", error);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error in post-deployment script:", error);
});
