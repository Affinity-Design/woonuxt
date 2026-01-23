/**
 * Stock Status API Endpoint
 *
 * Proxies stock status requests through the server to avoid 403 errors
 * from WordPress/Cloudflare security blocking client-side GraphQL calls.
 */

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const slug = query.slug as string;

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Missing slug parameter',
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
        query: `
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
        `,
        variables: {slug},
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

    // @ts-ignore
    return response?.data?.product || null;
  } catch (error: any) {
    console.error('[stock-status] Error fetching stock status:', error);

    // Return null instead of throwing - allow page to continue without live stock
    return null;
  }
});
