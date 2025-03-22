// scripts/identify-failed-products.js
const fs = require("fs");

// Load the state file
const state = JSON.parse(fs.readFileSync(".cache-warmer-state.json", "utf8"));

// Calculate missing product IDs
const processedCount = state.processedProducts.length;
const totalProductsCount = 1681; // Update with your total from the logs

console.log(`Processed products: ${processedCount}`);
console.log(`Missing products: ${totalProductsCount - processedCount}`);

// Optionally reset completion flag to force reprocessing
state.completedProducts = false;

// Save the modified state
fs.writeFileSync(".cache-warmer-state.json", JSON.stringify(state, null, 2));

console.log(
  'State updated. Run "npm run warm-cache products" to process missing products.'
);
