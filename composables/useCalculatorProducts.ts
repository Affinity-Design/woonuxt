import type {CalculatorCarriedBrand, CalculatorCarriedSizeRange} from '~/types/calculator-data';

export interface CalculatorProduct {
  id: string;
  slug: string;
  name: string;
  image?: {
    sourceUrl?: string;
    altText?: string;
  } | null;
}

interface FetchCalculatorProductsOptions {
  brand: CalculatorCarriedBrand;
  range: CalculatorCarriedSizeRange;
  graphqlEndpoint: string;
}

interface CalculatorProductsResponse {
  data?: {
    products?: {
      nodes?: CalculatorProduct[];
    };
  };
  errors?: Array<{message?: string}>;
}

const CALCULATOR_PRODUCTS_QUERY = `
  query CalculatorProducts($category: [String], $brand: String!, $size: String!) {
    products(
      first: 6
      where: {
        categoryIn: $category
        attributes: {
          relation: AND
          queries: [
            { taxonomy: PA_MANUFACTURER, terms: [$brand], operator: IN }
            { taxonomy: PA_SIZE, terms: [$size], operator: IN }
          ]
        }
        visibility: VISIBLE
        status: "publish"
      }
    ) {
      nodes {
        id
        slug
        name
        image {
          sourceUrl
          altText
        }
      }
    }
  }
`;

export const useCalculatorProducts = () => {
  const fetchProducts = async ({brand, range, graphqlEndpoint}: FetchCalculatorProductsOptions) => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frontend-Type': 'woonuxt',
        },
        signal: controller.signal,
        body: JSON.stringify({
          query: CALCULATOR_PRODUCTS_QUERY,
          variables: {
            category: [brand.graphqlLookup.categorySlug],
            brand: brand.graphqlLookup.productAttributeBrandSlug,
            size: range.sizeAttributeValue,
          },
        }),
      });

      const payload = (await response.json()) as CalculatorProductsResponse;

      if (!response.ok || payload.errors?.length) {
        throw new Error(payload.errors?.[0]?.message || `GraphQL request failed with ${response.status}.`);
      }

      return payload.data?.products?.nodes || [];
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  };

  return {
    fetchProducts,
  };
};
