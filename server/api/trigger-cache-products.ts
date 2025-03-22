// server/api/trigger-cache-products.ts
import { defineEventHandler, readBody, createError } from "h3";
import { spawn } from "child_process";

export default defineEventHandler(async (event) => {
  // Get request body
  const body = await readBody(event);
  const { secret } = body;
  
  // Validate secret
  if (secret !== process.env.REVALIDATION_SECRET) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized - Invalid secret",
    });
  }
  
  try {
    // Spawn the product cache builder in the background
    console.log('Spawning product cache builder process');
    const process = spawn('node', ['scripts/build-products-cache.js'], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        LIMIT_PRODUCTS: 'false' // Ensure we build the full product cache
      }
    });
    
    // Unref the child process so the parent can exit
    process.unref();
    
    // Return success response
    return {
      success: true,
      message: 'Product cache building process started successfully',
      processId: process.pid
    };
  } catch (error) {
    console.error('Error starting product cache building process:', error);
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to start product cache building process: ${error.message}`,
    });
  }
});
