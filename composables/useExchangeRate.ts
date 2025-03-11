// composables/useExchangeRate.ts
import { useState, useAsyncData, useCookie } from "#imports";

export const useExchangeRate = () => {
  const exchangeRate = useState<number | null>("exchangeRate", () => null);
  const lastUpdated = useState<number | null>("lastUpdated", () => null);

  // Check for cookie data first (to avoid unnecessary calls)
  const cookieData = useCookie("exchange-rate-data");

  if (cookieData.value && !exchangeRate.value) {
    try {
      const parsed = JSON.parse(cookieData.value as string);
      exchangeRate.value = parsed.rate;
      lastUpdated.value = parsed.lastUpdated;
    } catch (e) {
      // Invalid cookie data, will fetch from API
    }
  }

  const fetchExchangeRate = async () => {
    // Only fetch if we don't have data or it's older than 23 hours
    // (slightly less than the server's 24 hours to ensure freshness)
    const shouldFetch =
      !exchangeRate.value ||
      !lastUpdated.value ||
      Date.now() - lastUpdated.value > 23 * 60 * 60 * 1000;

    if (!shouldFetch) {
      return {
        exchangeRate: exchangeRate.value,
        lastUpdated: lastUpdated.value,
      };
    }

    const { data, error } = await useAsyncData(
      "exchangeRate",
      async () => {
        const response = await fetch("/api/exchange-rate");
        return response.json();
      },
      {
        server: false, // Allow this to run on client as well
        fresh: shouldFetch, // Only refetch when needed
        watch: [], // Don't reactively refetch
      }
    );

    if (error.value) {
      console.error("Failed to fetch exchange rate:", error.value);
      return {
        exchangeRate: exchangeRate.value,
        lastUpdated: lastUpdated.value,
      };
    }

    if (data.value && data.value.success && data.value.data) {
      exchangeRate.value = data.value.data.rate;
      lastUpdated.value = data.value.data.lastUpdated;
    }

    return { exchangeRate: exchangeRate.value, lastUpdated: lastUpdated.value };
  };

  // Fetch immediately if we don't have data
  if (!exchangeRate.value || !lastUpdated.value) {
    fetchExchangeRate();
  }

  return {
    exchangeRate,
    lastUpdated,
    refresh: fetchExchangeRate, // Expose refresh function
  };
};
