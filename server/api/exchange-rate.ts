// server/api/exchange-rate.ts
import {defineEventHandler, getHeader, getQuery, setCookie, createError} from 'h3';
import {useRuntimeConfig} from '#imports';

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
  fetchedForDay: string;
}

interface RefreshLockData {
  dayKey: string;
  lockedAt: number;
}

const CACHE_PREFIX = 'exchange-rate:usd-cad';
const CLIENT_COOKIE_NAME = 'exchange-rate-data';
const LOCK_TTL_MS = 15 * 1000;
const LOCK_POLL_INTERVAL_MS = 350;
const LOCK_POLL_ATTEMPTS = 5;

const getUtcDayKey = (timestamp = Date.now()) => new Date(timestamp).toISOString().slice(0, 10);

const isValidExchangeRateData = (value: unknown): value is ExchangeRateData => {
  if (!value || typeof value !== 'object') return false;

  const data = value as ExchangeRateData;
  return (
    typeof data.rate === 'number' && !Number.isNaN(data.rate) && data.rate > 0 && typeof data.lastUpdated === 'number' && typeof data.fetchedForDay === 'string'
  );
};

const isValidRefreshLock = (value: unknown): value is RefreshLockData => {
  if (!value || typeof value !== 'object') return false;

  const data = value as RefreshLockData;
  return typeof data.dayKey === 'string' && typeof data.lockedAt === 'number';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const refreshRequested = query.refresh === 'true';
  const refreshSecret = typeof query.secret === 'string' ? query.secret : '';
  const headerSecret = getHeader(event, 'x-revalidation-secret') || '';
  const refreshAuthorized =
    import.meta.dev || (!!config.REVALIDATION_SECRET && (refreshSecret === config.REVALIDATION_SECRET || headerSecret === config.REVALIDATION_SECRET));
  const forceRefresh = refreshRequested && refreshAuthorized;

  if (refreshRequested && !refreshAuthorized) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Invalid refresh secret',
    });
  }

  const now = Date.now();
  const todayKey = getUtcDayKey(now);
  const buildTimeRate = parseFloat(String(config.public.buildTimeExchangeRate || '1.38'));
  const fallbackRate = !Number.isNaN(buildTimeRate) && buildTimeRate > 0 ? buildTimeRate : 1.38;
  const fallbackData: ExchangeRateData = {
    rate: fallbackRate,
    lastUpdated: now,
    fetchedForDay: todayKey,
  };

  const dailyCacheKey = `${CACHE_PREFIX}:daily:${todayKey}`;
  const latestCacheKey = `${CACHE_PREFIX}:latest`;
  const refreshLockKey = `${CACHE_PREFIX}:refresh-lock`;

  const persistClientCookie = (data: ExchangeRateData) => {
    setCookie(event, CLIENT_COOKIE_NAME, JSON.stringify(data), {
      maxAge: 24 * 60 * 60,
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: !import.meta.dev,
    });
  };

  const respondWith = (data: ExchangeRateData, source: string, stale = false) => {
    persistClientCookie(data);

    return {
      success: true,
      data,
      source,
      stale,
    };
  };

  let storage: Awaited<ReturnType<typeof useStorage>> | null = null;
  let latestCache: ExchangeRateData | null = null;
  let lockAcquired = false;

  try {
    try {
      storage = useStorage('cache');
    } catch (storageError) {
      console.warn('[exchange-rate] Shared cache unavailable, falling back to in-request behavior:', storageError);
    }

    if (storage) {
      const [dailyCacheRaw, latestCacheRaw] = await Promise.all([
        forceRefresh ? Promise.resolve(null) : storage.getItem<ExchangeRateData>(dailyCacheKey),
        storage.getItem<ExchangeRateData>(latestCacheKey),
      ]);

      const dailyCache = isValidExchangeRateData(dailyCacheRaw) ? dailyCacheRaw : null;
      latestCache = isValidExchangeRateData(latestCacheRaw) ? latestCacheRaw : null;

      if (dailyCache?.fetchedForDay === todayKey) {
        return respondWith(dailyCache, 'shared-kv-daily-cache');
      }

      if (!forceRefresh && latestCache?.fetchedForDay === todayKey) {
        await storage.setItem(dailyCacheKey, latestCache);
        return respondWith(latestCache, 'shared-kv-latest-cache');
      }

      const existingLockRaw = await storage.getItem<RefreshLockData>(refreshLockKey);
      const existingLock = isValidRefreshLock(existingLockRaw) ? existingLockRaw : null;
      const activeLock = existingLock?.dayKey === todayKey && now - existingLock.lockedAt < LOCK_TTL_MS;

      if (activeLock) {
        for (let attempt = 0; attempt < LOCK_POLL_ATTEMPTS; attempt++) {
          await sleep(LOCK_POLL_INTERVAL_MS);
          const waitedDailyCache = await storage.getItem<ExchangeRateData>(dailyCacheKey);
          if (isValidExchangeRateData(waitedDailyCache) && waitedDailyCache.fetchedForDay === todayKey) {
            return respondWith(waitedDailyCache, 'shared-kv-waited-cache');
          }
        }

        if (!forceRefresh && latestCache) {
          return respondWith(latestCache, 'shared-kv-stale-cache', true);
        }

        return respondWith(fallbackData, 'build-time-fallback', true);
      }

      await storage.setItem(refreshLockKey, {
        dayKey: todayKey,
        lockedAt: now,
      });
      lockAcquired = true;
    }

    let exchangeRateData = fallbackData;

    if (!config.public.exchangeRateApiKey || config.public.exchangeRateApiKey === 'default_key' || config.public.exchangeRateApiKey === 'null') {
      console.warn('[exchange-rate] Missing exchange rate API key, serving build-time fallback');
    } else {
      console.log('[exchange-rate] Fetching fresh USD/CAD rate from upstream service');

      const response = await fetch(`https://v6.exchangerate-api.com/v6/${config.public.exchangeRateApiKey}/latest/USD`);

      if (!response.ok) {
        throw createError({
          statusCode: response.status,
          message: `Exchange rate API error: ${response.status}`,
        });
      }

      const data: ExchangeRateResponse = await response.json();

      if (
        data.result !== 'success' ||
        typeof data.conversion_rates?.CAD !== 'number' ||
        Number.isNaN(data.conversion_rates.CAD) ||
        data.conversion_rates.CAD <= 0
      ) {
        throw createError({
          statusCode: 500,
          message: 'Exchange rate API returned invalid CAD data',
        });
      }

      exchangeRateData = {
        rate: data.conversion_rates.CAD,
        lastUpdated: now,
        fetchedForDay: todayKey,
      };
    }

    if (storage) {
      await Promise.all([storage.setItem(dailyCacheKey, exchangeRateData), storage.setItem(latestCacheKey, exchangeRateData)]);
    }

    return respondWith(
      exchangeRateData,
      config.public.exchangeRateApiKey && config.public.exchangeRateApiKey !== 'default_key' && config.public.exchangeRateApiKey !== 'null'
        ? 'upstream-api'
        : 'build-time-fallback',
    );
  } catch (error) {
    console.error('[exchange-rate] Error fetching or caching rate:', error);

    if (latestCache) {
      return respondWith(latestCache, 'shared-kv-stale-cache', true);
    }

    return {
      success: true,
      data: fallbackData,
      source: 'build-time-fallback',
      stale: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    if (storage && lockAcquired) {
      await storage.removeItem(refreshLockKey).catch((lockError) => {
        console.warn('[exchange-rate] Failed to clear refresh lock:', lockError);
      });
    }
  }
});
