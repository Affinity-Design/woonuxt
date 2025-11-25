export default defineEventHandler(async (event) => {
  try {
    const fs = await import('fs');
    const path = await import('path');

    // Check if content directory exists
    const contentDir = path.resolve(process.cwd(), 'content', 'blog');
    const contentExists = fs.existsSync(contentDir);

    let blogPosts = [];
    if (contentExists) {
      try {
        const folders = fs.readdirSync(contentDir, {withFileTypes: true});
        blogPosts = folders.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
      } catch (error) {
        console.error('Error reading blog directory:', error);
      }
    }

    // Try to query content using Nuxt Content
    let contentQuery = null;
    try {
      const {serverQueryContent} = await import('#content/server');
      contentQuery = await serverQueryContent(event).find();
    } catch (error) {
      console.error('Error querying content:', error);
      contentQuery = {error: error.message};
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      platform: process.env.VERCEL ? 'vercel' : process.env.CF_PAGES ? 'cloudflare-pages' : 'other',
      contentDirectory: {
        path: contentDir,
        exists: contentExists,
        blogPosts: blogPosts,
      },
      contentQuery: contentQuery
        ? {
            count: Array.isArray(contentQuery) ? contentQuery.length : 'error',
            sample: Array.isArray(contentQuery) ? contentQuery.slice(0, 3) : contentQuery,
          }
        : 'failed',
      routes: {
        blogRoutes: await fs.promises
          .readFile(path.resolve(process.cwd(), 'data/blog-routes.json'), 'utf-8')
          .then((data) => JSON.parse(data))
          .catch(() => []),
        redirects: await fs.promises
          .readFile(path.resolve(process.cwd(), 'data/blog-redirects.json'), 'utf-8')
          .then((data) => JSON.parse(data))
          .catch(() => {}),
      },
    };

    setHeader(event, 'content-type', 'application/json');
    return debugInfo;
  } catch (error) {
    console.error('Debug API error:', error);
    return {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };
  }
});
