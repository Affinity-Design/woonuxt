<script setup lang="ts">
import Calculator from '~/components/SizeCalculator/Calculator.vue';
import referenceBrandsJson from '~/data/calculator-data/reference-brands.json';
import carriedBrandsJson from '~/data/calculator-data/carried-brands.json';
import type {CalculatorReferenceBrandsData, CalculatorCarriedBrandsData} from '~/types/calculator-data';

const {setCanadianSEO} = useCanadianSEO();

setCanadianSEO({
  title: 'Roller & Inline Skate Size Calculator | ProSkaters Place',
  description:
    'Free roller skate size calculator. Convert your shoe size to inline skates, rollerblades, or quad skates — all major brands, Canadian sizing. Find your perfect fit in under 2 minutes.',
  image: '/images/roller-skates-size-calculator.jpg',
  type: 'website',
});

const faqs = [
  {
    question: 'How do I find my roller skate size?',
    answer:
      'Use the ProSkaters Place Skate Size Calculator above. Select your current shoe or skate type, enter your size, choose the skate brand you want, and the tool instantly calculates your correct size — accounting for brand-specific differences.',
  },
  {
    question: 'Are roller skate sizes the same as shoe sizes?',
    answer:
      "Usually not. Women's quad skates often run true to US shoe size, but inline skates and European brands typically use EU or mm sizing. Brands like Rollerblade size 1–1.5 sizes smaller than US shoe size, while others like Moxi run true to size. Our calculator handles all conversions automatically.",
  },
  {
    question: 'How do inline skate sizes compare to shoe sizes?',
    answer:
      'Most inline skates (rollerblades) run 1 to 1.5 US sizes smaller than your regular shoe size. For example, if you wear a US men\'s 10 shoe, you likely need a size 9 or 9.5 inline skate. However this varies by brand — always use a brand-specific size chart or our calculator for accuracy.',
  },
  {
    question: 'What is my rollerblade size if I wear a men\'s size 10 shoe?',
    answer:
      "For most rollerblade brands (Rollerblade, K2, Powerslide), a men's US size 10 shoe typically corresponds to a size 9 or 9.5 inline skate. Use the calculator above and select your specific brand for the most accurate recommendation.",
  },
  {
    question: 'Can I use this calculator for kids\' skate sizes?',
    answer:
      "Yes. The calculator supports children's skate sizing. Select 'Kids' or the appropriate category, enter your child's shoe size, and choose the target brand. For growing children, some parents size up half a size to extend the life of the skate.",
  },
  {
    question: 'What if my exact size isn\'t available in the brand I want?',
    answer:
      'The calculator shows the closest available size. If your ideal size is out of stock, we recommend sizing up by half a size and using thicker socks for a snug fit. You can also contact our Toronto experts for personalized fitting advice.',
  },
  {
    question: 'Do quad roller skate sizes work the same as inline skate sizes?',
    answer:
      "No. Quad roller skates and inline skates use different sizing conventions. Women's quad skates (like Moxi or Riedell) typically run true to women's US shoe size, while men's quad skates often run a half size small. Inline skates generally run 1–1.5 sizes smaller than shoe size across genders.",
  },
  {
    question: 'Are hockey skate sizes the same as shoe sizes?',
    answer:
      'Hockey skates typically run 1.5 to 2 US sizes smaller than your shoe size. A player wearing a US size 9 shoe usually needs a size 7 or 7.5 hockey skate. Our calculator supports hockey skate conversions alongside recreational inline and quad skates.',
  },
];

// --- Indexable size charts (server-rendered from the same data the calculator uses) ---
// These are built at prerender time from the calculator data files so the published chart
// always stays in sync with the Google Sheet pipeline that feeds the tool above.
const referenceData = referenceBrandsJson as unknown as CalculatorReferenceBrandsData;
const carriedData = carriedBrandsJson as unknown as CalculatorCarriedBrandsData;

// Master shoe-size -> skate-size equivalence, from the Generic Sports Shoe reference scale.
const genericShoe = referenceData.brands.find((brand) => brand.name === 'Generic Sports Shoe');
const shoeSizeChart = (genericShoe?.sizes ?? [])
  .filter((size) => size.usMen !== undefined && size.usMen >= 4 && size.usMen <= 14)
  .map((size) => ({
    usMen: size.usMen,
    usWomen: size.usWomen,
    eu: size.eu,
    mm: size.mm,
  }));

// Available EU size range we stock per carried brand, parsed from each recommendation label.
const euFromLabel = (label: string): number | null => {
  const match = label.match(/EU ([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
};
const brandSizeGuide = carriedData.brands
  .filter((brand) => brand.productCategory === 'inline_skates' || brand.productCategory === 'roller_skates')
  .map((brand) => {
    const eus = brand.sizeRanges.map((range) => euFromLabel(range.recommendedLabel)).filter((value): value is number => value !== null);
    return {
      name: brand.name,
      type: brand.productCategory === 'inline_skates' ? 'Inline' : 'Quad / Roller',
      euMin: Math.min(...eus),
      euMax: Math.max(...eus),
    };
  })
  .sort((first, second) => first.type.localeCompare(second.type) || first.name.localeCompare(second.name));

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Roller Skate & Inline Skate Size Calculator',
        url: 'https://proskatersplace.ca/roller-skates-size-calculator',
        applicationCategory: 'UtilityApplication',
        operatingSystem: 'Any',
        description:
          'Free online tool to convert shoe sizes and existing skate sizes to the correct roller skate, inline skate, or rollerblade size. Supports all major brands sold in Canada including Rollerblade, K2, Powerslide, Moxi, and Riedell.',
        featureList: [
          'Shoe-to-skate size conversion',
          'Brand-specific sizing for 20+ brands',
          'Inline skate, quad skate, and hockey skate sizing',
          'Canadian and US sizing supported',
          'Free to use, no account required',
        ],
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
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'How to Find Your Roller Skate or Inline Skate Size',
        description:
          'Use the ProSkaters Place skate size calculator to convert your current shoe or skate size to the right fit for any brand.',
        totalTime: 'PT2M',
        tool: [
          {
            '@type': 'HowToTool',
            name: 'ProSkaters Place Skate Size Calculator',
          },
        ],
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: 'Select your reference type',
            text: 'Choose the type of size you already know — your shoe size, or your current skate brand and size.',
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: 'Choose your current brand',
            text: 'Select the brand your current size is based on, or choose "Street Shoe" for regular shoe sizing.',
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: 'Enter your size',
            text: 'Type in your current shoe or skate size. The calculator converts it to millimetres for precision.',
          },
          {
            '@type': 'HowToStep',
            position: 4,
            name: 'Select your target skate type',
            text: 'Choose what type of skate you want to buy — inline skates, quad roller skates, or hockey skates.',
          },
          {
            '@type': 'HowToStep',
            position: 5,
            name: 'Choose your target brand',
            text: 'Select the brand you want to buy. The calculator applies brand-specific sizing offsets.',
          },
          {
            '@type': 'HowToStep',
            position: 6,
            name: 'Get your recommended size',
            text: 'View your recommended skate size and shop directly for that size from ProSkaters Place.',
          },
        ],
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://proskatersplace.ca',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Inline Skates',
            item: 'https://proskatersplace.ca/product-category/inline-skates',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Skate Size Calculator',
            item: 'https://proskatersplace.ca/roller-skates-size-calculator',
          },
        ],
      }),
    },
  ],
});
</script>

<template>
  <div>
    <Calculator />

    <!-- Static SEO content — indexed by Google, hidden below the fold -->
    <div class="bg-white">
      <div class="mx-auto max-w-2xl px-4 py-12 sm:px-6">

        <!-- How it works -->
        <section class="mb-14">
          <h2 class="mb-4 text-2xl font-black text-zinc-900">How the Skate Size Calculator Works</h2>
          <p class="mb-6 text-zinc-600 leading-relaxed">
            Getting the right skate size is the single most important factor in skating comfort and performance. Unlike shoes, skates from different brands can vary by 1–2 full sizes even for the same foot measurement. Our free roller skate and inline skate size calculator uses a millimetre-based conversion system to match your foot length to the exact size available in the brand you want — whether that's <NuxtLink to="/search?q=Rollerblade" class="text-emerald-700 font-semibold hover:underline">Rollerblade</NuxtLink>, <NuxtLink to="/search?q=K2%20Skates" class="text-emerald-700 font-semibold hover:underline">K2</NuxtLink>, <NuxtLink to="/search?q=Powerslide" class="text-emerald-700 font-semibold hover:underline">Powerslide</NuxtLink>, <NuxtLink to="/search?q=Moxi" class="text-emerald-700 font-semibold hover:underline">Moxi</NuxtLink>, or <NuxtLink to="/search?q=Riedell" class="text-emerald-700 font-semibold hover:underline">Riedell</NuxtLink>.
          </p>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="rounded-xl border border-zinc-100 bg-stone-50 p-5">
              <p class="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700">Step 1–3</p>
              <p class="font-bold text-zinc-900">Tell us your current size</p>
              <p class="mt-1 text-sm text-zinc-500">Enter your shoe size or existing skate size and brand.</p>
            </div>
            <div class="rounded-xl border border-zinc-100 bg-stone-50 p-5">
              <p class="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700">Step 4–5</p>
              <p class="font-bold text-zinc-900">Choose your target skate</p>
              <p class="mt-1 text-sm text-zinc-500">Pick the skate type and brand you want to buy.</p>
            </div>
            <div class="rounded-xl border border-zinc-100 bg-stone-50 p-5">
              <p class="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700">Step 6</p>
              <p class="font-bold text-zinc-900">Get your recommended size</p>
              <p class="mt-1 text-sm text-zinc-500">See your exact size and shop directly from our Canadian inventory.</p>
            </div>
          </div>
        </section>

        <!-- Shoe size to skate size chart (indexable) -->
        <section class="mb-14">
          <h2 class="mb-4 text-2xl font-black text-zinc-900">Shoe Size to Skate Size Chart</h2>
          <p class="mb-6 text-zinc-600 leading-relaxed">
            Skate sizing is based on the actual length of your foot in millimetres (the Mondopoint system used across the industry). Use this chart to convert a US or EU shoe size to its skate-size equivalent, then run the calculator above to match it to a specific brand and see what's in stock. For a full step-by-step walkthrough, read our <NuxtLink to="/blog/roller-skate-size-chart" class="text-emerald-700 font-semibold hover:underline">complete roller skate size chart guide</NuxtLink>.
          </p>
          <div class="overflow-x-auto rounded-xl border border-zinc-100">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="bg-stone-50 text-left">
                  <th class="px-4 py-3 font-bold text-zinc-900">US Men</th>
                  <th class="px-4 py-3 font-bold text-zinc-900">US Women</th>
                  <th class="px-4 py-3 font-bold text-zinc-900">EU</th>
                  <th class="px-4 py-3 font-bold text-zinc-900">Foot length</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in shoeSizeChart" :key="row.mm" class="border-t border-zinc-100">
                  <td class="px-4 py-2.5 text-zinc-700">{{ row.usMen }}</td>
                  <td class="px-4 py-2.5 text-zinc-700">{{ row.usWomen ?? '—' }}</td>
                  <td class="px-4 py-2.5 text-zinc-700">{{ row.eu ?? '—' }}</td>
                  <td class="px-4 py-2.5 text-zinc-700">{{ row.mm }} mm</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-3 text-xs text-zinc-400">
            Sizes are general equivalents based on foot length. Skates are meant to fit snugly — most inline and hockey skaters size down from their shoe size, while women's quad skates usually run true to US women's size. Confirm with the calculator or the product page before ordering.
          </p>
        </section>

        <!-- Brands carried & available sizes (indexable) -->
        <section class="mb-14">
          <h2 class="mb-4 text-2xl font-black text-zinc-900">Skate Brands We Carry &amp; Their Available Sizes</h2>
          <p class="mb-6 text-zinc-600 leading-relaxed">
            Available sizes vary by brand. This table shows the EU size range we stock in Canada for each skate brand — check your size is available before you order, then use the calculator above for your exact recommendation.
          </p>
          <div class="overflow-x-auto rounded-xl border border-zinc-100">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="bg-stone-50 text-left">
                  <th class="px-4 py-3 font-bold text-zinc-900">Brand</th>
                  <th class="px-4 py-3 font-bold text-zinc-900">Type</th>
                  <th class="px-4 py-3 font-bold text-zinc-900">Available sizes (EU)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="brand in brandSizeGuide" :key="`${brand.name}-${brand.type}`" class="border-t border-zinc-100">
                  <td class="px-4 py-2.5 font-semibold text-zinc-800">{{ brand.name }}</td>
                  <td class="px-4 py-2.5 text-zinc-600">{{ brand.type }}</td>
                  <td class="px-4 py-2.5 text-zinc-700">EU {{ brand.euMin }}–{{ brand.euMax }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Sizing tips -->
        <section class="mb-14">
          <h2 class="mb-4 text-2xl font-black text-zinc-900">Roller Skate &amp; Inline Skate Sizing Tips</h2>
          <ul class="space-y-3 text-zinc-600 leading-relaxed">
            <li class="flex gap-3"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600"></span><span><strong class="text-zinc-900">Inline skates run 1–1.5 sizes smaller</strong> than your regular shoe size. If you're a shoe size 10, start at inline size 8.5–9.</span></li>
            <li class="flex gap-3"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600"></span><span><strong class="text-zinc-900">Quad roller skates</strong> (Moxi, Riedell, Chaya) usually run true to women's US shoe size.</span></li>
            <li class="flex gap-3"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600"></span><span><strong class="text-zinc-900">European brands</strong> like Powerslide and FR Skates use EU sizing. Our calculator converts automatically.</span></li>
            <li class="flex gap-3"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600"></span><span><strong class="text-zinc-900">When in doubt, size up</strong> half a size and use thicker skate socks for a snug fit without toe pain.</span></li>
            <li class="flex gap-3"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600"></span><span><strong class="text-zinc-900">Hockey skates</strong> typically run 1.5–2 US sizes smaller than shoe size.</span></li>
          </ul>
        </section>

        <!-- FAQ -->
        <section>
          <h2 class="mb-6 text-2xl font-black text-zinc-900">Frequently Asked Questions — Skate Sizing</h2>
          <div class="space-y-4">
            <details
              v-for="(faq, i) in faqs"
              :key="i"
              class="group rounded-xl border border-zinc-100 bg-stone-50">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-zinc-900 hover:text-emerald-700 transition-colors">
                <span>{{ faq.question }}</span>
                <Icon name="ion:chevron-down-outline" class="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
              </summary>
              <div class="border-t border-zinc-100 px-5 py-4 text-sm leading-relaxed text-zinc-600">
                {{ faq.answer }}
              </div>
            </details>
          </div>

          <div class="mt-10 rounded-xl bg-emerald-50 border border-emerald-100 p-6 text-center">
            <p class="font-bold text-zinc-900 mb-1">Still not sure about your size?</p>
            <p class="text-sm text-zinc-500 mb-4">Our Toronto-based skate experts have fitted thousands of Canadian skaters.</p>
            <NuxtLink
              to="/contact"
              class="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800 transition-colors">
              <Icon name="ion:chatbubble-outline" class="h-4 w-4" />
              Ask an Expert
            </NuxtLink>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>
