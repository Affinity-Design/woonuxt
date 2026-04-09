// server/api/cart-item-categories.post.ts
import {defineEventHandler, readBody} from 'h3';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const slugs: string[] = body?.slugs;

  if (!Array.isArray(slugs) || slugs.length === 0) {
    return {success: false, error: 'No slugs provided'};
  }

  // Cap at 50 to prevent abuse
  const limitedSlugs = slugs.slice(0, 50);

  const storage = useStorage();
  const cachedProducts = await storage.getItem('cached-products');

  if (!cachedProducts || !Array.isArray(cachedProducts)) {
    return {success: false, error: 'No cached products available'};
  }

  // Build a lookup map from cached products
  const result: Record<string, {isClearance: boolean; categories: Array<{slug: string; name: string}>}> = {};

  for (const slug of limitedSlugs) {
    const product = cachedProducts.find((p: any) => p.slug === slug);
    if (product) {
      const categories = product.productCategories?.nodes || [];
      const isClearance = categories.some((cat: any) => cat.slug === 'clearance-items');
      result[slug] = {
        isClearance,
        categories: categories.map((cat: any) => ({slug: cat.slug, name: cat.name})),
      };
    }
  }

  return {success: true, data: result};
});
