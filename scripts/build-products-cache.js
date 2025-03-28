// scripts/build-products-cache.js
require("dotenv").config();
const fetch = require("node-fetch");

// Check if running in build mode with product limit
const isBuildMode =
  process.argv.includes("--build-mode") ||
  process.env.LIMIT_PRODUCTS === "true";

const maxProducts = isBuildMode
  ? parseInt(process.env.MAX_PRODUCTS || "2000", 10) // Increase default limit
  : null; // No limit when not in build mode

// Configuration
const CONFIG = {
  // GraphQL endpoint for WooCommerce
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL,
  // Secret token for revalidation
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
  // How many products to fetch per batch
  BATCH_SIZE: isBuildMode ? 10 : 5,
  // Delay between batches (in ms)
  BATCH_DELAY: isBuildMode ? 500 : 1000,
  // Are we limiting products for build mode?
  IS_BUILD_MODE: isBuildMode,
  // Maximum products to fetch in build mode
  MAX_PRODUCTS: maxProducts,
};

// GraphQL query to fetch products with search-relevant fields
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
        # Use fragments for specific product types
        ... on SimpleProduct {
          price
          regularPrice
          salePrice
          stockStatus
          stockQuantity
          onSale
        }
        ... on VariableProduct {
          price
          regularPrice
          salePrice
          stockStatus
          stockQuantity
          onSale
        }
        ... on ExternalProduct {
          price
          regularPrice
          salePrice
          externalUrl
        }
        # Add any other product types you need
        image {
          sourceUrl
          altText
        }
      }
    }
  }
`;

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch products from the GraphQL API
 */
async function fetchProducts() {
  console.log(
    `Starting to fetch products${CONFIG.IS_BUILD_MODE ? " (BUILD MODE - LIMITED)" : ""}...`
  );
  if (CONFIG.IS_BUILD_MODE) {
    console.log(`Limited to ${CONFIG.MAX_PRODUCTS} products for build mode`);
  }

  let allProducts = [];
  let hasNextPage = true;
  let endCursor = null;
  let batchCount = 0;

  while (hasNextPage) {
    batchCount++;
    console.log(
      `Fetching batch ${batchCount} of products with cursor: ${endCursor || "Start"}`
    );

    // Check if we've reached the limit for build mode
    if (CONFIG.IS_BUILD_MODE && allProducts.length >= CONFIG.MAX_PRODUCTS) {
      console.log(
        `Reached build mode limit of ${CONFIG.MAX_PRODUCTS} products. Stopping fetch.`
      );
      break;
    }

    try {
      const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: CONFIG.BATCH_SIZE,
            after: endCursor,
            // In build mode, prioritize recent and popular products
            orderby: CONFIG.IS_BUILD_MODE ? "RATING" : "DATE",
            order: "DESC",
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        console.error("GraphQL errors:", result.errors);
        break;
      }

      const products = result.data.products.nodes;
      allProducts = [...allProducts, ...products];

      hasNextPage = result.data.products.pageInfo.hasNextPage;
      endCursor = result.data.products.pageInfo.endCursor;

      console.log(
        `Fetched ${products.length} products. Running total: ${allProducts.length}`
      );

      // If we're in build mode and have enough products, stop fetching
      if (CONFIG.IS_BUILD_MODE && allProducts.length >= CONFIG.MAX_PRODUCTS) {
        console.log(
          `Reached build mode limit of ${CONFIG.MAX_PRODUCTS} products. Stopping fetch.`
        );
        break;
      }

      // Add delay between batches to avoid overwhelming the server
      if (hasNextPage) {
        console.log(`Waiting ${CONFIG.BATCH_DELAY}ms before next batch...`);
        await delay(CONFIG.BATCH_DELAY);
      }
    } catch (error) {
      console.error("Error fetching products batch:", error);
      // Try to continue with the next batch
      if (hasNextPage && endCursor) {
        console.log("Attempting to continue with next batch...");
        await delay(CONFIG.BATCH_DELAY * 2);
      } else {
        break;
      }
    }
  }

  // If we're in build mode and have more products than the limit, trim the array
  if (CONFIG.IS_BUILD_MODE && allProducts.length > CONFIG.MAX_PRODUCTS) {
    allProducts = allProducts.slice(0, CONFIG.MAX_PRODUCTS);
    console.log(
      `Trimmed products array to ${CONFIG.MAX_PRODUCTS} for build mode`
    );
  }

  console.log(`Finished fetching products. Total: ${allProducts.length}`);
  return allProducts;
}

/**
 * Store products in cache for searching
 */
/**
 * Store products in cache for searching
 */
async function storeProductsInCache(products) {
  console.log(`Storing ${products.length} products in search cache...`);

  try {
    // For local development, write to a file instead of calling API
    const fs = require("fs");
    const path = require("path");

    // Create the .nuxt/cache directory if it doesn't exist
    const cacheDir = path.join(process.cwd(), ".nuxt", "cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Write the products to a file
    fs.writeFileSync(
      path.join(cacheDir, "cached-products.json"),
      JSON.stringify(products, null, 2)
    );

    console.log(
      `Successfully stored ${products.length} products in local cache file`
    );

    // If we're running in a development environment, also try to store in API
    // but only for testing that the API works - don't fail if it doesn't
    if (process.env.NODE_ENV === "development" && CONFIG.FRONTEND_URL) {
      try {
        // Create custom agent that ignores SSL errors for local development
        const https = require("https");
        const agent = new https.Agent({
          rejectUnauthorized: false, // Disable certificate verification
        });

        console.log("Testing API endpoint (with SSL verification disabled)...");

        const response = await fetch(
          `${CONFIG.FRONTEND_URL}/api/cache-products`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              secret: CONFIG.REVALIDATION_SECRET,
              products: products.slice(0, 5), // Just send a few products as a test
              buildMode: true,
            }),
            agent: CONFIG.FRONTEND_URL.startsWith("https") ? agent : undefined,
          }
        );

        const result = await response.json();
        console.log("API test result:", result);
      } catch (apiError) {
        console.log(
          "API test failed (expected in development):",
          apiError.message
        );
        console.log(
          "This is normal in development if the API endpoint is not running."
        );
      }
    }

    return true;
  } catch (error) {
    console.error("Error storing products in cache:", error);
    return false;
  }
}

/**
 * Main function
 */
// In the main function
async function main() {
  console.log(
    `Starting products cache builder${CONFIG.IS_BUILD_MODE ? " (BUILD MODE)" : ""}...`
  );

  if (CONFIG.IS_BUILD_MODE) {
    console.log(`Limited to ${CONFIG.MAX_PRODUCTS} products for build mode`);
  }

  try {
    // Fetch products
    const products = await fetchProducts();

    if (products.length === 0) {
      console.error(
        "No products fetched. Check your GraphQL endpoint configuration."
      );
      process.exit(1);
    }

    // Store products in cache
    const success = await storeProductsInCache(products);

    if (success) {
      console.log(
        `Successfully cached ${products.length} products for search.`
      );
    } else {
      console.error("Failed to cache products for search.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error in products cache builder:", error);
    process.exit(1);
  }
}

// Run the main function
main();
