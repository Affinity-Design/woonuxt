/**
 * Canadian SEO Composable
 *
 * Provides bilingual (EN/FR) SEO optimization for Canadian e-commerce
 * Compatible with Nuxt 3 SSR, prerendering, and Cloudflare KV caching
 *
 * Key Features:
 * - Bilingual support (en-CA, fr-CA)
 * - Proper hreflang tags for international targeting
 * - Geographic targeting (Canada/Toronto)
 * - CAD currency formatting
 * - Cache-friendly meta tag generation
 *
 * @see docs/seo-implementation.md for usage guide
 */

type Locale = 'en-CA' | 'fr-CA';

interface CanadianSEOOptions {
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  price?: number;
  currency?: string;
  availability?: string;
  locale?: Locale;
}

export const useCanadianSEO = () => {
  // @ts-ignore - Nuxt auto-imports
  const route = useRoute();
  // @ts-ignore - Nuxt auto-imports
  const runtimeConfig = useRuntimeConfig();

  /**
   * Generate hreflang tags for the current page
   * Now includes French Canadian support
   *
   * @param currentPath - The current route path
   * @param locale - Current locale (en-CA or fr-CA)
   */
  const generateHreflangTags = (currentPath: string, locale: Locale = 'en-CA') => {
    const baseUrl = 'https://proskatersplace.ca';
    const usUrl = 'https://proskatersplace.com';

    // For French pages, we need to handle path properly
    const frPath = locale === 'fr-CA' && !currentPath.startsWith('/fr') ? `/fr${currentPath}` : currentPath;
    const enPath = currentPath.replace(/^\/fr/, '');

    return [
      {
        rel: 'alternate',
        hreflang: 'en-ca',
        href: `${baseUrl}${enPath}`,
      },
      {
        rel: 'alternate',
        hreflang: 'fr-ca',
        href: `${baseUrl}${frPath}`,
      },
      {
        rel: 'alternate',
        hreflang: 'en-us',
        href: `${usUrl}${enPath}`,
      },
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: `${usUrl}${enPath}`,
      },
    ];
  };

  /**
   * Get Canadian-specific meta tags
   * Now bilingual aware
   *
   * @param locale - Current locale for language targeting
   */
  const getCanadianMetaTags = (locale: Locale = 'en-CA') => {
    const language = locale === 'fr-CA' ? 'French' : 'English';
    const ogLocale = locale === 'fr-CA' ? 'fr_CA' : 'en_CA';

    return [
      // Geographic targeting
      {name: 'geo.region', content: 'CA'},
      {name: 'geo.placename', content: 'Canada'},
      {name: 'geo.position', content: '43.651070;-79.347015'}, // Toronto
      {name: 'ICBM', content: '43.651070, -79.347015'},

      // Currency and business
      {property: 'product:price:currency', content: 'CAD'},
      {name: 'price_currency', content: 'CAD'},
      {name: 'business:location:country_name', content: 'Canada'},
      {name: 'business:location:region', content: 'Ontario'},
      {name: 'business:location:locality', content: 'Toronto'},

      // Language and locale (bilingual aware)
      {property: 'og:locale', content: ogLocale},
      {name: 'language', content: language},
      {name: 'country', content: 'Canada'},

      // Alternate locale for bilingual support
      ...(locale === 'en-CA' ? [{property: 'og:locale:alternate', content: 'fr_CA'}] : [{property: 'og:locale:alternate', content: 'en_CA'}]),
    ];
  };

  /**
   * Format prices in Canadian dollars
   * Now supports both English and French formatting
   *
   * @param price - Price amount to format
   * @param locale - Locale for number formatting
   */
  const formatCADPrice = (price: number, locale: Locale = 'en-CA') => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  // Canadian spelling conversions
  const canadianSpelling = {
    color: 'colour',
    center: 'centre',
    gray: 'grey',
    realize: 'realise',
    organize: 'organise',
    aluminum: 'aluminium',
  };

  // Convert text to Canadian spelling
  const toCanadianSpelling = (text: string): string => {
    let canadianText = text;
    for (const [us, ca] of Object.entries(canadianSpelling)) {
      const regex = new RegExp(`\\b${us}\\b`, 'gi');
      canadianText = canadianText.replace(regex, ca);
    }
    return canadianText;
  };

  /**
   * Generate canonical URL for current page
   * Handles both English and French paths properly
   *
   * @param path - Optional path override
   * @param locale - Current locale
   */
  const getCanonicalUrl = (path?: string, locale: Locale = 'en-CA') => {
    const currentPath = path || route.path;
    // For French pages, ensure canonical points to correct locale version
    return `https://proskatersplace.ca${currentPath}`;
  };

  /**
   * SEO meta for Canadian e-commerce (CACHE-SAFE VERSION)
   *
   * This function is compatible with:
   * - Static prerendering (build time)
   * - Server-side rendering (SSR)
   * - Cloudflare KV caching
   * - Client-side navigation
   *
   * IMPORTANT: useSeoMeta() and useHead() are reactive and cache-friendly
   * They work correctly with Nuxt's prerendering and Nitro caching strategy
   *
   * @param options - SEO configuration options
   */
  const setCanadianSEO = (options: CanadianSEOOptions) => {
    const {
      title,
      description,
      image,
      type = 'website',
      price,
      currency = 'CAD',
      availability,
      locale = 'en-CA', // Default to English Canadian
    } = options;

    const currentPath = route.path;
    const canonicalUrl = getCanonicalUrl(currentPath, locale);
    const hreflangTags = generateHreflangTags(currentPath, locale);
    const canadianMeta = getCanadianMetaTags(locale);

    // Determine language attribute
    const htmlLang = locale === 'fr-CA' ? 'fr-CA' : 'en-CA';
    const ogLocale = locale === 'fr-CA' ? 'fr_CA' : 'en_CA';

    // Build meta tags array (for useHead meta property)
    const metaTags = [
      // Basic meta
      {name: 'description', content: description},
      {property: 'og:title', content: title},
      {property: 'og:description', content: description},
      {property: 'og:url', content: canonicalUrl},
      {property: 'og:type', content: type},
      {property: 'og:site_name', content: 'ProSkaters Place Canada'},
      {property: 'og:locale', content: ogLocale},

      // Twitter
      {name: 'twitter:card', content: 'summary_large_image'},
      {name: 'twitter:title', content: title},
      {name: 'twitter:description', content: description},

      // Canadian-specific
      ...canadianMeta,
    ];

    // Add image if provided
    if (image) {
      metaTags.push({property: 'og:image', content: image}, {name: 'twitter:image', content: image});
    }

    // Add price/product info if provided
    if (price && type === 'product') {
      metaTags.push(
        {property: 'product:price:amount', content: price.toString()},
        {property: 'product:price:currency', content: currency},
        {
          property: 'product:availability',
          content: availability || 'in stock',
        },
      );
    }

    /**
     * CACHING COMPATIBILITY:
     *
     * useSeoMeta() is cache-friendly because:
     * 1. It runs during SSR/prerender and generates static HTML meta tags
     * 2. Values are serialized into the page payload
     * 3. Nitro caches the complete rendered HTML with meta tags
     * 4. No dynamic runtime lookup needed
     *
     * This works with routeRules caching because the meta tags
     * are part of the static HTML that gets cached in KV.
     */
    // @ts-ignore - Nuxt auto-imports
    useSeoMeta({
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      ogUrl: canonicalUrl,
      ogType: type as any, // Type assertion for Nuxt's strict typing
      ogSiteName: 'ProSkaters Place Canada',
      ogLocale,
      twitterCard: 'summary_large_image',
      twitterTitle: title,
      twitterDescription: description,
      ...(image && {
        ogImage: image,
        twitterImage: image,
      }),
    });

    /**
     * CACHING COMPATIBILITY:
     *
     * useHead() is also cache-friendly:
     * 1. Link tags (canonical, hreflang) are rendered server-side
     * 2. HTML lang attribute is set during SSR
     * 3. All values become part of cached HTML
     *
     * The meta tags array is merged with useSeoMeta values.
     * Hreflang tags are especially important for international SEO
     * and bilingual support.
     */
    // @ts-ignore - Nuxt auto-imports
    useHead({
      link: [{rel: 'canonical', href: canonicalUrl}, ...hreflangTags],
      meta: metaTags,
      htmlAttrs: {
        lang: htmlLang,
      },
    });
  };

  /**
   * Detect locale from route path or browser
   * Useful for determining which language to use
   *
   * @returns Current locale (en-CA or fr-CA)
   */
  const detectLocale = (): Locale => {
    const path = route.path;

    // Check if path starts with /fr
    if (path.startsWith('/fr')) {
      return 'fr-CA';
    }

    // Default to English Canadian
    return 'en-CA';
  };

  /**
   * Get site name in the appropriate language
   *
   * @param locale - Current locale
   * @returns Localized site name
   */
  const getSiteName = (locale: Locale = 'en-CA'): string => {
    return locale === 'fr-CA'
      ? 'ProSkaters Place Canada' // Keep English brand name
      : 'ProSkaters Place Canada';
  };

  return {
    generateHreflangTags,
    getCanadianMetaTags,
    formatCADPrice,
    toCanadianSpelling,
    getCanonicalUrl,
    setCanadianSEO,
    detectLocale,
    getSiteName,
  };
};
