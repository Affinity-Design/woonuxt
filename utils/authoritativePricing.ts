type PriceValue = string | null | undefined;

type VariationAttributeNode = {
  name?: string | null;
  value?: string | null;
};

type VariationNode = {
  databaseId?: number | string | null;
  slug?: string | null;
  price?: PriceValue;
  rawPrice?: PriceValue;
  regularPrice?: PriceValue;
  rawRegularPrice?: PriceValue;
  salePrice?: PriceValue;
  rawSalePrice?: PriceValue;
  onSale?: boolean | null;
  attributes?: {
    nodes?: VariationAttributeNode[] | null;
  } | null;
};

type PriceableProduct = {
  slug?: string | null;
  price?: PriceValue;
  rawPrice?: PriceValue;
  regularPrice?: PriceValue;
  rawRegularPrice?: PriceValue;
  salePrice?: PriceValue;
  rawSalePrice?: PriceValue;
  onSale?: boolean | null;
  variations?: {
    nodes?: VariationNode[] | null;
  } | null;
};

type CartLineNode = {
  product?: {
    node?: PriceableProduct | null;
  } | null;
  variation?: {
    node?: VariationNode | null;
  } | null;
};

type PriceableCart = {
  contents?: {
    nodes?: CartLineNode[] | null;
  } | null;
};

const PRICE_FIELDS = ['price', 'rawPrice', 'regularPrice', 'rawRegularPrice', 'salePrice', 'rawSalePrice'] as const;

const normalizeToken = (value: unknown): string => {
  return String(value ?? '')
    .trim()
    .toLowerCase();
};

const normalizeAttributeValue = (value: unknown): string => {
  const normalized = normalizeToken(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '');

  if (normalized.includes('-')) {
    return normalized.split('-').pop() || normalized;
  }

  return normalized;
};

const buildVariationSignatures = (variation: VariationNode | null | undefined): string[] => {
  const attributes = variation?.attributes?.nodes || [];
  if (!attributes.length) return [];

  const strictSignature = attributes
    .map((attribute) => `${normalizeToken(attribute?.name)}:${normalizeToken(attribute?.value)}`)
    .sort()
    .join('|');

  const looseSignature = attributes
    .map((attribute) => `${normalizeToken(attribute?.name)}:${normalizeAttributeValue(attribute?.value)}`)
    .sort()
    .join('|');

  return Array.from(new Set([strictSignature, looseSignature].filter(Boolean)));
};

const buildVariationPriceKey = (variation: VariationNode | PriceableProduct | null | undefined): string => {
  return PRICE_FIELDS.map((field) => String(variation?.[field] ?? '')).join('|');
};

const copyPriceFields = <T extends Record<string, any>>(target: T, source: Record<string, any>) => {
  for (const field of PRICE_FIELDS) {
    if (source[field] !== undefined) {
      target[field] = source[field];
    }
  }

  if (source.onSale !== undefined) {
    target.onSale = source.onSale;
  }
};

const getUniformVariationSource = (product: PriceableProduct | null | undefined): VariationNode | PriceableProduct | null => {
  const variations = product?.variations?.nodes || [];
  if (!variations.length) return null;

  const firstVariation = variations[0];
  const firstKey = buildVariationPriceKey(firstVariation);
  const hasUniformPricing = variations.every((variation) => buildVariationPriceKey(variation) === firstKey);

  if (hasUniformPricing) {
    return firstVariation;
  }

  return null;
};

const getAuthoritativeProductMatch = (
  slug: string | null | undefined,
  authoritativeProducts: Record<string, PriceableProduct | undefined> | null | undefined,
): PriceableProduct | undefined => {
  if (!slug || !authoritativeProducts) {
    return undefined;
  }

  return authoritativeProducts[slug] || authoritativeProducts[normalizeToken(slug)];
};

export const applyAuthoritativePriceOverlay = <T extends PriceableProduct>(
  product: T | null | undefined,
  authoritativeProduct: PriceableProduct | null | undefined,
): T | null | undefined => {
  if (!product || !authoritativeProduct) {
    return product;
  }

  const nextProduct = {...product};
  copyPriceFields(nextProduct as Record<string, any>, authoritativeProduct as Record<string, any>);

  const currentVariations = product.variations?.nodes || [];
  if (!currentVariations.length) {
    return nextProduct;
  }

  const authorityVariations = authoritativeProduct.variations?.nodes || [];
  const uniformVariationSource = getUniformVariationSource(authoritativeProduct) || authoritativeProduct;

  const authoritativeByDatabaseId = new Map<string, VariationNode>();
  const authoritativeBySlug = new Map<string, VariationNode>();
  const authoritativeBySignature = new Map<string, VariationNode>();

  for (const variation of authorityVariations) {
    if (variation?.databaseId !== undefined && variation?.databaseId !== null) {
      authoritativeByDatabaseId.set(String(variation.databaseId), variation);
    }

    if (variation?.slug) {
      authoritativeBySlug.set(normalizeToken(variation.slug), variation);
    }

    for (const signature of buildVariationSignatures(variation)) {
      authoritativeBySignature.set(signature, variation);
    }
  }

  const nextVariations = currentVariations.map((variation) => {
    const nextVariation = {...variation};

    let authoritativeVariation: VariationNode | PriceableProduct | undefined | null = null;

    if (variation?.databaseId !== undefined && variation?.databaseId !== null) {
      authoritativeVariation = authoritativeByDatabaseId.get(String(variation.databaseId));
    }

    if (!authoritativeVariation && variation?.slug) {
      authoritativeVariation = authoritativeBySlug.get(normalizeToken(variation.slug));
    }

    if (!authoritativeVariation) {
      for (const signature of buildVariationSignatures(variation)) {
        const matchedVariation = authoritativeBySignature.get(signature);
        if (matchedVariation) {
          authoritativeVariation = matchedVariation;
          break;
        }
      }
    }

    if (!authoritativeVariation && uniformVariationSource) {
      authoritativeVariation = uniformVariationSource;
    }

    if (authoritativeVariation) {
      copyPriceFields(nextVariation as Record<string, any>, authoritativeVariation as Record<string, any>);
    }

    return nextVariation;
  });

  nextProduct.variations = {
    ...product.variations,
    nodes: nextVariations,
  };

  return nextProduct;
};

export const applyAuthoritativePriceOverlayList = <T extends PriceableProduct>(
  products: T[],
  authoritativeProducts: Record<string, PriceableProduct | undefined> | null | undefined,
): T[] => {
  if (!products.length || !authoritativeProducts) {
    return products;
  }

  return products.map((product) => {
    const exactMatch = product?.slug ? authoritativeProducts[product.slug] : undefined;
    const caseInsensitiveMatch = !exactMatch && product?.slug ? authoritativeProducts[normalizeToken(product.slug)] : undefined;
    return (applyAuthoritativePriceOverlay(product, exactMatch || caseInsensitiveMatch) as T) || product;
  });
};

export const applyAuthoritativeCartPricing = <T extends PriceableCart>(
  cart: T | null | undefined,
  authoritativeProducts: Record<string, PriceableProduct | undefined> | null | undefined,
): T | null | undefined => {
  const cartItems = cart?.contents?.nodes || [];

  if (!cartItems.length || !authoritativeProducts) {
    return cart;
  }

  const nextItems = cartItems.map((item) => {
    const authoritativeProduct = getAuthoritativeProductMatch(item?.product?.node?.slug, authoritativeProducts);

    if (!authoritativeProduct) {
      return item;
    }

    const nextItem: CartLineNode = {...item};

    if (item?.product?.node) {
      nextItem.product = {
        ...item.product,
        node: (applyAuthoritativePriceOverlay(item.product.node, authoritativeProduct) as PriceableProduct) || item.product.node,
      };
    }

    if (item?.variation?.node) {
      const nextVariationContainer = applyAuthoritativePriceOverlay(
        {
          variations: {
            nodes: [item.variation.node],
          },
        },
        authoritativeProduct,
      );

      nextItem.variation = {
        ...item.variation,
        node: nextVariationContainer?.variations?.nodes?.[0] || item.variation.node,
      };
    }

    return nextItem;
  });

  return {
    ...cart,
    contents: {
      ...cart?.contents,
      nodes: nextItems,
    },
  };
};
