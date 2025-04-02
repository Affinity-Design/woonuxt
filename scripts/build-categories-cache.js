// scripts/build-categories-cache.js
require("dotenv").config();
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 50, // Categories are usually fewer than products
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

    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return [];
    }

    const categories = data.data.productCategories.nodes;
    console.log(`Fetched ${categories.length} categories`);

    return categories;
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

// Store categories in cache
async function storeCategoriesInCache(categories) {
  console.log(`Storing ${categories.length} categories in cache...`);

  // Create cache directory
  const cacheDir = path.join(process.cwd(), ".nuxt", "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Store categories in cache
  fs.writeFileSync(
    path.join(cacheDir, "cached-categories.json"),
    JSON.stringify(categories, null, 2)
  );

  console.log(`Successfully stored ${categories.length} categories in cache`);
  return true;
}

// Main function
async function main() {
  console.log("Starting category cache builder...");

  try {
    // Fetch categories
    const categories = await fetchCategories();

    if (categories.length === 0) {
      console.error("No categories fetched");
      process.exit(1);
    }

    // Store categories in cache
    const success = await storeCategoriesInCache(categories);

    if (success) {
      console.log(`Successfully cached ${categories.length} categories`);
    } else {
      console.error("Failed to cache categories");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error in category cache builder:", error);
    process.exit(1);
  }
}

// Run the main function
main();
