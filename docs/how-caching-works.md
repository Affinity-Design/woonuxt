How Product Page Caching Works

First Visit (Before Warming):

When someone visits /product/example-product
Nuxt makes a GraphQL query to fetch product data (useAsyncGql("getProduct", { slug }))
Processes the data and renders the HTML
This can take several seconds depending on the complexity of the product

After Cache Warming:

The cache warmer script visits each product page
The HTML response is stored in Cloudflare's KV storage
Future requests for the same URL return the cached HTML directly
No GraphQL queries are made for the initial page load

The Result:

Pages load in milliseconds instead of seconds
The WordPress/WooCommerce backend experiences far less load
Users see a much faster, more responsive site
