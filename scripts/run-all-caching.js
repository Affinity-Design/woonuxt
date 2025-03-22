// scripts/run-all-caching.js
require("dotenv").config();
const { execSync } = require("child_process");

console.log("Starting complete caching process...");

console.log("\n---- BUILDING PRODUCT SEARCH CACHE ----");
execSync("node scripts/build-products-cache.js", { stdio: "inherit" });

console.log("\n---- WARMING PAGE CACHE ----");
execSync("node scripts/cache-warmer.js all", { stdio: "inherit" });

console.log("\nAll caching processes completed successfully!");
