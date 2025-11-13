/**
 * Build Complete Sitemap with Products, Categories, Blog Posts, and Static Pages
 *
 * This script generates a comprehensive sitemap for SEO by:
 * 1. Fetching all products from GraphQL
 * 2. Fetching all categories from GraphQL
 * 3. Reading blog posts from content directory
 * 4. Combining with static routes
 * 5. Generating SEO metadata for each product page
 * 6. Creating sitemap XML files
 *
 * Can be run:
 * - During build (npm run build-sitemap)
 * - Locally for testing (npm run build-sitemap:local)
 * - As part of the main build process
 */

require('dotenv').config();
const fetch = require('node-fetch');
const {resolve} = require('path');
const {readdir, writeFileSync, existsSync, mkdirSync} = require('fs');
const {promisify} = require('util');

const readdirAsync = promisify(readdir);

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 50, // Fetch 50 products/categories at a time
  BATCH_DELAY: 300, // Delay between batches (ms)
  OUTPUT_DIR: resolve(__dirname, '..', 'data'),
  SITEMAP_FILE: 'sitemap-data.json',
  PRODUCT_SEO_FILE: 'product-seo-meta.json',
  BASE_URL: 'https://proskatersplace.ca',
  // Cloudflare KV Configuration
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA,
  KV_KEY_SITEMAP: 'sitemap-data', // Key for storing sitemap in KV
  KV_KEY_PRODUCT_SEO: 'product-seo-meta', // Key for storing product SEO metadata in KV
};

// GraphQL Queries
const PRODUCTS_QUERY = `
  query GetAllProductsForSitemap($first: Int!, $after: String) {
    products(first: $first, after: $after, where: { orderby: { field: DATE, order: DESC } }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        databaseId
        slug
        name
        shortDescription
        modified
        ... on SimpleProduct {
          price(format: RAW)
          regularPrice(format: RAW)
          onSale
          stockStatus
          image {
            sourceUrl
            altText
          }
        }
        ... on VariableProduct {
          price(format: RAW)
          regularPrice(format: RAW)
          onSale
          stockStatus
          image {
            sourceUrl
            altText
          }
        }
        productCategories {
          nodes {
            name
            slug
          }
        }
      }
    }
  }
`;

const CATEGORIES_QUERY = `
  query GetAllCategoriesForSitemap($first: Int = 100) {
    productCategories(first: $first, where: { hideEmpty: true }) {
      nodes {
        databaseId
        slug
        name
        description
        count
        image {
          sourceUrl
          altText
        }
      }
    }
  }
`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch all products from GraphQL for sitemap
 */
async function fetchAllProducts() {
  console.log('📦 Fetching all products from GraphQL...');

  if (!CONFIG.WP_GRAPHQL_URL) {
    console.error('❌ GQL_HOST is not defined. Cannot fetch products.');
    return [];
  }

  let allProducts = [];
  let hasNextPage = true;
  let endCursor = null;
  let batchCount = 0;

  try {
    while (hasNextPage) {
      batchCount++;
      console.log(`   Batch ${batchCount}, cursor: ${endCursor || 'Start'}`);

      const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: CONFIG.BATCH_SIZE,
            after: endCursor,
          },
        }),
      });

      if (!response.ok) {
        console.error(`❌ GraphQL request failed: ${response.status}`);
        break;
      }

      const result = await response.json();

      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        break;
      }

      if (!result.data?.products?.nodes) {
        console.warn('⚠️  No products data in response');
        break;
      }

      const products = result.data.products.nodes;
      allProducts.push(...products);
      console.log(`   Fetched ${products.length} products. Total: ${allProducts.length}`);

      hasNextPage = result.data.products.pageInfo.hasNextPage;
      endCursor = result.data.products.pageInfo.endCursor;

      if (hasNextPage && CONFIG.BATCH_DELAY > 0) {
        await delay(CONFIG.BATCH_DELAY);
      }
    }

    console.log(`✅ Fetched ${allProducts.length} total products`);
    return allProducts;
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    return [];
  }
}

/**
 * Fetch all categories from GraphQL for sitemap
 */
async function fetchAllCategories() {
  console.log('📁 Fetching all categories from GraphQL...');

  if (!CONFIG.WP_GRAPHQL_URL) {
    console.error('❌ GQL_HOST is not defined. Cannot fetch categories.');
    return [];
  }

  try {
    const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        query: CATEGORIES_QUERY,
        variables: {first: 500},
      }),
    });

    if (!response.ok) {
      console.error(`❌ GraphQL request failed: ${response.status}`);
      return [];
    }

    const result = await response.json();

    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return [];
    }

    if (!result.data?.productCategories?.nodes) {
      console.warn('⚠️  No categories data in response');
      return [];
    }

    const categories = result.data.productCategories.nodes;
    console.log(`✅ Fetched ${categories.length} categories`);
    return categories;
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    return [];
  }
}

/**
 * Get blog routes from content directory
 */
async function getBlogRoutes() {
  console.log('📝 Scanning blog posts...');

  try {
    const blogDir = resolve(__dirname, '..', 'content', 'blog');

    if (!existsSync(blogDir)) {
      console.warn('⚠️  Blog directory not found');
      return [];
    }

    const blogFolders = await readdirAsync(blogDir, {withFileTypes: true});
    const blogRoutes = blogFolders.filter((dirent) => dirent.isDirectory()).map((dirent) => `/blog/${dirent.name}`);

    console.log(`✅ Found ${blogRoutes.length} blog posts`);
    return blogRoutes;
  } catch (error) {
    console.error('❌ Error reading blog directory:', error);
    return [];
  }
}

/**
 * Generate SEO metadata for products using Canadian SEO pattern
 */
function generateProductSEOMetadata(products) {
  console.log('🎯 Generating SEO metadata for products...');

  const productSEO = products.map((product) => {
    // Extract first category for SEO
    const primaryCategory = product.productCategories?.nodes?.[0]?.name || 'Products';

    // Create SEO-optimized title
    const title = `${product.name} | Buy Online in Canada | ProSkaters Place`;

    // Create description from short description or generate one
    let description = product.shortDescription || '';
    if (description) {
      // Strip HTML and limit length
      description = description.replace(/<[^>]*>/g, '').substring(0, 160);
    } else {
      description = `Shop ${product.name} at ProSkaters Place Canada. ${primaryCategory} available online with fast Canadian shipping. Best prices and expert advice.`;
    }

    // Price information
    const price = product.price ? parseFloat(product.price) : null;
    const inStock = product.stockStatus === 'IN_STOCK';

    return {
      slug: product.slug,
      url: `/product/${product.slug}`,
      seo: {
        title,
        description,
        image: product.image?.sourceUrl || '/images/default-product.jpg',
        imageAlt: product.image?.altText || product.name,
        type: 'product',
        locale: 'en-CA',
        price,
        currency: 'CAD',
        availability: inStock ? 'in stock' : 'out of stock',
        category: primaryCategory,
        modified: product.modified,
      },
    };
  });

  console.log(`✅ Generated SEO metadata for ${productSEO.length} products`);
  return productSEO;
}

/**
 * Upload sitemap data to Cloudflare KV
 * @param {Object} sitemapData - The complete sitemap data object
 * @returns {Promise<boolean>} - Success status
 */
async function uploadSitemapToKV(sitemapData) {
  if (!CONFIG.CF_ACCOUNT_ID || !CONFIG.CF_API_TOKEN || !CONFIG.CF_KV_NAMESPACE_ID) {
    console.warn('\n⚠️  Cloudflare KV credentials not found. Skipping KV upload.');
    console.warn('   Sitemap will be available locally but not on production.');
    console.warn('   Set CF_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID_SCRIPT_DATA environment variables.');
    return false;
  }

  console.log(`\n📤 Uploading sitemap data to Cloudflare KV...`);
  console.log(`   Account: ${CONFIG.CF_ACCOUNT_ID}`);
  console.log(`   Namespace: ${CONFIG.CF_KV_NAMESPACE_ID}`);
  console.log(`   Key: ${CONFIG.KV_KEY_SITEMAP}`);

  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_SITEMAP}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sitemapData),
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.success) {
      console.error(`\n❌ Error storing sitemap in KV: ${response.status} ${response.statusText}`);
      console.error('   Response:', responseData);
      return false;
    }

    console.log(`✅ Successfully uploaded sitemap to KV (${sitemapData.totalRoutes} routes, ${Math.round(JSON.stringify(sitemapData).length / 1024)} KB)`);
    return true;
  } catch (error) {
    console.error('\n❌ Error making API call to Cloudflare KV:', error);
    return false;
  }
}

/**
 * Upload product SEO metadata to Cloudflare KV
 * @param {Array} productSEO - Array of product SEO metadata objects
 * @returns {Promise<boolean>} - Success status
 */
async function uploadProductSEOToKV(productSEO) {
  if (!CONFIG.CF_ACCOUNT_ID || !CONFIG.CF_API_TOKEN || !CONFIG.CF_KV_NAMESPACE_ID) {
    console.warn('\n⚠️  Cloudflare KV credentials not found. Skipping product SEO upload.');
    return false;
  }

  console.log(`\n📤 Uploading product SEO metadata to Cloudflare KV...`);
  console.log(`   Products: ${productSEO.length}`);
  console.log(`   Key: ${CONFIG.KV_KEY_PRODUCT_SEO}`);

  // Convert array to object for faster lookup by slug
  const seoBySlug = {};
  productSEO.forEach((item) => {
    seoBySlug[item.slug] = item;
  });

  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_PRODUCT_SEO}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(seoBySlug),
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.success) {
      console.error(`\n❌ Error storing product SEO in KV: ${response.status} ${response.statusText}`);
      console.error('   Response:', responseData);
      return false;
    }

    console.log(`✅ Successfully uploaded product SEO to KV (${productSEO.length} products, ${Math.round(JSON.stringify(seoBySlug).length / 1024)} KB)`);
    return true;
  } catch (error) {
    console.error('\n❌ Error making API call to Cloudflare KV:', error);
    return false;
  }
}

/**
 * Generate complete sitemap data
 */
async function generateCompleteSitemap() {
  console.log('🗺️  Generating complete sitemap...\n');

  // Ensure output directory exists
  if (!existsSync(CONFIG.OUTPUT_DIR)) {
    mkdirSync(CONFIG.OUTPUT_DIR, {recursive: true});
  }

  // Fetch all data
  const [products, categories, blogRoutes] = await Promise.all([fetchAllProducts(), fetchAllCategories(), getBlogRoutes()]);

  // Generate product SEO metadata
  const productSEO = generateProductSEOMetadata(products);

  // Static routes
  const staticRoutes = ['/', '/blog', '/categories', '/products', '/contact', '/terms', '/privacy'];

  // Build product routes
  const productRoutes = products.map((product) => ({
    url: `/product/${product.slug}`,
    lastmod: product.modified || new Date().toISOString().split('T')[0],
    changefreq: 'weekly',
    priority: '0.7',
    type: 'product',
  }));

  // Build category routes
  const categoryRoutes = categories.map((category) => ({
    url: `/product-category/${category.slug}`,
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'daily',
    priority: '0.8',
    type: 'category',
  }));

  // Build blog routes
  const blogRoutesData = blogRoutes.map((route) => ({
    url: route,
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: '0.8',
    type: 'blog',
  }));

  // Build static routes
  const staticRoutesData = staticRoutes.map((route) => ({
    url: route,
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? '1.0' : '0.7',
    type: 'static',
  }));

  // Combine all routes
  const allRoutes = [...staticRoutesData, ...blogRoutesData, ...categoryRoutes, ...productRoutes];

  // Create sitemap data
  const sitemapData = {
    lastGenerated: new Date().toISOString(),
    totalRoutes: allRoutes.length,
    breakdown: {
      static: staticRoutesData.length,
      blog: blogRoutesData.length,
      categories: categoryRoutes.length,
      products: productRoutes.length,
    },
    routes: allRoutes,
  };

  // Write sitemap data
  const sitemapPath = resolve(CONFIG.OUTPUT_DIR, CONFIG.SITEMAP_FILE);
  writeFileSync(sitemapPath, JSON.stringify(sitemapData, null, 2));
  console.log(`\n✅ Sitemap data written to: ${sitemapPath}`);

  // Write product SEO metadata
  const seoPath = resolve(CONFIG.OUTPUT_DIR, CONFIG.PRODUCT_SEO_FILE);
  writeFileSync(seoPath, JSON.stringify(productSEO, null, 2));
  console.log(`✅ Product SEO metadata written to: ${seoPath}`);

  // Generate simple route lists for Nuxt prerendering
  const productRoutesList = productRoutes.map((r) => r.url);
  const categoryRoutesList = categoryRoutes.map((r) => r.url);

  writeFileSync(resolve(CONFIG.OUTPUT_DIR, 'product-routes.json'), JSON.stringify(productRoutesList, null, 2));
  writeFileSync(resolve(CONFIG.OUTPUT_DIR, 'category-routes.json'), JSON.stringify(categoryRoutesList, null, 2));
  writeFileSync(resolve(CONFIG.OUTPUT_DIR, 'blog-routes.json'), JSON.stringify(blogRoutes, null, 2));

  console.log(`\n📊 Sitemap Summary:
    - Static pages:     ${sitemapData.breakdown.static}
    - Blog posts:       ${sitemapData.breakdown.blog}
    - Categories:       ${sitemapData.breakdown.categories}
    - Products:         ${sitemapData.breakdown.products}
    - TOTAL ROUTES:     ${sitemapData.totalRoutes}
  `);

  // Upload to Cloudflare KV
  await uploadSitemapToKV(sitemapData);
  await uploadProductSEOToKV(productSEO);

  return sitemapData;
}

// Run if called directly
if (require.main === module) {
  generateCompleteSitemap()
    .then((data) => {
      console.log('✅ Sitemap generation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Sitemap generation failed:', error);
      process.exit(1);
    });
}

module.exports = {
  generateCompleteSitemap,
  fetchAllProducts,
  fetchAllCategories,
};
