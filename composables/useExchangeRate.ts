// composables/useExchangeRate.ts
import {useState, useRuntimeConfig, useFetch, useCookie} from '#imports';

// Helper function to check if running on the server/build context
const isServerContext = () => process.server;

// Global flag to track if initialization has been attempted (singleton pattern)
let initializationAttempted = false;

export const useExchangeRate = () => {
  const config = useRuntimeConfig();

  // Initialize useState. ALWAYS start with build-time fallback to prevent white screens
  const exchangeRate = useState<number | null>('exchangeRate', () => {
    // Always try to use build-time fallback first (works on both server and client)
    const buildTimeRateRaw = config.public.buildTimeExchangeRate;
    if (buildTimeRateRaw) {
      const buildTimeRate = parseFloat(String(buildTimeRateRaw));
      if (!isNaN(buildTimeRate) && buildTimeRate > 0) {
        console.log('[useExchangeRate] Initialized with build-time fallback:', buildTimeRate);
        return buildTimeRate;
      }
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
    secure: process.env.NODE_ENV === 'production', // Secure in production only
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

    const now = Date.now();
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    // 1. Check client-side cookie FIRST (highest priority)
    let rateFromCookie: number | null = null;
    let updateTimeFromCookie: number | null = null;

    if (cookie.value && typeof cookie.value === 'string' && cookie.value !== '') {
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
            cookie.value = ''; // Clear expired cookie
          }
        } else {
          console.log('[useExchangeRate] Cookie data is invalid format');
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
      console.log('[useExchangeRate] Initialized from cookie, rate:', rateFromCookie);
      return; // Don't call fetchExchangeRate - we have fresh data
    }

    // 3. Check if state already has a value (from build-time fallback via payload)
    if (exchangeRate.value !== null) {
      console.log('[useExchangeRate] Using build-time fallback rate immediately:', exchangeRate.value, '(fresh rate will be fetched in background)');
      lastClientUpdate.value = null; // Mark as needing eventual refresh
    } else {
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
    if (isFetching.value) {
      console.log('[useExchangeRate] Fetch already in progress, skipping');
      return;
    }

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
    isFetching.value = true;

    try {
      // Use useFetch for client-side fetching
      const {data, error} = await useFetch('/api/exchange-rate', {
        key: `apiExchangeRateFetch-${now}`, // Unique key to prevent caching issues
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
            }
          }
        }
        isFetching.value = false;
        return; // Keep existing rate, don't crash
      }

      if (data.value && data.value.success && data.value.data?.rate) {
        const newRate = data.value.data.rate;

        // Update state
        exchangeRate.value = newRate;
        lastClientUpdate.value = now; // Record time of *this* client update

        // Update cookie with proper serialization
        const cookieData = JSON.stringify({rate: newRate, lastUpdated: now});
        cookie.value = cookieData;

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
    } finally {
      isFetching.value = false;
    }
  };

  // --- Auto-initialize on client (runs only once globally) ---
  if (process.client && !initializationAttempted) {
    // Use nextTick to ensure DOM is ready
    import('#app').then(({callOnce}) => {
      callOnce('exchangeRateInit', initializeOnClient);
    });
  }

  return {
    exchangeRate, // The reactive exchange rate ref
    refresh: fetchExchangeRate, // Function to manually trigger client-side refresh
    isFetching, // Expose fetching state
  };
};
