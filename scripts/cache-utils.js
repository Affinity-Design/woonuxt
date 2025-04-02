// scripts/cache-utils.js
const fs = require("fs").promises;
const path = require("path");
const https = require("https");

// Helper function to find local certificates
async function findMkcertCertificates() {
  const currentDir = process.cwd();
  const possibleCertPaths = [
    path.join(currentDir, "localhost.pem"),
    path.join(currentDir, "localhost-key.pem"),
    path.join(process.env.HOME || "", ".local/share/mkcert/localhost.pem"),
    path.join(process.env.HOME || "", ".local/share/mkcert/localhost-key.pem"),
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

// Create HTTPS agent with certificates
async function createHttpsAgent() {
  const { cert, key } = await findMkcertCertificates();

  return new https.Agent({
    rejectUnauthorized: false,
    ...(cert && key
      ? {
          cert: await fs.readFile(cert),
          key: await fs.readFile(key),
        }
      : {}),
  });
}

// Helper for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Load state file
async function loadState(stateFile) {
  try {
    const data = await fs.readFile(stateFile, "utf8");
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

// Save state file
async function saveState(stateFile, state) {
  try {
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving state:", error);
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
