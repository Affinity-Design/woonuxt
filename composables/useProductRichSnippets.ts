/**
 * Product Rich Snippets Composable
 *
 * Generates comprehensive Schema.org structured data for product pages
 * to maximize visibility in Google Search with rich snippets including:
 * - Product information with prices and availability
 * - Aggregate ratings and reviews
 * - FAQ sections
 * - Breadcrumbs
 * - Video content
 * - Merchant information
 *
 * Compatible with SSR, prerendering, and Cloudflare KV caching
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 */

interface ProductSchemaData {
  product: any;
  locale?: 'en-CA' | 'fr-CA';
  includeReviews?: boolean;
  includeFAQ?: boolean;
  includeVideo?: boolean;
  faqItems?: Array<{question: string; answer: string}>;
  videoUrl?: string;
  videoThumbnail?: string;
  videoDescription?: string;
}

export const useProductRichSnippets = () => {
  const {formatCADPrice} = useCanadianSEO();
  const route = useRoute();
  const config = useRuntimeConfig();

  /**
   * Generate comprehensive Product Schema with all relevant nested types
   * This is the main schema that Google uses for product rich snippets
   */
  const generateProductSchema = (data: ProductSchemaData) => {
    const {product, locale = 'en-CA'} = data;

    if (!product) return null;

    // Extract price information
    const price = parseFloat(product.price || product.regularPrice || '0');
    const salePrice = product.salePrice ? parseFloat(product.salePrice) : null;
    const currentPrice = salePrice || price;

    // Stock status mapping to Schema.org values
    const stockStatusMap: Record<string, string> = {
      IN_STOCK: 'https://schema.org/InStock',
      OUT_OF_STOCK: 'https://schema.org/OutOfStock',
      ON_BACKORDER: 'https://schema.org/PreOrder',
      LOW_STOCK: 'https://schema.org/LimitedAvailability',
    };

    const availability = stockStatusMap[product.stockStatus] || 'https://schema.org/OutOfStock';

    // Get primary category
    const primaryCategory = product.productCategories?.nodes?.[0]?.name || 'Products';

    // Get brand from attributes or use store name
    let brand = 'ProSkaters Place';
    if (product.attributes?.nodes) {
      const brandAttr = product.attributes.nodes.find((attr: any) => attr.name?.toLowerCase().includes('brand') || attr.name?.toLowerCase() === 'pa_brand');
      if (brandAttr && brandAttr.options?.[0]) {
        brand = brandAttr.options[0];
      }
    }

    // Build base product schema
    const productSchema: any = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: stripHtml(product.shortDescription || product.description || ''),
      image: product.image?.sourceUrl || product.image?.mediaItemUrl || '/images/default-product.jpg',
      sku: product.sku || `PRODUCT-${product.databaseId}`,
      brand: {
        '@type': 'Brand',
        name: brand,
      },
      manufacturer: {
        '@type': 'Organization',
        name: brand,
      },
      category: primaryCategory,
      url: `https://proskatersplace.ca/product/${product.slug}`,

      // Offer with Canadian pricing
      offers: {
        '@type': 'Offer',
        price: currentPrice.toFixed(2),
        priceCurrency: 'CAD',
        priceValidUntil: getNextYear(),
        availability,
        url: `https://proskatersplace.ca/product/${product.slug}`,
        seller: {
          '@type': 'Organization',
          name: 'ProSkaters Place Canada',
          url: 'https://proskatersplace.ca',
        },
        itemCondition: 'https://schema.org/NewCondition',
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingRate: {
            '@type': 'MonetaryAmount',
            value: '0',
            currency: 'CAD',
          },
          shippingDestination: {
            '@type': 'DefinedRegion',
            addressCountry: 'CA',
          },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            businessDays: {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            },
            cutoffTime: '16:00-05:00',
            handlingTime: {
              '@type': 'QuantitativeValue',
              minValue: 1,
              maxValue: 2,
              unitCode: 'DAY',
            },
            transitTime: {
              '@type': 'QuantitativeValue',
              minValue: 2,
              maxValue: 7,
              unitCode: 'DAY',
            },
          },
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: 30,
          returnMethod: 'https://schema.org/ReturnByMail',
          returnFees: 'https://schema.org/FreeReturn',
        },
      },
    };

    // Add GTIN if available (barcode/UPC)
    if (product.gtin || product.upc || product.ean) {
      productSchema.gtin = product.gtin || product.upc || product.ean;
    }

    // Add MPN if available
    if (product.mpn) {
      productSchema.mpn = product.mpn;
    }

    // Add aggregate rating and reviews if available
    if (data.includeReviews && product.averageRating && product.reviewCount > 0) {
      productSchema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: product.averageRating,
        reviewCount: product.reviewCount,
        bestRating: 5,
        worstRating: 1,
      };

      // Add individual reviews if available
      if (product.reviews?.nodes && product.reviews.nodes.length > 0) {
        productSchema.review = product.reviews.nodes.slice(0, 5).map((review: any) => ({
          '@type': 'Review',
          reviewRating: {
            '@type': 'Rating',
            ratingValue: review.rating || 5,
            bestRating: 5,
            worstRating: 1,
          },
          author: {
            '@type': 'Person',
            name: review.author?.node?.name || 'Anonymous',
          },
          datePublished: review.date,
          reviewBody: stripHtml(review.content || ''),
        }));
      }
    }

    // Add image gallery
    if (product.galleryImages?.nodes && product.galleryImages.nodes.length > 0) {
      const images = [product.image?.sourceUrl, ...product.galleryImages.nodes.map((img: any) => img.sourceUrl || img.mediaItemUrl)].filter(Boolean);
      productSchema.image = images;
    }

    // Add additional properties
    if (product.weight) {
      productSchema.weight = {
        '@type': 'QuantitativeValue',
        value: product.weight,
        unitCode: product.weightUnit || 'KGM',
      };
    }

    // Add dimensions if available
    if (product.length || product.width || product.height) {
      productSchema.depth = product.length
        ? {
            '@type': 'QuantitativeValue',
            value: product.length,
            unitCode: 'CMT',
          }
        : undefined;
      productSchema.width = product.width
        ? {
            '@type': 'QuantitativeValue',
            value: product.width,
            unitCode: 'CMT',
          }
        : undefined;
      productSchema.height = product.height
        ? {
            '@type': 'QuantitativeValue',
            value: product.height,
            unitCode: 'CMT',
          }
        : undefined;
    }

    return productSchema;
  };

  /**
   * Generate FAQ Schema for product pages
   * Great for "People also ask" rich snippets
   */
  const generateFAQSchema = (faqItems: Array<{question: string; answer: string}>) => {
    if (!faqItems || faqItems.length === 0) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    };
  };

  /**
   * Generate BreadcrumbList Schema
   * Helps Google understand site hierarchy
   */
  const generateBreadcrumbSchema = (product: any) => {
    if (!product) return null;

    const breadcrumbs = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://proskatersplace.ca',
      },
    ];

    // Add primary category
    if (product.productCategories?.nodes?.[0]) {
      const category = product.productCategories.nodes[0];
      breadcrumbs.push({
        '@type': 'ListItem',
        position: 2,
        name: category.name,
        item: `https://proskatersplace.ca/product-category/${category.slug}`,
      });
    }

    // Add product
    breadcrumbs.push({
      '@type': 'ListItem',
      position: breadcrumbs.length + 1,
      name: product.name,
      item: `https://proskatersplace.ca/product/${product.slug}`,
    });

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs,
    };
  };

  /**
   * Generate VideoObject Schema
   * For product demonstration videos
   */
  const generateVideoSchema = (data: {videoUrl: string; videoThumbnail: string; videoDescription: string; product: any}) => {
    if (!data.videoUrl) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: `${data.product.name} - Product Overview`,
      description: data.videoDescription || `Watch this video to learn more about ${data.product.name}`,
      thumbnailUrl: data.videoThumbnail,
      uploadDate: new Date().toISOString(),
      contentUrl: data.videoUrl,
      embedUrl: data.videoUrl,
      duration: 'PT2M', // Default 2 minutes, adjust as needed
    };
  };

  /**
   * Generate default FAQ items based on product category
   * These can be customized per product or category
   */
  const getDefaultFAQs = (product: any): Array<{question: string; answer: string}> => {
    const category = product.productCategories?.nodes?.[0]?.slug || '';
    const productName = product.name;

    // Safely parse price and handle NaN cases
    const rawPrice = product.price || product.regularPrice || product.salePrice || '0';
    const price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
    const hasValidPrice = !isNaN(price) && price > 0;

    // Default FAQs applicable to all products
    const defaultFAQs = [
      {
        question: `Is ${productName} available in Canada?`,
        answer: `Yes! ${productName} is available for purchase across Canada through ProSkaters Place. We offer fast Canadian shipping with tracking.`,
      },
    ];

    // Only include price FAQ if we have a valid price
    if (hasValidPrice) {
      defaultFAQs.push({
        question: `What is the price of ${productName} in CAD?`,
        answer: `${productName} is priced at ${formatCADPrice(price)}. We display all prices in Canadian dollars for your convenience.`,
      });
    }

    defaultFAQs.push(
      {
        question: `Does ${productName} come with a warranty?`,
        answer: `Yes, ${productName} comes with a manufacturer's warranty. Contact us for specific warranty details and coverage information.`,
      },
      {
        question: `How long does shipping take for ${productName}?`,
        answer: `Standard shipping for ${productName} takes 2-7 business days within Canada. Free shipping is available on orders over $99 CAD.`,
      },
    );

    // Category-specific FAQs
    if (category.includes('skate') || category.includes('inline') || category.includes('roller')) {
      defaultFAQs.push(
        {
          question: `What size should I order for ${productName}?`,
          answer: `We recommend checking our size guide for ${productName}. Most inline skates fit similar to your regular shoe size, but some brands may vary. Contact us for personalized sizing advice.`,
        },
        {
          question: `Can I return ${productName} if it doesn't fit?`,
          answer: `Yes! We offer a 30-day return policy on ${productName}. Items must be unused and in original packaging. Return shipping is free for Canadian customers.`,
        },
      );
    }

    if (category.includes('wheel') || category.includes('bearing')) {
      defaultFAQs.push({
        question: `Is ${productName} compatible with my skates?`,
        answer: `${productName} is compatible with most inline skates. Check the product specifications for exact measurements. Contact us if you need help determining compatibility.`,
      });
    }

    if (category.includes('protective') || category.includes('safety')) {
      defaultFAQs.push({
        question: `What protection does ${productName} offer?`,
        answer: `${productName} is designed to provide maximum protection while maintaining comfort. Check the product description for specific safety certifications and protection areas.`,
      });
    }

    return defaultFAQs.slice(0, 6); // Limit to 6 FAQs max
  };

  /**
   * Apply all structured data to the page
   * This is the main function to call from product pages
   */
  const applyProductRichSnippets = (data: ProductSchemaData) => {
    const {product, includeFAQ = true, includeReviews = true, includeVideo = false, faqItems, videoUrl, videoThumbnail, videoDescription} = data;

    if (!product) return;

    const scripts = [];

    // 1. Product Schema (required)
    const productSchema = generateProductSchema(data);
    if (productSchema) {
      scripts.push({
        type: 'application/ld+json',
        children: JSON.stringify(productSchema),
      });
    }

    // 2. Breadcrumb Schema (highly recommended)
    const breadcrumbSchema = generateBreadcrumbSchema(product);
    if (breadcrumbSchema) {
      scripts.push({
        type: 'application/ld+json',
        children: JSON.stringify(breadcrumbSchema),
      });
    }

    // 3. FAQ Schema (recommended for better SERP features)
    if (includeFAQ) {
      const faqs = faqItems || getDefaultFAQs(product);
      const faqSchema = generateFAQSchema(faqs);
      if (faqSchema) {
        scripts.push({
          type: 'application/ld+json',
          children: JSON.stringify(faqSchema),
        });
      }
    }

    // 4. Video Schema (if video is provided)
    if (includeVideo && videoUrl && videoThumbnail) {
      const videoSchema = generateVideoSchema({
        videoUrl,
        videoThumbnail,
        videoDescription: videoDescription || '',
        product,
      });
      if (videoSchema) {
        scripts.push({
          type: 'application/ld+json',
          children: JSON.stringify(videoSchema),
        });
      }
    }

    // Apply all schemas to the page head
    useHead({
      script: scripts,
    });
  };

  /**
   * Generate Organization Schema (for homepage/global)
   * This helps with brand recognition and knowledge graph
   */
  const generateOrganizationSchema = () => {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://proskatersplace.ca/#organization',
      name: 'ProSkaters Place Canada',
      url: 'https://proskatersplace.ca',
      logo: 'https://proskatersplace.ca/logo.svg',
      description: 'Leading inline skates and roller skating equipment retailer in Canada. Shop top brands with expert advice and fast Canadian shipping.',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'CA',
        addressRegion: 'ON',
        addressLocality: 'Toronto',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: '43.651070',
        longitude: '-79.347015',
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Service',
        areaServed: 'CA',
        availableLanguage: ['en', 'fr'],
      },
      sameAs: ['https://www.facebook.com/proskatersplace', 'https://www.instagram.com/proskatersplace', 'https://twitter.com/proskatersplace'],
    };
  };

  /**
   * Generate LocalBusiness Schema
   * For location-based searches
   */
  const generateLocalBusinessSchema = () => {
    return {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': 'https://proskatersplace.ca/#localbusiness',
      name: 'ProSkaters Place Canada',
      image: 'https://proskatersplace.ca/logo.svg',
      url: 'https://proskatersplace.ca',
      telephone: '+1-XXX-XXX-XXXX', // Add actual phone number
      priceRange: '$$',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'CA',
        addressRegion: 'ON',
        addressLocality: 'Toronto',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: '43.651070',
        longitude: '-79.347015',
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '09:00',
          closes: '17:00',
        },
      ],
      paymentAccepted: 'Cash, Credit Card, Debit Card',
      currenciesAccepted: 'CAD',
    };
  };

  // Utility function to strip HTML tags
  const stripHtml = (html: string): string => {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  };

  // Get date one year from now for price validity
  const getNextYear = (): string => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().split('T')[0];
  };

  return {
    applyProductRichSnippets,
    generateProductSchema,
    generateFAQSchema,
    generateBreadcrumbSchema,
    generateVideoSchema,
    generateOrganizationSchema,
    generateLocalBusinessSchema,
    getDefaultFAQs,
  };
};
