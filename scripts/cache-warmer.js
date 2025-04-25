// scripts/cache-warmer.js
require("dotenv").config();
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  createHttpsAgent,
  delay,
  loadState,
  saveState,
} = require("./cache-utils");

// Configuration
const CONFIG = {
  FRONTEND_URL: process.env.FRONTEND_URL || "https://localhost:3000",
  STATE_FILE: path.join(__dirname, "../.cache-warmer-state.json"),
  TYPE: process.argv[2] || "all",
  FORCE_REFRESH: process.argv.includes("--force"),
  REQUEST_DELAY: 500,
};

// Ensure cache directories exist
const nuxtCacheDir = path.join(process.cwd(), ".nuxt", "cache");
if (!fs.existsSync(nuxtCacheDir)) {
  fs.mkdirSync(nuxtCacheDir, { recursive: true });
}

// Ensure .cache directory exists
const baseCacheDir = path.join(process.cwd(), ".cache");
if (!fs.existsSync(baseCacheDir)) {
  fs.mkdirSync(baseCacheDir, { recursive: true });
}

// Warm a specific URL
async function warmCache(url, type, id) {
  try {
    console.log(`Warming: ${url}`);

    const agent = await createHttpsAgent();
    const startTime = Date.now();

    const fetchOptions = {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Cache Warmer",
      },
      timeout: 30000,
      agent: url.startsWith("https:") ? agent : undefined,
    };

    try {
      const response = await fetch(url, fetchOptions);
      const timeElapsed = Date.now() - startTime;

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
            agent: undefined,
          });

          if (httpResponse.ok) {
            console.log(`✅ HTTP Fallback ${httpUrl} - ${httpResponse.status}`);
            return true;
          }
        }

        console.error(`❌ Failed for ${url} - ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error warming ${url}:`, error.message);
      return false;
    }
  } catch (error) {
    console.error(`❌ Outer error:`, error.message);
    return false;
  }
}

// Process URLs from cache files
async function processUrlsFromCache(urlType, state) {
  console.log(`Processing ${urlType} URLs...`);

  try {
    // Load appropriate cache file
    const cachePath = path.join(
      process.cwd(),
      ".nuxt",
      "cache",
      urlType === "products" ? "cached-products.json" : "cached-categories.json"
    );

    // Check if the file exists before trying to require it
    if (!fs.existsSync(cachePath)) {
      console.log(
        `Cache file ${cachePath} does not exist. Creating an empty one.`
      );
      fs.writeFileSync(cachePath, JSON.stringify([]));
    }

    let items = [];
    try {
      const fileContent = fs.readFileSync(cachePath, "utf8");
      items = JSON.parse(fileContent);
    } catch (parseError) {
      console.error(`Error parsing ${cachePath}: ${parseError.message}`);
      console.log("Creating an empty cache file as fallback");
      fs.writeFileSync(cachePath, JSON.stringify([]));
      items = [];
    }

    console.log(`Loaded ${items.length} ${urlType} from cache`);

    // Debug first item to see structure
    if (items.length > 0) {
      console.log(
        `First item structure:`,
        JSON.stringify(items[0]).slice(0, 200) + "..."
      );
    }

    // If no items were found, mark as completed and skip
    if (items.length === 0) {
      console.log(`No ${urlType} found in cache. Marking as completed.`);
      state[
        urlType === "products" ? "completedProducts" : "completedCategories"
      ] = true;
      await saveState(CONFIG.STATE_FILE, state);
      return;
    }

    // Helper to get ID safely from various possible properties
    const getItemId = (item) =>
      item.databaseId || item.id || item.productId || item.slug;

    // Process in batches
    const batchSize = 5;
    const processedKey =
      urlType === "products" ? "processedProducts" : "processedCategories";

    // Initialize the processed array if it doesn't exist
    if (!state[processedKey]) {
      state[processedKey] = [];
    }

    // Filter out already processed items
    const remaining = CONFIG.FORCE_REFRESH
      ? items
      : items.filter((item) => {
          const id = getItemId(item);
          return id && !state[processedKey].includes(id);
        });

    console.log(`${remaining.length} ${urlType} need warming`);

    for (let i = 0; i < remaining.length; i += batchSize) {
      const batch = remaining.slice(i, i + batchSize);

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(remaining.length / batchSize)}`
      );

      await Promise.all(
        batch.map(async (item) => {
          if (!item || !item.slug) {
            console.log(`Skipping item without slug:`, item);
            return;
          }

          const urlPath =
            urlType === "products"
              ? `/product/${item.slug}`
              : `/product-category/${item.slug}`;

          const url = `${CONFIG.FRONTEND_URL}${urlPath}`;
          const itemId = getItemId(item);

          console.log(`Processing item with ID: ${itemId}, slug: ${item.slug}`);

          const success = await warmCache(url, urlType, itemId);

          if (success && itemId && !state[processedKey].includes(itemId)) {
            state[processedKey].push(itemId);
            console.log(`Added ${itemId} to processed ${urlType}`);
          }
        })
      );

      // Save progress after each batch
      console.log(
        `Saving state with ${state[processedKey].length} processed ${urlType}`
      );
      await saveState(CONFIG.STATE_FILE, state);

      // Delay between batches
      if (i + batchSize < remaining.length) {
        await delay(CONFIG.REQUEST_DELAY * 2);
      }
    }

    // Mark as completed
    state[
      urlType === "products" ? "completedProducts" : "completedCategories"
    ] = true;
    await saveState(CONFIG.STATE_FILE, state);

    console.log(
      `Finished processing ${urlType}. Total processed: ${state[processedKey].length}`
    );
  } catch (error) {
    console.error(`Error processing ${urlType}:`, error);

    // Even on error, mark as completed to prevent repeated failures
    state[
      urlType === "products" ? "completedProducts" : "completedCategories"
    ] = true;
    await saveState(CONFIG.STATE_FILE, state);
  }
}

// Main function
async function main() {
  console.log(
    `Starting cache warmer - Type: ${CONFIG.TYPE}, Force refresh: ${CONFIG.FORCE_REFRESH}`
  );

  // Load or create state
  const state = await loadState(CONFIG.STATE_FILE);
  state.lastRun = new Date().toISOString();

  // Ensure state has proper structure
  if (!state.processedProducts) state.processedProducts = [];
  if (!state.processedCategories) state.processedCategories = [];

  await saveState(CONFIG.STATE_FILE, state);

  // Build caches first if needed
  if (
    CONFIG.FORCE_REFRESH ||
    CONFIG.TYPE === "all" ||
    CONFIG.TYPE === "products"
  ) {
    console.log("Running product cache builder...");
    try {
      execSync("node scripts/build-products-cache.js", { stdio: "inherit" });
    } catch (error) {
      console.error("Error building product cache:", error.message);

      // Create empty cache file as fallback if it doesn't exist
      const productCachePath = path.join(
        process.cwd(),
        ".nuxt",
        "cache",
        "cached-products.json"
      );

      if (!fs.existsSync(productCachePath)) {
        console.log("Creating empty product cache file as fallback");
        fs.writeFileSync(productCachePath, JSON.stringify([]));
      }
    }
  }

  if (
    CONFIG.FORCE_REFRESH ||
    CONFIG.TYPE === "all" ||
    CONFIG.TYPE === "categories"
  ) {
    console.log("Running category cache builder...");
    try {
      execSync("node scripts/build-categories-cache.js", { stdio: "inherit" });
    } catch (error) {
      console.error("Error building category cache:", error.message);

      // Create empty cache file as fallback if it doesn't exist
      const categoryCachePath = path.join(
        process.cwd(),
        ".nuxt",
        "cache",
        "cached-categories.json"
      );

      if (!fs.existsSync(categoryCachePath)) {
        console.log("Creating empty category cache file as fallback");
        fs.writeFileSync(categoryCachePath, JSON.stringify([]));
      }
    }
  }

  // Process products
  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "products") {
    if (CONFIG.FORCE_REFRESH) {
      state.completedProducts = false;
    }

    if (!state.completedProducts) {
      await processUrlsFromCache("products", state);
    } else {
      console.log("Products already processed. Use --force to reprocess.");
    }
  }

  // Process categories
  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "categories") {
    if (CONFIG.FORCE_REFRESH) {
      state.completedCategories = false;
    }

    if (!state.completedCategories) {
      await processUrlsFromCache("categories", state);
    } else {
      console.log("Categories already processed. Use --force to reprocess.");
    }
  }

  // Warm homepage
  await warmCache(`${CONFIG.FRONTEND_URL}/`, "homepage", "home");

  console.log("Cache warming completed!");
}

// Run the main function
main().catch((error) => {
  console.error("Error in cache warmer:", error);
  process.exit(1);
});
