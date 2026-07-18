import {createError, defineEventHandler, readBody} from 'h3';
// Lives in server/utils so nitro bundles it — a project-root utils/ import is treated as external
// and fails to resolve at runtime in dev (same class of bug as the serverGetProduct outage).
import {fetchProductWithRetry, ProductNotFoundError} from '../utils/fetchProductWithRetry.mjs';

const PRODUCT_CACHE_MAX_AGE_MILLISECONDS = 24 * 60 * 60 * 1000;

interface CachedProductRecord {
  cachedAt: number;
  product: any;
}

export default defineEventHandler(async (event) => {
  const {slug} = await readBody(event);

  if (typeof slug !== 'string' || !slug.trim()) {
    throw createError({statusCode: 400, statusMessage: 'No slug provided'});
  }

  const storage = useStorage('cache');
  const productCacheKey = `product-data:${slug}`;
  const cachedProductRecord = await storage.getItem<CachedProductRecord>(productCacheKey);
  const isCachedProductFresh =
    cachedProductRecord?.product &&
    Number.isFinite(cachedProductRecord.cachedAt) &&
    Date.now() - cachedProductRecord.cachedAt < PRODUCT_CACHE_MAX_AGE_MILLISECONDS;

  if (isCachedProductFresh) {
    return {
      success: true,
      product: cachedProductRecord.product,
      timestamp: cachedProductRecord.cachedAt,
    };
  }

  try {
    const product = await fetchProductWithRetry({
      slug,
      // Raw fetch with browser-like headers (see serverGetProduct.ts) — the nitro Gql* client
      // (graphql-request) fails at runtime in the deployed Cloudflare Worker, which broke every
      // product page ("We could not load this product", 2026-07-17).
      fetchProduct: (productSlug: string) => fetchProductViaGraphQL(productSlug),
    });
    const cachedAt = Date.now();

    await storage.setItem(productCacheKey, {product, cachedAt});

    return {
      success: true,
      product,
      timestamp: cachedAt,
    };
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      throw createError({statusCode: 404, statusMessage: 'Product not found'});
    }

    if (cachedProductRecord?.product) {
      console.warn(`[cached-product] Serving stale product data for ${slug} after refresh failed.`);
      return {
        success: true,
        product: cachedProductRecord.product,
        timestamp: cachedProductRecord.cachedAt,
        stale: true,
      };
    }

    console.error(`[cached-product] Failed to load ${slug}:`, error);
    throw createError({statusCode: 502, statusMessage: 'Product data is temporarily unavailable'});
  }
});
