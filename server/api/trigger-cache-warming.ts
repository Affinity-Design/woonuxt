// server/api/trigger-cache-warming.ts
import { defineEventHandler, readBody, createError } from "h3";
import { spawn } from "child_process";

export default defineEventHandler(async (event) => {
  // Get request body
  const body = await readBody(event);
  const { secret, type = 'all' } = body;
  
  // Validate secret
  if (secret !== process.env.REVALIDATION_SECRET) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized - Invalid secret",
    });
  }
  
  try {
    // Determine which script to run
    let scriptArgs = ['scripts/cache-warmer.js'];
    
    // Add the type parameter
    if (type === 'categories') {
      scriptArgs.push('categories');
    } else if (type === 'products') {
      scriptArgs.push('products');
    } else {
      scriptArgs.push('all');
    }
    
    // Spawn the process in the background
    console.log(`Spawning cache warmer process with type: ${type}`);
    const process = spawn('node', scriptArgs, {
      detached: true,
      stdio: 'ignore'
    });
    
    // Unref the child process so the parent can exit
    process.unref();
    
    // Return success response
    return {
      success: true,
      message: `Cache warming process for ${type} started successfully`,
      processId: process.pid
    };
  } catch (error) {
    console.error('Error starting cache warming process:', error);
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to start cache warming process: ${error.message}`,
    });
  }
});
