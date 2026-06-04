// server/api/cart-item-categories.post.ts
import {defineEventHandler, readBody} from 'h3';

interface ProductCategory {
  slug?: string;
  name?: string;
}

interface CachedProduct {
  slug?: string;
  productCategories?: {
    nodes?: ProductCategory[];
  };
}

const parseCachedProducts = (cachedProducts: unknown): CachedProduct[] | null => {
  if (Array.isArray(cachedProducts)) return cachedProducts;

  if (typeof cachedProducts === 'string' && cachedProducts.trim()) {
    try {
      const parsedProducts = JSON.parse(cachedProducts);
      return Array.isArray(parsedProducts) ? parsedProducts : null;
    } catch {
      return null;
    }
  }

  return null;
};

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const slugs: string[] = body?.slugs;

  if (!Array.isArray(slugs) || slugs.length === 0) {
    return {success: false, error: 'No slugs provided'};
  }

  // Cap at 50 to prevent abuse
  const limitedSlugs = slugs.slice(0, 50);

  const scriptDataStorage = useStorage('script_data');
  const defaultStorage = useStorage();
  const cachedProducts = parseCachedProducts(
    (await scriptDataStorage.getItem('products-list')) || (await defaultStorage.getItem('products-list')) || (await defaultStorage.getItem('cached-products')),
  );

  if (!cachedProducts) {
    return {success: false, error: 'No cached products available'};
  }

  // Build a lookup map from cached products
  const result: Record<string, {isClearance: boolean; categories: Array<{slug: string; name: string}>}> = {};

  for (const slug of limitedSlugs) {
    const product = cachedProducts.find((cachedProduct) => cachedProduct.slug === slug);
    if (product) {
      const categories = product.productCategories?.nodes || [];
      const isClearance = categories.some((category) => category.slug === 'clearance-items');
      result[slug] = {
        isClearance,
        categories: categories.map((category) => ({slug: category.slug || '', name: category.name || ''})),
      };
    }
  }

  return {success: true, data: result};
});
