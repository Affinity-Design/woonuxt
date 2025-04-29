// scripts/build-categories-cache.js
require("dotenv").config();
const fetch = require("node-fetch");
const fs = require("fs"); // Using synchronous fs for simplicity in build script
const path = require("path");

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 50, // Categories are usually fewer than products
  // --- START: New output path configuration ---
  OUTPUT_DIR: path.join(process.cwd(), ".output", "public", "_script_data"),
  OUTPUT_FILE: "categories.json",
  // --- END: New output path configuration ---
};

// GraphQL query for categories with all needed data
const CATEGORIES_QUERY = `
  query getProductCategories($first: Int = 100) {
    productCategories(first: $first, where: { hideEmpty: true }) {
      nodes {
        slug
        databaseId
        name
        description
        count
        image {
          sourceUrl
          altText
        }
        parent {
          node {
            slug
            name
          }
        }
        children {
          nodes {
            slug
            name
            databaseId
          }
        }
      }
    }
  }
`;

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch categories
async function fetchCategories() {
  console.log("Fetching categories...");

  try {
    const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: CATEGORIES_QUERY }),
    });

    // Check for non-OK response status
    if (!response.ok) {
      console.error(
        `Error fetching categories: ${response.status} ${response.statusText}`
      );
      // Attempt to read the body for more details if possible
      try {
        const errorBody = await response.text();
        console.error("Response body:", errorBody);
      } catch (e) {
        console.error("Could not read error response body.");
      }
      return [];
    }

    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return [];
    }

    // Check if the expected data structure exists
    if (
      !data ||
      !data.data ||
      !data.data.productCategories ||
      !data.data.productCategories.nodes
    ) {
      console.error(
        "Unexpected data structure received from GraphQL:",
        JSON.stringify(data, null, 2)
      );
      return [];
    }

    const categories = data.data.productCategories.nodes;
    console.log(`Fetched ${categories.length} categories`);

    return categories;
  } catch (error) {
    console.error("Error during category fetch operation:", error);
    return [];
  }
}

// Store categories in the build output directory
function storeCategoriesInBuildOutput(categories) {
  console.log(`Storing ${categories.length} categories in build output...`);
  const outputPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_FILE);

  try {
    // Ensure the output directory exists
    // The '.output/public' part should be created by Nuxt build,
    // but we ensure our specific '_script_data' subdirectory is there.
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
      fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
      console.log(`Created directory: ${CONFIG.OUTPUT_DIR}`);
    }

    // Write the categories data to the JSON file
    fs.writeFileSync(outputPath, JSON.stringify(categories, null, 2));

    console.log(
      `Successfully stored ${categories.length} categories to ${outputPath}`
    );
    return true;
  } catch (error) {
    console.error(`Error storing categories to ${outputPath}:`, error);
    return false;
  }
}

// Main function
async function main() {
  console.log("Starting category cache builder...");

  try {
    // Fetch categories
    const categories = await fetchCategories();

    if (!categories || categories.length === 0) {
      console.warn(
        "No categories fetched or an error occurred. Attempting to write empty file."
      );
      // Write an empty array to ensure the file exists for the later API step
      storeCategoriesInBuildOutput([]);
      // Decide if you want to exit here or continue. Continuing allows build to finish.
      // process.exit(1); // Uncomment to make build fail if no categories are fetched
      console.log("Continuing build with empty categories file.");
    } else {
      // Store categories in the build output
      const success = storeCategoriesInBuildOutput(categories);

      if (!success) {
        console.error("Failed to store categories in build output.");
        process.exit(1); // Exit if writing failed
      }
    }
  } catch (error) {
    console.error("Error in category cache builder main function:", error);
    process.exit(1);
  }
}

// Run the main function
main();
