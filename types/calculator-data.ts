export type ReferenceCategory = 'inline_skates' | 'roller_skates' | 'ice_skates' | 'sports_shoes';
export type ProductCategory = 'inline_skates' | 'roller_skates' | 'ski_boots';
export type WidthProfile = 'narrow' | 'average' | 'wide';

export interface CalculatorReferenceSize {
  mm: number;
  eu?: number;
  usMen?: number;
  usWomen?: number;
  usYouth?: string;
  uk?: number;
}

export interface CalculatorReferenceBrand {
  id: string;
  name: string;
  category: ReferenceCategory;
  officialSizingUrl?: string;
  sizes: CalculatorReferenceSize[];
}

export interface CalculatorCarriedSizeRange {
  mmMin: number;
  mmMax: number;
  recommendedLabel: string;
  sizeAttributeValue: string;
}

export interface CalculatorCarriedBrand {
  id: string;
  name: string;
  productCategory: ProductCategory;
  widthProfile: WidthProfile;
  widthDisclaimer: string;
  graphqlLookup: {
    productAttributeBrandSlug: string;
    categorySlug: string;
  };
  sizeRanges: CalculatorCarriedSizeRange[];
}

export interface CalculatorReferenceBrandsData {
  schemaVersion: 1;
  generatedAt: string;
  brands: CalculatorReferenceBrand[];
}

export interface CalculatorCarriedBrandsData {
  schemaVersion: 1;
  generatedAt: string;
  brands: CalculatorCarriedBrand[];
}
