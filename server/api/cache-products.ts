// server/api/cache-products.ts
import { defineEventHandler, readBody, createError } from "h3";

export default defineEventHandler(async (event) => {
  try {
    // Get products and secret from request body
    const body = await readBody(event);
    const { products, secret } = body;
    
    // Check if secret is valid
    if (secret !== process.env.REVALIDATION_SECRET) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized - Invalid secret",
      });
    }
    
    // Check if products array is valid
    if (!products || !Array.isArray(products) || products.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad request - Invalid products data",
      });
    }
    
    // Get the storage instance
    const storage = useStorage();
    
    // Store the products in cache
    await storage.setItem('cached-products', products);
    
    // Store the last update timestamp
    const timestamp = new Date().toISOString();
    await storage.setItem('cached-products-updated', timestamp);
    
    // Return success response
    return {
      success: true,
      timestamp,
      productsCount: products.length,
      message: `Successfully cached ${products.length} products for search`,
    };
  } catch (error) {
    console.error('Error caching products:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to cache products',
    });
  }
});
