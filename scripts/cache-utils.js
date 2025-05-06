// scripts/cache-utils.js
require("dotenv").config(); // Ensure environment variables are loaded
const fs = require("fs").promises; // Retain for findMkcertCertificates
const path = require("path");
const https = require("https");
const fetch = require("node-fetch"); // For making API calls to our Nuxt app

// Configuration for API endpoints
const API_CONFIG = {
  NUXT_APP_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  STATE_API_KEY: "cache-warmer-state",
  STATE_API_ENDPOINT_GET: `/api/internal/script-storage`,
  STATE_API_ENDPOINT_POST: "/api/internal/script-storage/state",
  // Use REVALIDATION_SECRET as the shared secret for these internal API calls.
  // This should be available in the environment where cache-warmer.js runs.
  INTERNAL_API_SECRET: process.env.REVALIDATION_SECRET,
};

// --- Helper functions for local HTTPS agent (for warming https://localhost) ---
async function findMkcertCertificates() {
  const currentDir = process.cwd();
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const possibleCertPaths = [
    path.join(currentDir, "localhost.pem"),
    path.join(currentDir, "localhost-key.pem"),
    homeDir ? path.join(homeDir, ".local/share/mkcert/localhost.pem") : null,
    homeDir
      ? path.join(homeDir, ".local/share/mkcert/localhost-key.pem")
      : null,
  ].filter(Boolean);

  let certPath = null;
  let keyPath = null;

  for (const p of possibleCertPaths) {
    try {
      await fs.access(p);
      if (p.endsWith("localhost.pem") && !certPath) certPath = p;
      if (p.endsWith("localhost-key.pem") && !keyPath) keyPath = p;
    } catch {
      /* File not found, ignore */
    }
  }
  return { cert: certPath, key: keyPath };
}

async function createHttpsAgent() {
  const { cert, key } = await findMkcertCertificates();
  const agentOptions = { rejectUnauthorized: false };
  if (cert && key) {
    try {
      agentOptions.cert = await fs.readFile(cert);
      agentOptions.key = await fs.readFile(key);
      console.log("Using local mkcert certificates for HTTPS agent.");
    } catch (e) {
      console.warn(
        "Could not read local mkcert certificates, proceeding without them for HTTPS agent.",
        e.message
      );
    }
  } else {
    console.log(
      "Local mkcert certificates not found. HTTPS agent will use default CA behavior (or rejectUnauthorized:false)."
    );
  }
  return new https.Agent(agentOptions);
}
// --- End helper functions for local HTTPS agent ---

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getDefaultState() {
  return {
    lastRun: null,
    productsCursor: null,
    processedProducts: [],
    processedCategories: [],
    completedProducts: false,
    completedCategories: false,
  };
}

// Load state from the API endpoint
async function loadState() {
  const url = `${API_CONFIG.NUXT_APP_URL}${API_CONFIG.STATE_API_ENDPOINT_GET}/${API_CONFIG.STATE_API_KEY}`;
  console.log(`Loading cache warmer state from: ${url}`);

  try {
    const headers = { "Content-Type": "application/json" };
    // --- START: Add authentication header ---
    if (API_CONFIG.INTERNAL_API_SECRET) {
      headers["x-internal-secret"] = API_CONFIG.INTERNAL_API_SECRET;
    } else {
      console.warn(
        "INTERNAL_API_SECRET is not set in API_CONFIG. API call will likely be unauthorized."
      );
    }
    // --- END: Add authentication header ---

    const response = await fetch(url, { method: "GET", headers });

    if (response.status === 401) {
      console.error(
        `Unauthorized error loading state from API (401). Check INTERNAL_API_SECRET.`
      );
      console.warn("Falling back to default state due to authorization error.");
      return getDefaultState();
    }
    if (response.status === 404 || response.status === 204) {
      console.log(
        "No existing state found or API returned no content. Initializing with default state."
      );
      return getDefaultState();
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Error loading state from API: ${response.status} ${response.statusText}`,
        errorText
      );
      console.warn("Falling back to default state due to API error.");
      return getDefaultState();
    }

    const state = await response.json();
    const defaultState = getDefaultState();
    const mergedState = { ...defaultState, ...state };
    console.log("Successfully loaded state from API.");
    return mergedState;
  } catch (error) {
    console.error("Network or parsing error loading state from API:", error);
    console.warn("Falling back to default state due to network/parsing error.");
    return getDefaultState();
  }
}

// Save state to the API endpoint
async function saveState(state) {
  const url = `${API_CONFIG.NUXT_APP_URL}${API_CONFIG.STATE_API_ENDPOINT_POST}`;
  console.log(`Saving cache warmer state to: ${url}`);

  try {
    const headers = { "Content-Type": "application/json" };
    // --- START: Add authentication header ---
    if (API_CONFIG.INTERNAL_API_SECRET) {
      headers["x-internal-secret"] = API_CONFIG.INTERNAL_API_SECRET;
    } else {
      console.warn(
        "INTERNAL_API_SECRET is not set in API_CONFIG. API call will likely be unauthorized."
      );
    }
    // --- END: Add authentication header ---

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(state),
    });

    if (response.status === 401) {
      console.error(
        `Unauthorized error saving state via API (401). Check INTERNAL_API_SECRET.`
      );
      return false;
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Error saving state via API: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    const result = await response.json();
    if (result.success) {
      console.log("Successfully saved state via API.");
      return true;
    } else {
      console.error(
        "API indicated failure in saving state:",
        result.message || "No message provided."
      );
      return false;
    }
  } catch (error) {
    console.error("Network error saving state via API:", error);
    return false;
  }
}

module.exports = {
  findMkcertCertificates,
  createHttpsAgent,
  delay,
  loadState,
  saveState,
};
