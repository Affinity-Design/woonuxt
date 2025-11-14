/**
 * Product SEO Composable - ENHANCED VERSION WITH CANADIAN TERM INJECTION
 *
 * Loads pre-generated SEO metadata for product pages and applies it using the
 * Canadian SEO composable pattern. This works with Nuxt caching by reading from
 * static JSON data generated at build time.
 *
 * ENHANCEMENTS:
 * - 🇨🇦 **CANADIAN SEO TERM INJECTION**: Dynamically adds Canadian-specific keywords
 *   - Geographic terms: "Canada", "Canadian", "Toronto", "Ontario"
 *   - Shipping terms: "fast Canadian shipping", "nationwide delivery"
 *   - Currency: "CAD", "Canadian prices"
 *   - Context: "buy in Canada", "available in Canada"
 * - Comprehensive Schema.org structured data (Product, Offer, Review, FAQ, Breadcrumb)
 * - Rich snippets for Google Search (stars, prices, availability)
 * - Video and image optimization
 * - Social media optimization (Open Graph, Twitter Cards)
 * - Automatic FAQ generation based on product category
 * - Bilingual support (English/French Canadian)
 *
 * Usage in product pages:
 * ```typescript
 * const { setProductSEO } = useProductSEO();
 * await setProductSEO(product, { includeReviews: true, includeFAQ: true, locale: 'en-CA' });
 * ```
 *
 * CANADIAN TERM INJECTION EXAMPLES:
 * - Title: "Product Name | Buy Online in Canada | ProSkaters Place"
 * - Description: "Shop Product at ProSkaters Place Canada. Available online with fast Canadian shipping from Toronto. Best prices in CAD."
 */

interface ProductSEOData {
  slug: string;
  url: string;
  seo: {
    title: string;
    description: string;
    image: string;
    imageAlt: string;
    type: 'product';
    locale: 'en-CA' | 'fr-CA';
    price: number | null;
    currency: 'CAD';
    availability: string;
    category: string;
    modified: string;
  };
}

interface EnhancedSEOOptions {
  locale?: 'en-CA' | 'fr-CA';
  includeReviews?: boolean;
  includeFAQ?: boolean;
  includeVideo?: boolean;
  videoUrl?: string;
  videoThumbnail?: string;
  videoDescription?: string;
  customFAQs?: Array<{question: string; answer: string}>;
}

/**
 * Inject Canadian-specific terms into SEO content
 * Adds geographic and contextual Canadian keywords for better local SEO
 */
const injectCanadianTerms = (text: string, productName: string, category: string): string => {
  const canadianKeywords = ['Canada', 'Canadian', 'Toronto', 'Ontario', 'fast Canadian shipping', 'buy in Canada', 'Canadian prices', 'CAD'];

  // If text already contains Canadian terms, return as-is
  const lowerText = text.toLowerCase();
  if (canadianKeywords.some((term) => lowerText.includes(term.toLowerCase()))) {
    return text;
  }

  // Inject Canadian terms naturally into the description
  // Pattern: "Product description. Available in Canada with fast shipping."
  if (text.length > 0) {
    const canadianSuffix = ` Available in Canada with fast nationwide shipping. Buy ${productName} online at the best Canadian prices.`;
    return text + canadianSuffix;
  }

  return text;
};

/**
 * Generate Canadian-optimized title with local keywords
 */
const generateCanadianTitle = (productName: string, category: string, locale: 'en-CA' | 'fr-CA' = 'en-CA'): string => {
  const french = locale === 'fr-CA';

  if (french) {
    return `${productName} | Achetez en ligne au Canada | ProSkaters Place`;
  }

  // English Canadian title with location keywords
  return `${productName} | Buy Online in Canada | ProSkaters Place`;
};

/**
 * Generate Canadian-optimized description with local keywords
 */
const generateCanadianDescription = (product: any, category: string, locale: 'en-CA' | 'fr-CA' = 'en-CA'): string => {
  const french = locale === 'fr-CA';
  let baseDescription = product.shortDescription || '';

  // Strip HTML tags
  if (baseDescription.includes('<')) {
    baseDescription = baseDescription.replace(/<[^>]*>/g, '').trim();
  }

  if (french) {
    // French Canadian description
    if (baseDescription) {
      return `${baseDescription.substring(0, 100)} Disponible en ligne au Canada avec livraison rapide. Meilleurs prix canadiens.`;
    }
    return `Achetez ${product.name} chez ProSkaters Place Canada. ${category} disponible en ligne avec livraison rapide partout au Canada.`;
  }

  // English Canadian description with geographic keywords
  if (baseDescription) {
    // Inject Canadian terms into existing description
    const enhanced = injectCanadianTerms(baseDescription.substring(0, 120), product.name, category);
    return enhanced.substring(0, 160);
  }

  // Generate new Canadian-focused description
  return `Shop ${product.name} at ProSkaters Place Canada. ${category} available online with fast Canadian shipping from Toronto. Best prices in CAD with expert advice.`;
};

export const useProductSEO = () => {
  const canadianSEO = useCanadianSEO();
  const richSnippets = useProductRichSnippets();

  /**
   * Load pre-generated product SEO metadata
   * This data is generated at build time by build-sitemap.js and stored in Cloudflare KV
   *
   * FAIL-SAFE: This function will NEVER throw errors. It always returns null on failure
   * to ensure the product page loads even if SEO data cannot be fetched.
   */
  const loadProductSEOData = async (slug: string): Promise<ProductSEOData | null> => {
    // Early return with null - never let this break the page
    if (!slug || typeof slug !== 'string') {
      return null;
    }

    try {
      // Use $fetch for SSR-compatible API calls (handles relative URLs automatically)
      const data = await $fetch<ProductSEOData>(`/api/product-seo/${slug}`, {
        // Ignore response errors (404, 500, etc)
        ignoreResponseError: true,
      });

      if (data && data.slug === slug) {
        console.log('[useProductSEO] Loaded pre-generated SEO data for:', slug);
        return data;
      }

      // If not found, return null silently to trigger fallback
      return null;
    } catch (error) {
      // Silently catch ALL errors - don't even log warnings to avoid console spam
      // The fallback generateProductSEO will handle SEO generation
      return null;
    }
  };

  /**
   * Set SEO metadata for a product page - ENHANCED VERSION
   * Uses pre-generated data if available, falls back to generating from product
   *
   * NEW: Supports comprehensive rich snippets including:
   * - Product structured data with pricing and availability
   * - Reviews and ratings
   * - FAQ sections
   * - Video content
   * - Breadcrumbs
   * - Social media optimization
   *
   * FAIL-SAFE: This function will NEVER throw errors or break the page.
   * It gracefully handles all failures and always provides SEO metadata.
   *
   * @param product - Product data from WooCommerce
   * @param options - Enhanced SEO options
   */
  const setProductSEO = async (product: any, options: EnhancedSEOOptions = {}) => {
    // Fail-safe: if no product, silently return without breaking the page
    if (!product) {
      return;
    }

    const {locale = 'en-CA', includeReviews = true, includeFAQ = true, includeVideo = false, videoUrl, videoThumbnail, videoDescription, customFAQs} = options;

    try {
      // Try to load pre-generated SEO data (this is wrapped in its own try-catch)
      const seoData = await loadProductSEOData(product.slug);

      // Extract primary category
      const primaryCategory = product.productCategories?.nodes?.[0]?.name || 'Products';

      // 🇨🇦 CANADIAN SEO: Generate Canadian-optimized title with local keywords
      const title = seoData?.seo?.title || generateCanadianTitle(product.name, primaryCategory, locale);

      // 🇨🇦 CANADIAN SEO: Generate Canadian-optimized description with geographic terms
      let description = seoData?.seo?.description || generateCanadianDescription(product, primaryCategory, locale);

      // Ensure description length is appropriate
      if (description.length > 160) {
        description = description.substring(0, 157) + '...';
      }

      // Get product image
      const productImage = seoData?.seo?.image || product.image?.sourceUrl || product.image?.mediaItemUrl || '/images/default-product.jpg';

      // Set Canadian SEO metadata (handles hreflang, geo-targeting, etc.)
      canadianSEO.setCanadianSEO({
        title,
        description,
        image: productImage,
        type: 'product',
        locale,
      });

      // Apply comprehensive rich snippets (Product, Review, FAQ, Breadcrumb, Video schemas)
      richSnippets.applyProductRichSnippets({
        product,
        locale,
        includeReviews,
        includeFAQ,
        includeVideo,
        videoUrl,
        videoThumbnail,
        videoDescription,
        faqItems: customFAQs,
      });

      // Add additional Open Graph tags for better social sharing
      useHead({
        meta: [
          // Product-specific Open Graph
          {property: 'product:price:amount', content: String(parseFloat(product.price || product.regularPrice || '0'))},
          {property: 'product:price:currency', content: 'CAD'},
          {
            property: 'product:availability',
            content: product.stockStatus === 'IN_STOCK' ? 'in stock' : 'out of stock',
          },
          {property: 'product:condition', content: 'new'},
          {property: 'product:retailer_item_id', content: product.sku || `PRODUCT-${product.databaseId}`},
          {property: 'product:brand', content: primaryCategory},

          // Twitter Product Card
          {name: 'twitter:label1', content: 'Price'},
          {name: 'twitter:data1', content: canadianSEO.formatCADPrice(parseFloat(product.price || product.regularPrice || '0'))},
          {name: 'twitter:label2', content: 'Availability'},
          {name: 'twitter:data2', content: product.stockStatus === 'IN_STOCK' ? 'In Stock' : 'Out of Stock'},
        ],
      });
    } catch (error) {
      // ULTIMATE FAIL-SAFE: If anything goes wrong, use the fallback generator
      // This ensures the page ALWAYS has SEO metadata even if everything fails
      try {
        generateProductSEO(product, locale);
      } catch (fallbackError) {
        // If even the fallback fails, just silently return
        // The page will load without custom SEO but with default meta tags
        return;
      }
    }
  };

  /**
   * Generate SEO metadata from product data (fallback)
   * This is used when pre-generated data is not available
   */
  const generateProductSEO = (product: any, locale: 'en-CA' | 'fr-CA' = 'en-CA') => {
    // Extract primary category
    const primaryCategory = product.productCategories?.nodes?.[0]?.name || 'Products';

    // 🇨🇦 CANADIAN SEO: Use Canadian-optimized title generator
    const title = generateCanadianTitle(product.name, primaryCategory, locale);

    // 🇨🇦 CANADIAN SEO: Use Canadian-optimized description generator
    const description = generateCanadianDescription(product, primaryCategory, locale);

    // Get product image
    const productImage = product.image?.sourceUrl || '/images/default-product.jpg';

    // Get price (convert to CAD if needed)
    const price = product.price ? parseFloat(product.price) : null;

    // Check stock status
    const inStock = product.stockStatus === 'IN_STOCK';

    // Set Canadian SEO
    canadianSEO.setCanadianSEO({
      title,
      description,
      image: productImage,
      type: 'product',
      locale,
    });

    // Add product-specific structured data
    useHead({
      script: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            description,
            image: productImage,
            offers: {
              '@type': 'Offer',
              price,
              priceCurrency: 'CAD',
              availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: `https://proskatersplace.ca/product/${product.slug}`,
            },
            category: primaryCategory,
          }),
        },
      ],
    });
  };

  return {
    setProductSEO,
    generateProductSEO,
    loadProductSEOData,
  };
};
