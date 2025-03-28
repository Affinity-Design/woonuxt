Local Caching Setup Guide for WooNuxt E-Commerce
This guide explains how to set up and use the advanced caching system for your WooNuxt e-commerce store in a local development environment.
Table of Contents

Initial Setup
Building the Product Search Cache
Warming Product and Category Pages
Testing the Cache
Troubleshooting
Preparing for Production

Initial Setup
Prerequisites

Node.js v16+ installed
Clone of your WooNuxt repository
Access to your WordPress GraphQL endpoint

Environment Configuration

Create or update your .env file with the following variables:
Copy# WordPress GraphQL Endpoint
GQL_HOST=https://your-wordpress-site.com/graphql

# Frontend URL (use HTTP for local development to avoid SSL issues)

FRONTEND_URL=http://localhost:3000

# Secret for API endpoints

REVALIDATION_SECRET=local-development-secret-key

Install dependencies:
bashCopynpm install

Ensure all required caching scripts are in your project:

scripts/setup-cache.js - Builds initial product search cache
scripts/build-products-cache.js - Builds the full product search cache
scripts/cache-warmer.js - Warms product and category pages
scripts/post-deploy.js - Handles post-deployment tasks
server/api/cache-products.ts - API endpoint for storing product cache
server/api/revalidate.ts - API endpoint for cache revalidation
server/api/trigger-cache-warming.ts - API endpoint to trigger cache warming
server/api/trigger-cache-products.ts - API endpoint to trigger product cache building

Building the Product Search Cache
The product search cache allows your site to search products instantly without making GraphQL queries.

### Run the Setup Script

`npm run setup-cache`

This script:

Builds an initial product search cache with the most important products
Creates a signal file for post-deployment cache warming
Limits to 200 products by default to ensure it completes quickly

The output should show:
Copy🚀 Setting up caching system during build phase...
📦 Building initial product search cache (limited to recent/popular products)...
Starting products cache builder (BUILD MODE)...
...
Successfully cached 200 products for search.
🏁 Creating signal file for post-deployment cache warming...
✅ Build-time cache setup complete!
Building the Full Product Cache
If you want to build the complete product cache (all products):
bashCopynpm run build-product-cache
This script:

Fetches all products from your GraphQL endpoint
Stores them in the search cache
Takes longer but provides complete search capabilities

Warming Product and Category Pages
The cache warmer visits and caches HTML pages for faster loading.

### Warming Category Pages

`npm run warm-cache categories`

This script:

Fetches all category slugs from your GraphQL endpoint
Visits each category page to build the cache
Tracks progress in a state file

### Warming Product Pages

bashCopynpm run warm-cache products
This script:

Fetches all product slugs from your GraphQL endpoint
Visits each product page to build the cache
Tracks progress in a state file
May take a while for large catalogs

Warming Everything
bashCopynpm run warm-cache all
This will warm both categories and products.
Force Refresh
To refresh existing cache:
bashCopynpm run warm-cache all --force
Testing the Cache
Start the Development Server
bashCopynpm run dev
Verifying Product Search Cache

Open your browser to http://localhost:3000
Use the search functionality
Search should be instant and not trigger GraphQL queries

Verifying Page Cache

Visit a product page (e.g., http://localhost:3000/product/example-product)
First load may be slow if not cached
Refresh the page - it should load almost instantly
Check browser network tab - page should load in milliseconds

Troubleshooting
SSL Certificate Issues
If you get SSL certificate errors:
CopyError: unable to verify the first certificate
Solutions:

Use HTTP instead of HTTPS for local development:
CopyFRONTEND_URL=http://localhost:3000

Or disable SSL verification in the scripts:
javascriptCopyconst https = require('https');
const agent = new https.Agent({
rejectUnauthorized: false // Disable certificate verification
});

GraphQL Connection Issues
If you can't connect to your GraphQL endpoint:

Verify the GQL_HOST variable in your .env file
Check if your WordPress site has CORS enabled
Try using the WordPress admin to test the GraphQL endpoint

Cache Not Working
If pages aren't being cached:

Check that .nuxt/cache/ directory exists
Verify that API endpoints are being called correctly
Check server logs for errors

Preparing for Production
Environment Variables for Production
For Cloudflare Pages, set these environment variables:
CopyGQL_HOST=https://admin.yourdomain.com/graphql
FRONTEND_URL=https://yourdomain.com
REVALIDATION_SECRET=your-secure-secret-key
Deployment Configuration

Add the wrangler.toml configuration:
tomlCopyname = "your-site"
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
crons = ["0 0 * * *"] # Run daily

Update your package.json scripts:
jsonCopy"scripts": {
"setup-cache": "node scripts/setup-cache.js",
"warm-cache": "node scripts/cache-warmer.js",
"build-product-cache": "node scripts/build-products-cache.js"
}

Cache Maintenance Strategy

Regular Refreshes: Set up cron triggers to refresh the cache daily
Webhooks: Configure WooCommerce webhooks to trigger cache updates when content changes
Manual Refresh: Provide an admin endpoint for manual cache refreshes

By following this guide, you'll have a fully functional caching system for your WooNuxt e-commerce store, providing blazing-fast page loads and search functionality.
