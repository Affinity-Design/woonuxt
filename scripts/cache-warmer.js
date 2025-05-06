// scripts/cache-warmer.js
require("dotenv").config();
const fetch = require("node-fetch"); // For warming URLs and fetching data lists

const {
  createHttpsAgent, // For warming HTTPS URLs (e.g., localhost with mkcert)
  delay,
  loadState, // Now loads state from API via cache-utils (and sends secret)
  saveState, // Now saves state to API via cache-utils (and sends secret)
} = require("./cache-utils");

// Configuration
const CONFIG = {
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  NUXT_APP_URL:
    process.env.NUXT_APP_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000",
  TYPE: process.argv[2] || "all",
  FORCE_REFRESH: process.argv.includes("--force"),
  REQUEST_DELAY: parseInt(process.env.REQUEST_DELAY || "500", 10),
  // Use REVALIDATION_SECRET as the shared secret for internal API calls
  INTERNAL_API_SECRET: process.env.REVALIDATION_SECRET,
  KV_KEY_PRODUCTS: "products-list",
  KV_KEY_CATEGORIES: "categories-list",
};

// API endpoints for fetching product/category lists
const API_ENDPOINTS = {
  getList: `${CONFIG.NUXT_APP_URL}/api/internal/script-storage`, // Append /<key>
};

// Warm a specific URL
async function warmCacheUrl(urlToWarm, itemType, itemId) {
  try {
    console.log(`Warming ${itemType} (${itemId || "N/A"}): ${urlToWarm}`);
    const agent = urlToWarm.startsWith("https:")
      ? await createHttpsAgent()
      : undefined;
    const startTime = Date.now();
    const fetchOptions = {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": `CacheWarmerBot/1.0 (${itemType})`,
      },
      timeout: 30000,
      agent: agent,
    };

    const response = await fetch(urlToWarm, fetchOptions);
    const timeElapsed = Date.now() - startTime;

    if (response.ok) {
      console.log(`✅ ${urlToWarm} - ${response.status} (${timeElapsed}ms)`);
      return true;
    } else {
      if (urlToWarm.startsWith("https://localhost")) {
        const httpUrl = urlToWarm.replace("https://", "http://");
        console.log(`Attempting HTTP fallback for localhost: ${httpUrl}`);
        const httpResponse = await fetch(httpUrl, {
          ...fetchOptions,
          agent: undefined,
        });
        if (httpResponse.ok) {
          console.log(
            `✅ HTTP Fallback ${httpUrl} - ${httpResponse.status} (${Date.now() - startTime}ms)`
          );
          return true;
        }
        console.error(
          `❌ HTTP Fallback Failed for ${httpUrl} - ${httpResponse.status}`
        );
      }
      console.error(
        `❌ Failed for ${urlToWarm} - ${response.status} ${response.statusText}`
      );
      return false;
    }
  } catch (error) {
    console.error(`❌ Error warming ${urlToWarm}:`, error.message);
    return false;
  }
}

// Fetch item list (products or categories) from the API
async function fetchItemsList(itemType) {
  const kvKey =
    itemType === "products" ? CONFIG.KV_KEY_PRODUCTS : CONFIG.KV_KEY_CATEGORIES;
  const url = `${API_ENDPOINTS.getList}/${kvKey}`;
  console.log(`Fetching ${itemType} list from API: ${url}`);

  try {
    const headers = { "Content-Type": "application/json" };
    // --- START: Add authentication header ---
    if (CONFIG.INTERNAL_API_SECRET) {
      headers["x-internal-secret"] = CONFIG.INTERNAL_API_SECRET;
    } else {
      console.warn(
        `INTERNAL_API_SECRET is not set in CONFIG for fetchItemsList. API call to ${url} will likely be unauthorized.`
      );
    }
    // --- END: Add authentication header ---

    const response = await fetch(url, { method: "GET", headers });

    if (response.status === 401) {
      console.error(
        `Unauthorized error fetching ${itemType} list from API (401). Check INTERNAL_API_SECRET.`
      );
      return []; // Return empty list on auth error
    }
    if (response.status === 404 || response.status === 204) {
      console.warn(
        `No ${itemType} list found at ${url} (404/204). Returning empty list.`
      );
      return [];
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Error fetching ${itemType} list from API: ${response.status} ${response.statusText}`,
        errorText
      );
      return [];
    }

    const items = await response.json();
    if (!Array.isArray(items)) {
      console.error(
        `Expected an array from ${url}, but got: ${typeof items}. Returning empty list.`
      );
      return [];
    }
    console.log(`Successfully fetched ${items.length} ${itemType} from API.`);
    return items;
  } catch (error) {
    console.error(
      `Network or parsing error fetching ${itemType} list from API:`,
      error
    );
    return [];
  }
}

// Process URLs from the fetched item list
async function processUrlsFromList(urlType, state) {
  console.log(`Processing ${urlType} URLs for warming...`);
  const items = await fetchItemsList(urlType);

  if (!items || items.length === 0) {
    console.log(
      `No ${urlType} found from API or an error occurred. Marking as completed if appropriate.`
    );
    state[
      urlType === "products" ? "completedProducts" : "completedCategories"
    ] = true;
    await saveState(state);
    return;
  }

  console.log(`Loaded ${items.length} ${urlType} from API for warming.`);
  if (items.length > 0) {
    console.log(
      `First item structure (for debugging):`,
      JSON.stringify(items[0]).slice(0, 200) + "..."
    );
  }

  const getItemId = (item) =>
    item.databaseId || item.id || item.productId || item.slug;
  const processedKey =
    urlType === "products" ? "processedProducts" : "processedCategories";
  if (!state[processedKey]) state[processedKey] = [];

  const itemsToWarm = CONFIG.FORCE_REFRESH
    ? items
    : items.filter((item) => {
        const id = getItemId(item);
        return id && !state[processedKey].includes(id.toString());
      });

  console.log(
    `${itemsToWarm.length} ${urlType} to warm (total: ${items.length}, processed previously: ${state[processedKey].length}).`
  );

  const batchSize = 5;
  for (let i = 0; i < itemsToWarm.length; i += batchSize) {
    const batch = itemsToWarm.slice(i, i + batchSize);
    console.log(
      `Warming batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(itemsToWarm.length / batchSize)} for ${urlType}`
    );

    await Promise.all(
      batch.map(async (item) => {
        if (!item || !item.slug) {
          console.warn(
            `Skipping item due to missing slug:`,
            JSON.stringify(item).slice(0, 100)
          );
          return;
        }
        const urlPath =
          urlType === "products"
            ? `/product/${item.slug}`
            : `/product-category/${item.slug}`;
        const fullUrl = `${CONFIG.FRONTEND_URL}${urlPath}`;
        const itemId = getItemId(item);
        const success = await warmCacheUrl(fullUrl, urlType, itemId);
        if (success && itemId) {
          const idStr = itemId.toString();
          if (!state[processedKey].includes(idStr)) {
            state[processedKey].push(idStr);
          }
        }
      })
    );

    console.log(
      `Saving state after batch: ${state[processedKey].length} ${urlType} processed.`
    );
    await saveState(state);

    if (i + batchSize < itemsToWarm.length && CONFIG.REQUEST_DELAY > 0) {
      await delay(CONFIG.REQUEST_DELAY * 2);
    }
  }

  state[urlType === "products" ? "completedProducts" : "completedCategories"] =
    true;
  await saveState(state);
  console.log(
    `Finished processing ${urlType}. Total processed now: ${state[processedKey].length}`
  );
}

// Main function
async function main() {
  console.log(
    `Starting cache warmer - Type: ${CONFIG.TYPE}, Force refresh: ${CONFIG.FORCE_REFRESH}`
  );
  console.log(`Warming URLs on: ${CONFIG.FRONTEND_URL}`);
  console.log(`Fetching data from: ${CONFIG.NUXT_APP_URL}`);
  if (!CONFIG.INTERNAL_API_SECRET) {
    console.warn(
      "WARNING: INTERNAL_API_SECRET (REVALIDATION_SECRET) is not set. API calls to fetch lists and save state will likely fail if routes are secured."
    );
  }

  const state = await loadState();
  state.lastRun = new Date().toISOString();
  if (!state.processedProducts) state.processedProducts = [];
  if (!state.processedCategories) state.processedCategories = [];
  await saveState(state);

  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "products") {
    if (CONFIG.FORCE_REFRESH) {
      console.log(
        "Force refresh enabled for products: resetting completion state and processed list."
      );
      state.completedProducts = false;
      state.processedProducts = [];
      await saveState(state);
    }
    if (!state.completedProducts) {
      await processUrlsFromList("products", state);
    } else {
      console.log(
        "Products already marked as completed. Use --force to reprocess."
      );
    }
  }

  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "categories") {
    if (CONFIG.FORCE_REFRESH) {
      console.log(
        "Force refresh enabled for categories: resetting completion state and processed list."
      );
      state.completedCategories = false;
      state.processedCategories = [];
      await saveState(state);
    }
    if (!state.completedCategories) {
      await processUrlsFromList("categories", state);
    } else {
      console.log(
        "Categories already marked as completed. Use --force to reprocess."
      );
    }
  }

  if (CONFIG.TYPE === "all" || CONFIG.TYPE === "home") {
    console.log("Warming homepage...");
    await warmCacheUrl(`${CONFIG.FRONTEND_URL}/`, "homepage", "home");
  }

  console.log("Cache warming process completed!");
  console.log("Final state:", JSON.stringify(state, null, 2));
}

main().catch((error) => {
  console.error("Unhandled error in cache warmer main function:", error);
  process.exit(1);
});
