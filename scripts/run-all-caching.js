// scripts/run-all-caching.js
require("dotenv").config(); // Ensure .env variables are loaded
const { execSync } = require("child_process");

console.log("🚀 Starting comprehensive cache warming process...");
console.log(
  "   This script will trigger cache-warmer.js with various arguments."
);
console.log(
  "   Ensure FRONTEND_URL and REVALIDATION_SECRET environment variables are set,"
);
console.log(
  "   as cache-warmer.js relies on them for API calls and warming targets."
);

// Check for essential environment variables needed by cache-warmer.js
if (!process.env.FRONTEND_URL) {
  console.warn(
    "⚠️ WARNING: FRONTEND_URL is not set. Cache warming might target an incorrect URL or fail API calls."
  );
}
if (!process.env.REVALIDATION_SECRET) {
  console.warn(
    "⚠️ WARNING: REVALIDATION_SECRET is not set. API calls within cache-warmer.js might fail if endpoints are secured."
  );
}

// The build-products-cache.js and build-categories-cache.js scripts
// are now executed during the build phase by setup-script.js to populate KV directly.
// They are no longer run here.

// Step 1: Warm product pages using cache-warmer.js
try {
  console.log("\n---- WARMING PRODUCT PAGES (via cache-warmer.js) ----");
  // The 'products' argument tells cache-warmer.js to focus on product URLs.
  // It will fetch the product list from KV (via API) and manage its state in KV (via API).
  execSync("node scripts/cache-warmer.js products", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("✅ Product pages warming initiated.");
} catch (error) {
  console.error("❌ Error during product pages warming:", error.message);
  // Decide if you want to stop the whole script or continue
  // process.exit(1);
}

// Step 2: Warm category pages using cache-warmer.js
try {
  console.log("\n---- WARMING CATEGORY PAGES (via cache-warmer.js) ----");
  // The 'categories' argument tells cache-warmer.js to focus on category URLs.
  execSync("node scripts/cache-warmer.js categories", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("✅ Category pages warming initiated.");
} catch (error) {
  console.error("❌ Error during category pages warming:", error.message);
  // process.exit(1);
}

// Step 3: Warm homepage (and potentially other critical static pages defined within cache-warmer.js)
try {
  console.log(
    "\n---- WARMING HOMEPAGE & CRITICAL PAGES (via cache-warmer.js) ----"
  );
  // The 'home' argument can be used by cache-warmer.js to target the homepage.
  execSync("node scripts/cache-warmer.js home", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("✅ Homepage and critical pages warming initiated.");
} catch (error) {
  console.error(
    "❌ Error during homepage/critical pages warming:",
    error.message
  );
  // process.exit(1);
}

// Optional: A full 'all' run if you want to ensure everything is covered
// This might be redundant if 'products', 'categories', and 'home' cover all necessary aspects.
// try {
//   console.log("\n---- EXECUTING FULL 'ALL' WARMING (via cache-warmer.js) ----");
//   execSync("node scripts/cache-warmer.js all --force", { stdio: "inherit", env: process.env }); // Example with --force
//   console.log("✅ Full 'all' warming initiated.");
// } catch (error) {
//   console.error("❌ Error during full 'all' warming:", error.message);
// }

console.log("\n🏁 All configured cache warming processes have been initiated.");
console.log(
  "   Each 'cache-warmer.js' instance will manage its progress independently using KV storage."
);
