// server/api/cached-product.ts
import { defineEventHandler, readBody } from "h3";

export default defineEventHandler(async (event) => {
  try {
    const { slug } = await readBody(event);

    if (!slug) {
      return {
        success: false,
        error: "No slug provided",
      };
    }

    // Get the storage instance
    const storage = useStorage();

    // Try to get cached products
    const cachedProducts = await storage.getItem("cached-products");

    if (!cachedProducts || !Array.isArray(cachedProducts)) {
      return {
        success: false,
        error: "No cached products available",
      };
    }

    // Find the product with matching slug
    const product = cachedProducts.find((p) => p.slug === slug);

    if (!product) {
      return {
        success: false,
        error: "Product not found in cache",
      };
    }

    return {
      success: true,
      product,
    };
  } catch (error) {
    console.error("Error fetching cached product:", error);
    return {
      success: false,
      error: error.message,
    };
  }
});
