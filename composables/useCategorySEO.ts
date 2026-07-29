/**
 * Category SEO Composable - COMPREHENSIVE E-COMMERCE CATEGORY OPTIMIZATION
 *
 * Implements Google's e-commerce category page best practices:
 * - CollectionPage structured data (Schema.org)
 * - ItemList structured data for product listings
 * - BreadcrumbList for navigation hierarchy
 * - Optimized meta tags with Canadian SEO terms
 * - Faceted navigation SEO handling
 * - Rich snippets for category pages
 *
 * E-commerce Category SEO Best Practices Implemented:
 * 1. ✅ Unique, keyword-rich titles and descriptions
 * 2. ✅ Structured data (CollectionPage, ItemList, Breadcrumb)
 * 3. ✅ Optimized H1 tags with product count
 * 4. ✅ Category descriptions with keywords (above and below fold)
 * 5. ✅ Internal linking to subcategories and related categories
 * 6. ✅ Canonical URLs for faceted navigation
 * 7. ✅ Pagination handling (rel=next/prev)
 * 8. ✅ Image optimization and lazy loading
 * 9. ✅ Mobile-first responsive design
 * 10. ✅ Fast loading times (prerendering + KV cache)
 *
 * Usage:
 * ```typescript
 * const { setCategorySEO } = useCategorySEO();
 * await setCategorySEO({
 *   slug: 'inline-skates',
 *   name: 'Inline Skates',
 *   products: productsArray,
 *   totalProducts: 156,
 *   description: 'Custom description...',
 * });
 * ```
 */

// Term slug → nested proskatersplace.com category path (/products/<parents>/<slug>/).
// Generated from data/categories-list (same WP taxonomy backs both stores);
// powers the en-us hreflang alternate on category pages.
import usCategoryPaths from '~/data/us-category-paths.json';

/**
 * Convert authored category copy (which is intentionally HTML — <CategoryContent>
 * renders it on-page) into a clean plain-text meta description.
 *
 * Without this, the raw markup was emitted verbatim into meta description,
 * og:description, twitter:description AND CollectionPage.description — ~825 chars
 * beginning `<h2 class="text-2xl font-bold mb-4">` (2026-07-23 audit).
 *
 * Tags become a space (never welding words together), entities are decoded, and
 * the result is cut at a sentence boundary when one lands late enough, otherwise
 * at a word boundary. Idempotent: safe to apply to already-clean text.
 */
const toMetaDescription = (input?: string | null, maxLength = 155): string => {
  if (!input) return '';

  const text = String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    // Tag removal leaves a space before punctuation ("inline skates ." ) — close it up.
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  if (text.length <= maxLength) return text;

  const clipped = text.slice(0, maxLength);

  // Prefer ending on a complete sentence if one finishes in the last third.
  const lastSentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
  if (lastSentenceEnd > maxLength * 0.6) return clipped.slice(0, lastSentenceEnd + 1).trim();

  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim() + '…';
};

export interface CategorySEOProduct {
  name: string;
  slug: string;
  image?: {
    sourceUrl: string;
    altText?: string;
  };
  regularPrice?: string;
  salePrice?: string;
  onSale?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

export interface CategorySEOOptions {
  slug: string;
  name: string;
  description?: string;
  products: CategorySEOProduct[];
  totalProducts: number;
  locale?: 'en-CA' | 'fr-CA';
  parentCategory?: {
    name: string;
    slug: string;
  };
  subcategories?: Array<{
    name: string;
    slug: string;
    count: number;
  }>;
  currentPage?: number;
  totalPages?: number;
  featuredProducts?: CategorySEOProduct[];
  filters?: Record<string, string[]>; // Active filters for canonical URL
}

export const useCategorySEO = () => {
  const {setCanadianSEO, formatCADPrice} = useCanadianSEO();
  const config = useRuntimeConfig();
  const fst = config.public.freeShippingThreshold;

  /**
   * Generate SEO-optimized category title with Canadian terms
   * Pattern: "Shop Category Name Canada | 150+ Products | ProSkaters Place"
   */
  const generateCategoryTitle = (name: string, totalProducts: number, locale: 'en-CA' | 'fr-CA' = 'en-CA'): string => {
    const shopText = locale === 'fr-CA' ? 'Magasiner' : 'Shop';
    const productsText = locale === 'fr-CA' ? 'Produits' : 'Products';
    const inCanadaText = locale === 'fr-CA' ? 'au Canada' : 'Canada';

    // Special case for certain categories to ensure grammatical correctness
    // e.g. "Shop Inline Skates Canada" vs "Shop Roller Skates Canada"
    return `${shopText} ${name} ${inCanadaText} | ${totalProducts}+ ${productsText} | ProSkaters Place`;
  };

  /**
   * Generate SEO-optimized category description with Canadian keywords
   * Injects: geographic terms, shipping info, pricing, trust signals
   */
  const generateCategoryDescription = (name: string, totalProducts: number, slug: string, locale: 'en-CA' | 'fr-CA' = 'en-CA'): string => {
    const descriptions: Record<string, string> = {
      'inline-skates': `Shop ${totalProducts}+ inline skates in Canada at ProSkaters Place. Free shipping on orders over $${fst} CAD. Top brands including Rollerblade, K2, and Powerslide. Expert advice, fast delivery across Toronto, Ontario, and nationwide. Find your perfect fit from recreational to professional inline skates.`,
      'roller-skates': `Browse ${totalProducts}+ roller skates available in Canada. Best prices in CAD with free Canadian shipping on $${fst}+. Quad skates for all skill levels, from beginner to advanced. Shop indoor, outdoor, and artistic roller skates from trusted brands. Fast delivery from Toronto across Canada.`,
      'protective-gear': `Shop ${totalProducts}+ protective gear items for skating in Canada. Helmets, knee pads, elbow pads, and wrist guards. Safety-certified equipment with fast Canadian shipping. Best prices in CAD with expert sizing advice. Protect yourself with quality gear from ProSkaters Place Toronto.`,
      'wheels-bearings': `Upgrade your ride with ${totalProducts}+ wheels and bearings available in Canada. Premium skate wheels and ABEC/ILQ bearings from top brands. Fast shipping across Ontario and nationwide. Find the perfect setup for indoor, outdoor, or speed skating. Expert advice available.`,
      accessories: `Complete your skating setup with ${totalProducts}+ accessories in Canada. Bags, tools, laces, and maintenance supplies. Fast Canadian shipping on all orders. Best prices in CAD from Toronto's trusted skate shop. Everything you need to maintain and customize your skates.`,
      'clearance-items': `Save big on ${totalProducts}+ clearance items! Discounted inline skates, roller skates, and accessories in Canada. Limited quantities, best prices in CAD. Free shipping on $${fst}+. Fast delivery from Toronto. Shop now before they're gone!`,
      'children-products': `Shop ${totalProducts}+ kids' skates in Canada. Adjustable inline and roller skates for growing feet. Safe, quality skates for children and teens. Best prices in CAD with fast Canadian shipping. Expert sizing advice from ProSkaters Place Toronto. Free shipping on $${fst}+.`,
    };

    // Return custom description if available, otherwise generate generic one
    if (descriptions[slug]) {
      return descriptions[slug];
    }

    // Generic category description with Canadian SEO terms
    const template =
      locale === 'fr-CA'
        ? `Magasinez ${totalProducts}+ produits de ${name.toLowerCase()} au Canada chez ProSkaters Place. Livraison gratuite sur les commandes de plus de ${fst} $ CAD. Meilleurs prix, conseils d'experts et livraison rapide à travers le Canada.`
        : `Shop ${totalProducts}+ ${name.toLowerCase()} products in Canada at ProSkaters Place. Free shipping on orders over $${fst} CAD. Best prices, expert advice, and fast delivery across Canada from Toronto.`;

    return template;
  };

  /**
   * Generate CollectionPage structured data
   * https://schema.org/CollectionPage
   */
  const generateCollectionPageSchema = (options: CategorySEOOptions) => {
    const {name, description, slug, totalProducts, locale = 'en-CA'} = options;
    const baseUrl = 'https://proskatersplace.ca';
    const url = `${baseUrl}/product-category/${slug}`;
    const autoDescription = description || generateCategoryDescription(name, totalProducts, slug, locale);

    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      url,
      name,
      description: autoDescription,
      inLanguage: locale,
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${baseUrl}/#website`,
        name: 'ProSkaters Place',
      },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
      },
    };
  };

  /**
   * Generate ItemList structured data for products in category
   * https://schema.org/ItemList
   */
  const generateItemListSchema = (options: CategorySEOOptions) => {
    const {name, slug, products, totalProducts, currentPage = 1} = options;
    const baseUrl = 'https://proskatersplace.ca';
    const url = `${baseUrl}/product-category/${slug}`;

    const itemListElement = products.slice(0, 20).map((product, index) => {
      const productUrl = `${baseUrl}/product/${product.slug}`;
      const price = product.salePrice || product.regularPrice;

      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          '@id': `${productUrl}#product`,
          name: product.name,
          url: productUrl,
          image: product.image?.sourceUrl,
          offers: price
            ? {
                '@type': 'Offer',
                price: parseFloat(price.replace(/[^0-9.]/g, '')),
                priceCurrency: 'CAD',
                availability: 'https://schema.org/InStock',
                url: productUrl,
              }
            : undefined,
          aggregateRating:
            product.reviewCount && product.reviewCount > 0
              ? {
                  '@type': 'AggregateRating',
                  ratingValue: product.averageRating || 5,
                  reviewCount: product.reviewCount,
                }
              : undefined,
        },
      };
    });

    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${url}#itemlist`,
      name: `${name} Products`,
      description: `Browse ${totalProducts} ${name.toLowerCase()} products available in Canada`,
      numberOfItems: totalProducts,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement,
    };
  };

  /**
   * Generate BreadcrumbList structured data
   * https://schema.org/BreadcrumbList
   */
  const generateBreadcrumbSchema = (options: CategorySEOOptions) => {
    const {name, slug, parentCategory} = options;
    const baseUrl = 'https://proskatersplace.ca';

    const itemListElement: any[] = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Shop',
        item: `${baseUrl}/products`,
      },
    ];

    if (parentCategory) {
      itemListElement.push({
        '@type': 'ListItem',
        position: 3,
        name: parentCategory.name,
        item: `${baseUrl}/product-category/${parentCategory.slug}`,
      });
      itemListElement.push({
        '@type': 'ListItem',
        position: 4,
        name,
        item: `${baseUrl}/product-category/${slug}`,
      });
    } else {
      itemListElement.push({
        '@type': 'ListItem',
        position: 3,
        name,
        item: `${baseUrl}/product-category/${slug}`,
      });
    }

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      '@id': `${baseUrl}/product-category/${slug}#breadcrumb`,
      itemListElement,
    };
  };

  /**
   * Generate canonical URL with proper filter handling
   * Prevents duplicate content issues from faceted navigation
   */
  const generateCanonicalUrl = (slug: string, filters?: Record<string, string[]>, currentPage = 1): string => {
    const baseUrl = `https://proskatersplace.ca/product-category/${slug}`;

    // Allow specific filter parameters in canonical (e.g., brand, size)
    // Block others (e.g., color, price range) to avoid duplication
    const allowedFilters = ['brand', 'size', 'skill-level'];
    const params: string[] = [];

    for (const [key, values] of Object.entries(filters || {})) {
      if (allowedFilters.includes(key) && values.length > 0) {
        // Copy before sorting — .sort() mutates the caller's filter array.
        params.push(`${key}=${[...values].sort().join(',')}`);
      }
    }

    // Paginated pages must self-canonicalize. Pointing page 2..N at page 1
    // declared them duplicates, so Google dropped them — taking with them the
    // only crawl path to the ~126 products beyond page 1 of a big category.
    if (currentPage > 1) params.push(`page=${currentPage}`);

    return params.length ? `${baseUrl}?${params.join('&')}` : baseUrl;
  };

  /**
   * Apply comprehensive category SEO
   * Combines Canadian SEO, structured data, and e-commerce best practices
   */
  const setCategorySEO = async (options: CategorySEOOptions): Promise<void> => {
    const {slug, name, description: customDescription, products, totalProducts, locale = 'en-CA', currentPage = 1, totalPages = 1, filters} = options;

    // Generate optimized title and description.
    // Page 2+ gets a distinct title — an identical title on every paginated URL
    // is a duplicate-title signal now that those URLs self-canonicalize.
    const baseTitle = generateCategoryTitle(name, totalProducts, locale);
    const title = currentPage > 1 ? baseTitle.replace(' | ProSkaters Place', ` | Page ${currentPage} | ProSkaters Place`) : baseTitle;

    // Category copy is authored as HTML for on-page rendering — strip it before
    // it reaches any meta/schema string.
    const description = toMetaDescription(customDescription) || generateCategoryDescription(name, totalProducts, slug, locale);
    const canonicalUrl = generateCanonicalUrl(slug, filters, currentPage);
    const baseUrl = 'https://proskatersplace.ca';
    const url = `${baseUrl}/product-category/${slug}`;

    // Get first product image for og:image
    const image = products[0]?.image?.sourceUrl || `${baseUrl}/images/category-${slug}.jpg`;

    // en-us hreflang target: the same taxonomy term on proskatersplace.com
    // (nested path from the static map). Only on the clean page-1 URL —
    // filtered/paginated variants have no 1:1 US equivalent.
    const usPath = (usCategoryPaths as Record<string, string>)[slug];
    const usUrl = usPath && currentPage === 1 && !canonicalUrl.includes('?') ? `https://proskatersplace.com${usPath}` : undefined;

    // Apply Canadian SEO base meta tags (owns canonical + hreflang)
    setCanadianSEO({
      title,
      description,
      image,
      type: 'website',
      locale,
      url: canonicalUrl,
      usUrl,
    });

    // Generate structured data schemas
    const collectionPageSchema = generateCollectionPageSchema(options);
    const itemListSchema = generateItemListSchema(options);
    const breadcrumbSchema = generateBreadcrumbSchema(options);

    // Apply additional meta tags and structured data.
    // (canonical is emitted by setCanadianSEO above — a second link tag here
    // used to produce duplicate/conflicting canonicals on category pages)
    useHead({
      link: [
        // Pagination links for SEO
        currentPage > 1 ? {rel: 'prev', href: `${url}?page=${currentPage - 1}`} : null,
        currentPage < totalPages ? {rel: 'next', href: `${url}?page=${currentPage + 1}`} : null,
      ].filter(Boolean) as any,
      script: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify(collectionPageSchema),
        },
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify(itemListSchema),
        },
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify(breadcrumbSchema),
        },
      ],
      meta: [
        // Additional e-commerce specific meta tags
        {property: 'product:price:currency', content: 'CAD'},
        {property: 'product:availability', content: 'in stock'},
        {name: 'robots', content: 'index, follow, max-image-preview:large'},
      ],
    });
  };

  return {
    setCategorySEO,
    generateCategoryTitle,
    generateCategoryDescription,
    generateCollectionPageSchema,
    generateItemListSchema,
    generateBreadcrumbSchema,
    generateCanonicalUrl,
  };
};
