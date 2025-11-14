<script setup lang="ts">
/**
 * Global Organization Schema Component
 *
 * Adds Organization and LocalBusiness structured data to all pages
 * This helps with:
 * - Google Knowledge Graph
 * - Local business searches
 * - Brand recognition
 * - Rich snippets in search results
 *
 * Should be added to app.vue or default layout
 */

const {generateOrganizationSchema, generateLocalBusinessSchema} = useProductRichSnippets();

// Generate schemas
const organizationSchema = generateOrganizationSchema();
const localBusinessSchema = generateLocalBusinessSchema();

// Apply both schemas globally
useHead({
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify(organizationSchema),
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify(localBusinessSchema),
    },
    // WebSite schema for site-wide search
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': 'https://proskatersplace.ca/#website',
        url: 'https://proskatersplace.ca',
        name: 'ProSkaters Place Canada',
        description: 'Leading inline skates and roller skating equipment retailer in Canada',
        publisher: {
          '@id': 'https://proskatersplace.ca/#organization',
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://proskatersplace.ca/search?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
        inLanguage: ['en-CA', 'fr-CA'],
      }),
    },
  ],
});
</script>

<template>
  <!-- This component has no visual output - it only adds structured data to the page head -->
</template>
