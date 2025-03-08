// server/api/revalidate.ts
import { defineEventHandler, readBody, createError, getQuery } from "h3";

export default defineEventHandler(async (event) => {
  // Get the secret and path from the request body or query
  const query = getQuery(event);
  const body = await readBody(event).catch(() => ({}));

  const secret = body.secret || query.secret;
  const path = body.path || query.path;

  // Log revalidation request for debugging
  console.log(`Revalidation requested for path: ${path}`);

  // Check for secret to confirm this is a valid request
  if (secret !== process.env.REVALIDATION_SECRET) {
    console.log(`Invalid token provided: ${secret}`);
    return createError({
      statusCode: 401,
      statusMessage: "Invalid token",
    });
  }

  if (!path) {
    console.log("No path provided for revalidation");
    return createError({
      statusCode: 400,
      statusMessage: "Path is required",
    });
  }

  try {
    const storage = useStorage();

    // First try the direct cache key
    const cacheKey = `cache:${path}`;
    await storage.removeItem(cacheKey);
    console.log(`Removed cache key: ${cacheKey}`);

    // Also try alternative formats that Nuxt might use
    const altCacheKey1 = `cache:${path}/`;
    await storage.removeItem(altCacheKey1);

    const altCacheKey2 = `cache:${path.replace(/^\//, "")}`;
    await storage.removeItem(altCacheKey2);

    // Get all keys for debugging
    const keys = await storage.getKeys();
    console.log(
      `Current cache keys: ${keys.filter((k) => k.startsWith("cache:")).join(", ")}`
    );

    return {
      revalidated: true,
      message: `Path ${path} revalidated successfully`,
      keys: keys.filter((k) => k.startsWith("cache:")),
    };
  } catch (err) {
    console.error("Revalidation error:", err);
    // If there was an error, return it
    return createError({
      statusCode: 500,
      statusMessage: `Error revalidating: ${err.message}`,
    });
  }
});
