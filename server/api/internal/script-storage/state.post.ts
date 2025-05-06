import {
  defineEventHandler,
  readBody,
  createError,
  getRequestHeader,
} from "h3";
// import { useRuntimeConfig } from '#imports'; // Nuxt 3 auto-imports this

// Define the expected structure of the state object (optional but recommended)
interface CacheWarmerState {
  lastRun: string | null;
  productsCursor: string | null;
  processedProducts: (string | number)[];
  processedCategories: (string | number)[];
  completedProducts: boolean;
  completedCategories: boolean;
  // Add any other fields your state object might have
}

export default defineEventHandler(async (event) => {
  // --- START: Security Check ---
  const runtimeConfig = useRuntimeConfig(event);
  const expectedSecret = runtimeConfig.REVALIDATION_SECRET; // Or runtimeConfig.internalApiSecret
  const providedSecret = getRequestHeader(event, "x-internal-secret");

  if (!expectedSecret) {
    console.error(
      "REVALIDATION_SECRET is not configured in runtimeConfig. API endpoint is vulnerable."
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Configuration Error: Secret not set.",
    });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    console.warn(
      `Unauthorized attempt to access /api/internal/script-storage/state. Provided secret: ${providedSecret ? providedSecret.substring(0, 5) + "..." : "none"}`
    );
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  // --- END: Security Check ---

  try {
    const stateData = await readBody<CacheWarmerState>(event);

    if (typeof stateData !== "object" || stateData === null) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid request body: Expected JSON object",
      });
    }

    // Optional: Add more specific validation for required fields in stateData
    // if (stateData.processedProducts === undefined /* etc. */) { ... }

    const storage = useStorage("script_data");
    const stateKey = "cache-warmer-state"; // The key for storing the state in KV

    await storage.setItem(stateKey, stateData);

    return { success: true, message: "State saved successfully." };
  } catch (error: any) {
    console.error("Error saving cache warmer state:", error);
    if (error.statusCode) {
      // If it's an H3 error (like 400 from readBody)
      throw error;
    }
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error: Could not save state.",
    });
  }
});
