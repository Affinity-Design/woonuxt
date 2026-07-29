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

const SITE_ORIGIN = 'https://proskatersplace.ca';

/**
 * Open Graph and Twitter crawlers do NOT resolve relative image paths against
 * the page URL — they drop the image entirely. Nearly every call site passes a
 * site-relative path ('/images/…'), so previews on Facebook, LinkedIn, Slack and
 * iMessage were rendering without an image (2026-07-23 audit).
 *
 * Normalizing centrally here means every setCanadianSEO() caller inherits the
 * fix, including pages and components that pass images through untouched.
 */
const toAbsoluteImageUrl = (image?: string): string | undefined => {
  if (!image) return undefined;
  const trimmed = image.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `${SITE_ORIGIN}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

interface CanadianSEOOptions {
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  price?: number;
  currency?: string;
  availability?: string;
  locale?: Locale;
  /** Canonical URL override (e.g. category pages with filter params). */
  url?: string;
  /** The equivalent page on proskatersplace.com, used for en-us/x-default
   *  hreflang. Must be a full https://proskatersplace.com/... URL (product
   *  pages: the WP permalink from product.link; category pages: the static
   *  us-category-paths map). Omit when no US equivalent exists — the page
   *  then emits no hreflang at all. */
  usUrl?: string;
}

export const useCanadianSEO = () => {
  // @ts-ignore - Nuxt auto-imports
  const route = useRoute();
  // @ts-ignore - Nuxt auto-imports
  const runtimeConfig = useRuntimeConfig();

  /**
   * Generate hreflang tags for the current page (2026-07 hreflang repair).
   *
   * Cluster design:
   * - en-ca     → this page on proskatersplace.ca (self)
   * - en-us     → the equivalent page on proskatersplace.com — ONLY when the
   *               real US URL is known (WP permalink via product.link, the
   *               static category map, or the homepage). The old behaviour of
   *               appending the .ca path to the .com domain produced URLs that
   *               301 to the .com homepage, which invalidates the cluster.
   * - x-default → the US URL (deliberate: routes rest-of-world to .com)
   * - fr-ca is never emitted: i18n strategy is no_prefix, so no French URLs
   *   exist — the old tag declared this English page as its own French
   *   alternate.
   *
   * Pages with no known US equivalent emit NO hreflang at all — wrong tags
   * are worse than absent ones. Reciprocity requirement: the .com must emit
   * matching en-ca return tags (see wordpress/plugins/psp-hreflang/).
   *
   * @param currentPath - The current route path
   * @param locale - Current locale (kept for API compatibility)
   * @param usUrl - Verified https://proskatersplace.com/... equivalent URL
   */
  const generateHreflangTags = (currentPath: string, locale: Locale = 'en-CA', usUrl?: string) => {
    const baseUrl = 'https://proskatersplace.ca';
    const usBase = 'https://proskatersplace.com';
    const enPath = currentPath.replace(/^\/fr/, '');

    // Homepage maps 1:1; every other page needs an explicit, verified US URL.
    const resolvedUsUrl = usUrl && usUrl.startsWith(usBase) ? usUrl : enPath === '/' ? `${usBase}/` : null;

    if (!resolvedUsUrl) return [];

    return [
      {
        rel: 'alternate',
        hreflang: 'en-ca',
        href: `${baseUrl}${enPath}`,
      },
      {
        rel: 'alternate',
        hreflang: 'en-us',
        href: resolvedUsUrl,
      },
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: resolvedUsUrl,
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
      url,
      usUrl,
    } = options;

    const currentPath = route.path;
    const canonicalUrl = url || getCanonicalUrl(currentPath, locale);
    const hreflangTags = generateHreflangTags(currentPath, locale, usUrl);
    const canadianMeta = getCanadianMetaTags(locale);
    // Social crawlers require absolute image URLs (see toAbsoluteImageUrl).
    const absoluteImage = toAbsoluteImageUrl(image);

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
    if (absoluteImage) {
      metaTags.push({property: 'og:image', content: absoluteImage}, {property: 'og:image:secure_url', content: absoluteImage}, {name: 'twitter:image', content: absoluteImage});
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
      // Both this and the useHead meta array emit og:image/twitter:image (unhead
      // dedupes by key) — both must carry the absolute URL or the winner could
      // still be relative.
      ...(absoluteImage && {
        ogImage: absoluteImage,
        twitterImage: absoluteImage,
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
