// scripts/refresh-exchange-rate.js
/**
 * This script can be run during deployment to refresh the exchange rate cache
 * Usage: node scripts/refresh-exchange-rate.js
 */

require("dotenv").config();

async function refreshExchangeRate() {
  const SITE_URL = process.env.SITE_URL || "https://your-site.com";

  try {
    const response = await fetch(`${SITE_URL}/api/exchange-rate?refresh=true`);

    const data = await response.json();

    if (data.success) {
      console.log("Exchange rate refreshed successfully:", data.data);
    } else {
      console.error("Failed to refresh exchange rate:", data.error);
    }
  } catch (error) {
    console.error("Error when refreshing exchange rate:", error);
  }
}

refreshExchangeRate();
