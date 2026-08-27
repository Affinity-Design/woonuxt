/**
 * Add to Cart API Endpoint
 *
 * Proxies add-to-cart requests through the server to avoid 403 errors
 * from WordPress/Cloudflare security blocking client-side GraphQL calls.
 */

import {normalizeWooCommerceSessionToken} from '../utils/woocommerceSession.mjs';
import {getSafeCartErrorMessage, getSafeErrorLogDetails} from '#shared/utils/publicErrorMessages.mjs';

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
      message: 'The cart service is temporarily unavailable. Please try again.',
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
    const upstreamResponse = await $fetch.raw<{
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

    const response = upstreamResponse._data;
    const responseSessionToken = normalizeWooCommerceSessionToken(upstreamResponse.headers.get('woocommerce-session'));

    if (responseSessionToken) {
      setCookie(event, 'woocommerce-session', responseSessionToken, {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    if (response?.errors && response.errors.length > 0) {
      console.error('[add-to-cart] Upstream GraphQL request failed. Sensitive details were withheld.');
      throw createError({
        statusCode: 400,
        message: getSafeCartErrorMessage(response.errors[0], 'We could not add this item to your cart. Please try again.'),
      });
    }

    return {
      success: true,
      cart: response?.data?.addToCart?.cart || null,
      sessionToken: responseSessionToken,
    };
  } catch (error: any) {
    console.error('[add-to-cart] Request failed:', getSafeErrorLogDetails(error));

    throw createError({
      statusCode: Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 500 ? 400 : 500,
      message: getSafeCartErrorMessage(error, 'We could not add this item to your cart. Please try again.'),
    });
  }
});
