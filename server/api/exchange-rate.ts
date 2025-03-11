// server/api/exchange-rate.ts
import {
  defineEventHandler,
  getQuery,
  setCookie,
  getCookie,
  createError,
} from "h3";
import { useRuntimeConfig } from "#imports";

interface ExchangeRateResponse {
  result: string;
  conversion_rates: {
    CAD: number;
  };
  time_last_update_unix: number;
}

interface ExchangeRateData {
  rate: number;
  lastUpdated: number;
}

// Cloudflare Pages compatible approach for caching
export default defineEventHandler(async (event) => {
  // Get runtime config
  const config = useRuntimeConfig();

  // Force refresh if query parameter is set (for manual refresh/testing)
  const query = getQuery(event);
  const forceRefresh = query.refresh === "true";

  try {
    // Try to get the cached exchange rate data from cookie first
    let exchangeRateData: ExchangeRateData | null = null;
    const cookieData = getCookie(event, "exchange-rate-data");

    if (cookieData) {
      try {
        exchangeRateData = JSON.parse(cookieData as string);
      } catch (e) {
        // Invalid cookie data, will fetch from API
      }
    }

    const now = Date.now();
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    // Fetch new data if:
    // 1. No cached data exists
    // 2. Cached data is older than 24 hours
    // 3. Force refresh is requested
    if (
      !exchangeRateData ||
      now - exchangeRateData.lastUpdated > ONE_DAY_IN_MS ||
      forceRefresh
    ) {
      console.log("Fetching fresh exchange rate data");

      if (
        !config.public.exchangeRateApiKey ||
        config.public.exchangeRateApiKey === "default_key"
      ) {
        throw createError({
          statusCode: 500,
          message: "Exchange rate API key is not configured",
        });
      }

      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${config.public.exchangeRateApiKey}/latest/USD`
      );

      if (!response.ok) {
        throw createError({
          statusCode: response.status,
          message: `Exchange rate API error: ${response.status}`,
        });
      }

      const data: ExchangeRateResponse = await response.json();

      if (data.result === "success") {
        exchangeRateData = {
          rate: data.conversion_rates.CAD,
          lastUpdated: now,
        };

        // Set server cookie for server-side caching (helps with Cloudflare)
        setCookie(
          event,
          "exchange-rate-server",
          JSON.stringify(exchangeRateData),
          {
            maxAge: ONE_DAY_IN_MS / 1000, // seconds
            path: "/",
            httpOnly: true,
          }
        );
      } else {
        throw createError({
          statusCode: 500,
          message: "Exchange rate API returned unsuccessful result",
        });
      }
    } else {
      console.log("Using cached exchange rate data");
    }

    // Set a client-side cookie for client-side caching
    setCookie(event, "exchange-rate-data", JSON.stringify(exchangeRateData), {
      maxAge: ONE_DAY_IN_MS / 1000, // seconds
      path: "/",
      httpOnly: false, // Allow JS access
    });

    return {
      success: true,
      data: exchangeRateData,
    };
  } catch (error) {
    console.error("Exchange rate error:", error);

    // Try to get server-side cookie as fallback
    const serverCookieData = getCookie(event, "exchange-rate-server");
    if (serverCookieData) {
      try {
        const parsedData = JSON.parse(serverCookieData as string);
        return {
          success: true,
          data: parsedData,
          source: "server-cookie-fallback",
        };
      } catch (e) {
        // Cookie parsing failed
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: { rate: null, lastUpdated: null },
    };
  }
});
