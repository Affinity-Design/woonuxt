// composables/useExchangeRate.ts
import { useState, useAsyncData, useRuntimeConfig } from "#imports";

export const useExchangeRate = () => {
  const exchangeRate = useState<number | null>("exchangeRate", () => null);
  const lastUpdated = useState<number | null>("lastUpdated", () => null);
  const config = useRuntimeConfig();

  const fetchExchangeRate = async () => {
    // Skip fetching in development environment
    if (import.meta.env.DEV) {
      console.log("Skipping exchange rate fetch in development environment.");
      return;
    }

    const { data, error } = await useAsyncData(
      "exchangeRate",
      async () => {
        const response = await fetch(
          `https://v6.exchangerate-api.com/v6/${config.public.exchangeRateApiKey}/latest/USD`
        );
        return response.json();
      },
      {
        server: true, // Ensure this runs only on the server side
      }
    );

    if (error.value) {
      console.error("Failed to fetch exchange rate:", error.value);
      return;
    }

    if (data.value && data.value.result === "success") {
      exchangeRate.value = data.value.conversion_rates.CAD;
      lastUpdated.value = Date.now();
    }
  };

  // Fetch the exchange rate if it's stale or missing
  if (
    !exchangeRate.value ||
    !lastUpdated.value ||
    Date.now() - lastUpdated.value > 24 * 60 * 60 * 1000
  ) {
    fetchExchangeRate();
  }

  return {
    exchangeRate,
    lastUpdated,
  };
};
