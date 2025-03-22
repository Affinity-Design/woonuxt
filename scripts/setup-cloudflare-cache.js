// scripts/setup-cloudflare-cache.js
const { execSync } = require("child_process");
const fs = require("fs");

console.log("🔄 Setting up Cloudflare caching system...");

// Check if we're in a production build environment
const isProduction =
  process.env.CF_PAGES_BRANCH === "main" ||
  process.env.CF_PAGES_BRANCH === "production";

try {
  // Create necessary directories
  if (!fs.existsSync("./.cache")) {
    fs.mkdirSync("./.cache");
  }

  // Build the product search cache first
  console.log("\n📦 Building product search cache...");
  execSync("node scripts/build-products-cache.js", { stdio: "inherit" });

  // Don't run page warming during build - it will timeout
  // Instead, store a flag file that triggers warming post-deployment
  fs.writeFileSync("./.cache/needs-warming", "true");

  console.log(
    "\n✅ Cache setup complete! Page warming will run after deployment."
  );
} catch (error) {
  console.error("❌ Error setting up cache:", error.message);
  // Don't fail the build if caching fails
  console.log("Continuing with deployment despite caching error...");
}
