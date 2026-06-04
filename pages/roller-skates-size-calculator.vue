<script setup lang="ts">
import Calculator from '~/components/SizeCalculator/Calculator.vue';

const {setCanadianSEO} = useCanadianSEO();

setCanadianSEO({
  title: 'Roller Skates Size Calculator Canada | Inline, Roller & Ski Boot Fit Guide',
  description:
    'Use the ProSkaters Place skate size calculator to convert shoe, inline, roller, or ice skate sizes into millimeters and match the right stocked skate size.',
  image: '/images/inline-skates-size-calculator.jpg',
  type: 'website',
});

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Skate Size Calculator',
        url: 'https://proskatersplace.ca/roller-skates-size-calculator',
        applicationCategory: 'UtilityApplication',
        operatingSystem: 'Any',
        description: 'A data-driven skate size calculator for roller skates, inline skates, ski boots, sports shoes, and ice skates.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'CAD',
        },
        provider: {
          '@type': 'Organization',
          name: 'ProSkaters Place',
          url: 'https://proskatersplace.ca',
        },
      }),
    },
  ],
});
</script>

<template>
  <Calculator />
</template>
