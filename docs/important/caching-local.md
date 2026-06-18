```markdown
# Local Caching Setup Guide for WooNuxt E-Commerce

This guide explains how to set up and use the advanced caching system for your WooNuxt e-commerce store in a local development environment.

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Building Data Caches](#building-data-caches)
3. [Warming Page Caches](#warming-page-caches)
4. [Testing the Cache](#testing-the-cache)
5. [Troubleshooting](#troubleshooting)
6. [Preparing for Production](#preparing-for-production)

## Initial Setup

### Prerequisites

- Node.js v16+ installed
- Clone of your WooNuxt repository
- Access to your WordPress GraphQL endpoint

### Environment Configuration

Create or update your `.env` file with the following variables:
```

# WordPress GraphQL Endpoint

GQL_HOST=https://your-wordpress-site.com/graphql

# Frontend URL (use HTTP for local development to avoid SSL issues)

FRONTEND_URL=http://localhost:3000

# Secret for API endpoints

REVALIDATION_SECRET=local-development-secret-key

````

### Install dependencies:

```bash
npm install
````

### Ensure all required caching scripts are in your project:

- `scripts/setup-cache.js` - Configures initial cache settings
- `scripts/build-products-cache.js` - Builds the product data cache
- `scripts/build-categories-cache.js` - Builds the category data cache
- `scripts/cache-warmer.js` - Warms HTML pages for faster loading
- `scripts/cache-utils.js` - Shared utilities for caching scripts
- `scripts/run-all-caching.js` - Coordinates all caching operations
- `server/api/cached-product.ts` - API endpoint for accessing cached products
- `server/api/cache-products.ts` - API endpoint for updating product cache
- `server/api/revalidate.ts` - API endpoint for cache invalidation
- `server/api/trigger-cache-warming.ts` - API endpoint to trigger cache warming

## Building Data Caches

The data caches store product and category information for fast searching and browsing without making GraphQL queries for every request.

### Build the Product Cache

To build the complete product cache:

```bash
npm run build-product-cache
```

This script:

- Fetches all products from your GraphQL endpoint using the full query
- Stores them in a structured JSON file (`.nuxt/cache/cached-products.json`)
- Includes all product data (images, variations, pricing, etc.)

The output should show:

```
Starting products cache builder...
Fetching batch 1 of products with cursor: Start
Fetched 10 products. Running total: 10
...
Successfully stored 1667 products in local cache file
Successfully cached 1667 products for search.
```

### Build the Category Cache

To build the category cache:

```bash
npm run build-category-cache
```

This script:

- Fetches all categories from your GraphQL endpoint
- Stores them in a cache file (`.nuxt/cache/cached-categories.json`)
- Includes hierarchy and relationship information

## Warming Page Caches

The cache warmer pre-generates HTML pages to make subsequent visits extremely fast.

### Warming Specific Page Types

To warm just product pages:

```bash
npm run warm-cache products
```

To warm just category pages:

```bash
npm run warm-cache categories
```

### Warming Everything

To warm all page types:

```bash
npm run warm-cache all
```

This will:

1. Check for existing caches and warm state
2. Visit and cache all product and category pages
3. Track progress in a state file (`.cache-warmer-state.json`)

### Complete Cache Rebuild

To build all caches and warm all pages:

```bash
npm run rebuild-cache
```

This runs the complete process:

1. Builds the product cache
2. Builds the category cache
3. Warms product pages
4. Warms category pages
5. Warms the homepage

### Force Refresh

To refresh existing cache:

```bash
npm run warm-cache all --force
```

## Testing the Cache

### Start the Development Server

```bash
npm run dev
```

Or with SSL:

```bash
npm run dev:ssl
```

### Verifying Product Search Cache

1. Open your browser to http://localhost:3000
2. Use the search functionality
3. Search should be instant and not trigger GraphQL queries
4. Check browser network tab - no GraphQL requests for search

### Verifying Page Cache

1. Visit a product page (e.g., http://localhost:3000/product/example-product)
2. First load may be slow if not cached (it's fetching from GraphQL)
3. Refresh the page - it should load almost instantly
4. Subsequent visits should load in milliseconds

## Troubleshooting

### SSL Certificate Issues

If you get SSL certificate errors:

```
Error: unable to verify the first certificate
```

Solutions:

1. Use HTTP instead of HTTPS for local development:

   ```
   FRONTEND_URL=http://localhost:3000
   ```

2. Or use the built-in certificate handling in `cache-utils.js`:
   ```javascript
   const agent = await createHttpsAgent();
   ```

### GraphQL Connection Issues

If you can't connect to your GraphQL endpoint:

1. Verify the GQL_HOST variable in your .env file
2. Check if your WordPress site has CORS enabled
3. Try using the WordPress admin to test the GraphQL endpoint
4. Check for firewall or network issues

### Cache Not Working

If pages aren't being cached:

1. Check that `.nuxt/cache/` directory exists and has the cache files
2. Verify file permissions (the cache files should be readable)
3. Look for errors in the cache building scripts
4. Try running with the `--force` flag to rebuild the cache

## Preparing for Production

### Environment Variables for Production

For Cloudflare Pages, set these environment variables:

```
GQL_HOST=https://admin.yourdomain.com/graphql
FRONTEND_URL=https://yourdomain.com
REVALIDATION_SECRET=your-secure-secret-key
```

### Deployment Configuration

Add the `wrangler.toml` configuration:

```toml
name = "your-site"
compatibility_date = "2023-10-30"

# KV Namespace binding
kv_namespaces = [
  { binding = "NUXT_CACHE", id = "your-kv-namespace-id" }
]

[build]
command = "npm run build && npm run setup-cache"

[build.uploadDirectory]
command = "node scripts/post-deploy.js"

[triggers]
crons = ["0 0 * * *"] # Run daily at midnight
```

### Update your package.json scripts:

```json
"scripts": {
  "setup-cache": "node scripts/setup-cache.js",
  "build-product-cache": "node scripts/build-products-cache.js",
  "build-category-cache": "node scripts/build-categories-cache.js",
  "warm-cache": "node scripts/cache-warmer.js",
  "warm-products": "node scripts/cache-warmer.js products",
  "warm-categories": "node scripts/cache-warmer.js categories",
  "rebuild-cache": "node scripts/run-all-caching.js",
  "dev:ssl": "nuxt dev --https --ssl-cert localhost.pem --ssl-key localhost-key.pem"
}
```

### Cache Maintenance Strategy

1. **Regular Refreshes**: Set up cron triggers to refresh the cache daily
2. **Webhooks**: Configure WooCommerce webhooks to trigger cache updates when content changes
3. **Manual Refresh**: Provide an admin endpoint for manual cache refreshes
4. **Partial Updates**: Use targeted cache invalidation for specific products or categories

By following this guide, you'll have a fully functional multi-level caching system for your WooNuxt e-commerce store, providing blazing-fast page loads and search functionality while reducing load on your WordPress backend.

```

```
