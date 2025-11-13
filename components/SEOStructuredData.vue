<script setup lang="ts">
interface Props {
  type: 'Product' | 'Article' | 'BreadcrumbList';
  data: any;
}

const props = defineProps<Props>();

const generateStructuredData = () => {
  const baseContext = {
    '@context': 'https://schema.org',
  };

  switch (props.type) {
    case 'Product':
      return {
        ...baseContext,
        '@type': 'Product',
        name: props.data.name,
        description: props.data.description,
        image: props.data.image,
        brand: {
          '@type': 'Brand',
          name: props.data.brand || 'ProSkaters Place',
        },
        offers: {
          '@type': 'Offer',
          price: props.data.price,
          priceCurrency: 'CAD',
          availability: props.data.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          seller: {
            '@type': 'Organization',
            name: 'ProSkaters Place Canada',
            url: 'https://proskatersplace.ca',
          },
          areaServed: {
            '@type': 'Country',
            name: 'Canada',
          },
          validFrom: new Date().toISOString(),
          url: `https://proskatersplace.ca${props.data.url}`,
        },
        aggregateRating: props.data.rating
          ? {
              '@type': 'AggregateRating',
              ratingValue: props.data.rating.value,
              reviewCount: props.data.rating.count,
              bestRating: 5,
              worstRating: 1,
            }
          : undefined,
        category: props.data.category,
        sku: props.data.sku,
        gtin: props.data.gtin,
        manufacturer: {
          '@type': 'Organization',
          name: props.data.manufacturer || props.data.brand || 'Various',
        },
      };

    case 'Article':
      return {
        ...baseContext,
        '@type': 'Article',
        headline: props.data.title,
        description: props.data.description,
        image: props.data.image,
        author: {
          '@type': 'Person',
          name: props.data.author,
          description: props.data.authorBio,
        },
        publisher: {
          '@type': 'Organization',
          name: 'ProSkaters Place Canada',
          url: 'https://proskatersplace.ca',
          logo: {
            '@type': 'ImageObject',
            url: 'https://proskatersplace.ca/logo.svg',
          },
        },
        datePublished: props.data.datePublished,
        dateModified: props.data.dateModified || props.data.datePublished,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `https://proskatersplace.ca${props.data.url}`,
        },
        articleSection: props.data.category,
        keywords: props.data.tags?.join(', '),
        inLanguage: 'en-CA',
        isAccessibleForFree: true,
        audience: {
          '@type': 'Audience',
          geographicArea: {
            '@type': 'Country',
            name: 'Canada',
          },
        },
      };

    case 'BreadcrumbList':
      return {
        ...baseContext,
        '@type': 'BreadcrumbList',
        itemListElement: props.data.items.map((item: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: `https://proskatersplace.ca${item.url}`,
        })),
      };

    default:
      return baseContext;
  }
};

const structuredData = generateStructuredData();

// Use useHead to inject structured data script tag
// This is the correct way for Vue 3 + Nuxt 3
// Compatible with SSR, prerendering, and caching
// @ts-ignore - Nuxt auto-imports
useHead({
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify(structuredData),
    },
  ],
});
</script>

<template>
  <!-- No template needed - structured data injected via useHead -->
</template>
