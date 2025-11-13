export default defineEventHandler(async (event) => {
  try {
    // Try to read the sitemap data from Cloudflare KV first (production)
    // Then fall back to local file (development)
    let sitemapData;

    try {
      // PRODUCTION: Read from Cloudflare KV (NUXT_SCRIPT_DATA namespace)
      const storage = useStorage('script_data');
      sitemapData = await storage.getItem('sitemap-data');

      if (sitemapData) {
        console.log('[sitemap.xml] Using sitemap data from Cloudflare KV');
      }
    } catch (kvError) {
      console.warn('[sitemap.xml] Failed to read from KV, trying local file:', kvError);
    }

    // FALLBACK: Read from local file (development or if KV fails)
    if (!sitemapData) {
      try {
        const { readFileSync } = await import("fs");
        const { resolve } = await import("path");
        const dataPath = resolve(process.cwd(), "data", "sitemap-data.json");
        const rawData = readFileSync(dataPath, "utf8");
        sitemapData = JSON.parse(rawData);
        console.log('[sitemap.xml] Using sitemap data from local file');
      } catch (fileError) {
        console.warn('[sitemap.xml] Generated sitemap data not found in KV or filesystem');
        sitemapData = null;
      }
    }

    // LAST RESORT: Use hardcoded fallback routes
    if (!sitemapData) {
      console.warn("[sitemap.xml] Using fallback routes (minimal sitemap)");

      const staticRoutes = [
        "/",
        "/blog",
        "/categories",
        "/contact",
        "/terms",
        "/privacy",
      ];

      const fallbackBlogRoutes = [
        "/blog/best-inline-skates-2025",
        "/blog/roller-skating-toronto-guide",
        "/blog/skate-maintenance-winter",
      ];

      const fallbackCategoryRoutes = [
        "/product-category/inline-skates",
        "/product-category/roller-skates",
        "/product-category/replacement-parts",
        "/product-category/skate-tools",
        "/product-category/protection-gear-and-apparel",
        "/product-category/backpacks-bags-carriers",
        "/product-category/scooters",
        "/product-category/skateboards-and-longboards",
        "/product-category/alpine-skis",
        "/product-category/alpine-poles",
        "/product-category/cross-country-skis",
        "/product-category/cross-country-poles",
      ];

      const allRoutes = [
        ...staticRoutes,
        ...fallbackBlogRoutes,
        ...fallbackCategoryRoutes,
      ];

      sitemapData = {
        lastGenerated: new Date().toISOString(),
        routes: allRoutes.map((route) => ({
          url: route,
          lastmod: new Date().toISOString().split("T")[0],
          changefreq: route.includes("/blog/")
            ? "monthly"
            : route === "/"
              ? "daily"
              : "weekly",
          priority:
            route === "/" ? "1.0" : route.includes("/blog/") ? "0.8" : "0.7",
        })),
      };
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapData.routes
  .map(
    (route: any) => `  <url>
    <loc>https://proskatersplace.ca${route.url}</loc>
    <lastmod>${route.lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    setHeader(event, "content-type", "application/xml");
    setHeader(event, "cache-control", "max-age=3600"); // Cache for 1 hour
    setHeader(event, "x-sitemap-generated", sitemapData.lastGenerated);

    return sitemap;
  } catch (error) {
    console.error("Error generating sitemap:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Error generating sitemap",
    });
  }
});
