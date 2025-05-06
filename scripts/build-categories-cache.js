// scripts/build-categories-cache.js
require("dotenv").config();
const fetch = require("node-fetch"); // Make sure node-fetch is in your package.json devDependencies
const fs = require("fs"); // Retained for potential local debugging if needed, but not for primary storage
const path = require("path");

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 50,
  // Cloudflare API Details (from environment variables)
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA, // Specific KV namespace for script data
  KV_KEY_CATEGORIES: "categories-list", // The key to use in KV for storing categories
};

// GraphQL query for categories
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

// Fetch categories from GraphQL
async function fetchCategories() {
  console.log("Fetching categories from GraphQL...");
  if (!CONFIG.WP_GRAPHQL_URL) {
    console.error("GQL_HOST is not defined. Skipping category fetch.");
    return [];
  }

  try {
    const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: CATEGORIES_QUERY }),
    });

    if (!response.ok) {
      console.error(
        `Error fetching categories: ${response.status} ${response.statusText}`
      );
      const errorBody = await response
        .text()
        .catch(() => "Could not read error body.");
      console.error("Response body:", errorBody);
      return [];
    }

    const data = await response.json();
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return [];
    }
    if (
      !data.data ||
      !data.data.productCategories ||
      !data.data.productCategories.nodes
    ) {
      console.error(
        "Unexpected data structure from GraphQL:",
        JSON.stringify(data, null, 2)
      );
      return [];
    }

    const categories = data.data.productCategories.nodes;
    console.log(`Fetched ${categories.length} categories.`);
    return categories;
  } catch (error) {
    console.error("Error during category fetch operation:", error);
    return [];
  }
}

// Store categories directly into Cloudflare KV
async function storeCategoriesInKV(categories) {
  console.log(`Storing ${categories.length} categories in Cloudflare KV...`);

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

  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_CATEGORIES}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        "Content-Type": "application/json", // Cloudflare KV expects JSON value to be a string
      },
      body: JSON.stringify(categories), // Send the array as a JSON string
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.success) {
      console.error(
        `Error storing categories in KV: ${response.status} ${response.statusText}`
      );
      console.error("Cloudflare API response:", responseData);
      return false;
    }

    console.log(
      `Successfully stored ${categories.length} categories in KV under key "${CONFIG.KV_KEY_CATEGORIES}".`
    );
    return true;
  } catch (error) {
    console.error(
      `Error making API call to Cloudflare KV for categories:`,
      error
    );
    return false;
  }
}

// Main function
async function main() {
  console.log("Starting category data build process...");

  const categories = await fetchCategories();

  if (!categories || categories.length === 0) {
    console.warn("No categories fetched or an error occurred during fetch.");
    // Optionally, you might want to write an empty array to KV to clear previous data
    // or handle this case as an error. For now, we'll attempt to store whatever was fetched (even if empty).
    console.log(
      "Attempting to store empty or partial categories list in KV..."
    );
    const success = await storeCategoriesInKV([]); // Store empty array if nothing fetched
    if (!success) {
      console.error(
        "Failed to store empty categories list in KV. This might be a critical error."
      );
      process.exit(1); // Exit if storing even an empty list fails, as it indicates KV connection issue
    }
  } else {
    const success = await storeCategoriesInKV(categories);
    if (!success) {
      console.error("Failed to store categories in Cloudflare KV.");
      process.exit(1); // Exit if storing fetched categories fails
    }
  }
  console.log("Category data build process finished.");
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error in category build main function:", error);
  process.exit(1);
});
