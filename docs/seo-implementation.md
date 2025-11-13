# SEO Implementation Guide for WooNuxt Blog & E-commerce

## Overview

This document outlines the complete SEO implementation for the WooNuxt e-commerce site with integrated blog functionality. The system provides automated static generation, dynamic sitemaps, and comprehensive SEO optimization for Cloudflare Pages deployment.

## Architecture Summary

### Key Components

1. **Automated Route Generation System**
2. **Static Blog Post Generation**
3. **Dynamic Sitemap Generation**
4. **SEO Meta Tag Implementation**
5. **Build Process Integration**

## 1. Automated Route Generation System

### Purpose

Automatically discovers and generates routes for all content types (blog posts, categories, static pages) during the build process.

### Implementation

#### Core Script: `scripts/build-all-routes.js`

```javascript
// Main functions:
// - generateBlogRoutes() - Scans content/blog/ directory
// - generateCategoryRoutes() - Loads from existing category data
// - generateAllRoutes() - Combines all routes and creates sitemap data
```

#### Generated Files

- `data/blog-routes.json` - All blog post routes
- `data/sitemap-data.json` - Complete sitemap data with metadata

### Integration Points

#### Package.json Scripts

```json
{
  "build": "node scripts/build-all-routes.js && nuxt build",
  "generate": "node scripts/build-all-routes.js && nuxt generate",
  "build-all-routes": "node scripts/build-all-routes.js"
}
```

#### Setup Script Integration

Routes are generated as part of the main build process in `scripts/setup-script.js`:

1. Generate all routes
2. Populate category data
3. Populate product data

## 2. Static Blog Post Generation

### Configuration

#### Nuxt Config (`nuxt.config.ts`)

```typescript
// Prerender configuration
prerender: {
  routes: [
    "/",
    "/contact",
    "/terms",
    "/privacy",
    "/blog",
    ...(categoryRoutesToPrerender || []),
    ...(blogRoutesToPrerender || []),
  ],
}

// Route rules for static generation
routeRules: {
  "/blog/**": {
    prerender: true,
    cache: { maxAge: 60 * 60 * 24 * 7, base: "cache" },
  },
}
```

### Blog Post Structure

#### File Organization

```
content/
  blog/
    best-inline-skates-2025/
      index.md
    roller-skating-toronto-guide/
      index.md
    skate-maintenance-winter/
      index.md
```

#### Frontmatter Schema

```yaml
---
title: 'Post Title'
description: 'SEO description'
category: 'Category Name'
date: 2025-06-25
author: 'Author Name'
authorBio: 'Author description'
image: '/images/post-image.jpeg'
ogImage: '/images/post-image.jpeg'
tags: ['tag1', 'tag2', 'tag3']
---
```

### Page Components

#### Blog Index (`pages/blog/index.vue`)

- Lists all blog posts
- Category filtering
- SEO meta tags
- Static generation

#### Individual Posts (`pages/blog/[slug].vue`)

- Dynamic blog post rendering
- Related posts
- Author bio
- Tags display
- Complete SEO meta implementation

#### Catch-all Route (`pages/[...slug].vue`)

- Handles blog post routing
- 404 for non-existent posts
- Blog post detection logic

## 3. Dynamic Sitemap Generation

### API Endpoint: `server/api/sitemap.xml.ts`

#### Features

- Reads from generated `sitemap-data.json`
- Fallback routes if data unavailable
- Proper XML formatting
- SEO-optimized headers
- Cache control (1 hour)

#### Route Prioritization

- Homepage: `priority="1.0"`, `changefreq="daily"`
- Blog posts: `priority="0.8"`, `changefreq="monthly"`
- Other pages: `priority="0.7"`, `changefreq="weekly"`

#### Headers Set

```typescript
setHeader(event, 'content-type', 'application/xml');
setHeader(event, 'cache-control', 'max-age=3600');
setHeader(event, 'x-sitemap-generated', sitemapData.lastGenerated);
```

### Robots.txt (`public/robots.txt`)

```
User-agent: *
Allow: /

Sitemap: https://proskatersplace.ca/api/sitemap.xml

Disallow: /cart
Disallow: /checkout/
Disallow: /my-account/

Crawl-delay: 1
```

## 4. SEO Meta Tag Implementation

### Blog Post SEO Components

The blog system employs a comprehensive SEO strategy with Canadian market optimization:

#### Canadian SEO Composable (`composables/useCanadianSEO.ts`)

Provides bilingual Canadian-specific SEO optimization with full caching compatibility:

```typescript
export const useCanadianSEO = () => {
  // Features:
  // - Bilingual support (en-CA, fr-CA)
  // - Canadian geographic targeting (Toronto coordinates)
  // - Hreflang tags (en-CA, fr-CA, en-US, x-default)
  // - CAD currency specification with locale-aware formatting
  // - Canadian meta tags (geo.region: CA, locale: en_CA or fr_CA)
  // - Canonical URL generation
  // - Cache-friendly implementation (SSR, prerender, KV compatible)

  const setCanadianSEO = (options: {
    title: string;
    description: string;
    image?: string;
    type?: 'website' | 'article' | 'product';
    locale?: 'en-CA' | 'fr-CA';
  }) => {
    // Sets comprehensive meta tags
    // Adds bilingual hreflang alternates
    // Configures Canadian geo-targeting
    // Includes og:locale with alternate locale support
    // Works correctly with Nuxt prerendering and Cloudflare KV caching
  };
};
```

**Caching Compatibility (IMPORTANT):**

The composable uses `useSeoMeta()` and `useHead()` which are:

- ✅ **SSR-safe**: Meta tags generated during server-side rendering
- ✅ **Prerender-safe**: Static HTML includes all meta tags at build time
- ✅ **KV cache-safe**: Complete rendered HTML (with meta tags) stored in Cloudflare KV
- ✅ **No runtime lookups**: All values serialized into page payload

**How Caching Works:**

1. During build/SSR, `useSeoMeta()` generates `<meta>` tags in HTML `<head>`
2. Nitro caches the complete rendered HTML (including meta tags) in KV
3. Subsequent requests serve cached HTML directly - no re-execution needed
4. Meta tags are part of the static HTML, not dynamically generated

**Why This Matters:**

- Blog posts with `prerender: true` have SEO meta baked into static HTML
- Category pages cached in KV serve with correct canonical/hreflang tags
- No performance penalty for SEO optimization

**Geographic Targeting:**

- `geo.region: CA`
- `geo.placename: Canada`
- `geo.position: 43.651070;-79.347015` (Toronto)
- `business:location:country_name: Canada`

**Hreflang Implementation (Bilingual):**

```html
<link rel="alternate" hreflang="en-ca" href="https://proskatersplace.ca/post-slug" />
<link rel="alternate" hreflang="fr-ca" href="https://proskatersplace.ca/fr/post-slug" />
<link rel="alternate" hreflang="en-us" href="https://proskatersplace.com/post-slug" />
<link rel="alternate" hreflang="x-default" href="https://proskatersplace.com/post-slug" />
```

**Bilingual Support:**

The composable now supports French Canadian content:

- `locale: 'en-CA'` - English Canadian (default)
- `locale: 'fr-CA'` - French Canadian
- Automatic locale detection via `detectLocale()` helper
- French URLs use `/fr` prefix (e.g., `/fr/blog/post-slug`)
- Price formatting respects locale (`formatCADPrice(price, locale)`)
- `og:locale:alternate` tags for bilingual SEO

#### Structured Data Component (`components/SEOStructuredData.vue`)

Implements Schema.org markup for rich results:

```vue
<SEOStructuredData
  type="Article"
  :data="{
    title: post.title,
    description: post.description,
    image: post.ogImage,
    author: post.author,
    authorBio: post.authorBio,
    datePublished: post.date,
    url: route.path,
    category: post.category,
    tags: post.tags,
  }" />
```

**Article Schema Features:**

- Publisher information (ProSkaters Place Canada)
- Author details with bio
- Publication and modification dates
- Canadian audience targeting
- Language specification (en-CA)
- Keywords from tags
- Free accessibility indicator

#### Blog Post Implementation (`components/BlogPost.vue`)

```typescript
// Canadian SEO setup
const {setCanadianSEO, detectLocale} = useCanadianSEO();

// Auto-detect locale from route path (e.g., /fr/blog/post)
const locale = detectLocale(); // Returns 'en-CA' or 'fr-CA'

setCanadianSEO({
  title: post.value.title,
  description: post.value.description,
  image: post.value.ogImage,
  type: 'article',
  locale, // Pass detected locale for bilingual support
});

// Structured data
const articleStructuredData = {
  title: post.value.title,
  description: post.value.description,
  image: post.value.ogImage,
  author: post.value.author,
  authorBio: post.value.authorBio,
  datePublished: post.value.date,
  dateModified: post.value.dateModified || post.value.date,
  url: route.path,
  category: post.value.category,
  tags: post.value.tags,
};
```

**French Blog Post Example:**

For a French blog post at `/fr/blog/meilleurs-patins-2025`:

- Set `locale: 'fr-CA'` in `setCanadianSEO()`
- HTML lang attribute becomes `lang="fr-CA"`
- Hreflang tags include both en-ca and fr-ca alternates
- Price formatting uses French Canadian format (123,45 $)

### Blog Index SEO (`pages/blog/index.vue`)

```typescript
const {setCanadianSEO} = useCanadianSEO();

setCanadianSEO({
  title: 'Skating Tips & Guides | ProSkaters Place Canada Blog',
  description: "Expert skating advice, product reviews, and tips from Canada's most trusted skate shop...",
  image: '/images/Inline-Skates-Toronto.jpg',
  type: 'website',
  locale: 'en-CA', // Explicitly set for English version
});

// For French version (/fr/blog):
// setCanadianSEO({
//   title: 'Conseils de Patinage | Blog ProSkaters Place Canada',
//   description: "Conseils d'experts, critiques de produits...",
//   image: '/images/Inline-Skates-Toronto.jpg',
//   type: 'website',
//   locale: 'fr-CA',
// });
```

### SEO Strategy Alignment

Blog posts target high-value keywords from SEO research:

| **Target Keyword**          | **Search Volume**           | **KD** | **Blog Post**                   | **Status**   |
| --------------------------- | --------------------------- | ------ | ------------------------------- | ------------ |
| best inline skates 2025     | High                        | 30.7   | Best Inline Skates Canada 2025  | ✅ Targeting |
| inline skates canada        | High                        | 17.7   | Best Inline Skates Canada 2025  | ✅ Targeting |
| roller skates for beginners | 14.8k (+1956% YoY)          | 0-3    | Complete Beginner's Guide       | ✅ Targeting |
| how to skate backwards      | High (Featured snippet opp) | 2-7    | How to Skate Backwards Tutorial | ✅ Targeting |
| roller skates vs inline     | 2.9k                        | ≤10    | Inline Skates vs Roller Skates  | ✅ Targeting |
| inline skates toronto       | High                        | 14.1   | Multiple posts                  | ✅ Targeting |

### Advanced SEO Features

#### 1. Table of Contents (Jump Links)

- Auto-generated from H2/H3 headings
- Sticky sidebar navigation
- Anchor links for SERP features
- Improved user experience

#### 2. Internal Linking Strategy

- Product category links
- Specific product recommendations
- Related blog posts (same category)
- "Shop by Category" sections
- E-commerce integration

#### 3. Image Optimization

- Lazy loading (except hero images)
- Descriptive alt text from post title
- NuxtImg optimization
- Proper aspect ratios
- WebP format support

#### 4. Mobile Optimization

- Responsive design (mobile-first)
- Clamp typography
- Adaptive layouts
- Touch-friendly navigation

#### 5. Performance Optimization

- Static prerendering
- CDN delivery (Cloudflare)
- KV caching strategy
- Instant page loads

### SEO Checklist for New Posts

✅ **Required Elements:**

- Title (50-60 characters, includes primary keyword)
- Description (150-160 characters, compelling CTR)
- Category assignment
- Publication date
- Author and authorBio
- Image with descriptive filename
- ogImage (social sharing)
- 3-5 relevant tags (target keywords)

✅ **Content Requirements:**

- H1 title (matches meta title)
- Proper heading hierarchy (H2 → H3)
- 2,000+ words for comprehensive coverage
- Internal links to products/categories
- External links to authoritative sources
- Canadian spelling and terminology
- Location references (Toronto, Canada, Ontario)

✅ **Technical SEO:**

- Clean URL slug (no /blog/ prefix)
- Canonical URL set
- Hreflang tags configured
- Structured data included
- Meta tags complete
- Image alt text provided

## 5. Build Process Flow

### Development Workflow

1. Create new blog post folder in `content/blog/`
2. Add `index.md` with proper frontmatter
3. Run `npm run dev` - works immediately
4. Run `npm run build` - auto-generates routes

### Production Build Process

1. **Pre-Build**: `build-all-routes.js` executes

   - Scans `content/blog/` directory
   - Generates `blog-routes.json`
   - Creates `sitemap-data.json`
   - Logs route counts and paths

2. **Setup Script**: `setup-script.js` executes

   - Generates routes (if not already done)
   - Populates category cache
   - Populates product cache

3. **Nuxt Build**: Static generation

   - Prerender all discovered routes
   - Generate static HTML files
   - Optimize for Cloudflare Pages

4. **Deploy**: Cloudflare Pages
   - Serves static HTML files
   - Dynamic sitemap available at `/api/sitemap.xml`
   - SEO-optimized delivery

## 6. Cloudflare Pages Optimization

### Static Assets

- All blog posts pre-rendered as static HTML
- Images optimized with NuxtImg
- Proper caching headers set

### Dynamic Features

- Sitemap endpoint remains dynamic
- Handles route discovery failures gracefully
- Fallback content for offline scenarios

### Performance

- Static HTML = instant loading
- CDN distribution via Cloudflare
- Optimal Core Web Vitals scores

## 7. Monitoring & Maintenance

### Automated Checks

- Build fails if route generation fails
- Console warnings for missing data
- Fallback systems prevent complete failures

### Log Monitoring

```javascript
console.log(`✅ Generated routes for build:
  - Static: ${staticRoutes.length}
  - Blog: ${blogRoutes.length}  
  - Categories: ${categoryRoutes.length}
  - Total: ${allRoutes.length}`);
```

### Sitemap Verification

- Check `/api/sitemap.xml` after deployment
- Verify `x-sitemap-generated` header
- Confirm all routes present

## 8. Troubleshooting Guide

### Common Issues

#### Blog Posts Not Appearing

1. Check `content/blog/` directory structure
2. Verify frontmatter format
3. Run `npm run build-all-routes` manually
4. Check console for errors

#### Sitemap Missing Routes

1. Verify `data/sitemap-data.json` exists
2. Check file permissions
3. Review console warnings
4. Test sitemap endpoint directly

#### Build Failures

1. Check route generation script output
2. Verify all required files exist
3. Check environment variables
4. Review Cloudflare Pages build logs

#### Production Content Issues (404/500 errors)

1. **Content API Errors**: If getting 500 errors from `/_content/query/` endpoints:

   - Verify content directory is included in build
   - Check Nuxt Content module is properly configured
   - Test with debug endpoint: `/api/debug/content`

2. **Blog Post Redirects**: For URLs like `/best-inline-skates-2025`:

   - Verify route redirects are configured in `nuxt.config.ts`
   - Check `data/blog-redirects.json` exists
   - Ensure build script runs before deployment

3. **Static Generation**: If blog posts aren't pre-rendered:
   - Verify blog routes in `data/blog-routes.json`
   - Check prerender configuration includes blog routes
   - Review build logs for prerender completion

### Debug Commands

```bash
# Test route generation
npm run build-all-routes

# Check generated files
cat data/blog-routes.json
cat data/sitemap-data.json
cat data/blog-redirects.json

# Test full build
npm run build

# Test sitemap locally
curl http://localhost:3000/api/sitemap.xml

# Debug content issues (production)
curl https://proskatersplace.ca/api/debug/content
```

### Cloudflare Pages Specific Issues

#### Content Directory Not Deployed

- Ensure `content/` directory is included in build output
- Check build command includes route generation
- Verify no `.gitignore` exclusions

#### Environment Variables

- `NODE_ENV=production` should be set
- Check if any content-related env vars are missing

#### Route Rules Not Applied

- Verify dynamic redirects are properly spread in `routeRules`
- Check build logs for route generation completion
- Test redirect endpoints manually

## 9. Future Enhancements

### Planned Improvements

1. **Product Sitemap**: Add individual product URLs
2. **Image Sitemap**: Include blog post images
3. **Schema.org**: Add structured data markup
4. **Analytics**: Track sitemap usage and SEO performance

### Extension Points

- Additional content types (documentation, guides)
- Multi-language support
- Advanced SEO meta tag automation
- Social media automation

## 10. Performance Metrics

### Current Achievement

- **Static Generation**: 100% of blog content
- **Build Time**: Routes generated in <2 seconds
- **SEO Coverage**: All pages have complete meta tags
- **Sitemap**: Automatically updated on every build
- **Cache Strategy**: Optimized for Cloudflare Pages

### SEO Benefits

- **Crawlability**: All content statically available
- **Performance**: Instant page loads
- **Freshness**: Sitemap updates with every build
- **Completeness**: No missing meta tags or canonical URLs
- **Structure**: Proper heading hierarchy and semantic markup

---

## Quick Reference

### Adding New Blog Post

1. Create `/content/blog/your-post-slug/index.md`
2. Add proper frontmatter
3. Build automatically includes it

### Checking SEO Status

1. Visit `/api/sitemap.xml`
2. Check `x-sitemap-generated` header
3. Verify route count in build logs
4. Test social media previews

### Emergency Fallbacks

- Sitemap has hardcoded fallback routes
- Build process continues if route generation fails
- Static routes always included

This implementation provides a robust, automated SEO solution that scales with content growth and requires minimal maintenance.
