// scripts/debug-cache.js
require("dotenv").config(); // Load .env variables
const fetch = require("node-fetch");

// Configuration
const CONFIG = {
  // Base URL of your Nuxt app where internal APIs are hosted
  NUXT_APP_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  // Shared secret for API authentication
  INTERNAL_API_SECRET: process.env.REVALIDATION_SECRET,
  // Keys used in KV (and thus in API paths)
  PRODUCTS_KEY: "products-list",
  CATEGORIES_KEY: "categories-list",
  STATE_KEY: "cache-warmer-state",
};

// Helper function to make authenticated API calls
async function fetchFromApi(keyName) {
  const url = `${CONFIG.NUXT_APP_URL}/api/internal/script-storage/${keyName}`;
  console.log(`Fetching ${keyName} from: ${url}`);

  if (!CONFIG.INTERNAL_API_SECRET) {
    console.error(
      `ERROR: INTERNAL_API_SECRET (REVALIDATION_SECRET) is not set. Cannot authenticate API call to fetch ${keyName}.`
    );
    return null;
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      "x-internal-secret": CONFIG.INTERNAL_API_SECRET,
    };
    const response = await fetch(url, { method: "GET", headers });

    if (response.status === 401) {
      console.error(
        `ERROR: Unauthorized (401) when fetching ${keyName}. Check if REVALIDATION_SECRET is correct and matches the one used by the API routes.`
      );
      return null;
    }
    if (response.status === 404 || response.status === 204) {
      console.log(`INFO: No data found for ${keyName} (404/204).`);
      return null; // Or an empty object/array as appropriate for the key
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `ERROR: Failed to fetch ${keyName}: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    const data = await response.json();
    console.log(`Successfully fetched ${keyName}.`);
    return data;
  } catch (error) {
    console.error(
      `ERROR: Network or parsing error while fetching ${keyName}:`,
      error.message
    );
    return null;
  }
}

async function debugCache() {
  console.log("=== CACHE DEBUG (Fetching from API/KV) ===");

  if (!CONFIG.INTERNAL_API_SECRET) {
    console.warn(
      "WARNING: REVALIDATION_SECRET is not set in environment variables. API calls will fail if the endpoints are secured."
    );
  }

  // Debug Products List
  console.log("\n--- Debugging Products List ---");
  const products = await fetchFromApi(CONFIG.PRODUCTS_KEY);
  if (products) {
    if (Array.isArray(products)) {
      console.log(`Total products in KV: ${products.length}`);
      if (products.length > 0) {
        console.log("First 3 products (preview):");
        products.slice(0, 3).forEach((product, index) => {
          console.log(
            `${index + 1}. ID: ${product.databaseId || product.id || "N/A"}, Name: ${product.name || product.slug || "N/A"}`
          );
        });
      }
    } else {
      console.log("Products data from KV is not an array:", products);
    }
  } else {
    console.log("Could not retrieve products list from KV.");
  }

  // Debug Categories List
  console.log("\n--- Debugging Categories List ---");
  const categories = await fetchFromApi(CONFIG.CATEGORIES_KEY);
  if (categories) {
    if (Array.isArray(categories)) {
      console.log(`Total categories in KV: ${categories.length}`);
      if (categories.length > 0) {
        console.log("First 3 categories (preview):");
        categories.slice(0, 3).forEach((category, index) => {
          console.log(
            `${index + 1}. ID: ${category.databaseId || category.id || "N/A"}, Name: ${category.name || category.slug || "N/A"}`
          );
        });
      }
    } else {
      console.log("Categories data from KV is not an array:", categories);
    }
  } else {
    console.log("Could not retrieve categories list from KV.");
  }

  // Debug Cache Warmer State
  console.log("\n--- Debugging Cache Warmer State ---");
  const state = await fetchFromApi(CONFIG.STATE_KEY);
  if (state) {
    console.log("Cache Warmer State from KV:", JSON.stringify(state, null, 2));
    // You can add more specific checks here, e.g.:
    // console.log("Last Run:", state.lastRun);
    // console.log("Processed Products Count:", state.processedProducts ? state.processedProducts.length : 0);
    // console.log("Completed Products:", state.completedProducts);
  } else {
    console.log("Could not retrieve cache warmer state from KV.");
  }

  console.log("\n=== CACHE DEBUG FINISHED ===");
}

// Run the debug function
debugCache().catch((error) => {
  console.error("Unhandled error in debugCache:", error);
});
