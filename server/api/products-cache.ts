// server/api/products-cache.ts
import { defineEventHandler } from "h3";
import { readFileSync } from "fs";
import { resolve } from "path";

export default defineEventHandler(async (event) => {
  try {
    // Path to the cached products file
    const cachePath = resolve(
      process.cwd(),
      ".nuxt/cache/cached-products.json"
    );

    // Read the file
    const productsData = JSON.parse(readFileSync(cachePath, "utf-8"));

    return {
      success: true,
      products: productsData,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error reading cached products:", error);
    return {
      success: false,
      error: error.message,
      products: [],
    };
  }
});
