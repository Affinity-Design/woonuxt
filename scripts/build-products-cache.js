// scripts/build-products-cache.js
require("dotenv").config();
const fetch = require("node-fetch");
// fs and path are no longer needed here as we write directly to KV
// const fs = require("fs");
// const path = require("path");

// Check if running in build mode with product limit
const isBuildMode =
  process.argv.includes("--build-mode") ||
  process.env.LIMIT_PRODUCTS === "true";

const maxProducts = isBuildMode
  ? parseInt(process.env.MAX_PRODUCTS || "2000", 10)
  : null;

// --- Get Build-Time Exchange Rate ---
const BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD = parseFloat(
  process.env.NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE
);
if (
  isNaN(BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD) ||
  BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD <= 0
) {
  console.warn(
    "WARNING: NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE is not a valid positive number. Prices will not be converted to CAD in the build script.",
    `Current value: ${process.env.NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE}`
  );
  // Fallback to 1.0 (no conversion) if not set or invalid, to prevent crashes,
  // or you could choose to make the build fail by process.exit(1)
  // For now, let's proceed without conversion if rate is invalid, prices will remain USD.
}

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 10,
  BATCH_DELAY: 500,
  IS_BUILD_MODE: isBuildMode,
  MAX_PRODUCTS: maxProducts,
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA,
  KV_KEY_PRODUCTS: "products-list",
};

// GraphQL query to fetch products (ensure price, regularPrice, salePrice are fetched)
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
        price(format: RAW)       # Expecting raw numeric string e.g., "50.00"
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
        image {
          sourceUrl(size: WOOCOMMERCE_THUMBNAIL) # Use a consistent size
          altText
          title
        }
      }
      ... on VariableProduct {
        price(format: RAW)       # This is often a range or lowest price for variables
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
        image {
          sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
          altText
          title
        }
        # Variations are not fetched here, so their prices aren't converted by this script
        # If variations need converted prices in the KV store, the query must include them.
      }
    }
  }
}
fragment Image on MediaItem { sourceUrl altText title databaseId }`;

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Price Conversion Helper ---
/**
 * Converts a USD price string to a CAD price string using the build-time rate.
 * Applies specific rounding: rounds up cents to .99.
 * @param {string | null | undefined} usdPriceString - The USD price as a string (e.g., "55.99").
 * @param {number} exchangeRate - The USD to CAD exchange rate.
 * @returns {string | null} The CAD price as a string (e.g., "75.99"), or null if input is invalid.
 */
function convertUsdToCadWithRounding(usdPriceString, exchangeRate) {
  if (
    usdPriceString === null ||
    usdPriceString === undefined ||
    typeof usdPriceString !== "string" ||
    usdPriceString.trim() === ""
  ) {
    return null; // Cannot convert null, undefined, or empty strings
  }

  // Handle comma-separated prices if GQL_RAW doesn't always give a single number
  // For variable products, price(format: RAW) might still be a range like "50.00 - 70.00"
  // or just the lowest price. This function assumes a single numeric input for now.
  // If ranges need conversion, this function needs to be more complex or called for each part of the range.
  // Let's assume for this script, we are converting the primary 'price' field which should be singular.

  let priceToConvert = usdPriceString;
  if (priceToConvert.includes(",")) {
    // Take first if comma-separated
    priceToConvert = priceToConvert.split(",")[0].trim();
  }
  // Further clean potential non-numeric characters, though RAW format should be clean
  priceToConvert = priceToConvert.replace(/[^0-9.-]+/g, "");

  const numericUsdPrice = parseFloat(priceToConvert);
  if (isNaN(numericUsdPrice)) {
    // console.warn(`Could not parse USD price for conversion: "${usdPriceString}" (cleaned: "${priceToConvert}")`);
    return null; // Return null if not a valid number
  }

  if (isNaN(exchangeRate) || exchangeRate <= 0) {
    // If exchange rate is invalid, return original numeric price string (effectively no conversion)
    // console.warn(`Invalid exchange rate (${exchangeRate}), returning original price for "${numericUsdPrice.toFixed(2)}"`);
    return numericUsdPrice.toFixed(2);
  }

  const convertedValue = numericUsdPrice * exchangeRate;
  const dollars = Math.floor(convertedValue);
  const finalCadValue = dollars + 0.99;

  return finalCadValue.toFixed(2); // Return as string e.g., "75.99"
}

async function fetchAndProcessProducts() {
  console.log(
    `Starting to fetch products from GraphQL${CONFIG.IS_BUILD_MODE ? " (BUILD MODE - LIMITED)" : ""}...`
  );
  // ... (existing fetchProducts setup: GQL_HOST check, allProducts array, etc.) ...
  let allProducts = [];
  let hasNextPage = true;
  let endCursor = null;
  let batchCount = 0;

  if (!CONFIG.WP_GRAPHQL_URL) {
    console.error("GQL_HOST is not defined. Skipping product fetch.");
    return [];
  }

  while (hasNextPage) {
    batchCount++;
    console.log(
      `Workspaceing product batch ${batchCount}, cursor: ${endCursor || "Start"}`
    );
    if (
      CONFIG.IS_BUILD_MODE &&
      CONFIG.MAX_PRODUCTS !== null &&
      allProducts.length >= CONFIG.MAX_PRODUCTS
    ) {
      console.log(
        `Reached build mode limit of ${CONFIG.MAX_PRODUCTS}. Stopping fetch.`
      );
      break;
    }

    try {
      const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
        /* ... (existing fetch options) ... */
      });
      // ... (existing response handling and error checking) ...
      const result = await response.json(); // Assuming response.ok check is done

      const fetchedNodes = result.data?.products?.nodes || [];

      // --- Convert prices for fetched products ---
      const productsWithCadPrices = fetchedNodes.map((product) => {
        const convertedProduct = { ...product }; // Clone product
        if (
          !isNaN(BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD) &&
          BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD > 0
        ) {
          // Convert price fields if they exist
          if (convertedProduct.price !== undefined) {
            convertedProduct.price = convertUsdToCadWithRounding(
              convertedProduct.price,
              BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD
            );
          }
          if (convertedProduct.regularPrice !== undefined) {
            convertedProduct.regularPrice = convertUsdToCadWithRounding(
              convertedProduct.regularPrice,
              BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD
            );
          }
          if (convertedProduct.salePrice !== undefined) {
            convertedProduct.salePrice = convertUsdToCadWithRounding(
              convertedProduct.salePrice,
              BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD
            );
          }
        }
        // Ensure price fields that became null are explicitly null, not undefined
        if (convertedProduct.price === undefined) convertedProduct.price = null;
        if (convertedProduct.regularPrice === undefined)
          convertedProduct.regularPrice = null;
        if (convertedProduct.salePrice === undefined)
          convertedProduct.salePrice = null;

        return convertedProduct;
      });
      // --- End Price Conversion ---

      // ... (existing logic for limiting products and pagination) ...
      if (
        CONFIG.IS_BUILD_MODE &&
        CONFIG.MAX_PRODUCTS !== null &&
        allProducts.length + productsWithCadPrices.length > CONFIG.MAX_PRODUCTS
      ) {
        const limit = CONFIG.MAX_PRODUCTS - allProducts.length;
        allProducts.push(...productsWithCadPrices.slice(0, limit));
        console.log(
          `Workspaceed and converted ${limit} products (hit limit). Total: ${allProducts.length}.`
        );
        hasNextPage = false;
      } else {
        allProducts.push(...productsWithCadPrices);
        console.log(
          `Workspaceed and converted ${productsWithCadPrices.length} products. Total: ${allProducts.length}.`
        );
      }

      if (hasNextPage) {
        hasNextPage = result.data.products.pageInfo.hasNextPage;
        endCursor = result.data.products.pageInfo.endCursor;
      }
      if (hasNextPage && CONFIG.BATCH_DELAY > 0)
        await delay(CONFIG.BATCH_DELAY);
    } catch (error) {
      console.error("Error during product fetch/process operation:", error);
      break;
    }
  }
  console.log(
    `Finished fetching & processing products. Total collected: ${allProducts.length}`
  );
  return allProducts;
}

// storeProductsInKV function (remains mostly the same, just receives products with CAD prices)
async function storeProductsInKV(products) {
  // ... (existing KV store logic) ...
  console.log(
    `Storing ${products.length} products (with CAD prices) in Cloudflare KV...`
  );
  // ... (rest of the function)
  if (
    !CONFIG.CF_ACCOUNT_ID ||
    !CONFIG.CF_API_TOKEN ||
    !CONFIG.CF_KV_NAMESPACE_ID
  ) {
    console.error(
      "Cloudflare API credentials for KV not configured. Skipping KV store."
    );
    return false;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_PRODUCTS}`;
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(products),
    });
    const responseData = await response.json();
    if (!response.ok || !responseData.success) {
      console.error(
        `Error storing products in KV: ${response.statusText}`,
        responseData
      );
      return false;
    }
    console.log(`Successfully stored ${products.length} products in KV.`);
    return true;
  } catch (e) {
    console.error("Error making API call to Cloudflare KV:", e);
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
  if (
    isNaN(BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD) ||
    BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD <= 0
  ) {
    console.warn(
      "Build-time exchange rate is invalid or not set. Prices will be stored as fetched (assumed USD)."
    );
  } else {
    console.log(
      `Using build-time USD to CAD exchange rate: ${BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD}`
    );
  }

  const products = await fetchAndProcessProducts(); // Changed to call new function

  if (!products || products.length === 0) {
    console.warn("No products fetched/processed. Storing empty list in KV.");
    await storeProductsInKV([]); // Store empty array to clear if needed
  } else {
    const success = await storeProductsInKV(products);
    if (!success) {
      console.error("Failed to store products in Cloudflare KV.");
      process.exit(1);
    }
  }
  console.log("Products data build process finished.");
}

main().catch((error) => {
  console.error("Unhandled error in products build main function:", error);
  process.exit(1);
});
