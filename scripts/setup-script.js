// scripts/setup-script.js
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

console.log("🚀 Setting up caching system during build phase...");

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Configuration with default fallbacks
const CONFIG = {
  RUN_CACHE_WARMING: process.env.RUN_CACHE_WARMING === "true",
  WARM_CRITICAL_ONLY: process.env.WARM_CRITICAL_ONLY === "true",
  FRONTEND_URL: process.env.FRONTEND_URL || "https://localhost:3000",
  LIMIT_PRODUCTS: process.env.LIMIT_PRODUCTS === "true",
  MAX_PRODUCTS: parseInt(process.env.MAX_PRODUCTS || "2000", 10),
};

console.log("Configuration:", JSON.stringify(CONFIG, null, 2));

/**
 * Run the category cache builder as a promise
 */
function buildCategoryCache() {
  return new Promise((resolve) => {
    console.log("📦 Building category cache...");
    try {
      execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });
      console.log("✅ Category cache build complete!");
      resolve(true);
    } catch (categoryError) {
      console.error("⚠️ Error building category cache:", categoryError.message);
      console.log("Continuing despite category cache error...");

      // Create empty category cache file as fallback
      try {
        const categoryCachePath = path.join(
          nuxtCacheDir,
          "cached-categories.json"
        );
        fs.writeFileSync(categoryCachePath, JSON.stringify([]));
        console.log("Created empty category cache file as fallback");
      } catch (writeError) {
        console.error(
          "Error creating fallback category cache:",
          writeError.message
        );
      }

      resolve(false);
    }
  });
}

/**
 * Run the product cache builder as a promise
 */
function buildProductCache() {
  return new Promise((resolve) => {
    console.log("📦 Building initial product search cache...");
    try {
      const buildProductCacheCommand = `node scripts/build-products-cache.js ${CONFIG.LIMIT_PRODUCTS ? "--build-mode" : ""}`;

      execSync(buildProductCacheCommand, {
        stdio: "inherit",
        env: {
          ...process.env,
          LIMIT_PRODUCTS: CONFIG.LIMIT_PRODUCTS ? "true" : "false",
          MAX_PRODUCTS: CONFIG.MAX_PRODUCTS.toString(),
        },
      });
      console.log("✅ Product cache build complete!");
      resolve(true);
    } catch (productError) {
      console.error("⚠️ Error building product cache:", productError.message);
      console.log("Continuing despite product cache error...");

      // Create empty product cache file as fallback
      try {
        const productCachePath = path.join(
          nuxtCacheDir,
          "cached-products.json"
        );
        fs.writeFileSync(productCachePath, JSON.stringify([]));
        console.log("Created empty product cache file as fallback");
      } catch (writeError) {
        console.error(
          "Error creating fallback product cache:",
          writeError.message
        );
      }

      resolve(false);
    }
  });
}

// Main function to sequence operations
async function main() {
  try {
    // Create necessary cache directories
    const nuxtCacheDir = path.join(process.cwd(), ".nuxt", "cache");
    if (!fs.existsSync(nuxtCacheDir)) {
      fs.mkdirSync(nuxtCacheDir, { recursive: true });
    }

    // Create the .cache directory if it doesn't exist
    const cacheDir = path.join(process.cwd(), ".cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 1. First build category cache (smaller and faster)
    await buildCategoryCache();

    // Add delay to avoid rate limiting
    console.log("Waiting 3 seconds before building product cache...");
    await delay(3000);

    // 2. Then build product cache (larger and more intensive)
    await buildProductCache();

    // Create deployment data file
    console.log("🏁 Creating signal file for post-deployment actions...");
    const deploymentData = {
      buildTime: new Date().toISOString(),
      needsFullCacheWarming: CONFIG.RUN_CACHE_WARMING,
      needsFullProductCache: !CONFIG.WARM_CRITICAL_ONLY,
      configuration: CONFIG,
    };

    fs.writeFileSync(
      path.join(cacheDir, "deployment-data.json"),
      JSON.stringify(deploymentData, null, 2)
    );

    console.log("✅ Build-time cache setup complete!");

    // Give a moment for any final console output to be flushed
    await delay(500);

    // Exit with success code
    process.exit(0);
  } catch (error) {
    console.error("❌ Error in build-time cache setup:", error);
    console.log("⚠️ Continuing with deployment despite caching error...");
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error in setup script:", error);
  process.exit(1);
});
