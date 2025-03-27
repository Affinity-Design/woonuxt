## How Product Page Caching Works

### First Visit (Before Warming):

When someone visits /product/example-product
Nuxt makes a GraphQL query to fetch product data (useAsyncGql("getProduct", { slug }))
Processes the data and renders the HTML
This can take several seconds depending on the complexity of the product

### After Cache Warming:

The cache warmer script visits each product page
The HTML response is stored in Cloudflare's KV storage
Future requests for the same URL return the cached HTML directly
No GraphQL queries are made for the initial page load

### The Result:

Pages load in milliseconds instead of seconds
The WordPress/WooCommerce backend experiences far less load
Users see a much faster, more responsive site

## Differnces between scripts

The build-products-cache.js script has its own separate file because it serves a completely different purpose than cache-warmer.js, even though both are related to caching.
Here's why build-products-cache.js exists as a separate script:

### Different Type of Cache:

build-products-cache.js creates a searchable JSON database of product data
cache-warmer.js generates HTML page caches by visiting URLs

### Different Data Requirements:

build-products-cache.js needs comprehensive product details (prices, descriptions, attributes)
cache-warmer.js only needs slugs to construct URLs

### Different Use Cases:

build-products-cache.js powers client-side search functionality
cache-warmer.js speeds up page loading

### Different Storage Mechanisms:

build-products-cache.js creates a single large JSON file
cache-warmer.js works with the server's HTML response cache

### Different Execution Patterns:

build-products-cache.js is often run during build time
cache-warmer.js is typically run post-deployment or on a schedule
