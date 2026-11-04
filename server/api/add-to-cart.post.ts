/**
 * Add to Cart API Endpoint
 *
 * Proxies add-to-cart requests through the server to avoid 403 errors
 * from WordPress/Cloudflare security blocking client-side GraphQL calls.
 */

import {normalizeWooCommerceSessionToken, sendWithWooSessionRecovery} from '../utils/woocommerceSession.mjs';
import {forgetWooSessionCookies} from '../utils/wooSessionCookies';
import {getSafeCartErrorMessage, getSafeErrorLogDetails} from '#shared/utils/publicErrorMessages.mjs';
import {isWooSessionTokenError} from '#shared/utils/wooSession.mjs';

// Cart.feeTax/feeTotal are not selected: WPGraphQL for eCommerce 1.0 deprecated them ("Always null") and nothing read them.
const ADD_TO_CART_MUTATION = `
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
        discountTax
        discountTotal
      }
    }
  }
`;

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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Origin: config.public.siteUrl || 'https://proskatersplace.ca',
    Referer: config.public.siteUrl || 'https://proskatersplace.ca',
  };

  const variables = {
    input: {
      productId: parseInt(productId, 10),
      quantity: quantity ? parseInt(quantity, 10) : 1,
      ...(variationId && {variationId: parseInt(variationId, 10)}),
      ...(extraData && {extraData}),
    },
  };

  try {
    const sendAddToCart = async (token: string | null) => {
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
        headers: token ? {...headers, 'woocommerce-session': `Session ${token}`} : headers,
        body: {query: ADD_TO_CART_MUTATION, variables},
      });
      return {body: upstreamResponse._data, issuedToken: normalizeWooCommerceSessionToken(upstreamResponse.headers.get('woocommerce-session'))};
    };

    const storedSessionToken = parseCookies(event)['woocommerce-session'] || null;

    // Signed in (Headless Login's cookie): this route doesn't forward the Bearer token, so a replacement session
    // WooGraphQL issues here would be a GUEST session, and the client's next refresh (with the Bearer) would let it
    // overwrite the account's saved cart. Hand back to the client, which rebuilds the user-keyed session and retries.
    if (getCookie(event, 'gql:default')) {
      const first = await sendAddToCart(storedSessionToken);
      if (storedSessionToken && isWooSessionTokenError(first.body?.errors)) {
        console.warn('[add-to-cart] WooCommerce rejected a signed-in shopper\'s stored session; the client will rebuild it.');
        forgetWooSessionCookies(event);
        return {success: false, code: 'session_expired'};
      }
      return finishAddToCart({body: first.body, sessionToken: first.issuedToken, sessionWasReset: false});
    }

    // Guest: a token WooGraphQL no longer accepts (every 0.21.1 token after the 1.0 upgrade) fails before the item is
    // added; the add is repeated once on the session WooGraphQL issued in that same response.
    return finishAddToCart(
      await sendWithWooSessionRecovery({
        sessionToken: storedSessionToken,
        send: sendAddToCart,
        isStaleSessionError: isWooSessionTokenError,
      }),
    );
  } catch (error: any) {
    console.error('[add-to-cart] Request failed:', getSafeErrorLogDetails(error));

    throw createError({
      statusCode: Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 500 ? 400 : 500,
      message: getSafeCartErrorMessage(error, 'We could not add this item to your cart. Please try again.'),
    });
  }

  // Called inside the try above, so its createError reaches the same catch.
  function finishAddToCart(result: {body: any; sessionToken: string | null; sessionWasReset: boolean}) {
    const responseSessionToken = result.sessionToken;

    if (result.sessionWasReset) {
      console.warn('[add-to-cart] WooCommerce rejected the stored session; the item was added to a new session.');
      forgetWooSessionCookies(event); // before setCookie, so the new value is the last word
    }

    if (responseSessionToken) {
      setCookie(event, 'woocommerce-session', responseSessionToken, {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    const response = result.body;

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
      // A guest's earlier items stayed in the rejected session; the client tells the shopper.
      sessionReset: result.sessionWasReset,
    };
  }
});
