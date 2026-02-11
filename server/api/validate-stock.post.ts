// server/api/validate-stock.post.ts
// Validates stock availability for cart items before payment processing
// This is a critical safeguard against overselling due to race conditions

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  try {
    const {lineItems} = body;

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return {
        success: false,
        error: 'No line items provided for validation',
        outOfStockItems: [],
      };
    }

    console.log('[Stock Validation] Validating stock for', lineItems.length, 'items');

    // Create WordPress Application Password authentication
    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString('base64');

    // Build GraphQL query to check stock status for all products
    const productIds = lineItems.map((item: any) => item.productId || item.product_id).filter(Boolean);
    const variationIds = lineItems.map((item: any) => item.variationId || item.variation_id).filter(Boolean);

    // Query for stock status using WPGraphQL
    const stockQuery = `
      query CheckStockStatus($productIds: [ID!]!) {
        products(where: { include: $productIds }, first: 100) {
          nodes {
            databaseId
            name
            ... on SimpleProduct {
              stockStatus
              stockQuantity
              manageStock
              soldIndividually
            }
            ... on VariableProduct {
              stockStatus
              stockQuantity
              manageStock
              variations(first: 100) {
                nodes {
                  databaseId
                  name
                  stockStatus
                  stockQuantity
                  manageStock
                }
              }
            }
          }
        }
      }
    `;

    const graphqlUrl = `${config.public.wpBaseUrl}/graphql`;

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'WooNuxt-Stock-Validator/1.0',
      },
      body: JSON.stringify({
        query: stockQuery,
        variables: {
          productIds: productIds.map((id: number) => id.toString()),
        },
      }),
    });

    if (!response.ok) {
      console.error('[Stock Validation] GraphQL request failed:', response.status);
      // On error, allow the order to proceed (fail open) but log the issue
      return {
        success: true,
        warning: 'Stock validation skipped due to API error',
        outOfStockItems: [],
      };
    }

    const result = await response.json();

    if (result.errors) {
      console.error('[Stock Validation] GraphQL errors:', result.errors);
      return {
        success: true,
        warning: 'Stock validation skipped due to GraphQL errors',
        outOfStockItems: [],
      };
    }

    const products = result.data?.products?.nodes || [];
    const outOfStockItems: Array<{
      productId: number;
      variationId?: number;
      name: string;
      requestedQuantity: number;
      availableQuantity: number | null;
      stockStatus: string;
    }> = [];

    // Check each line item against current stock
    for (const lineItem of lineItems) {
      const productId = lineItem.productId || lineItem.product_id;
      const variationId = lineItem.variationId || lineItem.variation_id;
      const requestedQuantity = lineItem.quantity || 1;
      const itemName = lineItem.name || `Product #${productId}`;

      const product = products.find((p: any) => p.databaseId === productId);

      if (!product) {
        console.warn(`[Stock Validation] Product ${productId} not found in response`);
        continue; // Skip if product not found (might be deleted)
      }

      let stockStatus: string;
      let stockQuantity: number | null;
      let manageStock: boolean;

      if (variationId) {
        // Check variation stock
        const variation = product.variations?.nodes?.find((v: any) => v.databaseId === variationId);
        if (variation) {
          stockStatus = variation.stockStatus || 'IN_STOCK';
          stockQuantity = variation.stockQuantity;
          manageStock = variation.manageStock || false;
        } else {
          // Variation not found, use parent product stock
          stockStatus = product.stockStatus || 'IN_STOCK';
          stockQuantity = product.stockQuantity;
          manageStock = product.manageStock || false;
        }
      } else {
        // Simple product
        stockStatus = product.stockStatus || 'IN_STOCK';
        stockQuantity = product.stockQuantity;
        manageStock = product.manageStock || false;
      }

      // Check if item is out of stock
      const isOutOfStock = stockStatus === 'OUT_OF_STOCK';
      const insufficientStock = manageStock && stockQuantity !== null && stockQuantity < requestedQuantity;

      if (isOutOfStock || insufficientStock) {
        console.log(`[Stock Validation] ❌ Item unavailable:`, {
          name: itemName,
          productId,
          variationId,
          stockStatus,
          stockQuantity,
          requestedQuantity,
          manageStock,
        });

        outOfStockItems.push({
          productId,
          variationId,
          name: itemName,
          requestedQuantity,
          availableQuantity: stockQuantity,
          stockStatus,
        });
      } else {
        console.log(`[Stock Validation] ✅ Item available:`, {
          name: itemName,
          productId,
          variationId,
          stockStatus,
          stockQuantity,
          requestedQuantity,
        });
      }
    }

    if (outOfStockItems.length > 0) {
      console.log('[Stock Validation] ❌ Stock validation FAILED -', outOfStockItems.length, 'items unavailable');
      return {
        success: false,
        error: 'Some items in your cart are no longer available',
        outOfStockItems,
      };
    }

    console.log('[Stock Validation] ✅ All items in stock');
    return {
      success: true,
      outOfStockItems: [],
    };
  } catch (error: any) {
    console.error('[Stock Validation] Error:', error);
    // Fail open - allow order to proceed but log the error
    return {
      success: true,
      warning: `Stock validation error: ${error.message}`,
      outOfStockItems: [],
    };
  }
});
