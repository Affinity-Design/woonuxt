// composables/useExchangeRate.ts
import {useState, useRuntimeConfig, useFetch, useCookie, onMounted} from '#imports';

// Helper function to check if running on the server/build context
const isServerContext = () => process.server;

export const useExchangeRate = () => {
  const config = useRuntimeConfig();

  // Initialize useState. Try build-time fallback ONLY during server/build context.
  const exchangeRate = useState<number | null>('exchangeRate', () => {
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
  const lastClientUpdate = useState<number | null>('exchangeRateLastClientUpdate', () => null);

  // Client-side cookie for persistence between sessions
  const cookie = useCookie<string | null>('exchange-rate-data', {
    maxAge: 24 * 60 * 60, // 1 day expiry
    path: '/',
    // Consider `secure: true` and `sameSite: 'lax'` or 'strict' for production
  });

  // --- Client-Side Initialization Logic ---
  const initializeOnClient = () => {
    // This runs only once on the client after hydration
    if (isServerContext()) return; // Should not run on server

    const now = Date.now();
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    // 1. Check client-side cookie FIRST (highest priority)
    let rateFromCookie: number | null = null;
    let updateTimeFromCookie: number | null = null;
    if (cookie.value) {
      try {
        const parsed = JSON.parse(cookie.value);
        if (parsed && typeof parsed.rate === 'number' && typeof parsed.lastUpdated === 'number') {
          // Check if cookie is still fresh (less than 24 hours old)
          if (now - parsed.lastUpdated < ONE_DAY_IN_MS) {
            rateFromCookie = parsed.rate;
            updateTimeFromCookie = parsed.lastUpdated;
            console.log('[useExchangeRate] Using fresh cookie data, age:', Math.round((now - parsed.lastUpdated) / 1000 / 60 / 60), 'hours');
          } else {
            console.log('[useExchangeRate] Cookie data is expired, will fetch fresh');
            cookie.value = null; // Clear expired cookie
          }
        } else {
          console.log('[useExchangeRate] Cookie data is invalid');
          cookie.value = null; // Clear invalid cookie
        }
      } catch (e) {
        console.log('[useExchangeRate] Cookie parsing failed');
        cookie.value = null; // Clear invalid cookie
      }
    }

    // 2. If fresh cookie data exists, use it and skip fetch
    if (rateFromCookie !== null && updateTimeFromCookie !== null) {
      exchangeRate.value = rateFromCookie;
      lastClientUpdate.value = updateTimeFromCookie;
      console.log('[useExchangeRate] Initialized from cookie, no fetch needed');
      return; // Don't call fetchExchangeRate - we have fresh data
    }

    // 3. Check if state already has a value (from build-time fallback via payload)
    if (exchangeRate.value !== null) {
      console.log('[useExchangeRate] Using build-time fallback rate');
      lastClientUpdate.value = null; // Mark as needing eventual refresh
    } else {
      console.log('[useExchangeRate] No cached data found');
      lastClientUpdate.value = null;
    }

    // 4. Trigger fetch if needed (only if no fresh cookie data)
    fetchExchangeRate();
  };

  // --- Client-Side Fetch/Refresh Logic ---
  const fetchExchangeRate = async () => {
    if (isServerContext()) return; // Only run client-side

    const now = Date.now();
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Fetch if no rate, or no known last update time, or if last update is older than 24 hours
    const shouldFetch = exchangeRate.value === null || lastClientUpdate.value === null || now - lastClientUpdate.value > ONE_DAY_IN_MS;

    if (!shouldFetch) {
      const hoursSinceUpdate = Math.round((now - lastClientUpdate.value!) / 1000 / 60 / 60);
      console.log(`[useExchangeRate] Client fetch skipped, data is ${hoursSinceUpdate} hours old (fresh for 24 hours)`);
      return;
    }

    console.log('[useExchangeRate] Fetching fresh exchange rate from API...');

    try {
      // Use useFetch for client-side fetching
      const {data, error} = await useFetch('/api/exchange-rate', {
        key: 'apiExchangeRateFetch' /* Optional key */,
      });

      if (error.value) {
        console.warn('[useExchangeRate] Client fetch error:', error.value);
        // Don't throw - keep existing rate if available
        if (exchangeRate.value === null) {
          // Fallback to build-time rate if available
          const buildTimeRateRaw = config.public.buildTimeExchangeRate;
          if (buildTimeRateRaw) {
            const buildTimeRate = parseFloat(String(buildTimeRateRaw));
            if (!isNaN(buildTimeRate) && buildTimeRate > 0) {
              console.log('[useExchangeRate] Using build-time fallback rate:', buildTimeRate);
              exchangeRate.value = buildTimeRate;
              return;
            }
          }
        }
        return; // Keep existing rate, don't crash
      }

      if (data.value && data.value.success && data.value.data?.rate) {
        const newRate = data.value.data.rate;
        const apiLastUpdated = data.value.data.lastUpdated; // When the API last updated *its* source

        // Update state
        exchangeRate.value = newRate;
        lastClientUpdate.value = now; // Record time of *this* client update

        // Update cookie
        cookie.value = JSON.stringify({rate: newRate, lastUpdated: now});

        console.log('[useExchangeRate] Successfully fetched and cached new rate:', newRate);
      } else {
        console.warn('[useExchangeRate] Client fetch returned unexpected data:', data.value);
        // Don't clear existing rate - keep what we have
        if (exchangeRate.value === null) {
          // Fallback to build-time rate
          const buildTimeRateRaw = config.public.buildTimeExchangeRate;
          if (buildTimeRateRaw) {
            const buildTimeRate = parseFloat(String(buildTimeRateRaw));
            if (!isNaN(buildTimeRate) && buildTimeRate > 0) {
              console.log('[useExchangeRate] Using build-time fallback rate after unexpected data:', buildTimeRate);
              exchangeRate.value = buildTimeRate;
            }
          }
        }
      }
    } catch (fetchError) {
      console.error('[useExchangeRate] Client fetch failed:', fetchError);
      // Keep existing rate if we have one, don't crash the page
      if (exchangeRate.value === null) {
        // Last resort: use build-time rate
        const buildTimeRateRaw = config.public.buildTimeExchangeRate;
        if (buildTimeRateRaw) {
          const buildTimeRate = parseFloat(String(buildTimeRateRaw));
          if (!isNaN(buildTimeRate) && buildTimeRate > 0) {
            console.log('[useExchangeRate] Using build-time fallback rate after fetch error:', buildTimeRate);
            exchangeRate.value = buildTimeRate;
          }
        }
      }
      // Do NOT clear the rate or throw - graceful degradation
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
