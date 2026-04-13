type AuthorityProductReference = {
  slug?: string | null;
  databaseId?: number | string | null;
};

type AuthorityProductRequestBody = {
  slugs?: string[];
  products?: AuthorityProductReference[];
};

type AuthorityLookup = {
  idType: 'SLUG' | 'DATABASE_ID';
  idValue: string;
  aliases: string[];
};

type ProductSEORecord = {
  slug?: string;
  seo?: {
    price?: number | string | null;
    currency?: string | null;
  } | null;
};

const AUTHORITY_QUERY_CHUNK_SIZE = 25;

const normalizeHost = (value: string): string => value.trim().toLowerCase().replace(/\/+$/, '');

const normalizeLookupValue = (value: unknown): string => String(value ?? '').trim();

const addAlias = (aliases: Set<string>, value: unknown) => {
  const normalizedValue = normalizeLookupValue(value);

  if (!normalizedValue) {
    return;
  }

  aliases.add(normalizedValue);

  const lowercasedValue = normalizedValue.toLowerCase();
  if (lowercasedValue !== normalizedValue) {
    aliases.add(lowercasedValue);
  }
};

const buildAuthorityLookups = (body: AuthorityProductRequestBody): AuthorityLookup[] => {
  const lookups = new Map<string, AuthorityLookup>();

  const addLookup = (idType: AuthorityLookup['idType'], idValue: unknown, aliases: unknown[] = []) => {
    const normalizedIdValue = normalizeLookupValue(idValue);

    if (!normalizedIdValue) {
      return;
    }

    const lookupKey = `${idType}:${normalizedIdValue}`;
    const aliasSet = new Set<string>();
    addAlias(aliasSet, normalizedIdValue);

    for (const alias of aliases) {
      addAlias(aliasSet, alias);
    }

    const existingLookup = lookups.get(lookupKey);
    if (existingLookup) {
      for (const alias of aliasSet) {
        addAlias(new Set(existingLookup.aliases), alias);
      }

      existingLookup.aliases = Array.from(new Set([...existingLookup.aliases, ...aliasSet]));
      return;
    }

    lookups.set(lookupKey, {
      idType,
      idValue: normalizedIdValue,
      aliases: Array.from(aliasSet),
    });
  };

  for (const slug of body?.slugs || []) {
    addLookup('SLUG', slug, [slug]);
  }

  for (const product of body?.products || []) {
    const slug = normalizeLookupValue(product?.slug);
    const databaseId = normalizeLookupValue(product?.databaseId);

    if (slug) {
      addLookup('SLUG', slug, [slug]);
    }

    if (databaseId) {
      addLookup('DATABASE_ID', databaseId, [databaseId, slug]);
    }
  }

  return Array.from(lookups.values()).slice(0, 250);
};

const isIgnorableAuthorityError = (message: string): boolean => {
  return /^No product ID was found corresponding to the /i.test(String(message || '').trim());
};

const formatCadDisplayPrice = (value: number): string => {
  return `$${value.toFixed(2)}&nbsp;CAD`;
};

const normalizeSeoPrice = (value: number | string | null | undefined): number | null => {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.floor(numericValue) + 0.99;
};

const loadProductSeoRecords = async (): Promise<Record<string, ProductSEORecord>> => {
  let allProductSEO: Record<string, ProductSEORecord> | ProductSEORecord[] | null = null;

  try {
    const storage = useStorage('script_data');
    const seoFromStorage = await storage.getItem('product-seo-meta');

    if (seoFromStorage && typeof seoFromStorage === 'object') {
      allProductSEO = seoFromStorage as Record<string, ProductSEORecord> | ProductSEORecord[];
    }
  } catch (kvError) {
    console.warn('[authoritative-product-prices] Failed to read product SEO data from KV:', kvError);
  }

  if (!allProductSEO) {
    try {
      const {readFileSync} = await import('fs');
      const {resolve} = await import('path');
      const dataPath = resolve(process.cwd(), 'data', 'product-seo-meta.json');
      allProductSEO = JSON.parse(readFileSync(dataPath, 'utf8')) as Record<string, ProductSEORecord> | ProductSEORecord[];
    } catch (fileError) {
      console.warn('[authoritative-product-prices] Failed to read product SEO data from local file:', fileError);
      return {};
    }
  }

  if (Array.isArray(allProductSEO)) {
    return allProductSEO.reduce<Record<string, ProductSEORecord>>((seoMap, entry) => {
      if (entry?.slug) {
        seoMap[entry.slug] = entry;
        seoMap[entry.slug.toLowerCase()] = entry;
      }

      return seoMap;
    }, {});
  }

  const seoMap = allProductSEO || {};
  return Object.entries(seoMap).reduce<Record<string, ProductSEORecord>>((normalizedMap, [key, value]) => {
    normalizedMap[key] = value;
    normalizedMap[key.toLowerCase()] = value;
    if (value?.slug) {
      normalizedMap[value.slug] = value;
      normalizedMap[value.slug.toLowerCase()] = value;
    }
    return normalizedMap;
  }, {});
};

const buildSeoFallbackProduct = (slug: string, seoRecord: ProductSEORecord | undefined, databaseIds: Array<number | string | null | undefined> = []) => {
  const normalizedPrice = normalizeSeoPrice(seoRecord?.seo?.price);
  const normalizedCurrency = String(seoRecord?.seo?.currency || '').toUpperCase();

  if (!normalizedPrice || normalizedCurrency !== 'CAD') {
    return null;
  }

  const fallbackProduct = {
    __typename: 'ProductWithPricing',
    slug,
    databaseId: databaseIds.find((databaseId) => databaseId !== undefined && databaseId !== null) ?? null,
    price: formatCadDisplayPrice(normalizedPrice),
    rawPrice: normalizedPrice.toFixed(2),
    regularPrice: formatCadDisplayPrice(normalizedPrice),
    rawRegularPrice: normalizedPrice.toFixed(2),
    salePrice: null,
    rawSalePrice: null,
    onSale: false,
  };

  return normalizeAuthorityProduct(fallbackProduct as Record<string, any>);
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

const buildAuthorityQuery = (lookups: AuthorityLookup[]) => {
  const selections = lookups
    .map(
      (lookup, index) => `priceAuthority_${index}: product(id: ${JSON.stringify(lookup.idValue)}, idType: ${lookup.idType}) {
        __typename
        databaseId
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
  const authorityLookups = buildAuthorityLookups(body);
  const requestedSlugs = Array.from(
    new Set(
      [
        ...(body?.slugs || []).map((slug) => normalizeLookupValue(slug)),
        ...(body?.products || []).map((product) => normalizeLookupValue(product?.slug)),
      ].filter(Boolean),
    ),
  );
  const requestedDatabaseIdsBySlug = (body?.products || []).reduce<Record<string, Array<number | string | null | undefined>>>((slugMap, product) => {
    const normalizedSlug = normalizeLookupValue(product?.slug).toLowerCase();

    if (!normalizedSlug) {
      return slugMap;
    }

    slugMap[normalizedSlug] ||= [];
    slugMap[normalizedSlug].push(product?.databaseId);
    return slugMap;
  }, {});

  if (!authorityLookups.length) {
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

  const lookupChunks: AuthorityLookup[][] = [];
  for (let index = 0; index < authorityLookups.length; index += AUTHORITY_QUERY_CHUNK_SIZE) {
    lookupChunks.push(authorityLookups.slice(index, index + AUTHORITY_QUERY_CHUNK_SIZE));
  }

  const authorityResponses = await Promise.all(
    lookupChunks.map(async (lookupChunk) => {
      const response = await $fetch<{data?: Record<string, any>; errors?: Array<{message?: string}>}>(authorityHost, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; ProSkatersPlacePriceAuthority/1.0)',
          'CF-IPCountry': 'CA',
          Origin: 'https://proskatersplace.ca',
          Referer: 'https://proskatersplace.ca/',
        },
        body: {
          query: buildAuthorityQuery(lookupChunk),
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

      return {
        data: response?.data || {},
        lookups: lookupChunk,
      };
    }),
  );

  const products = authorityResponses.reduce<Record<string, any>>((allProducts, responseChunk) => {
    for (const [index, lookup] of responseChunk.lookups.entries()) {
      const rawProduct = responseChunk.data?.[`priceAuthority_${index}`];
      const product = normalizeAuthorityProduct(rawProduct as Record<string, any> | null | undefined);

      if (!product) {
        continue;
      }

      const productKeys = new Set<string>();
      addAlias(productKeys, product.slug);
      addAlias(productKeys, product.databaseId);

      for (const alias of lookup.aliases) {
        addAlias(productKeys, alias);
      }

      for (const productKey of productKeys) {
        allProducts[productKey] = product;
      }
    }

    return allProducts;
  }, {});

  if (requestedSlugs.length) {
    const productSeoRecords = await loadProductSeoRecords();

    for (const requestedSlug of requestedSlugs) {
      if (products[requestedSlug] || products[requestedSlug.toLowerCase()]) {
        continue;
      }

      const fallbackProduct = buildSeoFallbackProduct(
        requestedSlug,
        productSeoRecords[requestedSlug] || productSeoRecords[requestedSlug.toLowerCase()],
        requestedDatabaseIdsBySlug[requestedSlug.toLowerCase()] || [],
      );

      if (!fallbackProduct) {
        continue;
      }

      const fallbackKeys = new Set<string>();
      addAlias(fallbackKeys, requestedSlug);
      addAlias(fallbackKeys, fallbackProduct.slug);
      addAlias(fallbackKeys, fallbackProduct.databaseId);

      for (const databaseId of requestedDatabaseIdsBySlug[requestedSlug.toLowerCase()] || []) {
        addAlias(fallbackKeys, databaseId);
      }

      for (const fallbackKey of fallbackKeys) {
        products[fallbackKey] = fallbackProduct;
      }
    }
  }

  return {
    enabled: true,
    authorityHost,
    products,
  };
});
