// scripts/debug-cache.js
const fs = require("fs");
const path = require("path");

function debugCache() {
  const possibleCachePaths = [
    path.join(process.cwd(), ".cache", "cached-products.json"),
    path.join(process.cwd(), "cache", "cached-products.json"),
    path.join(process.cwd(), ".nuxt", "cache", "cached-products.json"),
    path.join(process.cwd(), "cached-products.json"),
  ];

  console.log("=== CACHE DEBUG ===");

  possibleCachePaths.forEach((cachePath) => {
    try {
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        console.log(`Cache found at: ${cachePath}`);
        console.log(`Total products in cache: ${cache.length}`);

        // Optional: Log first few product names or IDs
        console.log("First 5 products:");
        cache.slice(0, 5).forEach((product, index) => {
          console.log(
            `${index + 1}. ${product.name || product.slug || JSON.stringify(product)}`
          );
        });
      }
    } catch (error) {
      console.log(`Error reading cache at ${cachePath}:`, error.message);
    }
  });

  // State file check
  const stateFilePath = path.join(process.cwd(), ".cache-warmer-state.json");
  try {
    const state = JSON.parse(fs.readFileSync(stateFilePath, "utf8"));
    console.log("\n=== STATE FILE ===");
    console.log("Processed Products:", state.processedProducts.length);
    console.log("Completed Products:", state.completedProducts);
    console.log("Products Cursor:", state.productsCursor);
  } catch (error) {
    console.error("Error reading state file:", error.message);
  }
}

debugCache();
