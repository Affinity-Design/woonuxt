import {computed} from 'vue';
import carriedBrandsJson from '~/data/calculator-data/carried-brands.json';
import referenceBrandsJson from '~/data/calculator-data/reference-brands.json';
import type {
  CalculatorCarriedBrand,
  CalculatorCarriedBrandsData,
  CalculatorCarriedSizeRange,
  CalculatorReferenceBrand,
  CalculatorReferenceBrandsData,
  ProductCategory,
  ReferenceCategory,
} from '~/types/calculator-data';

type SizeInputField = 'mm' | 'eu' | 'usMen' | 'usWomen' | 'uk';

interface SizeInputState {
  mm: string;
  eu: string;
  usMen: string;
  usWomen: string;
  uk: string;
}

interface CalculatorState {
  referenceCategory: ReferenceCategory | null;
  referenceBrandId: string | null;
  sizeInput: SizeInputState;
  targetCategory: ProductCategory | null;
  targetBrandId: string | null;
  stepStartedAt: number;
}

interface ResolvedReferenceSize {
  mm: number;
  field: SizeInputField;
  enteredValue: number;
  matchedValue: number;
  snapped: boolean;
  warning: string | null;
  sourceLabel: string;
  size: {
    mm: number;
    eu?: number;
    usMen?: number;
    usWomen?: number;
    uk?: number;
  };
}

interface CalculatorRecommendation {
  range: CalculatorCarriedSizeRange;
  snapped: boolean;
  warning: string | null;
}

const referenceData = referenceBrandsJson as CalculatorReferenceBrandsData;
const carriedData = carriedBrandsJson as CalculatorCarriedBrandsData;

const referenceCategoryOptions: Array<{value: ReferenceCategory; label: string; description: string; icon: string}> = [
  {value: 'inline_skates', label: 'Inline Skates', description: 'Use sizing from rollerblades or inline boots you already know.', icon: 'ion:flash-outline'},
  {value: 'roller_skates', label: 'Roller Skates', description: 'Start from a quad skate size that already fits you.', icon: 'ion:ellipse-outline'},
  {value: 'ice_skates', label: 'Ice Skates', description: 'Convert a hockey or figure skate size into millimeters.', icon: 'ion:snow-outline'},
  {value: 'sports_shoes', label: 'Sports Shoes', description: 'Use a familiar shoe size when skate sizing is unknown.', icon: 'ion:walk-outline'},
];

const targetCategoryOptions: Array<{value: ProductCategory; label: string; description: string; icon: string}> = [
  {value: 'inline_skates', label: 'Inline Skates', description: 'Urban, fitness, freestyle, aggressive, and speed skates.', icon: 'ion:flash-outline'},
  {
    value: 'roller_skates',
    label: 'Roller Skates',
    description: 'Quad skates for indoor, outdoor, park, derby, and rhythm.',
    icon: 'ion:radio-button-on-outline',
  },
  {value: 'ski_boots', label: 'Ski Boots', description: 'Nordic and alpine boot recommendations from the same baseline.', icon: 'ion:snow-outline'},
];

const sizeFieldLabels: Record<SizeInputField, string> = {
  mm: 'Millimeters',
  eu: 'EU',
  usMen: 'US Men',
  usWomen: 'US Women',
  uk: 'UK',
};

const defaultState = (): CalculatorState => ({
  referenceCategory: null,
  referenceBrandId: null,
  sizeInput: {
    mm: '',
    eu: '',
    usMen: '',
    usWomen: '',
    uk: '',
  },
  targetCategory: null,
  targetBrandId: null,
  stepStartedAt: Date.now(),
});

function trackCalculatorEvent(eventName: string, payload: Record<string, unknown>) {
  if (!process.client) return;

  const windowWithAnalytics = window as typeof window & {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (eventType: string, eventName: string, payload: Record<string, unknown>) => void;
  };

  windowWithAnalytics.dataLayer?.push({event: eventName, ...payload});
  windowWithAnalytics.gtag?.('event', eventName, payload);
}

function nearestByValue<T>(items: T[], target: number, getValue: (item: T) => number | undefined) {
  let nearest: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const value = getValue(item);
    if (value === undefined) continue;

    const distance = Math.abs(value - target);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function sizeValue(size: ResolvedReferenceSize['size'], field: SizeInputField) {
  return field === 'mm' ? size.mm : size[field];
}

function formatSizeSource(size: ResolvedReferenceSize['size']) {
  const labels = [
    `MM ${size.mm}`,
    size.eu !== undefined ? `EU ${size.eu}` : null,
    size.usMen !== undefined ? `US Men ${size.usMen}` : null,
    size.usWomen !== undefined ? `US Women ${size.usWomen}` : null,
    size.uk !== undefined ? `UK ${size.uk}` : null,
  ].filter(Boolean);

  return labels.join(' / ');
}

function widthDisclaimer(brand: CalculatorCarriedBrand) {
  if (brand.widthDisclaimer) return brand.widthDisclaimer;

  if (brand.widthProfile === 'narrow') {
    return 'This brand has a narrow profile. If you are between sizes, verify the product page notes before sizing up.';
  }

  if (brand.widthProfile === 'wide') {
    return 'This brand has a wider shell profile. If you are between sizes, stay close to the millimeter recommendation first.';
  }

  return 'This brand has an average shell profile. Use the millimeter recommendation as your starting point.';
}

export const useCalculator = () => {
  const state = useState<CalculatorState>('size-calculator-v2', defaultState);

  const referenceBrands = computed(() => {
    if (!state.value.referenceCategory) return [];
    return referenceData.brands.filter((brand) => brand.category === state.value.referenceCategory);
  });

  const selectedReferenceBrand = computed<CalculatorReferenceBrand | null>(() => {
    return referenceData.brands.find((brand) => brand.id === state.value.referenceBrandId) || null;
  });

  const activeSizeField = computed<SizeInputField | null>(() => {
    return (Object.keys(state.value.sizeInput) as SizeInputField[]).find((field) => state.value.sizeInput[field] !== '') || null;
  });

  const resolvedReferenceSize = computed<ResolvedReferenceSize | null>(() => {
    const brand = selectedReferenceBrand.value;
    const field = activeSizeField.value;
    if (!brand || !field) return null;

    const enteredValue = Number(state.value.sizeInput[field]);
    if (!Number.isFinite(enteredValue) || enteredValue <= 0) return null;

    const exactMatch = brand.sizes.find((size) => sizeValue(size, field) === enteredValue);
    const matchedSize = exactMatch || nearestByValue(brand.sizes, enteredValue, (size) => sizeValue(size, field));
    if (!matchedSize) return null;

    const matchedValue = sizeValue(matchedSize, field);
    const snapped = matchedValue !== enteredValue;

    return {
      mm: matchedSize.mm,
      field,
      enteredValue,
      matchedValue: matchedValue || matchedSize.mm,
      snapped,
      warning: snapped ? `Snapped to ${sizeFieldLabels[field]} ${matchedValue} because that is the closest charted value.` : null,
      sourceLabel: formatSizeSource(matchedSize),
      size: matchedSize,
    };
  });

  const targetBrands = computed(() => {
    if (!state.value.targetCategory) return [];
    return carriedData.brands.filter((brand) => brand.productCategory === state.value.targetCategory);
  });

  const selectedTargetBrand = computed<CalculatorCarriedBrand | null>(() => {
    return carriedData.brands.find((brand) => brand.id === state.value.targetBrandId) || null;
  });

  const recommendation = computed<CalculatorRecommendation | null>(() => {
    const targetBrand = selectedTargetBrand.value;
    const resolvedSize = resolvedReferenceSize.value;
    if (!targetBrand || !resolvedSize) return null;

    const directRange = targetBrand.sizeRanges.find((range) => resolvedSize.mm >= range.mmMin && resolvedSize.mm <= range.mmMax);
    if (directRange) {
      return {
        range: directRange,
        snapped: false,
        warning: null,
      };
    }

    const nearestRange = nearestByValue(targetBrand.sizeRanges, resolvedSize.mm, (range) => (range.mmMin + range.mmMax) / 2);
    if (!nearestRange) return null;

    return {
      range: nearestRange,
      snapped: true,
      warning: `No exact target range covered ${resolvedSize.mm}mm, so the closest available range was selected.`,
    };
  });

  const currentStep = computed(() => {
    if (!state.value.referenceCategory) return 1;
    if (!state.value.referenceBrandId) return 2;
    if (!resolvedReferenceSize.value) return 3;
    if (!state.value.targetCategory) return 4;
    if (!state.value.targetBrandId) return 5;
    return 6;
  });

  const stepDuration = () => Date.now() - state.value.stepStartedAt;

  const markStepAdvance = (from: number, to: number) => {
    trackCalculatorEvent('calc_step_advance', {
      from,
      to,
      durationMs: stepDuration(),
    });
    state.value.stepStartedAt = Date.now();
  };

  const setReferenceCategory = (category: ReferenceCategory) => {
    const from = currentStep.value;
    state.value.referenceCategory = category;
    state.value.referenceBrandId = null;
    state.value.sizeInput = defaultState().sizeInput;
    state.value.targetCategory = null;
    state.value.targetBrandId = null;
    markStepAdvance(from, 2);
  };

  const setReferenceBrand = (brandId: string) => {
    const brand = referenceData.brands.find((item) => item.id === brandId);
    if (!brand) return;

    const from = currentStep.value;
    state.value.referenceBrandId = brandId;
    state.value.sizeInput = defaultState().sizeInput;
    state.value.targetCategory = null;
    state.value.targetBrandId = null;
    markStepAdvance(from, 3);
    trackCalculatorEvent('calc_reference_selected', {
      category: brand.category,
      brandId: brand.id,
      brandName: brand.name,
    });
  };

  const setSizeInput = (field: SizeInputField, value: string) => {
    const cleanedValue = value.replace(/[^\d.]/g, '');
    const currentActiveField = activeSizeField.value;

    if (currentActiveField && currentActiveField !== field && cleanedValue !== '') return;
    state.value.sizeInput[field] = cleanedValue;
  };

  const clearSizeInput = () => {
    state.value.sizeInput = defaultState().sizeInput;
    state.value.targetCategory = null;
    state.value.targetBrandId = null;
  };

  const continueFromSize = () => {
    if (!resolvedReferenceSize.value) return;
    const from = currentStep.value;
    markStepAdvance(from, 4);
  };

  const setTargetCategory = (category: ProductCategory) => {
    const from = currentStep.value;
    state.value.targetCategory = category;
    state.value.targetBrandId = null;
    markStepAdvance(from, 5);
  };

  const setTargetBrand = (brandId: string) => {
    const brand = carriedData.brands.find((item) => item.id === brandId);
    const resolvedSize = resolvedReferenceSize.value;
    if (!brand || !resolvedSize) return;

    const from = currentStep.value;
    state.value.targetBrandId = brandId;
    markStepAdvance(from, 6);
    trackCalculatorEvent('calc_target_selected', {
      intent: brand.productCategory,
      brandId: brand.id,
      brandName: brand.name,
      resolvedMm: resolvedSize.mm,
    });
  };

  const trackRecommendation = () => {
    const resolvedSize = resolvedReferenceSize.value;
    const targetBrand = selectedTargetBrand.value;
    const referenceBrand = selectedReferenceBrand.value;
    const recommendedRange = recommendation.value?.range;
    if (!resolvedSize || !targetBrand || !referenceBrand || !recommendedRange) return;

    trackCalculatorEvent('calc_recommendation', {
      referenceBrandId: referenceBrand.id,
      referenceSize: resolvedSize.sourceLabel,
      resolvedMm: resolvedSize.mm,
      targetBrandId: targetBrand.id,
      recommendedLabel: recommendedRange.recommendedLabel,
    });
  };

  const trackPriceRevealClick = (productSlug: string, storeBaseUrl: string, region: string) => {
    const targetBrand = selectedTargetBrand.value;
    if (!targetBrand) return;

    trackCalculatorEvent('calc_price_reveal_click', {
      region,
      storeBaseUrl,
      targetBrandId: targetBrand.id,
      productSlug,
    });
  };

  const resetCalculator = () => {
    state.value = defaultState();
  };

  return {
    state,
    referenceCategoryOptions,
    targetCategoryOptions,
    sizeFieldLabels,
    currentStep,
    referenceBrands,
    selectedReferenceBrand,
    activeSizeField,
    resolvedReferenceSize,
    targetBrands,
    selectedTargetBrand,
    recommendation,
    widthDisclaimer,
    setReferenceCategory,
    setReferenceBrand,
    setSizeInput,
    clearSizeInput,
    continueFromSize,
    setTargetCategory,
    setTargetBrand,
    trackRecommendation,
    trackPriceRevealClick,
    resetCalculator,
  };
};
