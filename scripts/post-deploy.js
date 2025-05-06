// scripts/post-deploy.js
require("dotenv").config(); // Ensure .env variables are loaded
const fetch = require("node-fetch"); // For warmUrl
const { spawn } = require("child_process"); // For running cache-warmer in background
const { createHttpsAgent } = require("./cache-utils"); // For warmUrl if using HTTPS localhost

// Configuration
const CONFIG = {
  // Base URL for the frontend site to warm up
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  // Whether to run the full cache warming process after this script warms critical pages
  RUN_FULL_CACHE_WARMING: process.env.RUN_FULL_CACHE_WARMING !== "false", // Default true
  // Whether the full cache warming should only focus on critical, or do everything
  // This is more of a flag for how 'cache-warmer.js' itself behaves if triggered.
  // The 'cache-warmer.js' script itself can take 'all', 'products', 'categories', 'home' as args.
  CACHE_WARMER_TYPE: process.env.CACHE_WARMER_TYPE || "all", // Type of warming for the full run
  // REVALIDATION_SECRET will be needed by cache-warmer.js for its API calls.
  // Ensure it's available in the environment.
};

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Warm a specific URL
 */
async function warmUrl(urlToWarm, pageType = "critical") {
  try {
    console.log(`Warming ${pageType} page: ${urlToWarm}`);
    const agent = urlToWarm.startsWith("https:")
      ? await createHttpsAgent()
      : undefined;
    const startTime = Date.now();
    const response = await fetch(urlToWarm, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": `PostDeployWarmer/1.0 (${pageType})`,
      },
      timeout: 45000, // 45 seconds timeout for critical pages
      agent: agent,
    });
    const timeElapsed = Date.now() - startTime;

    if (response.ok) {
      console.log(`✅ ${urlToWarm} - ${response.status} (${timeElapsed}ms)`);
      return true;
    } else {
      console.error(
        `❌ Failed to warm ${urlToWarm} - ${response.status} ${response.statusText}`
      );
      return false;
    }
  } catch (error) {
    console.error(`❌ Error warming ${urlToWarm}: ${error.message}`);
    return false;
  }
}

/**
 * Warm critical pages that should be immediately available
 */
async function warmCriticalPages() {
  // Define your most critical URLs
  const criticalUrls = [
    `${CONFIG.FRONTEND_URL}/`, // Homepage
    // Add a few other absolutely essential pages if any
    // For example:
    // `${CONFIG.FRONTEND_URL}/some-key-category`,
    // `${CONFIG.FRONTEND_URL}/about-us`,
  ];

  if (criticalUrls.length === 0) {
    console.log("No critical URLs defined to warm immediately.");
    return;
  }

  console.log(`Warming ${criticalUrls.length} critical page(s)...`);

  for (const url of criticalUrls) {
    await warmUrl(url);
    await delay(1000); // Delay between warming critical pages
  }
  console.log("Finished warming critical pages.");
}

/**
 * Run the cache warmer script in the background.
 * This script (cache-warmer.js) now reads data from KV (via API)
 * and manages its state in KV (via API).
 */
function runFullCacheWarmerDetached(type = "all") {
  console.log(
    `🔄 Starting full cache warmer for type '${type}' in background...`
  );
  try {
    // Ensure REVALIDATION_SECRET is available for the child process
    if (!process.env.REVALIDATION_SECRET) {
      console.warn(
        "WARNING: REVALIDATION_SECRET is not set. The detached cache-warmer.js might fail its API calls if they are secured."
      );
    }
    if (!process.env.FRONTEND_URL) {
      console.warn(
        "WARNING: FRONTEND_URL is not set. The detached cache-warmer.js needs this for its API calls and warming targets."
      );
    }

    const warmerProcess = spawn("node", ["scripts/cache-warmer.js", type], {
      detached: true,
      stdio: "ignore", // Or 'inherit' if you want to see its output where this script runs
      env: {
        ...process.env, // Pass all current environment variables
        // You can override or ensure specific ones here if needed,
        // but cache-warmer.js should pick them up from process.env
      },
    });

    warmerProcess.unref(); // Allows parent process (this script) to exit independently

    console.log(
      `✅ Full cache warmer (type: ${type}) started in background with PID: ${warmerProcess.pid}. It will continue running independently.`
    );
    return true;
  } catch (error) {
    console.error(
      `❌ Error starting full cache warmer for type '${type}':`,
      error.message
    );
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Post-deployment script started.");
  console.log(
    `Configuration: RUN_FULL_CACHE_WARMING=${CONFIG.RUN_FULL_CACHE_WARMING}, CACHE_WARMER_TYPE=${CONFIG.CACHE_WARMER_TYPE}`
  );

  try {
    // 1. Always warm critical pages immediately after deployment
    await warmCriticalPages();

    // 2. Check if we need to run the full cache warmer (which reads from KV)
    if (CONFIG.RUN_FULL_CACHE_WARMING) {
      console.log("Proceeding to run full cache warmer in background...");
      // Add a small delay before starting the background process
      await delay(5000); // 5 seconds
      runFullCacheWarmerDetached(CONFIG.CACHE_WARMER_TYPE);
    } else {
      console.log(
        "Full cache warming is disabled by RUN_FULL_CACHE_WARMING setting."
      );
    }

    console.log("✅ Post-deployment script main tasks initiated.");
    console.log(
      "If full cache warming was started, it is now running in a detached background process."
    );

    // Give a moment for any final console output to be flushed, especially if warmer was detached
    await delay(1000);
    process.exit(0); // Exit successfully
  } catch (error) {
    console.error(
      "❌ Unhandled error in post-deployment script main function:",
      error
    );
    process.exit(1); // Exit with failure
  }
}

// Run the main function
main();
