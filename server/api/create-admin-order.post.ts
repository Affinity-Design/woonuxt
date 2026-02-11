// Admin Order Creation API - Creates orders directly via WPGraphQL with Application Password authentication
// Bypasses all session-based GraphQL issues by using admin-level authentication
// Enhanced with retry logic and better error handling for reliability

// Helper function for retry with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If we get a response (even an error response), return it
      // Let the caller handle HTTP errors
      return response;
    } catch (error: any) {
      lastError = error;
      console.warn(`⚠️ Fetch attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  // Generate a unique request ID for tracing
  const requestId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🆔 Request ID: ${requestId}`);

  try {
    console.log('🛠️ Creating order via WPGraphQL with Application Password authentication...');

    const {
      billing,
      shipping,
      transactionId,
      lineItems,
      coupons = [],
      cartTotals,
      shippingMethod,
      customerNote,
      metaData = [],
      createAccount = false,
      currency = 'CAD',
      customerId,
      cardToken, // Helcim card token for native refund support
      helcimInvoiceData, // Backup data if order fails - can be used to recover
    } = body;

    // Validate required configuration
    if (!config.wpAdminUsername || !config.wpAdminAppPassword || !config.public.wpBaseUrl) {
      throw new Error('Missing WordPress Application Password credentials in configuration');
    }

    // Validate required transaction ID
    if (!transactionId) {
      console.error('❌ Missing transaction ID - cannot create order without payment reference');
      throw new Error('Transaction ID is required for order creation');
    }

    // Idempotency guard: prevents accidental repeat submissions from spamming WC REST updates.
    // This endpoint is only used for Helcim payments; `transactionId` should be stable per payment.
    const idempotencyStorage = useStorage('cache');
    const idempotencyKey = `idempotency:admin-order:${transactionId}`;
    const existingIdempotency = await idempotencyStorage.getItem<any>(idempotencyKey);

    if (existingIdempotency?.status === 'completed' && existingIdempotency?.order) {
      console.log('🔁 Idempotency hit: returning previously created order for transactionId', transactionId);
      return {
        success: true,
        idempotent: true,
        order: existingIdempotency.order,
      };
    }

    if (existingIdempotency?.status === 'in_progress') {
      console.warn('⏳ Idempotency in-progress: ignoring duplicate request for transactionId', transactionId);
      return {
        success: false,
        idempotent: true,
        error: 'Order creation already in progress. Please wait and refresh.',
      };
    }

    await idempotencyStorage.setItem(idempotencyKey, {
      status: 'in_progress',
      transactionId,
      startedAt: new Date().toISOString(),
    });

    // Log the request data for debugging/recovery purposes
    console.log(`📝 Order Request [${requestId}]:`, {
      transactionId,
      email: billing?.email,
      total: cartTotals?.total,
      lineItemCount: lineItems?.length || 0,
      hasCardToken: !!cardToken,
      timestamp: new Date().toISOString(),
    });

    // Log line items for debugging variation issues and pricing
    if (lineItems && lineItems.length > 0) {
      console.log(
        '📦 Processing line items for admin order:',
        JSON.stringify(
          lineItems.map((item: any) => ({
            productId: item.productId || item.product_id,
            variationId: item.variationId || item.variation_id,
            hasVariationData: !!item.variation,
            attributeCount: item.variation?.attributes?.length || 0,
            attributes: item.variation?.attributes || [],
            name: item.name,
            sku: item.sku,
            total: item.total,
            subtotal: item.subtotal,
          })),
          null,
          2,
        ),
      );
    }

    // Log cart totals to verify CAD currency
    console.log('💰 Cart totals received:', {
      subtotal: cartTotals?.subtotal,
      total: cartTotals?.total,
      totalTax: cartTotals?.totalTax,
      shippingTotal: cartTotals?.shippingTotal,
      discountTotal: cartTotals?.discountTotal,
      currency: currency,
    });

    // Helper function to parse CAD price strings to numeric values
    const parseCADPrice = (priceString: string | null): string | null => {
      if (!priceString) return null;
      // Remove currency symbols, commas, and whitespace
      const cleaned = priceString.replace(/[^0-9.\\-]/g, '');
      return cleaned || null;
    };

    // Create WordPress Application Password authentication
    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString('base64');

    // Build GraphQL createOrder mutation
    const mutation = `
      mutation CreateAdminOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
          clientMutationId
          order {
            id
            databaseId
            orderNumber
            orderKey
            status
            total
            subtotal
            totalTax
            shippingTotal
            shippingTax
            date
            paymentMethod
            paymentMethodTitle
            transactionId
            billing {
              firstName
              lastName
              email
              phone
              address1
              city
              state
              postcode
              country
            }
            shipping {
              firstName
              lastName
              address1
              city
              state
              postcode
              country
            }
            lineItems {
              nodes {
                productId
                variationId
                quantity
                total
                subtotal
                totalTax
                product {
                  node {
                    id
                    name
                    sku
                  }
                }
                variation {
                  node {
                    id
                    name
                    sku
                  }
                }
              }
            }
            shippingLines {
              nodes {
                methodTitle
                total
              }
            }
            metaData {
              key
              value
            }
          }
        }
      }
    `;

    // Build GraphQL variables for createOrder
    const variables = {
      input: {
        clientMutationId: `admin-order-${transactionId}-${Date.now()}`,
        // CRITICAL: Use 'helcimjs' to match the Helcim Commerce for WooCommerce plugin
        // This enables native refunds via the WP admin dashboard
        paymentMethod: 'helcimjs',
        paymentMethodTitle: 'Helcim Credit Card Payment',
        transactionId: transactionId,
        status: 'PENDING', // Start as PENDING to prevent premature emails
        isPaid: false, // Do not mark as paid yet, wait for final update
        currency: currency, // Use provided currency or default to CAD
        customerId: customerId ? parseInt(customerId) : undefined,

        billing: {
          firstName: billing?.firstName || '',
          lastName: billing?.lastName || '',
          company: billing?.company || '',
          address1: billing?.address1 || '',
          address2: billing?.address2 || '',
          city: billing?.city || '',
          state: billing?.state || '',
          postcode: billing?.postcode || '',
          country: billing?.country || 'CA',
          email: billing?.email || '',
          phone: billing?.phone || '',
        },

        shipping: {
          firstName: shipping?.firstName || billing?.firstName || '',
          lastName: shipping?.lastName || billing?.lastName || '',
          company: shipping?.company || billing?.company || '',
          address1: shipping?.address1 || billing?.address1 || '',
          address2: shipping?.address2 || billing?.address2 || '',
          city: shipping?.city || billing?.city || '',
          state: shipping?.state || billing?.state || '',
          postcode: shipping?.postcode || billing?.postcode || '',
          country: shipping?.country || billing?.country || 'CA',
        },

        // Line items with complete product data including SKU and variations
        lineItems: (lineItems || []).map((item: any) => {
          const lineItem: any = {
            productId: item.productId || item.product_id,
            variationId: item.variationId || item.variation_id || null,
            quantity: item.quantity || 1,
            name: item.name || '',
            sku: item.sku || '',
            // Ensure prices are numeric CAD values (strip formatting)
            total: parseCADPrice(item.total),
            subtotal: parseCADPrice(item.subtotal),
          };

          console.log('💵 Line item pricing:', {
            name: item.name,
            originalTotal: item.total,
            parsedTotal: lineItem.total,
            originalSubtotal: item.subtotal,
            parsedSubtotal: lineItem.subtotal,
          });

          // Add variation attributes as metadata in WooCommerce format
          if (item.variation && Array.isArray(item.variation.attributes)) {
            console.log('🔍 Processing variation attributes for item:', {
              name: item.name,
              variationId: item.variationId || item.variation_id,
              attributes: item.variation.attributes,
            });

            lineItem.metaData = item.variation.attributes.map((attr: any) => {
              // WooCommerce expects attribute keys in format 'pa_size', 'pa_color', etc.
              // The attr.name should already be in the correct format from the cart
              const attributeKey = attr.name || attr.attributeName || attr.key;
              const attributeValue = attr.value || attr.attributeValue;

              console.log('  📋 Mapping attribute:', {
                originalKey: attr.name,
                finalKey: attributeKey,
                value: attributeValue,
              });

              return {
                key: attributeKey,
                value: attributeValue,
              };
            });

            console.log('✅ Final metaData for line item:', lineItem.metaData);
          }

          return lineItem;
        }),

        // Add shipping line with costs from cart totals
        shippingLines: cartTotals?.shippingTotal
          ? [
              {
                methodId: shippingMethod?.id || shippingMethod || 'flat_rate',
                methodTitle: shippingMethod?.title || shippingMethod?.label || 'Shipping',
                // Ensure shipping total is tax-exclusive by subtracting shipping tax
                total: (() => {
                  const sTotal = parseFloat(parseCADPrice(cartTotals.shippingTotal) || '0');
                  const sTax = parseFloat(parseCADPrice(cartTotals.shippingTax) || '0');
                  return Math.max(0, sTotal - sTax).toFixed(2);
                })(),
              },
            ]
          : [],

        customerNote: customerNote || '',

        metaData: [
          {key: '_created_via', value: 'woonuxt_admin_api'},
          // CRITICAL: Store transaction ID in both standard WooCommerce format AND Helcim-specific format
          // The Helcim plugin uses _transaction_id for refund lookups
          {key: '_transaction_id', value: transactionId},
          {key: '_helcim_transaction_id', value: transactionId},
          // CRITICAL: Use 'helcimjs' to match the Helcim WooCommerce plugin for native refunds
          {key: '_payment_method', value: 'helcimjs'},
          {key: '_payment_method_title', value: 'Helcim Credit Card Payment'},
          // CRITICAL: Store card token for native refund support via WP admin
          // Store in multiple formats to ensure Helcim plugin can find it
          ...(cardToken
            ? [
                {key: 'helcim-card-token', value: cardToken},
                {key: '_helcim_card_token', value: cardToken},
              ]
            : []),
          {key: '_paid_date', value: new Date().toISOString()},
          {key: '_transaction_paid', value: '1'},
          {key: '_order_source', value: 'proskatersplace.ca'},
          {key: '_customer_source', value: 'proskatersplace.ca'},
          {key: '_order_via', value: 'WooNuxt'},
          // Mark order as created via API for email template handling
          {key: '_created_via_api', value: 'woonuxt'},
          // Add cart totals as metadata for reference
          {key: '_cart_subtotal', value: cartTotals?.subtotal || '0'},
          {key: '_cart_total', value: cartTotals?.total || '0'},
          {key: '_cart_total_tax', value: cartTotals?.totalTax || '0'},
          {key: '_cart_shipping_total', value: cartTotals?.shippingTotal || '0'},
          {key: '_cart_shipping_tax', value: cartTotals?.shippingTax || '0'},
          ...metaData,
        ],
      },
    };

    console.log('📋 Order data prepared:', {
      clientMutationId: variables.input.clientMutationId,
      transactionId: transactionId,
      email: variables.input.billing.email,
      lineItemCount: variables.input.lineItems.length,
      appliedCoupons: coupons?.length || 0,
      requestId: requestId,
    });

    // Make GraphQL request with Application Password authentication
    // Uses retry logic for better reliability
    const graphqlUrl = `${config.public.wpBaseUrl}/graphql`;
    console.log('🌐 Making GraphQL request to:', graphqlUrl);

    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'WooNuxt-Admin-Order-Creator/1.0',
        Origin: config.public.wpBaseUrl, // Match the WordPress origin
        Referer: config.public.wpBaseUrl, // Set referrer to WordPress site
        'X-Requested-With': 'XMLHttpRequest', // Indicate AJAX request
        'X-Request-ID': requestId, // Include request ID for tracing
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ GraphQL HTTP Error [${requestId}]:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return {
        success: false,
        error: `GraphQL HTTP Error: ${response.status} - ${response.statusText}`,
        details: errorText,
        requestUrl: graphqlUrl,
        authMethod: 'Application Password (Basic Auth)',
      };
    }

    const result = await response.json();

    // Check for GraphQL errors
    if (result.errors) {
      console.error('❌ GraphQL mutation errors:', result.errors);
      return {
        success: false,
        error: 'GraphQL mutation failed',
        graphqlErrors: result.errors,
        requestUrl: graphqlUrl,
        authMethod: 'Application Password (Basic Auth)',
      };
    }

    const orderData = result.data?.createOrder?.order;
    if (!orderData) {
      console.error('❌ No order data returned from GraphQL mutation');
      return {
        success: false,
        error: 'Order creation failed - no order data returned from GraphQL',
        result: result,
        requestUrl: graphqlUrl,
        authMethod: 'Application Password (Basic Auth)',
      };
    }

    console.log('✅ TEST ORDER created successfully via GraphQL:', {
      orderId: orderData.databaseId,
      orderNumber: orderData.orderNumber,
      orderKey: orderData.orderKey,
      status: orderData.status,
      total: orderData.total,
      globalId: orderData.id,
    });

    // Line items are already created by GraphQL mutation with all necessary data
    // No need to update them separately to avoid duplicates
    console.log('✅ Order created with complete line items via GraphQL');

    // Step 1: SKIP Applying coupons to avoid double-discounting logic
    // Since we already calculated the discounted totals in the line items, applying coupons again via API
    // triggers a re-calculation that corrupts the totals (e.g. 0.85 -> 0.74).
    // We will just update status.

    try {
      /*
      console.log('🔄 Step 1: Applying coupons and recalculating...');

      // Prepare the coupon update payload
      const couponPayload: any = {
        currency: currency,
        meta_data: [
          {
            key: '_email_fix_applied',
            value: new Date().toISOString(),
          },
        ],
      };

      // Add coupons if present
      if (coupons && coupons.length > 0) {
        console.log(`🎫 Adding ${coupons.length} coupons to payload...`);
        couponPayload.coupon_lines = coupons.map((c: any) => ({
          code: c.code,
        }));
      }

      // Wait a moment to ensure GraphQL creation is fully settled in DB
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const couponResponse = await fetch(`${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WooNuxt-Test-GraphQL-Creator/1.0',
        },
        body: JSON.stringify(couponPayload),
      });

      if (!couponResponse.ok) {
        const errorText = await couponResponse.text();
        console.warn('⚠️ Failed to apply coupons:', errorText);
      } else {
        console.log('✅ Coupons applied and totals recalculated');
      }
      */

      console.log('🔄 Skipped coupon application to preserve manual line totals.');

      // Step 2: Update status to processing and ensure transaction_id is stored correctly
      console.log('🔄 Step 2: Updating status to processing...');

      // Delay to ensure DB write completes and totals are stable
      // User requested longer wait to guarantee correctness
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Build meta_data array for the REST API update
      // This ensures WooCommerce stores these in the standard format for the Helcim plugin
      const statusMetaData: Array<{key: string; value: string}> = [
        {
          key: '_order_completed_processing',
          value: 'true',
        },
        // Ensure transaction_id is stored in WooCommerce standard location
        {
          key: '_transaction_id',
          value: transactionId,
        },
      ];

      // Add cardToken for Helcim native refund support if available
      // Store in multiple formats to ensure Helcim plugin can find it
      if (cardToken) {
        statusMetaData.push({key: 'helcim-card-token', value: cardToken}, {key: '_helcim_card_token', value: cardToken});
        console.log('✅ Including cardToken in status update for refund support');
      }

      const statusPayload = {
        status: 'processing',
        set_paid: true,
        // Set transaction_id at the order level (required by WooCommerce for refunds)
        transaction_id: transactionId,
        // Set payment_method to match Helcim plugin
        payment_method: 'helcimjs',
        payment_method_title: 'Helcim Credit Card Payment',
        meta_data: statusMetaData,
      };

      // Use retry for status update to ensure it completes
      const statusResponse = await fetchWithRetry(
        `${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WooNuxt-Admin-Order-Creator/1.0',
            'X-Request-ID': requestId,
          },
          body: JSON.stringify(statusPayload),
        },
        2, // Fewer retries for status update
      );

      if (statusResponse.ok) {
        console.log('✅ Order status updated to processing (Email triggered)');
      } else {
        const errorText = await statusResponse.text();
        console.warn('⚠️ Failed to update status:', errorText);
      }
    } catch (finalError: any) {
      console.warn('⚠️ Failed to finalize order:', finalError.message);
    }

    const responsePayload = {
      success: true,
      message: '🎉 Order created successfully!',
      requestId: requestId,
      order: {
        id: orderData.databaseId,
        databaseId: orderData.databaseId,
        globalId: orderData.id,
        orderNumber: orderData.orderNumber,
        orderKey: orderData.orderKey,
        status: orderData.status,
        total: orderData.total,
        transactionId: orderData.transactionId,
        paymentMethod: orderData.paymentMethod,
        date: orderData.date,
        billing: orderData.billing,
        lineItems: orderData.lineItems?.nodes || [],
        metaData: orderData.metaData || [],
      },
      nextSteps: [
        '✅ Order successfully created with admin authentication',
        '✅ Payment method and transaction ID recorded',
        '✅ Customer billing and shipping information saved',
        '✅ Line items and metadata properly stored',
        '🔗 Redirect to order confirmation page',
      ],
    };

    await idempotencyStorage.setItem(idempotencyKey, {
      status: 'completed',
      transactionId,
      completedAt: new Date().toISOString(),
      order: responsePayload.order,
    });

    return responsePayload;
  } catch (error: any) {
    console.error(`❌ Admin order creation failed [${requestId}]:`, {
      message: error.message,
      transactionId: body.transactionId,
      email: body.billing?.email,
      stack: error.stack,
    });

    // Best-effort mark idempotency key as failed (if we had a transactionId)
    try {
      if (body?.transactionId) {
        const idempotencyStorage = useStorage('cache');
        const idempotencyKey = `idempotency:admin-order:${body.transactionId}`;
        await idempotencyStorage.setItem(idempotencyKey, {
          status: 'failed',
          transactionId: body.transactionId,
          failedAt: new Date().toISOString(),
          error: error?.message || 'Unknown error',
        });
      }
    } catch {
      // ignore
    }

    // Return detailed error info for debugging
    // The transaction was successful in Helcim, but WP order failed
    // Include enough info to manually recover the order if needed
    return {
      success: false,
      error: error.message || 'Admin order creation failed',
      requestId: requestId,
      transactionId: body.transactionId,
      recoveryInfo: {
        helcimTransactionId: body.transactionId,
        customerEmail: body.billing?.email,
        customerName: `${body.billing?.firstName || ''} ${body.billing?.lastName || ''}`.trim(),
        cartTotal: body.cartTotals?.total,
        timestamp: new Date().toISOString(),
        // If Helcim has the invoice data, it can be used to recover
        helcimHasInvoice: !!body.helcimInvoiceData,
      },
      details: error.stack || 'No additional details available',
    };
  }
});
