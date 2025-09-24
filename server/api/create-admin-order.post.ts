// Admin Order Creation API - Creates orders directly via WPGraphQL with Application Password authentication
// Bypasses all session-based GraphQL issues by using admin-level authentication

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

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
      checkoutSessionToken,
    } = body;

    // Verify checkout session first
    if (checkoutSessionToken) {
      console.log('🔐 Verifying checkout session before order creation...');

      try {
        // Validate session using the session validation API
        const storage = useStorage('redis'); // or 'memory' for development
        const rawSessionData = await storage.getItem(checkoutSessionToken);

        if (!rawSessionData) {
          console.error('❌ Checkout session not found or expired');
          return {
            success: false,
            error: 'Security verification expired. Please complete security check again.',
          };
        }

        // Parse session data
        const sessionData = typeof rawSessionData === 'object' ? rawSessionData : JSON.parse(rawSessionData as string);

        // Check if session is still valid
        const now = Date.now();
        if (now > sessionData.expiresAt) {
          console.error('❌ Checkout session expired');
          await storage.removeItem(checkoutSessionToken); // Clean up expired session
          return {
            success: false,
            error: 'Security verification expired. Please complete security check again.',
          };
        }

        console.log('✅ Checkout session verification successful');
      } catch (sessionError) {
        console.error('❌ Session verification error:', sessionError);
        return {
          success: false,
          error: 'Security verification failed. Please try again.',
        };
      }
    } else {
      console.warn('⚠️ No checkout session provided - order may be spam');
    }

    // Validate required configuration
    if (!config.wpAdminUsername || !config.wpAdminAppPassword || !config.public.wpBaseUrl) {
      throw new Error('Missing WordPress Application Password credentials in configuration');
    }

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
            lineItems {
              nodes {
                productId
                quantity
                total
                product {
                  node {
                    id
                    name
                  }
                }
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
        paymentMethod: 'helcim',
        paymentMethodTitle: 'Helcim Credit Card Payment',
        transactionId: transactionId,
        status: 'PROCESSING',
        isPaid: true,
        currency: 'CAD',

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

        // Line items from cart - let WooCommerce calculate pricing with applied coupons
        lineItems: (lineItems || []).map((item: any) => ({
          productId: item.productId || item.product_id,
          variationId: item.variationId || item.variation_id || null,
          quantity: item.quantity || 1,
        })),

        customerNote: customerNote || '',

        metaData: [
          {key: '_created_via', value: 'woonuxt_admin_api'},
          {key: '_helcim_transaction_id', value: transactionId},
          {key: '_payment_method', value: 'helcim'},
          {key: '_payment_method_title', value: 'Helcim Credit Card Payment'},
          {key: '_paid_date', value: new Date().toISOString()},
          {key: '_transaction_paid', value: '1'},
          {key: '_order_source', value: 'proskatersplace.ca'},
          {key: '_customer_source', value: 'proskatersplace.ca'},
          {key: '_order_via', value: 'WooNuxt'},
          // Mark order as created via API for email template handling
          {key: '_created_via_api', value: 'woonuxt'},
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
    });

    // Make GraphQL request with Application Password authentication
    const graphqlUrl = `${config.public.wpBaseUrl}/graphql`;
    console.log('🌐 Making test GraphQL request to:', graphqlUrl);

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'ProSkatersPlaceFrontend/1.0;',
        Origin: config.public.wpBaseUrl, // Match the WordPress origin
        Referer: config.public.wpBaseUrl, // Set referrer to WordPress site
        'X-Requested-With': 'XMLHttpRequest', // Indicate AJAX request
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ GraphQL HTTP Error:', {
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

    // Apply coupons if any were provided
    if (coupons && coupons.length > 0) {
      console.log('🎫 Applying coupons to order via REST API...');

      try {
        for (const coupon of coupons) {
          console.log(`📋 Applying coupon: ${coupon.code}`);

          // Use WooCommerce REST API to apply coupon to the order
          const restApiUrl = `${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`;

          // Add coupon to the order
          await $fetch(restApiUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: {
              coupon_lines: [
                {
                  code: coupon.code,
                  discount: coupon.discountAmount || '0',
                  discount_tax: coupon.discountTax || '0',
                },
              ],
            },
          });

          console.log(`✅ Coupon ${coupon.code} applied to order ${orderData.orderNumber}`);
        }

        // Recalculate totals after applying coupons
        await $fetch(`${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: {
            // Trigger recalculation
            recalculate: true,
          },
        });

        console.log('🔄 Order totals recalculated after coupon application');
      } catch (couponError: any) {
        console.warn('⚠️ Failed to apply coupons via REST API:', couponError.message);
        // Don't fail the entire order creation, just log the warning
      }
    }

    // Background email fix: Trigger updated order email after processing completes
    // This runs asynchronously without blocking the checkout UI
    setImmediate(async () => {
      try {
        console.log('📧 Background: Refreshing order for proper email notifications...');

        // Wait for WooCommerce to finish all processing
        setTimeout(async () => {
          try {
            // Refresh order data and trigger both admin and customer emails
            await $fetch(`${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`, {
              method: 'PUT',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: {
                // Force recalculation of totals
                recalculate: true,
                // Ensure status triggers both admin and customer emails
                status: 'processing',
                // Mark that proper emails should be sent
                meta_data: [
                  {
                    key: '_email_sent_refreshed',
                    value: new Date().toISOString(),
                  },
                  {
                    key: '_order_emails_triggered',
                    value: 'admin_and_customer',
                  },
                ],
              },
            });

            console.log('✅ Background: Order refreshed for proper email notifications');
          } catch (refreshError: any) {
            console.warn('⚠️ Background: Email refresh failed:', refreshError.message);
          }
        }, 3000); // 3 second delay for background processing
      } catch (emailError: any) {
        console.warn('⚠️ Background: Email processing failed:', emailError.message);
      }
    });

    return {
      success: true,
      message: '🎉 GraphQL admin authentication test SUCCESSFUL!',
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
  } catch (error: any) {
    console.error('❌ Admin order creation failed:', error);

    return {
      success: false,
      error: error.message || 'Admin order creation failed',
      details: error.stack || 'No additional details available',
    };
  }
});
