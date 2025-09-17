export const useCanadianSEO = () => {
  // @ts-ignore - Nuxt auto-imports
  const route = useRoute()
  // @ts-ignore - Nuxt auto-imports  
  const runtimeConfig = useRuntimeConfig()

  // Generate hreflang tags for the current page
  const generateHreflangTags = (currentPath: string) => {
    const baseUrl = 'https://proskatersplace.ca'
    const usUrl = 'https://proskatersplace.com'
    
    return [
      {
        rel: 'alternate',
        hreflang: 'en-ca',
        href: `${baseUrl}${currentPath}`
      },
      {
        rel: 'alternate', 
        hreflang: 'en-us',
        href: `${usUrl}${currentPath}`
      },
      {
        rel: 'alternate',
        hreflang: 'x-default', 
        href: `${usUrl}${currentPath}`
      }
    ]
  }

  // Canadian-specific meta tags
  const getCanadianMetaTags = () => {
    return [
      // Geographic targeting
      { name: 'geo.region', content: 'CA' },
      { name: 'geo.placename', content: 'Canada' },
      { name: 'geo.position', content: '43.651070;-79.347015' }, // Toronto
      { name: 'ICBM', content: '43.651070, -79.347015' },
      
      // Currency and business
      { property: 'product:price:currency', content: 'CAD' },
      { name: 'price_currency', content: 'CAD' },
      { name: 'business:location:country_name', content: 'Canada' },
      { name: 'business:location:region', content: 'Ontario' },
      { name: 'business:location:locality', content: 'Toronto' },
      
      // Language and locale
      { property: 'og:locale', content: 'en_CA' },
      { name: 'language', content: 'English' },
      { name: 'country', content: 'Canada' }
    ]
  }

  // Format prices in Canadian dollars
  const formatCADPrice = (price: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(price)
  }

  // Canadian spelling conversions
  const canadianSpelling = {
    'color': 'colour',
    'center': 'centre', 
    'gray': 'grey',
    'realize': 'realise',
    'organize': 'organise',
    'aluminum': 'aluminium'
  }

  // Convert text to Canadian spelling
  const toCanadianSpelling = (text: string): string => {
    let canadianText = text
    for (const [us, ca] of Object.entries(canadianSpelling)) {
      const regex = new RegExp(`\\b${us}\\b`, 'gi')
      canadianText = canadianText.replace(regex, ca)
    }
    return canadianText
  }

  // Generate canonical URL for current page
  const getCanonicalUrl = (path?: string) => {
    const currentPath = path || route.path
    return `https://proskatersplace.ca${currentPath}`
  }

  // SEO meta for Canadian e-commerce
  const setCanadianSEO = (options: {
    title: string
    description: string
    image?: string
    type?: string
    price?: number
    currency?: string
    availability?: string
  }) => {
    const { title, description, image, type = 'website', price, currency = 'CAD', availability } = options
    
    const currentPath = route.path
    const canonicalUrl = getCanonicalUrl(currentPath)
    const hreflangTags = generateHreflangTags(currentPath)
    const canadianMeta = getCanadianMetaTags()

    // Build meta tags
    const metaTags = [
      // Basic meta
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonicalUrl },
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: 'ProSkaters Place Canada' },
      { property: 'og:locale', content: 'en_CA' },
      
      // Twitter
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      
      // Canadian-specific
      ...canadianMeta
    ]

    // Add image if provided
    if (image) {
      metaTags.push(
        { property: 'og:image', content: image },
        { name: 'twitter:image', content: image }
      )
    }

    // Add price/product info if provided
    if (price && type === 'product') {
      metaTags.push(
        { property: 'product:price:amount', content: price.toString() },
        { property: 'product:price:currency', content: currency },
        { property: 'product:availability', content: availability || 'in stock' }
      )
    }

    // Set all meta tags
    // @ts-ignore - Nuxt auto-imports
    useSeoMeta({
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      ogUrl: canonicalUrl,
      ogType: type,
      ogSiteName: 'ProSkaters Place Canada',
      ogLocale: 'en_CA',
      twitterCard: 'summary_large_image',
      twitterTitle: title,
      twitterDescription: description,
      ...(image && { 
        ogImage: image,
        twitterImage: image 
      })
    })

    // Set links (canonical + hreflang)
    // @ts-ignore - Nuxt auto-imports
    useHead({
      link: [
        { rel: 'canonical', href: canonicalUrl },
        ...hreflangTags
      ],
      meta: metaTags,
      htmlAttrs: {
        lang: 'en-CA'
      }
    })
  }

  return {
    generateHreflangTags,
    getCanadianMetaTags,
    formatCADPrice,
    toCanadianSpelling,
    getCanonicalUrl,
    setCanadianSEO
  }
}
