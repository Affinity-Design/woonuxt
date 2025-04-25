const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🚀 Setting up caching system during build phase...");

// Configuration with default fallbacks
const CONFIG = {
  RUN_CACHE_WARMING: process.env.RUN_CACHE_WARMING,
  WARM_CRITICAL_ONLY: process.env.WARM_CRITICAL_ONLY,
  FRONTEND_URL: process.env.FRONTEND_URL || "https://localhost:3000",
  LIMIT_PRODUCTS: process.env.LIMIT_PRODUCTS,
  MAX_PRODUCTS: parseInt(process.env.MAX_PRODUCTS),
};

console.log("Configuration:", JSON.stringify(CONFIG, null, 2));

try {
  // Create the cache directory if it doesn't exist
  const cacheDir = path.join(process.cwd(), ".cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Build product search cache
  console.log("📦 Building initial product search cache...");

  const buildProductCacheCommand = `node scripts/build-products-cache.js ${CONFIG.LIMIT_PRODUCTS ? "--build-mode" : ""}`;

  execSync(buildProductCacheCommand, {
    stdio: "inherit",
    env: {
      ...process.env,
      LIMIT_PRODUCTS: CONFIG.LIMIT_PRODUCTS ? "true" : "false",
      MAX_PRODUCTS: CONFIG.MAX_PRODUCTS.toString(),
    },
  });

  // Build category cache
  console.log("📦 Building category cache...");

  try {
    execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });
    console.log("✅ Category cache build complete!");
  } catch (categoryError) {
    console.error("⚠️ Error building category cache:", categoryError.message);
    console.log("Continuing deployment despite category cache error...");
  }

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
} catch (error) {
  console.error("❌ Error in build-time cache setup:", error);
  console.log("⚠️ Continuing with deployment despite caching error...");
}
