// scripts/setup-script.js
const fs = require("fs"); // Using synchronous fs for simplicity in build script
const path = require("path");
const { execSync } = require("child_process");

console.log("🚀 Setting up caching system during build phase...");

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Configuration with default fallbacks
const CONFIG = {
  RUN_CACHE_WARMING: process.env.RUN_CACHE_WARMING === "true",
  WARM_CRITICAL_ONLY: process.env.WARM_CRITICAL_ONLY === "true",
  LIMIT_PRODUCTS: process.env.LIMIT_PRODUCTS === "true",
  MAX_PRODUCTS: parseInt(process.env.MAX_PRODUCTS || "2000", 10),
  // --- START: New output path configuration ---
  OUTPUT_DIR: path.join(process.cwd(), ".output", "public", "_script_data"),
  DEPLOYMENT_DATA_FILE: "deployment-data.json",
  // --- END: New output path configuration ---
};

console.log("Configuration:", JSON.stringify(CONFIG, null, 2));

/**
 * Run the category cache builder as a promise
 */
function buildCategoryCache() {
  return new Promise((resolve) => {
    console.log("📦 Building category cache...");
    try {
      // Execute the updated build-categories-cache.js script
      execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });
      console.log(
        "✅ Category cache build seems complete (check script output above)."
      );
      resolve(true); // Resolve true even if the script internally handles errors/empty files
    } catch (categoryError) {
      // This catch block might be hit if the script itself throws an unhandled error or exits non-zero
      console.error(
        "⚠️ Error executing build-categories-cache.js script:",
        categoryError.message
      );
      console.log("Continuing build despite script execution error...");
      resolve(false); // Indicate that the execution failed
    }
  });
}

/**
 * Run the product cache builder as a promise
 */
function buildProductCache() {
  return new Promise((resolve) => {
    console.log("📦 Building product search cache...");
    try {
      // Determine if build mode flag should be passed
      const buildModeFlag = CONFIG.LIMIT_PRODUCTS ? "--build-mode" : "";
      const buildProductCacheCommand = `node scripts/build-products-cache.js ${buildModeFlag}`;

      // Execute the updated build-products-cache.js script
      execSync(buildProductCacheCommand, {
        stdio: "inherit",
        // Pass relevant env vars if the script relies on them (it does)
        env: {
          ...process.env,
          LIMIT_PRODUCTS: CONFIG.LIMIT_PRODUCTS ? "true" : "false",
          MAX_PRODUCTS: CONFIG.MAX_PRODUCTS.toString(),
        },
      });
      console.log(
        "✅ Product cache build seems complete (check script output above)."
      );
      resolve(true); // Resolve true even if the script internally handles errors/empty files
    } catch (productError) {
      // This catch block might be hit if the script itself throws an unhandled error or exits non-zero
      console.error(
        "⚠️ Error executing build-products-cache.js script:",
        productError.message
      );
      console.log("Continuing build despite script execution error...");
      resolve(false); // Indicate that the execution failed
    }
  });
}

// Main function to sequence operations
async function main() {
  try {
    // Ensure the target output directory exists before writing deployment data
    // The build scripts themselves also ensure this directory exists, but doesn't hurt to double-check.
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
      fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
      console.log(`Created directory for build output: ${CONFIG.OUTPUT_DIR}`);
    }

    // 1. First build category cache (smaller and faster)
    await buildCategoryCache();

    // Add delay to potentially avoid filesystem contention or rate limiting if applicable
    console.log("Waiting 1 second before building product cache...");
    await delay(1000); // Reduced delay

    // 2. Then build product cache (larger and more intensive)
    await buildProductCache();

    // 3. Create deployment data file in the same output directory
    console.log(
      "🏁 Creating deployment data file for post-deployment actions..."
    );
    const deploymentData = {
      buildTime: new Date().toISOString(),
      // These flags signal to the post-deploy process what needs to happen
      needsFullCacheWarming: CONFIG.RUN_CACHE_WARMING,
      warmedCriticalOnly: CONFIG.WARM_CRITICAL_ONLY,
      buildModeLimitedProducts: CONFIG.LIMIT_PRODUCTS,
      buildModeMaxProducts: CONFIG.LIMIT_PRODUCTS ? CONFIG.MAX_PRODUCTS : null,
      // Include original config for reference if needed
      // configuration: CONFIG,
    };

    const deploymentDataPath = path.join(
      CONFIG.OUTPUT_DIR,
      CONFIG.DEPLOYMENT_DATA_FILE
    );

    try {
      fs.writeFileSync(
        deploymentDataPath,
        JSON.stringify(deploymentData, null, 2)
      );
      console.log(`✅ Deployment data file written to ${deploymentDataPath}`);
    } catch (writeError) {
      console.error(
        `❌ Failed to write deployment data file to ${deploymentDataPath}:`,
        writeError
      );
      // Decide if this is a critical failure for the build
      process.exit(1);
    }

    console.log("✅ Build-time cache setup complete!");

    // Give a moment for any final console output to be flushed
    await delay(500);

    // Exit with success code (assuming previous steps didn't exit)
    process.exit(0);
  } catch (error) {
    // Catch errors from the main async function itself (e.g., delay issues)
    console.error("❌ Error in build-time cache setup (main function):", error);
    console.log("⚠️ Continuing with deployment despite setup script error...");
    process.exit(1); // Exit with failure code
  }
}

// Run the main function
main(); // No need for .catch here as errors are handled within main()
