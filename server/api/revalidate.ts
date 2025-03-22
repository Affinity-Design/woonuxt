// server/api/revalidate.ts
import { defineEventHandler, readBody, createError, getQuery } from "h3";

export default defineEventHandler(async (event) => {
  // Get the secret and path from the request body or query
  const query = getQuery(event);
  const body = await readBody(event).catch(() => ({}));

  const secret = body.secret || query.secret;
  const path = body.path || query.path;
  const pattern = body.pattern || query.pattern;
  const type = body.type || query.type || 'page'; // 'page', 'product', 'category', or 'all'

  // Log revalidation request for debugging
  console.log(`Revalidation requested for path: ${path || pattern}, type: ${type}`);

  // Check for secret to confirm this is a valid request
  if (secret !== process.env.REVALIDATION_SECRET) {
    console.log(`Invalid token provided: ${secret}`);
    return createError({
      statusCode: 401,
      statusMessage: "Invalid token",
    });
  }

  if (!path && !pattern) {
    console.log("No path or pattern provided for revalidation");
    return createError({
      statusCode: 400,
      statusMessage: "Path or pattern is required",
    });
  }

  try {
    const storage = useStorage();
    let revalidatedKeys = [];

    // Function to check if a key matches our pattern
    const matchesPattern = (key, pattern) => {
      // Convert wildcard pattern to regex pattern
      const regexPattern = pattern.replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(key.replace('cache:', ''));
    };

    // Get all keys for processing
    const allKeys = await storage.getKeys();
    const cacheKeys = allKeys.filter(k => k.startsWith("cache:"));
    
    // If we have a specific path
    if (path) {
      // Try multiple variations of the path
      const pathVariations = [
        `cache:${path}`,
        `cache:${path}/`,
        `cache:${path.replace(/^\//, "")}`,
      ];
      
      for (const pathVariation of pathVariations) {
        if (await storage.hasItem(pathVariation)) {
          await storage.removeItem(pathVariation);
          revalidatedKeys.push(pathVariation);
        }
      }
    } 
    // If we have a pattern, remove all matching keys
    else if (pattern) {
      for (const key of cacheKeys) {
        if (matchesPattern(key, pattern)) {
          await storage.removeItem(key);
          revalidatedKeys.push(key);
        }
      }
    }
    
    // Handle type-based revalidation
    if (type === 'product' || type === 'all') {
      const productPattern = 'cache:/product/*';
      for (const key of cacheKeys) {
        if (matchesPattern(key, productPattern) && !revalidatedKeys.includes(key)) {
          await storage.removeItem(key);
          revalidatedKeys.push(key);
        }
      }
    }
    
    if (type === 'category' || type === 'all') {
      const categoryPattern = 'cache:/product-category/*';
      for (const key of cacheKeys) {
        if (matchesPattern(key, categoryPattern) && !revalidatedKeys.includes(key)) {
          await storage.removeItem(key);
          revalidatedKeys.push(key);
        }
      }
    }

    // Get remaining cache keys for debugging
    const remainingKeys = (await storage.getKeys()).filter(k => k.startsWith("cache:"));
    
    return {
      revalidated: true,
      count: revalidatedKeys.length,
      keys: revalidatedKeys,
      message: `Revalidated ${revalidatedKeys.length} paths successfully`,
      remainingCacheCount: remainingKeys.length,
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
