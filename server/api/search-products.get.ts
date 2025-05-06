// server/api/search-products.get.ts
import { defineEventHandler, createError } from "h3";
// Nitro's useStorage is auto-imported in server routes
// import { useStorage } from '#imports'; // Not typically needed for manual import

export default defineEventHandler(async (event) => {
  try {
    // Access the 'script_data' KV store.
    // 'script_data' is the mount point name defined in your nuxt.config.ts.
    // In production, this will point to your NUXT_SCRIPT_DATA KV namespace.
    const storage = useStorage("script_data");

    // Fetch the 'products-list' from KV.
    // This key ('products-list') must match the key used by your
    // build-products-cache.js script when it populates the KV store.
    const productsList = await storage.getItem("products-list");

    // Check if the products list was found in KV
    if (productsList === null || productsList === undefined) {
      // If no products list is found, log a warning and return an empty array.
      // This ensures the search composable on the client-side receives an array
      // and doesn't break, even if the data isn't available.
      console.warn(
        "API: No 'products-list' found in KV store ('script_data'). Returning empty array for search."
      );
      return []; // Return an empty array
    }

    // The data retrieved from KV via useStorage is automatically parsed if it was stored as an object/array.
    // Nitro's event handler will automatically set the correct Content-Type for JSON responses.
    return productsList;
  } catch (error: any) {
    // Log the error for server-side debugging
    console.error(
      "API Error: Failed to retrieve 'products-list' for search from KV:",
      error.message
    );
    console.error("Error details:", error); // Log full error object for more context

    // Return a structured error response to the client
    throw createError({
      statusCode: 500,
      statusMessage:
        "Internal Server Error: Could not retrieve products for search at this time.",
      // Optionally, you can add more data to the error if it's safe to expose
      // data: { details: "Failed to access underlying storage." }
    });
  }
});
