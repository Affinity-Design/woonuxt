// server/utils/serverGetProduct.ts
//
// Server-side (nitro) product fetch for /api/cached-product.
//
// WHY THIS EXISTS
// ---------------
// nuxt-graphql-client's auto-generated Gql* functions ARE registered for nitro routes, but their
// nitro implementation runs through `graphql-request`, and those calls fail at runtime in the
// deployed Cloudflare Worker on BOTH environments (prod + test) — every `Gql*` call from a server
// route errors while the exact same query succeeds as a plain fetch. `server/api/stock-status.get.ts`
// has always worked because it bypasses the client and does a raw $fetch with browser-like headers
// (User-Agent + Origin/Referer), which is what the WordPress-side security expects. This util applies
// that proven pattern to the full product query so product pages work again (2026-07-17 incident:
// every PDP on test showed "We could not load this product").
//
// KEEP IN SYNC: the query below is the flattened version (fragments inlined) of
//   woonuxt_base/app/queries/getProduct.gql
// and the fragments it spreads (ProductAttribute, ProductCategories, Terms, SimpleProduct, Image,
// VariableProduct, VariationAttribute, ExternalProduct, Comment) from woonuxt_base/app/queries/.
// If those change, regenerate this string (`.nuxt/gql/default.ts` GetProductDocument with the
// ${...FragmentDoc} interpolations resolved) or the PDP payload will drift from what the page expects.

const GET_PRODUCT_QUERY = `
query getProduct($slug: ID!) {
  product(id: $slug, idType: SLUG) {
    name
    type
    databaseId
    id
    metaData {
      id
      key
      value
    }
    slug
    sku
    description
    rawDescription: description(format: RAW)
    shortDescription
    ... on ProductWithAttributes {
      attributes {
        nodes {
          ...ProductAttribute
          ... on GlobalProductAttribute {
            slug
            terms(where: {orderby: MENU_ORDER, order: ASC}) {
              nodes {
                name
                slug
                taxonomyName
                databaseId
              }
            }
          }
        }
      }
    }
    ...ProductCategories
    ...Terms
    ...SimpleProduct
    ...VariableProduct
    ...ExternalProduct
    related(first: 5) {
      nodes {
        ...SimpleProduct
        ...VariableProduct
        ...ExternalProduct
      }
    }
    reviews {
      averageRating
      edges {
        rating
        node {
          ...Comment
        }
      }
    }
  }
}

fragment ProductAttribute on ProductAttribute {
  variation
  name
  id
  options
  label
  scope
}

fragment ProductCategories on Product {
  productCategories {
    nodes {
      databaseId
      slug
      name
      count
    }
  }
}

fragment Terms on Product {
  terms(first: 100) {
    nodes {
      taxonomyName
      slug
    }
  }
}

fragment SimpleProduct on SimpleProduct {
  name
  slug
  price
  rawPrice: price(format: RAW)
  date
  regularPrice
  rawRegularPrice: regularPrice(format: RAW)
  salePrice
  rawSalePrice: salePrice(format: RAW)
  stockStatus
  stockQuantity
  lowStockAmount
  averageRating
  weight
  length
  width
  height
  reviewCount
  onSale
  virtual
  attributes {
    nodes {
      ... on GlobalProductAttribute {
        name
        slug
        options
      }
    }
  }
  image {
    ...Image
    cartSourceUrl: sourceUrl(size: THUMBNAIL)
    producCardSourceUrl: sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
  }
  galleryImages(first: 20) {
    nodes {
      ...Image
      databaseId
    }
  }
}

fragment Image on MediaItem {
  sourceUrl
  altText
  title
  databaseId
}

fragment VariableProduct on VariableProduct {
  name
  slug
  price
  rawPrice: price(format: RAW)
  date
  weight
  length
  width
  height
  attributes {
    nodes {
      ... on GlobalProductAttribute {
        name
        slug
        options
      }
    }
  }
  image {
    ...Image
    cartSourceUrl: sourceUrl(size: THUMBNAIL)
    producCardSourceUrl: sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
  }
  averageRating
  reviewCount
  onSale
  regularPrice
  rawRegularPrice: regularPrice(format: RAW)
  salePrice
  rawSalePrice: salePrice(format: RAW)
  stockStatus
  totalSales
  stockQuantity
  lowStockAmount
  defaultAttributes {
    nodes {
      ...VariationAttribute
    }
  }
  variations(first: 100) {
    nodes {
      name
      databaseId
      price
      regularPrice
      salePrice
      rawSalePrice: salePrice(format: RAW)
      slug
      stockQuantity
      stockStatus
      hasAttributes
      image {
        ...Image
        cartSourceUrl: sourceUrl(size: THUMBNAIL)
        producCardSourceUrl: sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
      }
      attributes {
        nodes {
          ...VariationAttribute
        }
      }
    }
  }
  galleryImages(first: 20) {
    nodes {
      ...Image
      databaseId
    }
  }
}

fragment VariationAttribute on VariationAttribute {
  name
  attributeId
  value
  label
}

fragment ExternalProduct on ExternalProduct {
  externalUrl
  buttonText
}

fragment Comment on Comment {
  content
  id
  date
  author {
    node {
      name
      avatar {
        url
      }
    }
  }
}
`;

/**
 * Fetch a full product by slug straight from WPGraphQL, shaped like GqlGetProduct's result
 * ({product}) so fetchProductWithRetry's contract is unchanged. Throws on transport/GraphQL
 * failure (the retry util handles retries); returns {product: null} for a genuine not-found
 * (which the retry util converts to ProductNotFoundError → 404).
 */
export async function fetchProductViaGraphQL(slug: string): Promise<{product: any | null}> {
  const config = useRuntimeConfig();
  const gqlHost = (config.public as any)?.GQL_HOST || process.env.GQL_HOST;

  if (!gqlHost) {
    throw new Error('GraphQL host not configured (GQL_HOST)');
  }

  const siteUrl = (config.public as any)?.siteUrl || 'https://proskatersplace.ca';

  const response: any = await $fetch(gqlHost, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Browser-like headers, mirroring stock-status.get.ts — the WordPress-side security
      // rejects anonymous server-to-server requests without them.
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Origin: siteUrl,
      Referer: siteUrl,
    },
    body: {
      query: GET_PRODUCT_QUERY,
      variables: {slug},
    },
  });

  // WPGraphQL can return partial data alongside errors — prefer the product when present.
  if (response?.data?.product) {
    if (response?.errors?.length) {
      console.warn(`[serverGetProduct] Partial GraphQL errors for ${slug} (product still returned):`, response.errors[0]?.message);
    }
    return {product: response.data.product};
  }

  if (response?.errors?.length) {
    throw new Error(`GraphQL error for ${slug}: ${response.errors[0]?.message || 'unknown'}`);
  }

  return {product: null};
}
