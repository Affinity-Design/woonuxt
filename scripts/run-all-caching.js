// scripts/run-all-caching.js
require("dotenv").config();
const { execSync } = require("child_process");

console.log("Starting complete caching process...");

// Step 1: Build product cache
console.log("\n---- BUILDING PRODUCT CACHE ----");
execSync("node scripts/build-products-cache.js", { stdio: "inherit" });

// Step 2: Build category cache
console.log("\n---- BUILDING CATEGORY CACHE ----");
execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });

// Step 3: Warm product pages
console.log("\n---- WARMING PRODUCT PAGES ----");
execSync("node scripts/cache-warmer.js products", { stdio: "inherit" });

// Step 4: Warm category pages
console.log("\n---- WARMING CATEGORY PAGES ----");
execSync("node scripts/cache-warmer.js categories", { stdio: "inherit" });

// Step 5: Warm homepage and other critical pages
console.log("\n---- WARMING HOMEPAGE AND CRITICAL PAGES ----");
execSync("node scripts/cache-warmer.js home", { stdio: "inherit" });

console.log("\nAll caching processes completed successfully!");
console.log("Cache summary:");
console.log("- Product data cached for search and browsing");
console.log("- Category data cached for navigation");
console.log("- HTML pages pre-rendered for fast loading");
console.log("- Homepage and critical pages warmed");
