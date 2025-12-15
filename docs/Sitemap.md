# Comprehensive Sitemap Generation System

## Overview

The sitemap generation system creates a complete XML sitemap that includes **all products, categories, blog posts, and static pages** for optimal SEO. This ensures Google can discover and index every page on the site.

## Architecture

### Build-Time Generation

The sitemap is generated **at build time** (not runtime) to ensure:

- ✅ No GraphQL queries during page requests
- ✅ Fast sitemap delivery (static JSON data)
- ✅ Comprehensive coverage of all products (~2000+)
- ✅ Proper priority and changefreq settings per page type
- ✅ Compatible with Cloudflare Pages deployment

### Data Flow

```
WordPress GraphQL API
    ↓
build-sitemap.js (Build Script)
    ↓
data/sitemap-data.json (Generated File)
    ↓
server/api/sitemap.xml.ts (API Endpoint)
    ↓
https://proskatersplace.ca/sitemap.xml
```

## Build Script: `scripts/build-sitemap.js`

### Features

1. **Fetches All Products**

   - Uses GraphQL pagination to fetch all products
   - Batch size: 50 products per request
   - Delay between batches: 300ms (respects server)
   - Extracts: slug, name, price, categories, image, modified date

2. **Fetches All Categories**

   - Single GraphQL query (up to 500 categories)
   - Filters for non-empty categories only
   - Extracts: slug, name, description, product count

3. **Scans Blog Posts**

   - Reads from `content/blog/` directory
   - Detects all folder-based blog posts
   - Generates `/blog/{slug}` routes automatically

4. **Generates SEO Metadata**

   - Creates product-specific SEO data
   - Optimized titles: `{Product Name} | Buy Online in Canada | ProSkaters Place`
   - SEO descriptions with category context
   - Price, availability, and structured data preparation

5. **Outputs Multiple Files**
   - `data/sitemap-data.json` - Complete sitemap with all routes
   - `data/product-seo-meta.json` - Product SEO metadata
   - `data/product-routes.json` - List of product URLs
   - `data/category-routes.json` - List of category URLs
   - `data/blog-routes.json` - List of blog URLs

### Configuration

Located in `scripts/build-sitemap.js`:

```javascript
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 50, // Products per GraphQL request
  BATCH_DELAY: 300, // Delay between requests (ms)
  OUTPUT_DIR: 'data', // Output directory
  BASE_URL: 'https://proskatersplace.ca',
};
```

### GraphQL Queries

**Products Query:**

```graphql
query GetAllProductsForSitemap($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      slug
      name
      shortDescription
      modified
      price
      stockStatus
      image {
        sourceUrl
        altText
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
```

**Categories Query:**

```graphql
query GetAllCategoriesForSitemap($first: Int = 100) {
  productCategories(first: $first, where: {hideEmpty: true}) {
    nodes {
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
```

## NPM Scripts

### For Local Development

```bash
# Generate sitemap locally (works without Cloudflare KV)
npm run build-sitemap

# Or use the alias
npm run build-sitemap:local
```

### In Production Build

```bash
# Automatically runs during build
npm run build
# → Executes: node scripts/build-sitemap.js && nuxt build

# Or during static generation
npm run generate
# → Executes: node scripts/build-sitemap.js && nuxt generate
```

## Sitemap Data Format

### `data/sitemap-data.json`

```json
{
  "lastGenerated": "2025-01-15T10:30:00.000Z",
  "totalRoutes": 2543,
  "breakdown": {
    "static": 7,
    "blog": 15,
    "categories": 23,
    "products": 2498
  },
  "routes": [
    {
      "url": "/",
      "lastmod": "2025-01-15",
      "changefreq": "daily",
      "priority": "1.0",
      "type": "static"
    },
    {
      "url": "/product/rollerblade-zetrablade",
      "lastmod": "2025-01-10",
      "changefreq": "weekly",
      "priority": "0.7",
      "type": "product"
    }
  ]
}
```

### Route Types and Settings

| Type       | Example URL                       | Priority | Change Freq | Prerender |
| ---------- | --------------------------------- | -------- | ----------- | --------- |
| Homepage   | `/`                               | 1.0      | daily       | Yes       |
| Blog Index | `/blog`                           | 0.8      | daily       | Yes       |
| Blog Post  | `/blog/best-inline-skates-2025`   | 0.8      | monthly     | Yes       |
| Category   | `/product-category/inline-skates` | 0.8      | daily       | Yes       |
| Product    | `/product/rollerblade-zetrablade` | 0.7      | weekly      | Via KV    |
| Static     | `/contact`, `/terms`, `/privacy`  | 0.7      | weekly      | Yes       |

## Product SEO Metadata

### `data/product-seo-meta.json`

```json
[
  {
    "slug": "rollerblade-zetrablade",
    "url": "/product/rollerblade-zetrablade",
    "seo": {
      "title": "Rollerblade Zetrablade | Buy Online in Canada | ProSkaters Place",
      "description": "Shop Rollerblade Zetrablade at ProSkaters Place Canada. Inline Skates available online with fast Canadian shipping.",
      "image": "https://proskatersplace.ca/images/products/rollerblade-zetrablade.jpg",
      "imageAlt": "Rollerblade Zetrablade inline skates",
      "type": "product",
      "locale": "en-CA",
      "price": 129.99,
      "currency": "CAD",
      "availability": "in stock",
      "category": "Inline Skates",
      "modified": "2025-01-10"
    }
  }
]
```

## Nuxt Config Integration

### Route Rules Configuration

**File:** `nuxt.config.ts`

```typescript
// Import generated routes
import productRoutesToPrerender from './data/product-routes.json';
import categoryRoutesToPrerender from './data/category-routes.json';
import blogRoutesToPrerender from './data/blog-routes.json';

export default defineNuxtConfig({
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: [
        '/',
        '/contact',
        '/terms',
        '/privacy',
        '/blog',
        ...categoryRoutesToPrerender,
        ...blogRoutesToPrerender,
        // Products use KV cache instead (too many to prerender)
      ],
    },
  },

  routeRules: {
    '/': {prerender: true, cache: {maxAge: 60 * 60 * 24, base: 'cache'}},
    '/blog/**': {prerender: true, cache: {maxAge: 60 * 60 * 24 * 7, base: 'cache'}},
    '/product-category/**': {prerender: true, cache: {maxAge: 60 * 60 * 24 * 7, base: 'cache'}},
    '/product/**': {cache: {maxAge: 60 * 60 * 72, base: 'cache'}}, // KV cache only
  },
});
```

### Why Products Aren't Prerendered

For sites with **2000+ products**, prerendering all products would:

- ❌ Increase build time to 2-3 hours
- ❌ Create huge deployment artifacts (GBs)
- ❌ Slow down deployments

**Solution:** Use **Cloudflare KV caching** instead:

- ✅ Products cached on first visit (ISR-style)
- ✅ 72-hour cache lifetime
- ✅ Sitemap still lists all products for Google
- ✅ Fast builds and deployments

## Using Product SEO Composable

### In Product Pages

**File:** `pages/product/[slug].vue`

```vue
<script setup>
const {setProductSEO} = useProductSEO();
const route = useRoute();

// Load product data
const {data: product} = await useAsyncData(`product-${route.params.slug}`, () => GqlGetProduct({slug: route.params.slug}));

// Apply SEO metadata (uses pre-generated data if available)
await setProductSEO(product.value);
</script>
```

### How It Works

1. `useProductSEO()` tries to load pre-generated SEO data
2. If available, uses optimized metadata from `product-seo-meta.json`
3. Falls back to generating SEO from product data if not found
4. Applies Canadian SEO pattern (bilingual, CAD pricing, geo-targeting)
5. Adds Schema.org Product structured data

## API Endpoint

### `server/api/sitemap.xml.ts`

- **Route:** `GET /sitemap.xml`
- **Response:** XML sitemap (application/xml)
- **Cache:** 1 hour (client-side)
- **Source:** Reads from `data/sitemap-data.json`
- **Fallback:** Hardcoded static routes if data file missing

### Response Headers

```
Content-Type: application/xml
Cache-Control: max-age=3600
X-Sitemap-Generated: 2025-01-15T10:30:00.000Z
```

## Testing Locally

### 1. Generate Sitemap Data

```bash
npm run build-sitemap
```

**Expected Output:**

```
📦 Fetching all products from GraphQL...
   Batch 1, cursor: Start
   Fetched 50 products. Total: 50
   Batch 2, cursor: WyJkYXRlX2dt...
   Fetched 50 products. Total: 100
   ...
✅ Fetched 2498 total products

📁 Fetching all categories from GraphQL...
✅ Fetched 23 categories

📝 Scanning blog posts...
✅ Found 15 blog posts

🎯 Generating SEO metadata for products...
✅ Generated SEO metadata for 2498 products

✅ Sitemap data written to: e:\Documents\GitHub\woonuxt\data\sitemap-data.json
✅ Product SEO metadata written to: e:\Documents\GitHub\woonuxt\data\product-seo-meta.json

📊 Sitemap Summary:
    - Static pages:     7
    - Blog posts:       15
    - Categories:       23
    - Products:         2498
    - TOTAL ROUTES:     2543

✅ Sitemap generation completed successfully!
```

### 2. Start Dev Server

```bash
npm run dev
```

### 3. Test Sitemap Endpoint

```bash
curl http://localhost:3000/sitemap.xml
```

**Or open in browser:**

```
http://localhost:3000/sitemap.xml
```

### 4. Verify Data Files

Check that these files were created:

```
data/
├── sitemap-data.json         ← Complete sitemap data
├── product-seo-meta.json     ← Product SEO metadata
├── product-routes.json       ← Product URLs list
├── category-routes.json      ← Category URLs list
└── blog-routes.json          ← Blog URLs list
```

## Production Deployment

### Build Process

1. **Pre-build:** Script runs automatically

   ```bash
   npm run build
   # → node scripts/build-sitemap.js && nuxt build
   ```

2. **Data Generation:** All JSON files created in `data/`

3. **Static Generation:** Nuxt prerenders static pages and blog

4. **KV Population:** Products/categories stored in Cloudflare KV

5. **Deploy:** Static assets + API endpoints to Cloudflare Pages

### Post-Deployment

After deployment, **submit sitemap to Google Search Console:**

```
https://proskatersplace.ca/sitemap.xml
```

**Google will:**

- Discover all 2500+ URLs
- Index product pages on-demand (as users/bots visit)
- Re-crawl based on changefreq settings
- Prioritize pages by priority values

## Troubleshooting

### Issue: "GQL_HOST is not defined"

**Solution:** Add to `.env`:

```env
GQL_HOST=https://your-wordpress-site.com/graphql
```

### Issue: Empty sitemap (no products)

**Causes:**

1. GraphQL endpoint not accessible
2. No products in WordPress
3. Network/firewall issues

**Debug:**

```bash
# Test GraphQL directly
curl -X POST https://your-wordpress-site.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ products(first: 1) { nodes { slug } } }"}'
```

### Issue: Build fails with "Cannot find module './data/product-routes.json'"

**Solution:** This is expected on first build. The config handles missing files:

```typescript
let productRoutesToPrerender = [];
try {
  productRoutesToPrerender = require('./data/product-routes.json');
} catch (error) {
  console.warn('Product routes not found, will be generated during build.');
}
```

### Issue: Sitemap shows old products

**Solution:** Regenerate sitemap data:

```bash
npm run build-sitemap
```

## Performance Considerations

### Build Time

- **Products:** ~50 products/second (with 300ms delay)
- **Total Build Time:** ~60 seconds for 2500 products
- **Categories:** < 5 seconds
- **Blog Posts:** < 1 second

### GraphQL Load

- Batch requests to avoid overwhelming WordPress
- 300ms delay between batches (configurable)
- Respectful of server resources

### File Sizes

- `sitemap-data.json`: ~500 KB (2500 routes)
- `product-seo-meta.json`: ~1.2 MB (detailed metadata)
- XML Sitemap: ~400 KB (served with gzip)

## Best Practices

1. **Run Before Every Deploy**

   - Ensures sitemap is up-to-date
   - Included automatically in `npm run build`

2. **Monitor Build Logs**

   - Check for GraphQL errors
   - Verify route counts
   - Watch for missing categories

3. **Test Locally First**

   - Use `npm run build-sitemap:local`
   - Verify data files generated
   - Check sitemap.xml output

4. **Cache Warming**

   - After deployment, run cache warming
   - Ensures product pages are cached
   - See `docs/how-caching-works.md`

5. **Google Search Console**
   - Submit sitemap after major updates
   - Monitor indexing status
   - Check for crawl errors

## Related Documentation

- `docs/seo-implementation.md` - SEO strategy and implementation
- `docs/how-caching-works.md` - Three-layer caching system
- `docs/blog-architecture.md` - Blog post routing and SEO
- `.github/copilot-instructions.md` - Development guidelines

## Future Enhancements

### Potential Improvements

1. **Sitemap Index**

   - Split into multiple sitemaps (products, categories, blog)
   - Use sitemap index file to link them
   - Better for very large catalogs (10,000+ products)

2. **Image Sitemap**

   - Separate sitemap for product images
   - Helps Google Image Search indexing
   - Include image titles, captions, licenses

3. **Video Sitemap**

   - If product videos are added
   - YouTube video integration
   - Video thumbnails and descriptions

4. **News Sitemap**

   - For blog posts (if frequent news-style posts)
   - Special Google News indexing
   - Time-sensitive content prioritization

5. **Multi-language Sitemaps**
   - French Canadian sitemap
   - Bilingual URL entries
   - Hreflang annotations in sitemap

---

**Questions or Issues?**

Check the main documentation or run:

```bash
npm run build-sitemap -- --help
```
