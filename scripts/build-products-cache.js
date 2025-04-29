// scripts/build-products-cache.js
require("dotenv").config();
const fetch = require("node-fetch");
const fs = require("fs"); // Using synchronous fs for simplicity in build script
const path = require("path");

// Check if running in build mode with product limit
const isBuildMode =
  process.argv.includes("--build-mode") ||
  process.env.LIMIT_PRODUCTS === "true";

const maxProducts = isBuildMode
  ? parseInt(process.env.MAX_PRODUCTS || "2000", 10) // Default limit for build mode
  : null; // No limit when not in build mode

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 10,
  BATCH_DELAY: 500,
  IS_BUILD_MODE: isBuildMode,
  MAX_PRODUCTS: maxProducts,
  // --- START: New output path configuration ---
  OUTPUT_DIR: path.join(process.cwd(), ".output", "public", "_script_data"),
  OUTPUT_FILE: "products.json",
  // --- END: New output path configuration ---
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
        price(format: RAW) # Request raw price
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
      }
      ... on VariableProduct {
        price(format: RAW) # Request raw price
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
        # Include variations if needed for search/display later
        # variations {
        #   nodes {
        #     databaseId
        #     name
        #     sku
        #     price(format: RAW)
        #     regularPrice(format: RAW)
        #     salePrice(format: RAW)
        #     stockStatus
        #     stockQuantity
        #     manageStock
        #     attributes {
        #       nodes {
        #         name
        #         value
        #       }
        #     }
        #   }
        # }
      }
      # Add other product types if necessary (e.g., ExternalProduct, GroupProduct)
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: CONFIG.BATCH_SIZE,
            after: endCursor,
            // In build mode, prioritize recent products if desired, otherwise by DATE
            orderby: CONFIG.IS_BUILD_MODE ? "DATE" : "DATE", // Example: Use DATE for both, adjust if needed
            order: "DESC",
          },
        }),
      });

      // Check for non-OK response status
      if (!response.ok) {
        console.error(
          `Error fetching products batch: ${response.status} ${response.statusText}`
        );
        try {
          const errorBody = await response.text();
          console.error("Response body:", errorBody);
        } catch (e) {
          console.error("Could not read error response body.");
        }
        // Decide how to handle batch errors: break, retry, or skip? Breaking for now.
        break;
      }

      const result = await response.json();

      if (result.errors) {
        console.error("GraphQL errors:", result.errors);
        break; // Stop fetching if there are GraphQL errors
      }

      // Check for expected data structure
      if (
        !result ||
        !result.data ||
        !result.data.products ||
        !result.data.products.nodes ||
        !result.data.products.pageInfo
      ) {
        console.error(
          "Unexpected data structure received from GraphQL:",
          JSON.stringify(result, null, 2)
        );
        break; // Stop if the structure is wrong
      }

      const products = result.data.products.nodes;
      const fetchedCount = products.length;
      const potentialTotal = allProducts.length + fetchedCount;

      // If in build mode, check if adding this batch exceeds the limit
      if (
        CONFIG.IS_BUILD_MODE &&
        CONFIG.MAX_PRODUCTS !== null &&
        potentialTotal > CONFIG.MAX_PRODUCTS
      ) {
        const needed = CONFIG.MAX_PRODUCTS - allProducts.length;
        allProducts = [...allProducts, ...products.slice(0, needed)];
        console.log(
          `Fetched ${needed} products (reached limit). Running total: ${allProducts.length}`
        );
        hasNextPage = false; // Stop fetching
      } else {
        allProducts = [...allProducts, ...products];
        console.log(
          `Fetched ${fetchedCount} products. Running total: ${allProducts.length}`
        );
      }

      // Update page info only if we haven't manually stopped
      if (hasNextPage) {
        hasNextPage = result.data.products.pageInfo.hasNextPage;
        endCursor = result.data.products.pageInfo.endCursor;
      }

      // Add delay between batches to avoid overwhelming the server
      if (hasNextPage) {
        console.log(`Waiting ${CONFIG.BATCH_DELAY}ms before next batch...`);
        await delay(CONFIG.BATCH_DELAY);
      }
    } catch (error) {
      console.error("Error during product fetch operation:", error);
      // Decide how to handle: break, retry, or skip? Breaking for now.
      break;
    }
  }

  console.log(`Finished fetching products. Total: ${allProducts.length}`);
  return allProducts;
}

/**
 * Store products in the build output directory
 */
function storeProductsInBuildOutput(products) {
  console.log(`Storing ${products.length} products in build output...`);
  const outputPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_FILE);

  try {
    // Ensure the output directory exists
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
      fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
      console.log(`Created directory: ${CONFIG.OUTPUT_DIR}`);
    }

    // Write the products data to the JSON file
    fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));

    console.log(
      `Successfully stored ${products.length} products to ${outputPath}`
    );
    return true;
  } catch (error) {
    console.error(`Error storing products to ${outputPath}:`, error);
    return false;
  }
}

/**
 * Main function
 */
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

    if (!products || products.length === 0) {
      console.warn(
        "No products fetched or an error occurred. Attempting to write empty file."
      );
      // Write an empty array to ensure the file exists for the later API step
      storeProductsInBuildOutput([]);
      // Decide if you want to exit here or continue. Continuing allows build to finish.
      // process.exit(1); // Uncomment to make build fail if no products are fetched
      console.log("Continuing build with empty products file.");
    } else {
      // Store products in the build output
      const success = storeProductsInBuildOutput(products);

      if (!success) {
        console.error("Failed to store products in build output.");
        process.exit(1); // Exit if writing failed
      }
    }
  } catch (error) {
    console.error("Error in products cache builder main function:", error);
    process.exit(1);
  }
}

// Run the main function
main();
