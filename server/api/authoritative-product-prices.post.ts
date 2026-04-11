type AuthorityProductRequestBody = {
  slugs?: string[];
};

const AUTHORITY_QUERY_CHUNK_SIZE = 25;

const normalizeHost = (value: string): string => value.trim().toLowerCase().replace(/\/+$/, '');

const isIgnorableAuthorityError = (message: string): boolean => {
  return /^No product ID was found corresponding to the slug:/i.test(String(message || '').trim());
};

const extractNumericPrice = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const matches = String(value)
    .replace(/&nbsp;/gi, ' ')
    .match(/[0-9]+(?:\.[0-9]+)?/g);

  if (!matches?.length) {
    return null;
  }

  return matches.join(', ');
};

const normalizePriceFields = <T extends Record<string, any>>(node: T | null | undefined): T | null | undefined => {
  if (!node) {
    return node;
  }

  const normalizedNode = {...node};

  if (normalizedNode.rawPrice === undefined || normalizedNode.rawPrice === null || normalizedNode.rawPrice === '') {
    normalizedNode.rawPrice = normalizedNode.rawSalePrice || normalizedNode.rawRegularPrice || extractNumericPrice(normalizedNode.price);
  }

  if (normalizedNode.rawRegularPrice === undefined || normalizedNode.rawRegularPrice === null || normalizedNode.rawRegularPrice === '') {
    normalizedNode.rawRegularPrice = extractNumericPrice(normalizedNode.regularPrice);
  }

  if (normalizedNode.rawSalePrice === undefined || normalizedNode.rawSalePrice === null || normalizedNode.rawSalePrice === '') {
    normalizedNode.rawSalePrice = extractNumericPrice(normalizedNode.salePrice);
  }

  return normalizedNode;
};

const normalizeAuthorityProduct = (product: Record<string, any> | null | undefined) => {
  if (!product) {
    return product;
  }

  const normalizedProduct = normalizePriceFields(product);
  const variations = normalizedProduct?.variations?.nodes || [];

  if (!variations.length) {
    return normalizedProduct;
  }

  return {
    ...normalizedProduct,
    variations: {
      ...normalizedProduct.variations,
      nodes: variations.map((variation: Record<string, any>) => normalizePriceFields(variation)),
    },
  };
};

const getConfiguredGraphqlHost = (config: ReturnType<typeof useRuntimeConfig>): string => {
  const runtimeGraphqlHost = String(config.public.gqlHost || '');
  if (runtimeGraphqlHost) {
    return runtimeGraphqlHost;
  }

  const moduleGraphqlHost = String((config.public as Record<string, any>)?.['graphql-client']?.clients?.default?.host || '');
  if (moduleGraphqlHost) {
    return moduleGraphqlHost;
  }

  return String(process.env.GQL_HOST || '');
};

const getAuthorityHost = (config: ReturnType<typeof useRuntimeConfig>): string => {
  const configuredAuthorityHost = String(config.public.priceAuthorityHost || '');
  if (configuredAuthorityHost) {
    return configuredAuthorityHost;
  }

  const sourceGraphqlHost = getConfiguredGraphqlHost(config);
  if (normalizeHost(sourceGraphqlHost).includes('test.')) {
    return 'https://proskatersplace.com/graphql';
  }

  return '';
};

const buildAuthorityQuery = (slugs: string[]) => {
  const selections = slugs
    .map(
      (slug, index) => `priceAuthority_${index}: product(id: ${JSON.stringify(slug)}, idType: SLUG) {
        __typename
        slug
        type
        ... on ProductWithPricing {
            price
            regularPrice
            rawPrice: price(format: RAW)
            rawRegularPrice: regularPrice(format: RAW)
            salePrice
            rawSalePrice: salePrice(format: RAW)
            onSale
          }
        ... on VariableProduct {
          variations(first: 100) {
            nodes {
              databaseId
              slug
              price
              regularPrice
              rawRegularPrice: regularPrice(format: RAW)
              salePrice
              rawSalePrice: salePrice(format: RAW)
              attributes {
                nodes {
                  name
                  value
                  label
                  attributeId
                }
              }
            }
          }
        }
      }`,
    )
    .join('\n');

  return `query AuthoritativeProductPrices {\n${selections}\n}`;
};

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as AuthorityProductRequestBody;
  const uniqueSlugs = Array.from(new Set((body?.slugs || []).map((slug) => String(slug || '').trim()).filter(Boolean))).slice(0, 250);

  if (!uniqueSlugs.length) {
    return {
      enabled: false,
      products: {},
    };
  }

  const config = useRuntimeConfig(event);
  const sourceHost = getConfiguredGraphqlHost(config);
  const authorityHost = getAuthorityHost(config);

  if (!authorityHost || normalizeHost(authorityHost) === normalizeHost(sourceHost)) {
    return {
      enabled: false,
      products: {},
    };
  }

  const slugChunks: string[][] = [];
  for (let index = 0; index < uniqueSlugs.length; index += AUTHORITY_QUERY_CHUNK_SIZE) {
    slugChunks.push(uniqueSlugs.slice(index, index + AUTHORITY_QUERY_CHUNK_SIZE));
  }

  const authorityResponses = await Promise.all(
    slugChunks.map(async (slugChunk) => {
      const response = await $fetch<{data?: Record<string, any>; errors?: Array<{message?: string}>}>(authorityHost, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; ProSkatersPlacePriceAuthority/1.0)',
          Origin: 'https://proskatersplace.ca',
          Referer: 'https://proskatersplace.ca/',
        },
        body: {
          query: buildAuthorityQuery(slugChunk),
        },
      });

      if (response?.errors?.length) {
        const fatalErrors = response.errors.filter((error) => !isIgnorableAuthorityError(error.message || ''));

        if (fatalErrors.length) {
          throw createError({
            statusCode: 502,
            statusMessage: fatalErrors.map((error) => error.message || 'Unknown GraphQL error').join('; '),
          });
        }

        console.warn(
          `[authoritative-product-prices] Ignoring missing products from authority host: ${response.errors
            .map((error) => error.message || 'Unknown GraphQL error')
            .join('; ')}`,
        );
      }

      return response?.data || {};
    }),
  );

  const products = authorityResponses.reduce<Record<string, any>>((allProducts, responseChunk) => {
    for (const rawProduct of Object.values(responseChunk)) {
      const product = normalizeAuthorityProduct(rawProduct as Record<string, any> | null | undefined);

      if (product?.slug) {
        allProducts[product.slug] = product;
        allProducts[String(product.slug).toLowerCase()] = product;
      }
    }

    return allProducts;
  }, {});

  return {
    enabled: true,
    authorityHost,
    products,
  };
});
