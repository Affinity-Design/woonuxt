// plugins/exchange-rate.ts
import { defineNuxtPlugin, useState } from "#imports";

export default defineNuxtPlugin(async (nuxtApp) => {
  // This plugin will run once at app initialization

  // Only run on client-side to avoid SSR issues
  if (process.server) {
    console.log("Skipping exchange rate initialization on server");
    return;
  }

  // Check for existing cookie data first
  const cookieData = document.cookie
    .split("; ")
    .find((row) => row.startsWith("exchange-rate-data="))
    ?.split("=")[1];

  if (cookieData) {
    try {
      const data = JSON.parse(decodeURIComponent(cookieData));
      const exchangeRate = useState<number | null>("exchangeRate");
      const lastUpdated = useState<number | null>("lastUpdated");

      exchangeRate.value = data.rate;
      lastUpdated.value = data.lastUpdated;

      console.log("Initialized exchange rate from cookie");
      return;
    } catch (e) {
      // Invalid cookie data, will proceed to fetch
    }
  }

  // Fetch exchange rate once at app startup
  try {
    const response = await fetch("/api/exchange-rate");
    const data = await response.json();

    if (data.success && data.data) {
      // Set the values in global state
      const exchangeRate = useState<number | null>("exchangeRate");
      const lastUpdated = useState<number | null>("lastUpdated");

      exchangeRate.value = data.data.rate;
      lastUpdated.value = data.data.lastUpdated;

      console.log("Initialized exchange rate from API");
    }
  } catch (error) {
    console.error("Failed to initialize exchange rate:", error);
  }
});
