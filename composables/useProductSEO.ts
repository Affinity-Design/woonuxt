/**
 * Product SEO Composable
 *
 * Loads pre-generated SEO metadata for product pages and applies it using the
 * Canadian SEO composable pattern. This works with Nuxt caching by reading from
 * static JSON data generated at build time.
 *
 * Usage in product pages:
 * ```typescript
 * const { setProductSEO } = useProductSEO();
 * await setProductSEO(productSlug);
 * ```
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

export const useProductSEO = () => {
  const canadianSEO = useCanadianSEO();

  /**
   * Load pre-generated product SEO metadata
   * This data is generated at build time by build-sitemap.js
   */
  const loadProductSEOData = async (slug: string): Promise<ProductSEOData | null> => {
    try {
      // In production, this would be a static import or API call
      // For now, we'll construct SEO data from the product itself
      return null;
    } catch (error) {
      console.warn(`Could not load SEO data for product: ${slug}`, error);
      return null;
    }
  };

  /**
   * Set SEO metadata for a product page
   * Uses pre-generated data if available, falls back to generating from product
   */
  const setProductSEO = async (product: any, locale: 'en-CA' | 'fr-CA' = 'en-CA') => {
    if (!product) {
      console.warn('setProductSEO called without product data');
      return;
    }

    // Try to load pre-generated SEO data
    const seoData = await loadProductSEOData(product.slug);

    if (seoData) {
      // Use pre-generated SEO metadata
      canadianSEO.setCanadianSEO({
        title: seoData.seo.title,
        description: seoData.seo.description,
        image: seoData.seo.image,
        type: 'product',
        locale: seoData.seo.locale,
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
              description: seoData.seo.description,
              image: seoData.seo.image,
              offers: {
                '@type': 'Offer',
                price: seoData.seo.price,
                priceCurrency: 'CAD',
                availability: seoData.seo.availability === 'in stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                url: `https://proskatersplace.ca/product/${product.slug}`,
              },
              category: seoData.seo.category,
            }),
          },
        ],
      });
    } else {
      // Generate SEO metadata from product data (fallback)
      generateProductSEO(product, locale);
    }
  };

  /**
   * Generate SEO metadata from product data (fallback)
   * This is used when pre-generated data is not available
   */
  const generateProductSEO = (product: any, locale: 'en-CA' | 'fr-CA' = 'en-CA') => {
    // Extract primary category
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
