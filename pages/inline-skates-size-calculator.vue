<script lang="ts" setup>
// Canadian SEO Optimization
const {setCanadianSEO, formatCADPrice} = useCanadianSEO();

setCanadianSEO({
  title: 'Inline Skates Size Calculator Canada | Perfect Fit Guide | ProSkaters Place',
  description:
    'Free inline skates size calculator for Canadian skaters. Convert foot size to skate size instantly! Expert sizing guide with 27EU-49EU range. Find your perfect fit for inline skating.',
  image: '/images/inline-skates-size-calculator.jpg',
  type: 'website',
});

// Structured data for the tool
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Inline Skates Size Calculator',
        url: 'https://proskatersplace.ca/inline-skates-size-calculator',
        applicationCategory: 'UtilityApplication',
        operatingSystem: 'Any',
        description: 'Free inline skates size calculator to help find the perfect skate size based on foot measurements and North American shoe sizes.',
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

// State management
const selectedUnit = ref<'ca' | 'cm' | 'inches'>('ca');
const inputValue = ref<number | null>(null);
const gender = ref<'men' | 'women' | 'youth'>('men');
const preference = ref<'control' | 'comfort'>('control');
const footWidth = ref<'narrow' | 'regular' | 'wide'>('regular');
const recommendedSize = ref<string | null>(null);
const showResults = ref(false);
const errorMessage = ref<string>('');

// Comprehensive size conversion data (Mondopoint-based)
interface SizeConversion {
  mmLength: number;
  caMen: number | string;
  caWomen: number | string;
  caYouth: number | string;
  euSize: string;
}

const sizeChart: SizeConversion[] = [
  // Youth/Kids sizes
  {mmLength: 165, caMen: '-', caWomen: '-', caYouth: '8.5Y', euSize: '27EU'},
  {mmLength: 170, caMen: '-', caWomen: '-', caYouth: '9Y', euSize: '28EU'},
  {mmLength: 175, caMen: '-', caWomen: '-', caYouth: '10Y', euSize: '29EU'},
  {mmLength: 180, caMen: '-', caWomen: '-', caYouth: '10.5Y', euSize: '30EU'},
  {mmLength: 185, caMen: '-', caWomen: '-', caYouth: '11.5Y', euSize: '31EU'},
  {mmLength: 190, caMen: '-', caWomen: '-', caYouth: '12Y', euSize: '32EU'},
  {mmLength: 195, caMen: '-', caWomen: '-', caYouth: '12.5Y', euSize: '33EU'},
  {mmLength: 200, caMen: '-', caWomen: '-', caYouth: '13.5Y', euSize: '34EU'},
  // Adult sizes start
  {mmLength: 205, caMen: '1', caWomen: '2', caYouth: '-', euSize: '34EU'},
  {mmLength: 210, caMen: '1.5', caWomen: '3', caYouth: '-', euSize: '35EU'},
  {mmLength: 215, caMen: '2', caWomen: '3.5', caYouth: '-', euSize: '35.5EU'},
  {mmLength: 220, caMen: '3', caWomen: '4.5', caYouth: '-', euSize: '36EU'},
  {mmLength: 225, caMen: '3.5', caWomen: '5', caYouth: '-', euSize: '36.5EU'},
  {mmLength: 230, caMen: '4', caWomen: '5.5', caYouth: '-', euSize: '37EU'},
  {mmLength: 235, caMen: '5', caWomen: '6.5', caYouth: '-', euSize: '38EU'},
  {mmLength: 240, caMen: '5.5', caWomen: '7', caYouth: '-', euSize: '38.5EU'},
  {mmLength: 245, caMen: '6', caWomen: '7.5', caYouth: '-', euSize: '39EU'},
  {mmLength: 250, caMen: '6.5', caWomen: '8', caYouth: '-', euSize: '39.5EU'},
  {mmLength: 255, caMen: '7', caWomen: '8.5', caYouth: '-', euSize: '40EU'},
  {mmLength: 260, caMen: '7.5', caWomen: '9', caYouth: '-', euSize: '40.5EU'},
  {mmLength: 265, caMen: '8', caWomen: '9.5', caYouth: '-', euSize: '41EU'},
  {mmLength: 270, caMen: '8.5', caWomen: '10', caYouth: '-', euSize: '41.5EU'},
  {mmLength: 275, caMen: '9', caWomen: '10.5', caYouth: '-', euSize: '42EU'},
  {mmLength: 280, caMen: '9.5', caWomen: '11', caYouth: '-', euSize: '42.5EU'},
  {mmLength: 285, caMen: '10', caWomen: '11.5', caYouth: '-', euSize: '43EU'},
  {mmLength: 290, caMen: '10.5', caWomen: '12', caYouth: '-', euSize: '43.5EU'},
  {mmLength: 295, caMen: '11', caWomen: '12.5', caYouth: '-', euSize: '44EU'},
  {mmLength: 300, caMen: '11.5', caWomen: '13', caYouth: '-', euSize: '44.5EU'},
  {mmLength: 305, caMen: '12', caWomen: '13.5', caYouth: '-', euSize: '45EU'},
  {mmLength: 310, caMen: '12.5', caWomen: '-', caYouth: '-', euSize: '45.5EU'},
  {mmLength: 315, caMen: '13', caWomen: '-', caYouth: '-', euSize: '46EU'},
  {mmLength: 320, caMen: '13.5', caWomen: '-', caYouth: '-', euSize: '47EU'},
  {mmLength: 325, caMen: '14', caWomen: '-', caYouth: '-', euSize: '47.5EU'},
  {mmLength: 330, caMen: '14.5', caWomen: '-', caYouth: '-', euSize: '48EU'},
  {mmLength: 335, caMen: '15', caWomen: '-', caYouth: '-', euSize: '49EU'},
];

// All available skate sizes (including ranges)
const availableSkates = [
  '27EU',
  '28EU',
  '29EU',
  '30EU',
  '31EU',
  '32EU',
  '33EU',
  '34EU',
  '35EU',
  '35.5EU',
  '36EU',
  '36.5EU',
  '37EU',
  '38EU',
  '38.5EU',
  '39EU',
  '39.5EU',
  '40EU',
  '40.5EU',
  '41EU',
  '41.5EU',
  '42EU',
  '42.5EU',
  '43EU',
  '43.5EU',
  '44EU',
  '44.5EU',
  '45EU',
  '45.5EU',
  '46EU',
  '47EU',
  '47.5EU',
  '48EU',
  '49EU',
  '24-31EU',
  '27-30EU',
  '28-31EU',
  '28-32EU',
  '29-32EU',
  '29-33EU',
  '30.5-34EU',
  '31-34EU',
  '32-34EU',
  '32-35EU',
  '33-35EU',
  '33-36EU',
  '33-37EU',
  '35-38EU',
  '35-39EU',
  '36-37EU',
  '36-38EU',
  '36-39EU',
  '36-42.5EU',
  '37-38EU',
  '37-39EU',
  '37-40EU',
  '38-38.5EU',
  '38-39EU',
  '38-42EU',
  '39-40EU',
  '39-42EU',
  '40-41EU',
  '40-42EU',
  '40.5-41EU',
  '40.5-41.5EU',
  '41-42EU',
  '42-42.5EU',
  '42-43EU',
  '43-44EU',
  '43-49EU',
  '43.5-44.5EU',
  '44-45EU',
  '44.5-45EU',
  '45-46EU',
  '45-48EU',
  '45.5-46EU',
  '46-47EU',
  '47-47.5EU',
  '47-48EU',
  '48-49EU',
];

// Calculate size
const calculateSize = () => {
  errorMessage.value = '';
  showResults.value = false;

  if (!inputValue.value || inputValue.value <= 0) {
    errorMessage.value = 'Please enter a valid measurement';
    return;
  }

  try {
    let footLengthMM = 0;

    // Convert to mm based on input type
    if (selectedUnit.value === 'cm') {
      footLengthMM = inputValue.value * 10;
    } else if (selectedUnit.value === 'inches') {
      footLengthMM = inputValue.value * 25.4;
    } else {
      // CA size - convert based on gender
      const caSize = inputValue.value;
      let conversion: SizeConversion | undefined;

      if (gender.value === 'youth') {
        conversion = sizeChart.find((s) => s.caYouth === `${caSize}Y` || s.caYouth === `${caSize}.5Y`);
      } else if (gender.value === 'women') {
        conversion = sizeChart.find((s) => s.caWomen === caSize || s.caWomen === `${caSize}`);
      } else {
        conversion = sizeChart.find((s) => s.caMen === caSize || s.caMen === `${caSize}`);
      }

      if (conversion) {
        footLengthMM = conversion.mmLength;
      } else {
        // Estimate if not in chart
        footLengthMM = 200 + (caSize - 1) * 8.5;
      }
    }

    // Validation
    if (footLengthMM < 160 || footLengthMM > 340) {
      errorMessage.value = 'Measurement out of range. Please check your input.';
      return;
    }

    // Find closest size match
    const closestSize = sizeChart.reduce((prev, curr) => {
      return Math.abs(curr.mmLength - footLengthMM) < Math.abs(prev.mmLength - footLengthMM) ? curr : prev;
    });

    let recommendedEU = closestSize.euSize;

    // Adjust based on preferences
    if (preference.value === 'comfort') {
      // Size up by 0.5 or 1 for comfort
      const currentIndex = sizeChart.findIndex((s) => s.euSize === recommendedEU);
      if (currentIndex < sizeChart.length - 1) {
        recommendedEU = sizeChart[currentIndex + 1].euSize;
      }
    }

    // Adjust for wide feet
    if (footWidth.value === 'wide') {
      const currentIndex = sizeChart.findIndex((s) => s.euSize === recommendedEU);
      if (currentIndex < sizeChart.length - 1) {
        recommendedEU = sizeChart[currentIndex + 1].euSize;
      }
    }

    recommendedSize.value = recommendedEU;
    showResults.value = true;
  } catch (error) {
    errorMessage.value = 'Error calculating size. Please try again.';
  }
};

// Get fitting advice
const getFittingAdvice = computed(() => {
  if (!recommendedSize.value) return '';

  const tips = [];

  if (preference.value === 'control') {
    tips.push('You selected a snug fit for maximum control. Perfect for aggressive skating and precision maneuvers.');
  } else {
    tips.push('You selected comfort fit. Great for recreational skating and longer sessions.');
  }

  if (footWidth.value === 'wide') {
    tips.push('We recommend sizing up for wider feet to ensure comfort during the break-in period.');
  }

  tips.push('Inline skates typically fit true to shoe size, but may vary by brand.');
  tips.push('Most skates require a 2-4 hour break-in period for optimal comfort.');

  return tips.join(' ');
});

// Get brand recommendations
const getBrandNotes = computed(() => {
  const notes = [
    '• Powerslide & Rollerblade: Generally true to size',
    '• FR Skates: Tend to run slightly wider, great for wider feet',
    '• Flying Eagle: True to size with generous toe box',
    '• K2: Often run slightly larger, consider sizing down',
    '• USD/Them Skates: Snug fit, some models run narrow',
  ];
  return notes;
});

// Inline skate category link from sitemap
const inlineSkatesLink = '/product-category/inline-skates';
const childrenSkatesLink = '/product-category/children-products';
const offRoadSkatesLink = '/product-category/off-road-skates';

// Fetch product categories for "Shop by Category" section
const {data: categoriesData} = await useAsyncGql('getProductCategories');
const categoryMapping = [
  {display: 'Inline Skates', slug: 'inline-skates'},
  {display: 'Roller Skates', slug: 'roller-skates'},
  {display: 'Skate Parts', slug: 'replacement-parts'},
  {display: 'Protection Gear', slug: 'protection-gear-and-apparel'},
  {display: 'Skate Tools', slug: 'skate-tools'},
  {display: 'Scooters', slug: 'scooters'},
];

const productCategories = computed(() => {
  if (!categoriesData.value?.productCategories?.nodes) return [];

  const categoriesMap = new Map(categoriesData.value.productCategories.nodes.map((cat: ProductCategory) => [cat.slug, cat]));

  return categoryMapping
    .map((category) => {
      const categoryData = categoriesMap.get(category.slug);
      return categoryData
        ? {
            ...categoryData,
            displayName: category.display,
          }
        : undefined;
    })
    .filter((category) => category !== undefined);
});
</script>

<template>
  <main class="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 md:py-12">
    <div class="container mx-auto px-4 max-w-5xl">
      <!-- Header -->
      <header class="text-center mb-8 md:mb-12">
        <h1 class="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">Inline Skates Size Calculator</h1>
        <p class="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Find your perfect inline skate size in seconds! Our expert calculator uses professional Mondopoint measurements for accurate sizing.
        </p>
      </header>

      <!-- Calculator Card -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 md:p-10 mb-8">
        <!-- Input Selection -->
        <div class="mb-8">
          <label class="block text-lg font-semibold text-gray-900 dark:text-white mb-4">Step 1: Choose Your Measurement Type</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              @click="selectedUnit = 'ca'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium text-center',
                selectedUnit === 'ca'
                  ? 'border-primary bg-primary text-white shadow-lg scale-105'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              CA Shoe Size
            </button>
            <button
              @click="selectedUnit = 'cm'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium text-center',
                selectedUnit === 'cm'
                  ? 'border-primary bg-primary text-white shadow-lg scale-105'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Centimeters (cm)
            </button>
            <button
              @click="selectedUnit = 'inches'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium text-center',
                selectedUnit === 'inches'
                  ? 'border-primary bg-primary text-white shadow-lg scale-105'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Inches (in)
            </button>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-3 text-center italic">
            <Icon name="mdi:information-outline" class="inline" />
            Note: Canadian shoe sizes are the same as US sizes
          </p>
        </div>

        <!-- Gender Selection (for CA sizes) -->
        <div v-if="selectedUnit === 'ca'" class="mb-8">
          <label class="block text-lg font-semibold text-gray-900 dark:text-white mb-4">Step 2: Select Category</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              @click="gender = 'men'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium',
                gender === 'men'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Men's
            </button>
            <button
              @click="gender = 'women'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium',
                gender === 'women'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Women's
            </button>
            <button
              @click="gender = 'youth'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium',
                gender === 'youth'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Youth
            </button>
          </div>
        </div>

        <!-- Size Input -->
        <div class="mb-8">
          <label class="block text-lg font-semibold text-gray-900 dark:text-white mb-4"
            >{{ selectedUnit === 'ca' ? 'Step 3' : 'Step 2' }}: Enter Your {{ selectedUnit === 'ca' ? 'Shoe Size' : 'Foot Length' }}</label
          >
          <div class="flex items-center gap-4">
            <input
              v-model.number="inputValue"
              type="number"
              step="0.5"
              :placeholder="selectedUnit === 'ca' ? '8.5' : selectedUnit === 'cm' ? '26.5' : '10.5'"
              class="flex-1 px-6 py-4 text-xl border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:text-white" />
            <span class="text-xl font-semibold text-gray-700 dark:text-gray-300 min-w-[80px]">
              {{ selectedUnit === 'ca' ? 'CA' : selectedUnit === 'cm' ? 'cm' : 'inches' }}
            </span>
          </div>
        </div>

        <!-- Preferences -->
        <div class="mb-8">
          <label class="block text-lg font-semibold text-gray-900 dark:text-white mb-4"
            >{{ selectedUnit === 'ca' ? 'Step 4' : 'Step 3' }}: Fit Preference</label
          >
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              @click="preference = 'control'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all text-left',
                preference === 'control'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              <div class="font-semibold mb-1">Snug Fit (Control)</div>
              <div class="text-sm opacity-90">Best for aggressive skating & tricks</div>
            </button>
            <button
              @click="preference = 'comfort'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all text-left',
                preference === 'comfort'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              <div class="font-semibold mb-1">Comfortable Fit</div>
              <div class="text-sm opacity-90">Best for recreational & fitness skating</div>
            </button>
          </div>
        </div>

        <!-- Foot Width -->
        <div class="mb-8">
          <label class="block text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ selectedUnit === 'ca' ? 'Step 5' : 'Step 4' }}: Foot Width</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              @click="footWidth = 'narrow'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium',
                footWidth === 'narrow'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Narrow
            </button>
            <button
              @click="footWidth = 'regular'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium',
                footWidth === 'regular'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Regular
            </button>
            <button
              @click="footWidth = 'wide'"
              :class="[
                'px-6 py-4 rounded-xl border-2 transition-all font-medium',
                footWidth === 'wide'
                  ? 'border-primary bg-primary text-white shadow-lg'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:text-gray-300',
              ]">
              Wide
            </button>
          </div>
        </div>

        <!-- Calculate Button -->
        <button
          @click="calculateSize"
          class="w-full bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white font-bold text-xl py-5 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]">
          Calculate My Skate Size
        </button>

        <!-- Error Message -->
        <div v-if="errorMessage" class="mt-6 p-4 bg-red-100 dark:bg-red-900/30 border-2 border-red-400 rounded-xl">
          <p class="text-red-700 dark:text-red-300 font-medium">{{ errorMessage }}</p>
        </div>
      </div>

      <!-- Results Section -->
      <transition name="fade">
        <div
          v-if="showResults && recommendedSize"
          class="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-2xl shadow-xl p-6 md:p-10 mb-8">
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-20 h-20 bg-green-500 rounded-full mb-4">
              <Icon name="mdi:check-circle" class="w-12 h-12 text-white" />
            </div>
            <h2 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">Your Recommended Size</h2>
            <div class="text-6xl md:text-7xl font-black text-primary my-6">{{ recommendedSize }}</div>
            <p class="text-lg text-gray-700 dark:text-gray-300">Based on your measurements and preferences</p>
          </div>

          <!-- Fitting Advice -->
          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Icon name="mdi:lightbulb-on" class="text-yellow-500" />
              Fitting Advice
            </h3>
            <p class="text-gray-700 dark:text-gray-300 leading-relaxed">{{ getFittingAdvice }}</p>
          </div>

          <!-- Brand Notes -->
          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Icon name="mdi:information" class="text-blue-500" />
              Brand Sizing Notes
            </h3>
            <ul class="space-y-2 text-gray-700 dark:text-gray-300">
              <li v-for="note in getBrandNotes" :key="note">{{ note }}</li>
            </ul>
          </div>

          <!-- CTA Buttons -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <NuxtLink
              :to="inlineSkatesLink"
              class="bg-primary hover:bg-primary-dark text-white font-bold text-lg py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all text-center flex items-center justify-center gap-2">
              <Icon name="mdi:rollerblade" class="text-2xl" />
              Shop Inline Skates
            </NuxtLink>
            <NuxtLink
              to="/contact"
              class="bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-bold text-lg py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all text-center flex items-center justify-center gap-2">
              <Icon name="mdi:email" class="text-2xl" />
              Contact Our Experts
            </NuxtLink>
          </div>
        </div>
      </transition>

      <!-- Educational Content -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <!-- Why Size Matters -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Icon name="mdi:shoe-formal" class="text-primary" />
            Why Size Matters
          </h2>
          <div class="space-y-3 text-gray-700 dark:text-gray-300">
            <p>
              <strong>Proper sizing is crucial for inline skating.</strong> Skates that are too large cause blisters and reduce control, while too-small skates
              cause pain and restrict circulation.
            </p>
            <p>Unlike regular shoes, inline skates should fit snugly but not painfully tight. Your toes should lightly touch the toe box when standing.</p>
            <p>
              <strong>Break-in period:</strong> Most skates need 2-4 hours of skating to mold to your feet. Initial tightness often loosens as materials conform
              to your foot shape.
            </p>
          </div>
        </div>

        <!-- How to Measure -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Icon name="mdi:ruler" class="text-primary" />
            How to Measure Your Feet
          </h2>
          <ol class="space-y-3 text-gray-700 dark:text-gray-300 list-decimal list-inside">
            <li><strong>Stand barefoot</strong> on a piece of paper against a wall.</li>
            <li><strong>Mark</strong> the longest point of your heel and toe.</li>
            <li><strong>Measure</strong> the distance in centimeters or inches.</li>
            <li><strong>Measure both feet</strong> and use the larger measurement.</li>
            <li><strong>Measure in the evening</strong> when feet are slightly swollen (like during skating).</li>
          </ol>
        </div>
      </div>

      <!-- Size Chart Reference -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8 mb-8">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">Quick Reference Size Chart</h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-primary text-white">
                <th class="px-4 py-3 text-left">Foot Length (mm)</th>
                <th class="px-4 py-3 text-left">CA Men</th>
                <th class="px-4 py-3 text-left">CA Women</th>
                <th class="px-4 py-3 text-left">EU Size</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(size, index) in sizeChart.slice(8, 28)"
                :key="index"
                :class="index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'">
                <td class="px-4 py-3 text-gray-900 dark:text-gray-300">{{ size.mmLength }} mm</td>
                <td class="px-4 py-3 text-gray-900 dark:text-gray-300">{{ size.caMen }}</td>
                <td class="px-4 py-3 text-gray-900 dark:text-gray-300">{{ size.caWomen }}</td>
                <td class="px-4 py-3 font-semibold text-primary">{{ size.euSize }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-center text-gray-600 dark:text-gray-400 mt-4 text-sm">*Sizes based on Mondopoint standard (foot length in mm)</p>
      </div>

      <!-- Expert Tips -->
      <div class="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-xl p-6 md:p-10 text-white mb-8">
        <h2 class="text-2xl md:text-3xl font-bold mb-6 text-center">Expert Sizing Tips from ProSkaters Place</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white/10 backdrop-blur rounded-xl p-5">
            <h3 class="font-bold text-xl mb-3 flex items-center gap-2">
              <Icon name="mdi:account-check" class="text-yellow-300" />
              For Beginners
            </h3>
            <p>
              If you're new to skating, we recommend sizing up by 0.5 for extra comfort during the learning phase. You can always tighten laces for a snugger
              fit.
            </p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-xl p-5">
            <h3 class="font-bold text-xl mb-3 flex items-center gap-2">
              <Icon name="mdi:ski" class="text-yellow-300" />
              For Advanced Skaters
            </h3>
            <p>
              Experienced skaters often prefer a tighter fit for maximum response and control. Consider your true shoe size or even 0.5 smaller if you value
              precision.
            </p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-xl p-5">
            <h3 class="font-bold text-xl mb-3 flex items-center gap-2">
              <Icon name="mdi:baby-face" class="text-yellow-300" />
              For Kids
            </h3>
            <p>
              Children's feet grow fast! Consider
              <NuxtLink :to="childrenSkatesLink" class="underline font-semibold">adjustable kids' skates</NuxtLink>
              that expand up to 4 sizes. Allow some growth room but ensure current safety and comfort.
            </p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-xl p-5">
            <h3 class="font-bold text-xl mb-3 flex items-center gap-2">
              <Icon name="mdi:hiking" class="text-yellow-300" />
              Off-Road Skating
            </h3>
            <p>
              For
              <NuxtLink :to="offRoadSkatesLink" class="underline font-semibold">off-road skates</NuxtLink>
              and rough terrain, consider sizing up slightly and wearing thicker socks for extra ankle support and cushioning.
            </p>
          </div>
        </div>
      </div>

      <!-- Still Unsure Section -->
      <div class="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 rounded-2xl p-6 md:p-8 text-center">
        <Icon name="mdi:help-circle" class="text-6xl text-yellow-500 mx-auto mb-4" />
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">Still Unsure About Your Size?</h2>
        <p class="text-lg text-gray-700 dark:text-gray-300 mb-6 max-w-2xl mx-auto">
          Our expert staff has been fitting skaters since 1995. We're here to help you find the perfect size for your needs. Contact us for personalized
          recommendations!
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <NuxtLink
            to="/contact"
            class="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold text-lg py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2">
            <Icon name="mdi:chat" class="text-2xl" />
            Get Expert Advice
          </NuxtLink>
          <a href="tel:+14167392929" class="text-gray-700 dark:text-gray-300 font-semibold hover:text-primary transition-colors flex items-center gap-2">
            <Icon name="mdi:phone" class="text-2xl" />
            (416) 739-2929
          </a>
        </div>
      </div>

      <!-- Shop by Category Section -->
      <div
        v-if="productCategories && productCategories.length"
        class="mt-12 p-6 md:p-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-gray-700 shadow-xl">
        <div class="text-center mb-8">
          <h3 class="text-2xl md:text-3xl font-bold text-white mb-2">Shop by Category</h3>
          <p class="text-gray-300 text-sm md:text-base">Discover our premium selection of skating equipment and gear</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          <CategoryCard
            v-for="(category, i) in productCategories"
            :key="category.slug"
            :node="{
              ...category,
              name: category.displayName,
            }"
            :image-loading="'lazy'"
            class="transform hover:scale-105 transition-transform duration-200" />
        </div>
        <div class="text-center mt-8">
          <NuxtLink
            to="/categories"
            class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg hover:shadow-xl text-sm md:text-base">
            View All Categories
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </NuxtLink>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Mobile optimizations */
@media (max-width: 640px) {
  input[type='number']::-webkit-inner-spin-button,
  input[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }
}

/* Custom scrollbar for table */
.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 10px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
