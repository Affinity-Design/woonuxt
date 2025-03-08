// server/api/revalidate.ts
import { defineEventHandler, readBody, createError, getQuery } from "h3";

export default defineEventHandler(async (event) => {
  // Get the secret and path from the request body or query
  const query = getQuery(event);
  const body = await readBody(event).catch(() => ({}));

  const secret = body.secret || query.secret;
  const path = body.path || query.path;

  // Check for secret to confirm this is a valid request
  if (secret !== process.env.REVALIDATION_SECRET) {
    return createError({
      statusCode: 401,
      statusMessage: "Invalid token",
    });
  }

  if (!path) {
    return createError({
      statusCode: 400,
      statusMessage: "Path is required",
    });
  }

  try {
    // Clear the cache for this path with Nuxt 3 cache API
    await useStorage().removeItem(`cache:${path}`);

    return {
      revalidated: true,
      message: `Path ${path} revalidated successfully`,
    };
  } catch (err) {
    console.error("Revalidation error:", err);
    // If there was an error, return it
    return createError({
      statusCode: 500,
      statusMessage: "Error revalidating",
    });
  }
});
