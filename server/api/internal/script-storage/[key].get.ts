import {
  defineEventHandler,
  getRouterParam,
  createError,
  getRequestHeader,
} from "h3";
// Ensure you have access to runtimeConfig for the secret
// This is typically available in Nuxt 3 server routes.
// import { useRuntimeConfig } from '#imports'; // Nuxt 3 auto-imports this

export default defineEventHandler(async (event) => {
  // --- START: Security Check ---
  const runtimeConfig = useRuntimeConfig(event);
  const expectedSecret = runtimeConfig.REVALIDATION_SECRET; // Or runtimeConfig.internalApiSecret if you define a new one
  const providedSecret = getRequestHeader(event, "x-internal-secret");

  if (!expectedSecret) {
    console.error(
      "REVALIDATION_SECRET is not configured in runtimeConfig. API endpoint is vulnerable."
    );
    // In a real scenario, you might want to prevent the API from functioning if the secret isn't set up.
    // For now, we'll throw an error if it's missing, as it's a critical security component.
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Configuration Error: Secret not set.",
    });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    console.warn(
      `Unauthorized attempt to access /api/internal/script-storage/:key. Provided secret: ${providedSecret ? providedSecret.substring(0, 5) + "..." : "none"}`
    );
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  // --- END: Security Check ---

  const key = getRouterParam(event, "key");

  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing key parameter",
    });
  }

  try {
    const storage = useStorage("script_data"); // Accesses the 'script_data' KV store
    const data = await storage.getItem(key);

    if (data === null || data === undefined) {
      return sendNoContent(event, 204); // No content found for the key
    }

    // Nitro automatically handles JSON stringification for objects/arrays.
    // If data is already a string (like raw JSON from KV), it's returned as is.
    return data;
  } catch (error: any) {
    console.error(
      `Error reading from script_data storage for key "${key}":`,
      error
    );
    throw createError({
      statusCode: 500,
      statusMessage: `Internal Server Error: Could not retrieve data for key ${key}`,
    });
  }
});
