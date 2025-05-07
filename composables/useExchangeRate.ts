// composables/useExchangeRate.ts
import {
  useState,
  useRuntimeConfig,
  useFetch,
  useCookie,
  onMounted,
} from "#imports";

// Helper function to check if running on the server/build context
const isServerContext = () => process.server;

export const useExchangeRate = () => {
  const config = useRuntimeConfig();

  // Initialize useState. Try build-time fallback ONLY during server/build context.
  const exchangeRate = useState<number | null>("exchangeRate", () => {
    if (isServerContext()) {
      const buildTimeRateRaw = config.public.buildTimeExchangeRate;
      if (buildTimeRateRaw) {
        const buildTimeRate = parseFloat(String(buildTimeRateRaw));
        if (!isNaN(buildTimeRate) && buildTimeRate > 0) {
          return buildTimeRate;
        } else {
        }
      } else {
      }
    }
    // Default to null if not server context or no valid build-time rate
    return null;
  });

  // State to track the timestamp of the last *client-side* fetch/update
  const lastClientUpdate = useState<number | null>(
    "exchangeRateLastClientUpdate",
    () => null
  );

  // Client-side cookie for persistence between sessions
  const cookie = useCookie<string | null>("exchange-rate-data", {
    maxAge: 24 * 60 * 60, // 1 day expiry
    path: "/",
    // Consider `secure: true` and `sameSite: 'lax'` or 'strict' for production
  });

  // --- Client-Side Initialization Logic ---
  const initializeOnClient = () => {
    // This runs only once on the client after hydration
    if (isServerContext()) return; // Should not run on server

    // 1. Check if state already has a value (could be from build-time fallback via payload)
    if (exchangeRate.value !== null) {
      // We might still check the cookie or fetch if the build-time value is potentially stale
    }

    // 2. Check client-side cookie
    let rateFromCookie: number | null = null;
    let updateTimeFromCookie: number | null = null;
    if (cookie.value) {
      try {
        const parsed = JSON.parse(cookie.value);
        if (
          parsed &&
          typeof parsed.rate === "number" &&
          typeof parsed.lastUpdated === "number"
        ) {
          // Optional: Check cookie age
          // const MAX_COOKIE_AGE = 24 * 60 * 60 * 1000;
          // if (Date.now() - parsed.lastUpdated < MAX_COOKIE_AGE) {

          rateFromCookie = parsed.rate;
          updateTimeFromCookie = parsed.lastUpdated;
          // } else {
          //     console.log("[useExchangeRate - Client Init] Cookie data is expired.");
          //     cookie.value = null; // Clear expired cookie
          // }
        } else {
          cookie.value = null; // Clear invalid cookie
        }
      } catch (e) {
        cookie.value = null; // Clear invalid cookie
      }
    } else {
    }

    // 3. Decide initial client state: Prioritize fresh cookie over potentially stale build-time value
    if (rateFromCookie !== null && updateTimeFromCookie !== null) {
      // If cookie is valid, use it as the initial client state
      if (exchangeRate.value !== rateFromCookie) {
        exchangeRate.value = rateFromCookie;
      }
      lastClientUpdate.value = updateTimeFromCookie;
    } else if (exchangeRate.value !== null) {
      // If no valid cookie, but we have a build-time value, keep it for now
      // but mark lastClientUpdate as null so fetchExchangeRate knows to check freshness
      lastClientUpdate.value = null;
    } else {
      // No build-time value, no cookie value

      lastClientUpdate.value = null;
    }

    // 4. Trigger fetch if needed based on current state and last update time
    fetchExchangeRate(); // fetchExchangeRate has internal logic to check if fetch is necessary
  };

  // --- Client-Side Fetch/Refresh Logic ---
  const fetchExchangeRate = async () => {
    if (isServerContext()) return; // Only run client-side

    const now = Date.now();
    const FETCH_INTERVAL = 23 * 60 * 60 * 1000; // Re-fetch if older than 23 hours

    // Fetch if no rate, or no known last update time, or if last update is too old
    const shouldFetch =
      exchangeRate.value === null ||
      lastClientUpdate.value === null ||
      now - lastClientUpdate.value > FETCH_INTERVAL;

    if (!shouldFetch) {
      // console.log("[useExchangeRate] Client fetch skipped, data is fresh enough based on lastClientUpdate.");
      return;
    }

    try {
      // Use useFetch for client-side fetching
      const { data, error } = await useFetch("/api/exchange-rate", {
        key: "apiExchangeRateFetch" /* Optional key */,
      });

      if (error.value) {
        throw error.value; // Throw error to be caught below
      }

      if (data.value && data.value.success && data.value.data?.rate) {
        const newRate = data.value.data.rate;
        const apiLastUpdated = data.value.data.lastUpdated; // When the API last updated *its* source

        // Update state
        exchangeRate.value = newRate;
        lastClientUpdate.value = now; // Record time of *this* client update

        // Update cookie
        cookie.value = JSON.stringify({ rate: newRate, lastUpdated: now });
      } else {
        console.warn(
          "[useExchangeRate] Client fetch returned unexpected data:",
          data.value
        );
      }
    } catch (fetchError) {
      console.error("[useExchangeRate] Client fetch failed:", fetchError);
      // Decide if you want to clear the rate or keep the potentially stale one
      // exchangeRate.value = null; // Option: clear on failure
      // lastClientUpdate.value = null;
      // cookie.value = null;
    }
  };

  // --- Run Initialization ---
  // Use onMounted to ensure this runs once on the client after hydration
  onMounted(() => {
    initializeOnClient();
  });

  return {
    exchangeRate, // The reactive exchange rate ref
    // lastUpdated: lastClientUpdate, // Expose client update time if needed
    refresh: fetchExchangeRate, // Function to manually trigger client-side refresh
  };
};
