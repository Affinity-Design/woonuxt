// composables/useExchangeRate.ts
import {useState, useRuntimeConfig, useFetch, useCookie, callOnce} from '#imports';

// Helper function to check if running on the server/build context
const isServerContext = () => typeof window === 'undefined';
const isClientContext = () => typeof window !== 'undefined';
const isDevEnvironment = process.env.NODE_ENV !== 'production';

const getUtcDayKey = (timestamp = Date.now()) => new Date(timestamp).toISOString().slice(0, 10);

// Global flag to track if initialization has been attempted (singleton pattern)
let initializationAttempted = false;

export const useExchangeRate = () => {
  const config = useRuntimeConfig();

  const getBuildTimeFallbackRate = () => {
    const buildTimeRateRaw = config.public.buildTimeExchangeRate;
    if (buildTimeRateRaw) {
      const buildTimeRate = parseFloat(String(buildTimeRateRaw));
      if (!isNaN(buildTimeRate) && buildTimeRate > 0) {
        return buildTimeRate;
      }
    }

    return null;
  };

  // Initialize useState. ALWAYS start with build-time fallback to prevent white screens
  const exchangeRate = useState<number | null>('exchangeRate', () => {
    // Always try to use build-time fallback first (works on both server and client)
    const buildTimeRate = getBuildTimeFallbackRate();
    if (buildTimeRate !== null) {
      return buildTimeRate;
    }
    // Only return null as absolute last resort
    console.warn('[useExchangeRate] No build-time fallback available!');
    return null;
  });

  // State to track the timestamp of the last *client-side* fetch/update
  const lastClientUpdate = useState<number | null>('exchangeRateLastClientUpdate', () => null);

  // State to track if we're currently fetching (prevents duplicate fetches)
  const isFetching = useState<boolean>('exchangeRateIsFetching', () => false);

  // Client-side cookie for persistence between sessions
  const cookie = useCookie<string>('exchange-rate-data', {
    maxAge: 24 * 60 * 60, // 1 day expiry
    path: '/',
    sameSite: 'lax', // Allow cookie on same-site navigation
    secure: !isDevEnvironment,
    default: () => '', // Default to empty string instead of null
  });

  // --- Client-Side Initialization Logic ---
  const initializeOnClient = () => {
    // Only run once globally across all component instances
    if (initializationAttempted) {
      return;
    }
    initializationAttempted = true;

    // This runs only once on the client after hydration
    if (isServerContext()) return; // Should not run on server

    const currentDayKey = getUtcDayKey();

    // 1. Check client-side cookie FIRST (highest priority)
    let rateFromCookie: number | null = null;
    let updateTimeFromCookie: number | null = null;
    let staleRateFromCookie: number | null = null;
    let staleUpdateTimeFromCookie: number | null = null;

    if (cookie.value && typeof cookie.value === 'string' && cookie.value !== '') {
      try {
        const parsed = JSON.parse(cookie.value);
        if (parsed && typeof parsed.rate === 'number' && typeof parsed.lastUpdated === 'number') {
          if (getUtcDayKey(parsed.lastUpdated) === currentDayKey) {
            rateFromCookie = parsed.rate;
            updateTimeFromCookie = parsed.lastUpdated;
          } else {
            staleRateFromCookie = parsed.rate;
            staleUpdateTimeFromCookie = parsed.lastUpdated;
          }
        } else {
          cookie.value = ''; // Clear invalid cookie
        }
      } catch (e) {
        console.warn('[useExchangeRate] Cookie parsing failed:', e);
        cookie.value = ''; // Clear invalid cookie
      }
    }

    // 2. If fresh cookie data exists, use it and skip fetch
    if (rateFromCookie !== null && updateTimeFromCookie !== null) {
      exchangeRate.value = rateFromCookie;
      lastClientUpdate.value = updateTimeFromCookie;
      return; // Don't call fetchExchangeRate - we have fresh data
    }

    const hasStaleCookieData = staleRateFromCookie !== null && staleUpdateTimeFromCookie !== null;

    if (hasStaleCookieData) {
      exchangeRate.value = staleRateFromCookie;
      lastClientUpdate.value = staleUpdateTimeFromCookie;
    }

    // 3. Check if state already has a value (from build-time fallback via payload)
    if (exchangeRate.value !== null && !hasStaleCookieData) {
      lastClientUpdate.value = null; // Mark as needing eventual refresh
    } else if (exchangeRate.value === null) {
      console.warn('[useExchangeRate] No fallback rate available - this should not happen!');
      lastClientUpdate.value = null;
    }

    // 4. Trigger BACKGROUND fetch (non-blocking)
    // This happens asynchronously and won't block the UI
    // The page will render with fallback rate, then update when fresh data arrives
    setTimeout(() => {
      fetchExchangeRate();
    }, 0); // Use setTimeout to ensure this runs after initial render
  };

  // --- Client-Side Fetch/Refresh Logic ---
  const fetchExchangeRate = async () => {
    if (isServerContext()) return; // Only run client-side

    // Prevent duplicate fetches
    if (isFetching.value) return;

    const now = Date.now();
    const currentDayKey = getUtcDayKey(now);

    // Fetch if no rate, or no known last update time, or if the cached rate is from a previous UTC day.
    const shouldFetch = exchangeRate.value === null || lastClientUpdate.value === null || getUtcDayKey(lastClientUpdate.value) !== currentDayKey;

    if (!shouldFetch) return;

    isFetching.value = true;

    try {
      // Use useFetch for client-side fetching
      const {data, error} = await useFetch('/api/exchange-rate', {
        key: `apiExchangeRateFetch-${now}`, // Unique key to prevent caching issues
      });

      if (error.value) {
        console.warn('[useExchangeRate] Fetch error:', error.value);
        // Don't throw - keep existing rate if available
        if (exchangeRate.value === null) {
          const buildTimeRate = getBuildTimeFallbackRate();
          if (buildTimeRate !== null) {
            exchangeRate.value = buildTimeRate;
          }
        }
        isFetching.value = false;
        return; // Keep existing rate, don't crash
      }

      if (data.value && data.value.success && data.value.data?.rate) {
        const newRate = data.value.data.rate;
        const serverLastUpdated = typeof data.value.data.lastUpdated === 'number' ? data.value.data.lastUpdated : now;

        // Update state
        exchangeRate.value = newRate;
        lastClientUpdate.value = serverLastUpdated;

        // Update cookie with proper serialization
        const cookieData = JSON.stringify({rate: newRate, lastUpdated: serverLastUpdated});
        cookie.value = cookieData;

        console.log('[useExchangeRate] Updated rate:', newRate);
      } else {
        console.warn('[useExchangeRate] Client fetch returned unexpected data:', data.value);
        // Don't clear existing rate - keep what we have
        if (exchangeRate.value === null) {
          const buildTimeRate = getBuildTimeFallbackRate();
          if (buildTimeRate !== null) {
            exchangeRate.value = buildTimeRate;
          }
        }
      }
    } catch (fetchError) {
      console.error('[useExchangeRate] Fetch failed:', fetchError);
      // Keep existing rate if we have one, don't crash the page
      if (exchangeRate.value === null) {
        const buildTimeRate = getBuildTimeFallbackRate();
        if (buildTimeRate !== null) {
          exchangeRate.value = buildTimeRate;
        }
      }
      // Do NOT clear the rate or throw - graceful degradation
    } finally {
      isFetching.value = false;
    }
  };

  // --- Auto-initialize on client (runs only once globally) ---
  if (isClientContext() && !initializationAttempted) {
    callOnce('exchangeRateInit', initializeOnClient);
  }

  return {
    exchangeRate, // The reactive exchange rate ref
    refresh: fetchExchangeRate, // Function to manually trigger client-side refresh
    isFetching, // Expose fetching state
  };
};
