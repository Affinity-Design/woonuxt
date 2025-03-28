// server/api/products-cache.ts
import { defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  try {
    // Get the storage instance
    const storage = useStorage();

    // Try to get products from cache
    const cachedProducts = await storage.getItem("cached-products");

    if (!cachedProducts) {
      return {
        products: [],
        cached: false,
        message: "No products in cache",
      };
    }

    return {
      products: cachedProducts,
      cached: true,
      timestamp: (await storage.getItem("cached-products-updated")) || null,
    };
  } catch (error) {
    console.error("Error retrieving cached products:", error);
    return {
      products: [],
      cached: false,
      error: error.message,
    };
  }
});
