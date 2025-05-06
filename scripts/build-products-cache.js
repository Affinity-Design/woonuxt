// scripts/build-products-cache.js
require("dotenv").config();
const fetch = require("node-fetch"); // Make sure node-fetch is in your package.json devDependencies
const fs = require("fs"); // Retained for potential local debugging, not primary storage
const path = require("path");

// Check if running in build mode with product limit
const isBuildMode =
  process.argv.includes("--build-mode") ||
  process.env.LIMIT_PRODUCTS === "true";

const maxProducts = isBuildMode
  ? parseInt(process.env.MAX_PRODUCTS || "2000", 10)
  : null;

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 10,
  BATCH_DELAY: 500,
  IS_BUILD_MODE: isBuildMode,
  MAX_PRODUCTS: maxProducts,
  // Cloudflare API Details (from environment variables)
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA, // Specific KV namespace for script data
  KV_KEY_PRODUCTS: "products-list", // The key to use in KV for storing products
};

// GraphQL query to fetch products
const PRODUCTS_QUERY = `
query GetProductsForSearch($first: Int!, $after: String, $orderby: ProductsOrderByEnum = DATE, $order: OrderEnum = DESC) {
  products(first: $first, after: $after, where: {orderby: {field: $orderby, order: $order}}) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      databaseId
      name
      slug
      sku
      shortDescription
      productCategories {
        nodes {
          name
          slug
        }
      }
      ... on SimpleProduct {
        price(format: RAW)
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
      }
      ... on VariableProduct {
        price(format: RAW)
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
      }
      # Add other product types if necessary
    }
  }
}`;

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch products from the GraphQL API
 */
async function fetchProducts() {
  console.log(
    `Starting to fetch products from GraphQL${CONFIG.IS_BUILD_MODE ? " (BUILD MODE - LIMITED)" : ""}...`
  );
  if (CONFIG.IS_BUILD_MODE && CONFIG.MAX_PRODUCTS !== null) {
    console.log(`Limited to a maximum of ${CONFIG.MAX_PRODUCTS} products.`);
  }
  if (!CONFIG.WP_GRAPHQL_URL) {
    console.error("GQL_HOST is not defined. Skipping product fetch.");
    return [];
  }

  let allProducts = [];
  let hasNextPage = true;
  let endCursor = null;
  let batchCount = 0;

  while (hasNextPage) {
    batchCount++;
    console.log(
      `Fetching product batch ${batchCount} with cursor: ${endCursor || "Start"}`
    );

    if (
      CONFIG.IS_BUILD_MODE &&
      CONFIG.MAX_PRODUCTS !== null &&
      allProducts.length >= CONFIG.MAX_PRODUCTS
    ) {
      console.log(
        `Reached build mode limit of ${CONFIG.MAX_PRODUCTS} products. Stopping fetch.`
      );
      break;
    }

    try {
      const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: CONFIG.BATCH_SIZE,
            after: endCursor,
            orderby: "DATE",
            order: "DESC",
          },
        }),
      });

      if (!response.ok) {
        console.error(
          `Error fetching products batch: ${response.status} ${response.statusText}`
        );
        const errorBody = await response
          .text()
          .catch(() => "Could not read error body.");
        console.error("Response body:", errorBody);
        break;
      }

      const result = await response.json();
      if (result.errors) {
        console.error("GraphQL errors:", result.errors);
        break;
      }
      if (
        !result.data ||
        !result.data.products ||
        !result.data.products.nodes ||
        !result.data.products.pageInfo
      ) {
        console.error(
          "Unexpected data structure from GraphQL:",
          JSON.stringify(result, null, 2)
        );
        break;
      }

      const fetchedProducts = result.data.products.nodes;
      const numFetched = fetchedProducts.length;

      if (
        CONFIG.IS_BUILD_MODE &&
        CONFIG.MAX_PRODUCTS !== null &&
        allProducts.length + numFetched > CONFIG.MAX_PRODUCTS
      ) {
        const limit = CONFIG.MAX_PRODUCTS - allProducts.length;
        allProducts.push(...fetchedProducts.slice(0, limit));
        console.log(
          `Fetched ${limit} products (hit limit). Total: ${allProducts.length}.`
        );
        hasNextPage = false; // Reached max products for build mode
      } else {
        allProducts.push(...fetchedProducts);
        console.log(
          `Fetched ${numFetched} products. Total: ${allProducts.length}.`
        );
      }

      if (hasNextPage) {
        // Only update if we haven't manually stopped
        hasNextPage = result.data.products.pageInfo.hasNextPage;
        endCursor = result.data.products.pageInfo.endCursor;
      }

      if (hasNextPage && CONFIG.BATCH_DELAY > 0) {
        console.log(`Waiting ${CONFIG.BATCH_DELAY}ms before next batch...`);
        await delay(CONFIG.BATCH_DELAY);
      }
    } catch (error) {
      console.error("Error during product fetch operation:", error);
      break;
    }
  }
  console.log(
    `Finished fetching products. Total collected: ${allProducts.length}`
  );
  return allProducts;
}

/**
 * Store products directly into Cloudflare KV
 */
async function storeProductsInKV(products) {
  console.log(`Storing ${products.length} products in Cloudflare KV...`);

  if (
    !CONFIG.CF_ACCOUNT_ID ||
    !CONFIG.CF_API_TOKEN ||
    !CONFIG.CF_KV_NAMESPACE_ID
  ) {
    console.error(
      "Cloudflare API credentials or KV Namespace ID are not configured. Skipping KV store."
    );
    console.error(
      "Please set CF_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID_SCRIPT_DATA environment variables."
    );
    return false;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_PRODUCTS}`;

  try {
    // Cloudflare KV has a 25 MiB limit per value.
    // If your products list is very large, you might need to chunk it.
    // For now, assuming it fits. If not, this will fail.
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        "Content-Type": "application/json", // KV expects the value to be a string for JSON
      },
      body: JSON.stringify(products), // Send the array as a JSON string
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.success) {
      console.error(
        `Error storing products in KV: ${response.status} ${response.statusText}`
      );
      console.error("Cloudflare API response:", responseData);
      // Log the first few characters of the body if it's large to avoid flooding logs
      const bodyPreview = JSON.stringify(products).substring(0, 200);
      console.error(
        "Attempted to store body (preview):",
        bodyPreview + (JSON.stringify(products).length > 200 ? "..." : "")
      );
      return false;
    }

    console.log(
      `Successfully stored ${products.length} products in KV under key "${CONFIG.KV_KEY_PRODUCTS}".`
    );
    return true;
  } catch (error) {
    console.error(
      `Error making API call to Cloudflare KV for products:`,
      error
    );
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log(
    `Starting products data build process${CONFIG.IS_BUILD_MODE ? " (BUILD MODE)" : ""}...`
  );

  const products = await fetchProducts();

  if (!products || products.length === 0) {
    console.warn("No products fetched or an error occurred during fetch.");
    // Attempt to store an empty array in KV to clear previous data or indicate no products
    console.log("Attempting to store empty products list in KV...");
    const success = await storeProductsInKV([]);
    if (!success) {
      console.error(
        "Failed to store empty products list in KV. This might be a critical error."
      );
      process.exit(1); // Exit if storing even an empty list fails
    }
  } else {
    const success = await storeProductsInKV(products);
    if (!success) {
      console.error("Failed to store products in Cloudflare KV.");
      process.exit(1); // Exit if storing fetched products fails
    }
  }
  console.log("Products data build process finished.");
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error in products build main function:", error);
  process.exit(1);
});
