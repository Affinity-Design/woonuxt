// scripts/cache-warmer.js
require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const https = require("https");
const fetch = require("node-fetch");

async function findMkcertCertificates() {
  const currentDir = process.cwd();
  const possibleCertPaths = [
    path.join(currentDir, "localhost.pem"),
    path.join(currentDir, "localhost-key.pem"),
    path.join(process.env.HOME, ".local/share/mkcert/localhost.pem"),
    path.join(process.env.HOME, ".local/share/mkcert/localhost-key.pem"),
  ];

  const certPath = await Promise.all(
    possibleCertPaths.map(async (p) => {
      try {
        await fs.access(p);
        return p;
      } catch {
        return null;
      }
    })
  ).then((paths) => paths.find((p) => p !== null));

  const keyPath = await Promise.all(
    possibleCertPaths.map(async (p) => {
      try {
        await fs.access(p);
        return p.includes("key") ? p : null;
      } catch {
        return null;
      }
    })
  ).then((paths) => paths.find((p) => p !== null));

  return {
    cert: certPath,
    key: keyPath,
  };
}

// Configuration
const CONFIG = {
  // Base URL for the frontend site
  FRONTEND_URL: process.env.FRONTEND_URL,
  // GraphQL endpoint for WooCommerce
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  // Secret token for revalidation
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
  // Batch size - how many products to process at once
  BATCH_SIZE: 5,
  // Delay between requests in ms
  REQUEST_DELAY: 500,
  // State file to track progress
  STATE_FILE: path.join(__dirname, "../.cache-warmer-state.json"),
  // Types to warm: 'products', 'categories', or 'all'
  TYPE: process.argv[2] || "all",
  // Force refresh existing pages in cache
  FORCE_REFRESH: process.argv.includes("--force"),
};

// GraphQL query for products
const PRODUCTS_QUERY = `
   query getProducts($after: String, $first: Int = 1700) {
    products(
      first: $first
      after: $after
      where: { visibility: VISIBLE, status: "publish" }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        slug
        databaseId  # Kept for tracking processed items
      }
    }
  }

`;

// GraphQL query for categories
const CATEGORIES_QUERY = `
  query getProductCategories($first: Int = 99) {
    productCategories(first: $first, where: { hideEmpty: true }) {
      nodes {
        slug
        databaseId  # Kept for tracking processed items
      }
    }
  }

`;

/**
 * Delay execution
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load the state file or create a new one
 */
async function loadState() {
  try {
    const data = await fs.readFile(CONFIG.STATE_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    // Initialize fresh state
    return {
      lastRun: null,
      productsCursor: null,
      processedProducts: [],
      processedCategories: [],
      completedProducts: false,
      completedCategories: false,
    };
  }
}

/**
 * Save the current state
 */
async function saveState(state) {
  try {
    await fs.writeFile(
      CONFIG.STATE_FILE,
      JSON.stringify(state, null, 2),
      "utf8"
    );
    console.log("State saved successfully");
  } catch (error) {
    console.error("Error saving state:", error);
  }
}

/**
 * Fetch all product slugs in batches
 */
async function getAllProductSlugs(state) {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = state.productsCursor;
  let totalFetched = 0;

  console.log("=== DETAILED PRODUCT FETCH ===");
  console.log(`Starting with cursor: ${cursor || "null"}`);
  console.log(`Existing processed products: ${state.processedProducts.length}`);

  while (hasNextPage) {
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
            after: cursor,
          },
        }),
      });

      const data = await response.json();

      if (data.errors) {
        console.error("GraphQL errors:", data.errors);
        break;
      }

      const products = data.data.products.nodes;

      // Log detailed product information
      console.log("Batch products:");
      products.forEach((product) => {
        console.log(
          `- ${product.name} (ID: ${product.databaseId}, Slug: ${product.slug})`
        );
      });

      allProducts = [...allProducts, ...products];
      totalFetched += products.length;

      hasNextPage = data.data.products.pageInfo.hasNextPage;
      cursor = data.data.products.pageInfo.endCursor;

      console.log(
        `Fetched ${products.length} products. Total so far: ${totalFetched}`
      );

      // Update cursor in state
      state.productsCursor = cursor;
      await saveState(state);

      // Avoid overwhelming the GraphQL server
      await delay(CONFIG.REQUEST_DELAY);

      if (!hasNextPage) {
        console.log("=== PRODUCT FETCH COMPLETE ===");
        console.log(`Total unique products fetched: ${allProducts.length}`);
        console.log(
          `Total product database IDs: ${allProducts.map((p) => p.databaseId)}`
        );

        state.completedProducts = true;
        await saveState(state);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      break;
    }
  }

  return allProducts;
}
/**
 * Fetch all category slugs
 */
async function getAllCategorySlugs() {
  console.log("Fetching categories...");

  try {
    const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: CATEGORIES_QUERY,
      }),
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

/**
 * Warm the cache for a specific URL
 */
async function warmCache(url, type, id) {
  try {
    console.log(`Attempting to warm: ${url}`);

    // Find mkcert certificates
    const { cert, key } = await findMkcertCertificates();
    console.log("Certificates found:", { cert, key });

    // Create a custom HTTPS agent that uses mkcert certificates if available
    const agent = new https.Agent({
      rejectUnauthorized: false,
      ...(cert && key
        ? {
            cert: await fs.readFile(cert),
            key: await fs.readFile(key),
          }
        : {}),
    });

    const fetchOptions = {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Cache Warmer",
      },
      timeout: 10000,
      // Add the custom agent for HTTPS requests
      agent: url.startsWith("https:") ? agent : undefined,
    };

    try {
      const startTime = Date.now();
      const response = await fetch(url, fetchOptions);
      const timeElapsed = Date.now() - startTime;

      console.log(`Fetch response status: ${response.status}`);
      console.log(`Fetch time: ${timeElapsed}ms`);

      if (response.ok) {
        console.log(`✅ ${url} - ${response.status} (${timeElapsed}ms)`);
        return true;
      } else {
        // Try HTTP fallback for localhost
        if (url.startsWith("https://localhost")) {
          const httpUrl = url.replace("https://", "http://");
          console.log(`Attempting HTTP fallback: ${httpUrl}`);

          const httpResponse = await fetch(httpUrl, {
            ...fetchOptions,
            agent: undefined, // Remove HTTPS agent for HTTP
          });

          if (httpResponse.ok) {
            console.log(`✅ HTTP Fallback ${httpUrl} - ${httpResponse.status}`);
            return true;
          }
        }

        console.error(`❌ Fetch failed for ${url} - ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error warming cache for ${url}:`, error);

      // Additional HTTP fallback for localhost
      if (url.startsWith("https://localhost")) {
        try {
          const httpUrl = url.replace("https://", "http://");
          console.log(`Attempting HTTP fallback: ${httpUrl}`);

          const httpResponse = await fetch(httpUrl, {
            method: "GET",
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "User-Agent": "Cache Warmer",
            },
            timeout: 10000,
          });

          if (httpResponse.ok) {
            console.log(`✅ HTTP Fallback ${httpUrl} - ${httpResponse.status}`);
            return true;
          }
        } catch (httpError) {
          console.error(`❌ HTTP Fallback failed for ${url}:`, httpError);
        }
      }

      return false;
    }
  } catch (outerError) {
    console.error(`❌ Outer error warming cache:`, outerError);
    return false;
  }
}

/**
 * Revalidate a specific path
 */
/**
 * Revalidate a specific path
 */
async function revalidatePath(path) {
  try {
    console.log(`Revalidating path: ${path}`);

    // Create a custom agent that ignores SSL errors for local development
    const isLocalhost =
      CONFIG.FRONTEND_URL.includes("localhost") ||
      CONFIG.FRONTEND_URL.includes("127.0.0.1");
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: CONFIG.REVALIDATION_SECRET,
        path,
      }),
    };

    if (isLocalhost && CONFIG.FRONTEND_URL.startsWith("https")) {
      const https = require("https");
      fetchOptions.agent = new https.Agent({
        rejectUnauthorized: false, // Disable certificate verification for localhost
      });
      console.log("SSL verification disabled for localhost");
    }

    const response = await fetch(
      `${CONFIG.FRONTEND_URL}/api/revalidate`,
      fetchOptions
    );
    const data = await response.json();

    if (response.ok) {
      console.log(`✅ Revalidated ${path}`);
      return true;
    } else {
      console.error(`❌ Failed to revalidate ${path}:`, data);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error revalidating ${path}:`, error.message);
    return false;
  }
}

/**
 * Process products in batches
 */
async function processProducts(products, state) {
  console.log("=== PROCESSING PRODUCTS ===");
  console.log(`Total products to process: ${products.length}`);
  console.log(`Already processed products: ${state.processedProducts.length}`);

  // Filter out already processed products (unless forced)
  const remainingProducts = CONFIG.FORCE_REFRESH
    ? products
    : products.filter((p) => !state.processedProducts.includes(p.databaseId));

  console.log(`Remaining products to process: ${remainingProducts.length}`);

  // Process in small batches to avoid overwhelming the server
  const batchSize = 10;
  for (let i = 0; i < remainingProducts.length; i += batchSize) {
    const batch = remainingProducts.slice(i, i + batchSize);

    console.log(
      `Processing batch ${i / batchSize + 1} of ${Math.ceil(remainingProducts.length / batchSize)}`
    );

    await Promise.all(
      batch.map(async (product) => {
        const productUrl = `${CONFIG.FRONTEND_URL}/product/${product.slug}`;
        const success = await warmCache(
          productUrl,
          "product",
          product.databaseId
        );

        if (success && !state.processedProducts.includes(product.databaseId)) {
          state.processedProducts.push(product.databaseId);
        }
      })
    );

    // Save progress after each batch
    await saveState(state);

    // Add delay between batches
    if (i + batchSize < remainingProducts.length) {
      console.log(`Waiting ${CONFIG.REQUEST_DELAY * 2}ms before next batch...`);
      await delay(CONFIG.REQUEST_DELAY * 2);
    }
  }

  console.log(
    `Finished processing products. Total processed: ${state.processedProducts.length}`
  );
}

/**
 * Process categories
 */
async function processCategories(categories, state) {
  // Filter out already processed categories (unless forced)
  const remainingCategories = CONFIG.FORCE_REFRESH
    ? categories
    : categories.filter(
        (c) => !state.processedCategories.includes(c.databaseId)
      );

  console.log(`Processing ${remainingCategories.length} categories...`);

  // Process categories one by one with delay
  for (const category of remainingCategories) {
    const categoryUrl = `${CONFIG.FRONTEND_URL}/product-category/${category.slug}`;
    const success = await warmCache(
      categoryUrl,
      "category",
      category.databaseId
    );

    if (success && !state.processedCategories.includes(category.databaseId)) {
      state.processedCategories.push(category.databaseId);
    }

    // Save progress after each category
    await saveState(state);

    // Add delay between categories
    await delay(CONFIG.REQUEST_DELAY);
  }

  state.completedCategories = true;
  await saveState(state);

  console.log(
    `Finished processing categories. Total processed: ${state.processedCategories.length}`
  );
}

/**
 * Main function
 */
async function main() {
  console.log(
    `Starting cache warmer - Type: ${CONFIG.TYPE}, Force refresh: ${CONFIG.FORCE_REFRESH}`
  );

  // Load state
  const state = await loadState();
  state.lastRun = new Date().toISOString();

  // Process products
  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "products") {
    // Reset completion status if forced
    if (CONFIG.FORCE_REFRESH) {
      state.completedProducts = false;
    }

    if (!state.completedProducts) {
      const products = await getAllProductSlugs(state);
      await processProducts(products, state);
    } else {
      console.log("Products already processed. Use --force to process again.");
    }
  }

  // Process categories
  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "categories") {
    // Reset completion status if forced
    if (CONFIG.FORCE_REFRESH) {
      state.completedCategories = false;
    }

    if (!state.completedCategories) {
      const categories = await getAllCategorySlugs();
      await processCategories(categories, state);
    } else {
      console.log(
        "Categories already processed. Use --force to process again."
      );
    }
  }

  // Warm the homepage
  await warmCache(CONFIG.FRONTEND_URL, "homepage", "home");

  console.log("Cache warming completed!");
}

// Run the main function
main().catch((error) => {
  console.error("Error in cache warmer:", error);
  process.exit(1);
});
