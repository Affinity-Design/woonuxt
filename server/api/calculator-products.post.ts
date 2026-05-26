const FETCH_LIMIT = 12;

// WPGraphQL's attribute `operator: IN` with multiple terms uses AND logic —
// a product must carry ALL listed terms. So we must query each candidate term
// in a separate request and merge results.
//
// For whole-number EU/cm sizes we also try the two adjacent span-1 range slugs
// (e.g. "41-42eu" and "42-43eu" for "42eu") to cover brands like Powerslide
// that tag products with paired range terms instead of single-size terms.
function sizeVariants(sizeSlug: string): string[] {
  const exact = [sizeSlug];
  const wholeMatch = sizeSlug.match(/^(\d+)(eu|cm|uk)?$/i);
  if (!wholeMatch) return exact;
  const n = parseInt(wholeMatch[1], 10);
  const s = (wholeMatch[2] ?? '').toLowerCase();
  return [sizeSlug, `${n - 1}-${n}${s}`, `${n}-${n + 1}${s}`];
}

const PRODUCT_FIELDS = `
  id slug name link image { sourceUrl altText }
  ... on SimpleProduct { stockStatus }
  ... on VariableProduct { stockStatus }
`;

const makeQuery = (taxonomy: 'PA_SIZE' | 'PA_SIZE_PARTS_ACCESSORIES') => `
  query CalcProducts($category: [String], $brand: String!, $size: String!) {
    products(first: ${FETCH_LIMIT}, where: {
      categoryIn: $category
      attributes: { relation: AND, queries: [
        { taxonomy: PA_MANUFACTURER, terms: [$brand], operator: IN }
        { taxonomy: ${taxonomy}, terms: [$size], operator: IN }
      ]}
      status: "publish"
    }) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

const QUERY_PA_SIZE = makeQuery('PA_SIZE');
const QUERY_PA_SIZE_PARTS = makeQuery('PA_SIZE_PARTS_ACCESSORIES');

const QUERY_BROWSE = `
  query CalcBrowse($category: [String]) {
    products(first: ${FETCH_LIMIT}, where: {
      categoryIn: $category
      status: "publish"
      orderby: { field: PRICE, order: ASC }
    }) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

interface ProductNode {
  id?: string;
  slug?: string;
  name?: string;
  link?: string;
  stockStatus?: string | null;
  image?: {sourceUrl?: string; altText?: string} | null;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    category: string;
    brand?: string;
    size?: string;
    productCategory?: string;
    browse?: boolean;
  }>(event);

  const {category, brand, size, productCategory, browse} = body;

  if (!category) {
    throw createError({statusCode: 400, statusMessage: 'Missing category'});
  }

  const config = useRuntimeConfig();
  const wpBase = (config.public.wpBaseUrl as string) || 'https://proskatersplace.ca';
  const graphqlUrl = `${wpBase}/graphql`;

  const gqlFetch = (q: string, vars: Record<string, unknown>) =>
    $fetch<{data?: {products?: {nodes?: ProductNode[]}}}>(graphqlUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Frontend-Type': 'woonuxt', Origin: wpBase},
      body: JSON.stringify({query: q, variables: vars}),
    }).then((r) => r?.data?.products?.nodes ?? []);

  let nodes: ProductNode[];

  if (browse) {
    nodes = await gqlFetch(QUERY_BROWSE, {category: [category]});
  } else {
    if (!brand || !size) {
      throw createError({statusCode: 400, statusMessage: 'Missing brand or size'});
    }

    const queryTemplate = productCategory === 'ski_boots' ? QUERY_PA_SIZE_PARTS : QUERY_PA_SIZE;

    // Query each size variant separately (AND logic within a single query means
    // only one term can be in the terms array), then merge and deduplicate.
    const variants = sizeVariants(size);
    const results = await Promise.all(
      variants.map((v) => gqlFetch(queryTemplate, {category: [category], brand, size: v})),
    );

    const seen = new Set<string>();
    nodes = results.flat().filter((p) => {
      const key = p.id ?? p.slug ?? '';
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Filter out out-of-stock products, then cap at 6 results.
  const inStock = nodes.filter((n) => n.stockStatus !== 'OUT_OF_STOCK');
  return inStock.slice(0, 6);
});
