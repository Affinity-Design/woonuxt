// server/api/update-cart-quantity.post.ts
// Server-side proxy for cart quantity updates to avoid 403 errors from WordPress/Cloudflare
import {defineEventHandler, createError, readBody} from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const {key, quantity, sessionToken} = body;

  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cart item key is required',
    });
  }

  if (typeof quantity !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quantity must be a number',
    });
  }

  const gqlHost = config.public.gqlHost || process.env.GQL_HOST;

  if (!gqlHost) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GraphQL host not configured',
    });
  }

  // GraphQL mutation for updating cart item quantity
  const mutation = `
    mutation updateItemQuantities($key: ID!, $quantity: Int!) {
      updateItemQuantities(input: { items: [{ key: $key, quantity: $quantity }] }) {
        cart {
          total
          rawTotal: total(format: RAW)
          subtotal
          totalTax
          discountTotal
          rawDiscountTotal: discountTotal(format: RAW)
          shippingTotal
          chosenShippingMethods
          availableShippingMethods {
            rates {
              cost
              id
              label
            }
          }
          appliedCoupons {
            description
            discountTax
            discountAmount
            code
          }
          isEmpty
          contents(first: 100) {
            itemCount
            productCount
            nodes {
              quantity
              key
              total
              subtotal
              tax
              subtotalTax
              product {
                node {
                  name
                  slug
                  sku
                  databaseId
                  type
                  ... on SimpleProduct {
                    name
                    slug
                    price
                    rawPrice: price(format: RAW)
                    regularPrice
                    rawRegularPrice: regularPrice(format: RAW)
                    salePrice
                    rawSalePrice: salePrice(format: RAW)
                    stockStatus
                    stockQuantity
                    image {
                      sourceUrl(size: THUMBNAIL)
                      cartSourceUrl: sourceUrl(size: THUMBNAIL)
                      altText
                      title
                    }
                  }
                  ... on VariableProduct {
                    name
                    slug
                    price
                    rawPrice: price(format: RAW)
                    regularPrice
                    rawRegularPrice: regularPrice(format: RAW)
                    salePrice
                    rawSalePrice: salePrice(format: RAW)
                    stockStatus
                    stockQuantity
                    image {
                      sourceUrl(size: THUMBNAIL)
                      cartSourceUrl: sourceUrl(size: THUMBNAIL)
                      altText
                      title
                    }
                  }
                }
              }
              variation {
                node {
                  name
                  slug
                  price
                  databaseId
                  sku
                  stockStatus
                  stockQuantity
                  regularPrice
                  rawRegularPrice: regularPrice(format: RAW)
                  salePrice
                  rawSalePrice: salePrice(format: RAW)
                  image {
                    sourceUrl(size: THUMBNAIL)
                    cartSourceUrl: sourceUrl(size: THUMBNAIL)
                    altText
                    title
                  }
                  attributes {
                    nodes {
                      name
                      label
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'ProSkatersPlace-Nuxt/1.0 (Server-Side)',
    Origin: config.public.siteUrl || 'https://proskatersplace.ca',
    Referer: config.public.siteUrl || 'https://proskatersplace.ca',
  };

  // Pass through the WooCommerce session token if provided
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    console.log(`[update-cart-quantity] Updating item ${key} to quantity ${quantity}`);

    const response = await $fetch<{data?: any; errors?: any[]}>(gqlHost, {
      method: 'POST',
      headers,
      body: {
        query: mutation,
        variables: {key, quantity},
      },
    });

    if (response.errors && response.errors.length > 0) {
      console.error('[update-cart-quantity] GraphQL errors:', response.errors);
      const errorMessage = response.errors[0]?.message || 'Failed to update cart';
      throw createError({
        statusCode: 400,
        statusMessage: errorMessage,
      });
    }

    if (!response.data?.updateItemQuantities?.cart) {
      console.error('[update-cart-quantity] No cart data in response');
      throw createError({
        statusCode: 500,
        statusMessage: 'No cart data returned',
      });
    }

    console.log(`[update-cart-quantity] Successfully updated cart`);

    return {
      success: true,
      cart: response.data.updateItemQuantities.cart,
    };
  } catch (error: any) {
    console.error('[update-cart-quantity] Error:', error.message || error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to update cart',
    });
  }
});
