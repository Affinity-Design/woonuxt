// server/api/scheduled-cache-warming.ts
export default defineEventHandler(async (event) => {
  const { cacheKey } = getQuery(event);

  // Get state from KV
  const storage = useStorage();
  const state = await storage.getItem(`cache:state:${cacheKey}`);

  // Process a small batch
  const urls = [
    /* get next batch of URLs */
  ];
  for (const url of urls) {
    await fetch(url);
  }

  // Save updated state
  await storage.setItem(`cache:state:${cacheKey}`, newState);

  return { success: true, processedUrls: urls.length };
});
