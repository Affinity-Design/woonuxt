/**
 * Stock Status API Endpoint
 *
 * Proxies stock status requests through the server to avoid 403 errors
 * from WordPress/Cloudflare security blocking client-side GraphQL calls.
 *
 * Supports two query modes:
 * - ?slug=product-slug (for product pages)
 * - ?productId=12345&isVariation=true (for cart items)
 */

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const slug = query.slug as string;
  const productId = query.productId as string;
  const isVariation = query.isVariation === 'true';

  // Validate that we have either slug or productId
  if (!slug && !productId) {
    throw createError({
      statusCode: 400,
      message: 'Missing slug or productId parameter',
    });
  }

  const config = useRuntimeConfig();
  const gqlHost = config.public.GQL_HOST || process.env.GQL_HOST;

  if (!gqlHost) {
    throw createError({
      statusCode: 500,
      message: 'GraphQL host not configured',
    });
  }

  try {
    let graphqlQuery: string;
    let variables: Record<string, any>;

    if (productId) {
      // Query by database ID (for cart items)
      if (isVariation) {
        graphqlQuery = `
          query getVariationStock($id: ID!) {
            productVariation(id: $id, idType: DATABASE_ID) {
              stockStatus
              stockQuantity
            }
          }
        `;
        variables = {id: productId};
      } else {
        graphqlQuery = `
          query getProductStock($id: ID!) {
            product(id: $id, idType: DATABASE_ID) {
              ... on SimpleProduct {
                stockStatus
                stockQuantity
              }
              ... on VariableProduct {
                stockStatus
                stockQuantity
              }
            }
          }
        `;
        variables = {id: productId};
      }
    } else {
      // Query by slug (for product pages)
      graphqlQuery = `
        query getStockStatus($slug: ID!) {
          product(id: $slug, idType: SLUG) {
            ... on SimpleProduct {
              stockStatus
              stockQuantity
            }
            ... on VariableProduct {
              stockStatus
              stockQuantity
              variations {
                nodes {
                  id
                  databaseId
                  stockStatus
                  stockQuantity
                  attributes {
                    nodes {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
        }
      `;
      variables = {slug};
    }

    const response = await $fetch(gqlHost, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Origin: config.public.siteUrl || 'https://proskatersplace.ca',
        Referer: config.public.siteUrl || 'https://proskatersplace.ca',
      },
      body: {
        query: graphqlQuery,
        variables,
      },
    });

    // @ts-ignore
    if (response?.errors) {
      console.error('[stock-status] GraphQL errors:', response.errors);
      throw createError({
        statusCode: 500,
        // @ts-ignore
        message: response.errors[0]?.message || 'GraphQL error',
      });
    }

    // Return the appropriate data based on query type
    // @ts-ignore
    if (productId && isVariation) {
      // @ts-ignore
      return response?.data?.productVariation || null;
    }
    // @ts-ignore
    return response?.data?.product || null;
  } catch (error: any) {
    console.error('[stock-status] Error fetching stock status:', error);

    // Return null instead of throwing - allow page to continue without live stock
    return null;
  }
});
