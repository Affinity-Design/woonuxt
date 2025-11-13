export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Product slug is required',
    });
  }

  try {
    // Try to read from Cloudflare KV first (production)
    let productSEOData;

    try {
      const storage = useStorage('script_data');
      const allProductSEO = await storage.getItem('product-seo-meta');

      if (allProductSEO && typeof allProductSEO === 'object') {
        // Data is stored as {slug: seoData} object for fast lookup
        productSEOData = (allProductSEO as any)[slug];

        if (productSEOData) {
          console.log('[product-seo API] Using SEO data from Cloudflare KV for:', slug);
        }
      }
    } catch (kvError) {
      console.warn('[product-seo API] Failed to read from KV, trying local file:', kvError);
    }

    // Fallback to local file (development)
    if (!productSEOData) {
      try {
        const {readFileSync} = await import('fs');
        const {resolve} = await import('path');
        const dataPath = resolve(process.cwd(), 'data', 'product-seo-meta.json');
        const rawData = readFileSync(dataPath, 'utf8');
        const allProductSEO = JSON.parse(rawData);

        // Data can be array or object, handle both
        if (Array.isArray(allProductSEO)) {
          productSEOData = allProductSEO.find((p: any) => p.slug === slug);
        } else {
          productSEOData = allProductSEO[slug];
        }

        if (productSEOData) {
          console.log('[product-seo API] Using SEO data from local file for:', slug);
        }
      } catch (fileError) {
        console.warn('[product-seo API] Failed to read from local file:', fileError);
      }
    }

    // If still not found, return 404
    if (!productSEOData) {
      throw createError({
        statusCode: 404,
        statusMessage: `SEO data not found for product: ${slug}`,
      });
    }

    // Return the SEO data
    return productSEOData;
  } catch (error) {
    console.error('[product-seo API] Error fetching SEO data:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Error fetching product SEO data',
    });
  }
});
