import type {CalculatorCarriedBrand, CalculatorCarriedSizeRange} from '~/types/calculator-data';

export interface CalculatorProduct {
  id: string;
  slug: string;
  name: string;
  link?: string; // full .com permalink from WPGraphQL — used for COM/international URLs
  image?: {
    sourceUrl?: string;
    altText?: string;
  } | null;
}

interface FetchCalculatorProductsOptions {
  brand: CalculatorCarriedBrand;
  range: CalculatorCarriedSizeRange;
  graphqlEndpoint?: string; // kept for API compat; ignored (proxy handles routing)
}

interface FetchBrowseProductsOptions {
  categorySlug: string;
  productCategory: string;
}

export const useCalculatorProducts = () => {
  const fetchBrowseProducts = async ({categorySlug, productCategory}: FetchBrowseProductsOptions) => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('/api/calculator-products', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: controller.signal,
        body: JSON.stringify({category: categorySlug, productCategory, browse: true}),
      });

      if (!response.ok) throw new Error(`Product lookup failed with ${response.status}.`);
      return (await response.json()) as CalculatorProduct[];
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  };

  const fetchProducts = async ({brand, range}: FetchCalculatorProductsOptions) => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('/api/calculator-products', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: controller.signal,
        body: JSON.stringify({
          category: brand.graphqlLookup.categorySlug,
          brand: brand.graphqlLookup.productAttributeBrandSlug,
          size: range.sizeAttributeValue,
          productCategory: brand.productCategory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Product lookup failed with ${response.status}.`);
      }

      return (await response.json()) as CalculatorProduct[];
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  };

  return {
    fetchProducts,
    fetchBrowseProducts,
  };
};
