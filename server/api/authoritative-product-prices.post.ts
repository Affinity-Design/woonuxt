type AuthorityProductRequestBody = {
  slugs?: string[];
};

const AUTHORITY_QUERY_CHUNK_SIZE = 25;

const normalizeHost = (value: string): string => value.trim().toLowerCase().replace(/\/+$/, '');

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
        slug
        type
        price
        rawPrice: price(format: RAW)
        regularPrice
        rawRegularPrice: regularPrice(format: RAW)
        salePrice
        rawSalePrice: salePrice(format: RAW)
        onSale
        variations(first: 100) {
          nodes {
            databaseId
            slug
            price
            rawPrice: price(format: RAW)
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
        throw createError({
          statusCode: 502,
          statusMessage: response.errors.map((error) => error.message || 'Unknown GraphQL error').join('; '),
        });
      }

      return response?.data || {};
    }),
  );

  const products = authorityResponses.reduce<Record<string, any>>((allProducts, responseChunk) => {
    for (const product of Object.values(responseChunk)) {
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
