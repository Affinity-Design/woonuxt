/**
 * Add to Cart API Endpoint
 *
 * Proxies add-to-cart requests through the server to avoid 403 errors
 * from WordPress/Cloudflare security blocking client-side GraphQL calls.
 */

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const {productId, quantity, variationId, extraData} = body;

  if (!productId) {
    throw createError({
      statusCode: 400,
      message: 'Missing productId parameter',
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

  // Get session token from request cookies
  const cookies = parseCookies(event);
  const sessionToken = cookies['woocommerce-session'] || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Origin: config.public.siteUrl || 'https://proskatersplace.ca',
    Referer: config.public.siteUrl || 'https://proskatersplace.ca',
  };

  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const response = await $fetch<{
      data?: {
        addToCart?: {
          cart?: any;
          cartItem?: any;
        };
      };
      errors?: Array<{message: string}>;
    }>(gqlHost, {
      method: 'POST',
      headers,
      body: {
        query: `
          mutation addToCart($input: AddToCartInput!) {
            addToCart(input: $input) {
              cart {
                contents {
                  itemCount
                  nodes {
                    key
                    product {
                      node {
                        id
                        databaseId
                        name
                        slug
                        type
                        image {
                          id
                          sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
                          altText
                        }
                        ... on SimpleProduct {
                          price
                          regularPrice
                          soldIndividually
                        }
                        ... on VariableProduct {
                          price
                          regularPrice
                          soldIndividually
                        }
                      }
                    }
                    variation {
                      node {
                        id
                        databaseId
                        name
                        slug
                        image {
                          id
                          sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
                          altText
                        }
                        price
                        regularPrice
                      }
                    }
                    quantity
                    total
                    subtotal
                    subtotalTax
                  }
                }
                appliedCoupons {
                  code
                  discountAmount
                  discountTax
                }
                needsShippingAddress
                availableShippingMethods {
                  packageDetails
                  supportsShippingCalculator
                  rates {
                    id
                    instanceId
                    methodId
                    label
                    cost
                  }
                }
                subtotal
                subtotalTax
                shippingTax
                shippingTotal
                total
                totalTax
                feeTax
                feeTotal
                discountTax
                discountTotal
              }
            }
          }
        `,
        variables: {
          input: {
            productId: parseInt(productId, 10),
            quantity: quantity ? parseInt(quantity, 10) : 1,
            ...(variationId && {variationId: parseInt(variationId, 10)}),
            ...(extraData && {extraData}),
          },
        },
      },
    });

    // Extract session token from response and set it in response cookies
    // Note: The response headers with woocommerce-session are handled by the fetch

    if (response?.errors && response.errors.length > 0) {
      console.error('[add-to-cart] GraphQL errors:', response.errors);
      throw createError({
        statusCode: 400,
        message: response.errors[0]?.message || 'GraphQL error',
        data: {errors: response.errors},
      });
    }

    return {
      success: true,
      cart: response?.data?.addToCart?.cart || null,
    };
  } catch (error: any) {
    console.error('[add-to-cart] Error:', error);

    // If it's a createError, re-throw it
    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: error?.message || 'Failed to add item to cart',
    });
  }
});
