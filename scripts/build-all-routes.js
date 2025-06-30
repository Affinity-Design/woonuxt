const { resolve } = require("path");
const { readdir, writeFileSync, readFileSync, existsSync } = require("fs");
const { promisify } = require("util");

const readdirAsync = promisify(readdir);

/**
 * Generate blog routes from content directory
 */
async function generateBlogRoutes() {
  try {
    const blogDir = resolve(__dirname, "..", "content", "blog");
    
    if (!existsSync(blogDir)) {
      console.warn('Blog directory not found, creating empty blog routes');
      return [];
    }
    
    const blogFolders = await readdirAsync(blogDir, { withFileTypes: true });
    
    const blogRoutes = blogFolders
      .filter(dirent => dirent.isDirectory())
      .map(dirent => `/blog/${dirent.name}`);
    
    console.log(`Found ${blogRoutes.length} blog post routes:`, blogRoutes);
    return blogRoutes;
  } catch (error) {
    console.error("Error generating blog routes:", error);
    return [];
  }
}

/**
 * Generate category routes (if they exist in data)
 */
async function generateCategoryRoutes() {
  try {
    const categoryRoutesPath = resolve(__dirname, "..", "data", "category-routes.json");
    
    if (existsSync(categoryRoutesPath)) {
      const categoryData = JSON.parse(readFileSync(categoryRoutesPath, 'utf8'));
      console.log(`Found ${categoryData.length} category routes from existing data`);
      return categoryData;
    } else {
      console.warn('Category routes file not found, using fallback');
      return [
        '/product-category/inline-skates',
        '/product-category/roller-skates',
        '/product-category/replacement-parts',
        '/product-category/skate-tools',
        '/product-category/protection-gear-and-apparel',
        '/product-category/backpacks-bags-carriers', 
        '/product-category/scooters',
        '/product-category/skateboards-and-longboards',
        '/product-category/alpine-skis',
        '/product-category/alpine-poles',
        '/product-category/cross-country-skis',
        '/product-category/cross-country-poles'
      ];
    }
  } catch (error) {
    console.error("Error loading category routes:", error);
    return [];
  }
}

/**
 * Generate all routes for prerendering and sitemap
 */
async function generateAllRoutes() {
  console.log("🚀 Generating all routes for build process...");
  
  try {
    // Generate blog routes
    const blogRoutes = await generateBlogRoutes();
    const blogRoutesPath = resolve(__dirname, "..", "data", "blog-routes.json");
    writeFileSync(blogRoutesPath, JSON.stringify(blogRoutes, null, 2));
    console.log(`Blog routes written to: ${blogRoutesPath}`);
    
    // Get category routes
    const categoryRoutes = await generateCategoryRoutes();
    
    // Static routes
    const staticRoutes = [
      '/',
      '/blog',
      '/categories',
      '/contact',
      '/terms',
      '/privacy'
    ];
    
    // Combine all routes
    const allRoutes = [...staticRoutes, ...blogRoutes, ...categoryRoutes];
    
    // Generate sitemap data
    const sitemapData = {
      lastGenerated: new Date().toISOString(),
      routes: allRoutes.map(route => ({
        url: route,
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: route.includes('/blog/') ? 'monthly' : route === '/' ? 'daily' : 'weekly',
        priority: route === '/' ? '1.0' : route.includes('/blog/') ? '0.8' : '0.7'
      }))
    };
    
    const sitemapDataPath = resolve(__dirname, "..", "data", "sitemap-data.json");
    writeFileSync(sitemapDataPath, JSON.stringify(sitemapData, null, 2));
    console.log(`Sitemap data written to: ${sitemapDataPath}`);
    
    console.log(`✅ Generated routes for build:
    - Static: ${staticRoutes.length}
    - Blog: ${blogRoutes.length}
    - Categories: ${categoryRoutes.length}
    - Total: ${allRoutes.length}`);
    
    return {
      blogRoutes,
      categoryRoutes,
      staticRoutes,
      allRoutes,
      sitemapData
    };
    
  } catch (error) {
    console.error("❌ Error generating routes:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  generateAllRoutes()
    .then(() => {
      console.log("✅ Route generation completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Route generation failed:", error);
      process.exit(1);
    });
}

module.exports = {
  generateBlogRoutes,
  generateCategoryRoutes,
  generateAllRoutes
};
