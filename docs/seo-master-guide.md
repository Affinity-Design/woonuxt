# SEO Master Guide for WooNuxt

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Fail-Safe Systems](#architecture--fail-safe-systems)
3. [Product SEO Implementation](#product-seo-implementation)
4. [Category SEO Implementation](#category-seo-implementation)
5. [Blog SEO Implementation](#blog-seo-implementation)
6. [Bilingual & International SEO](#bilingual--international-seo)
7. [Sitemaps & Routing](#sitemaps--routing)
8. [Rich Snippets & Schema](#rich-snippets--schema)
9. [Implementation Checklist](#implementation-checklist)

---

## Overview

This document outlines the complete SEO implementation for the WooNuxt e-commerce site. The system provides automated static generation, dynamic sitemaps, comprehensive SEO optimization, and fail-safe error handling to ensure pages always load even when SEO data is unavailable.

### Key Features

- **Automated Route Generation**: Scans content and API to build routes.
- **Static Prerendering**: Critical pages are generated at build time.
- **Dynamic Sitemaps**: Automatically updated sitemaps for products, categories, and blog posts.
- **Fail-Safe Loading**: Triple-layer error handling ensures pages never crash due to missing SEO data.
- **Canadian Optimization**: Specific targeting for en-CA/fr-CA, CAD pricing, and local geo-targeting.

---

## Architecture & Fail-Safe Systems

### Three-Layer Protection System

To prevent 500 errors on product pages when SEO data is missing or the API fails, we use a triple-layer protection system:

1.  **Layer 1: API Call Protection** (`loadProductSEOData`)

    - Silently returns `null` on ANY error.
    - Validates input before attempting fetch.
    - Never logs warnings to avoid console spam.

2.  **Layer 2: Data Generator Protection** (`generateProductSEO`)

    - Validates all inputs (product, reviews, etc.).
    - Uses safe defaults for missing fields (e.g., default price, default image).
    - Wraps schema generation in try-catch blocks.
    - Returns a "Safe SEO Object" even if partial data fails.

3.  **Layer 3: Composable Protection** (`useProductSEO`)
    - Checks if SEO data is null/undefined.
    - Falls back to `generateDefaultSEO()` if primary generation fails.
    - Ensures `useHead()` and `useSchemaOrg()` always receive valid objects.

### SSR Compatibility

- **`$fetch` over `fetch`**: All internal API calls use Nuxt's `$fetch` to ensure relative URLs work correctly during Server-Side Rendering.
- **Non-Blocking Operations**: Exchange rate fetching and other non-critical data loading are non-blocking to ensure fast initial page loads.

---

## Product SEO Implementation

Product pages are optimized with rich snippets, reviews, and FAQs to maximize visibility in search results.

### Components

- `composables/useProductRichSnippets.ts`: Core engine for generating JSON-LD schema.
- `components/ProductReviews.vue`: Displays reviews and generates AggregateRating schema.
- `components/ProductFAQ.vue`: Auto-generates FAQ schema from product data.
- `components/ProductVideo.vue`: Embeds videos with VideoObject schema.

### Features

- **Rich Snippets**: Product, Offer, Review, and FAQPage schema.
- **Automatic FAQs**: Generates FAQs based on product attributes and common questions.
- **Review Integration**: Displays star ratings and review counts in search results.

---

## Category SEO Implementation

Category pages are critical landing pages targeting high-volume keywords (e.g., "Inline Skates Canada").

### Strategy

- **Unique Titles**: Pattern: `Category Name | Shop [Count]+ Products | Canada | ProSkaters Place`.
- **Compelling Descriptions**: Includes keywords, trust signals (free shipping), and calls to action.
- **Structured Data**: CollectionPage, ItemList, and BreadcrumbList schema.
- **Content Injection**: `components/CategoryContent.vue` injects SEO-rich content above and below the product grid.

### Files

- `composables/useCategorySEO.ts`: Manages category-specific meta tags and schema.
- `data/category-content.ts`: Stores custom descriptions and SEO content for specific categories.

---

## Blog SEO Implementation

The blog system uses Nuxt Content with a file-based architecture for maximum performance and SEO control.

### Writing Rules

1.  **Keywords**: Use keywords from `data/seo_Keywordlist.csv`.
2.  **Internal Links**: Link to products and categories using `data/sitemap-data.json`.
3.  **Structure**: Use H1, H2, H3 hierarchy. No HTML in markdown files.
4.  **Images**: Use `<NuxtImg>` and include alt text.

### Technical SEO

- **Clean URLs**: Posts are served at `/post-slug` (no `/blog/` prefix).
- **Auto-Generated Meta**: Title, description, and Open Graph tags are automatically generated from frontmatter.
- **Schema**: Article and BreadcrumbList schema are automatically applied.

---

## Bilingual & International SEO

The site is optimized for the Canadian market with support for English and French.

### Implementation

- **Hreflang Tags**: Automatically generates `en-CA`, `fr-CA`, `en-US`, and `x-default` tags.
- **Locale Detection**: `useCanadianSEO` composable detects locale from route (e.g., `/fr/` prefix).
- **Currency**: Prices are formatted in CAD (`$123.45` vs `123,45 $`).
- **Geo-Targeting**: Meta tags include Toronto/Canada location data.

---

## Sitemaps & Routing

### Dynamic Generation

- **Script**: `scripts/build-sitemap.js` runs before build.
- **Sources**:
  - Products: Fetched from WordPress GraphQL.
  - Categories: Fetched from WordPress GraphQL.
  - Blog Posts: Scanned from `content/blog/`.
- **Output**: `public/sitemap.xml` and `data/sitemap-data.json`.

### Route Rules

- **Prerendering**: Blog posts and static pages are prerendered.
- **ISR**: Products and categories use Incremental Static Regeneration via Cloudflare KV.

---

## Rich Snippets & Schema

We use `nuxt-schema-org` to generate JSON-LD structured data.

### Supported Schemas

- **Organization**: Global schema for ProSkaters Place.
- **LocalBusiness**: Physical store details (address, hours).
- **Product**: Name, description, image, SKU, brand.
- **Offer**: Price, currency (CAD), availability.
- **AggregateRating**: Review score and count.
- **FAQPage**: Q&A content on product and category pages.
- **Article**: Blog post metadata.
- **BreadcrumbList**: Navigation hierarchy.

---

## Implementation Checklist

### Verification

- [ ] **Rich Results Test**: Test product and category URLs on [Google Rich Results Test](https://search.google.com/test/rich-results).
- [ ] **Sitemap Check**: Verify `sitemap.xml` contains all expected URLs.
- [ ] **Hreflang Check**: Ensure English pages link to French counterparts and vice versa.
- [ ] **Meta Tags**: Check title and description length and keyword usage.
- [ ] **Console Errors**: Verify no 404s or 500s in the browser console during navigation.

### Monitoring

- [ ] **Google Search Console**: Monitor "Enhancements" tab for schema errors.
- [ ] **Performance**: Check Core Web Vitals (LCP, CLS) on PageSpeed Insights.
