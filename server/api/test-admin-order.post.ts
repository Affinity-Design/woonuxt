// Test Admin Order Creation - Validates WPGraphQL admin authentication with dummy data
// This endpoint tests our GraphQL createOrder with Application Password before real implementation

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  try {
    console.log("🧪 Testing admin order creation via WPGraphQL...");

    // Validate required configuration
    if (
      !config.wpAdminUsername ||
      !config.wpAdminAppPassword ||
      !config.public.wpBaseUrl
    ) {
      return {
        success: false,
        error:
          "Missing WordPress Application Password credentials in configuration",
        config: {
          hasAdminUsername: !!config.wpAdminUsername,
          hasAdminAppPassword: !!config.wpAdminAppPassword,
          hasBaseUrl: !!config.public.wpBaseUrl,
          baseUrl: config.public.wpBaseUrl,
        },
      };
    }

    // Create WordPress Application Password authentication
    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString("base64");

    // Test dummy order data
    const testTransactionId = `test-${Date.now()}`;

    // Build test GraphQL createOrder mutation
    const mutation = `
      mutation CreateTestOrder($input: CreateOrderInput!) {
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

    // Test variables with dummy data
    const variables = {
      input: {
        clientMutationId: `test-admin-order-${testTransactionId}`,
        paymentMethod: "helcim_test",
        paymentMethodTitle: "Helcim Test Payment",
        transactionId: testTransactionId,
        status: "PROCESSING",
        isPaid: true,
        currency: "CAD",

        billing: {
          firstName: "Test",
          lastName: "Customer",
          company: "Test Company",
          address1: "123 Test Street",
          address2: "Suite 100",
          city: "Test City",
          state: "ON",
          postcode: "K1A 0A6",
          country: "CA",
          email: "test@example.com",
          phone: "613-555-0123",
        },

        shipping: {
          firstName: "Test",
          lastName: "Customer",
          company: "Test Company",
          address1: "123 Test Street",
          address2: "Suite 100",
          city: "Test City",
          state: "ON",
          postcode: "K1A 0A6",
          country: "CA",
        },

        // Line items with real product ID from store
        lineItems: [
          {
            productId: 114132, // ZETAZS Trident Pro Electric Longboard
            quantity: 1,
          },
        ],

        customerNote:
          "This is a test order created via WPGraphQL admin authentication",

        metaData: [
          { key: "_test_transaction_id", value: testTransactionId },
          { key: "_test_payment_method", value: "helcim_test" },
          { key: "_test_created_date", value: new Date().toISOString() },
          { key: "_order_via", value: "WooNuxt_Test" },
          { key: "_admin_test", value: "yes" },
          { key: "_authentication_method", value: "application_password" },
        ],
      },
    };

    console.log("📋 Test order data prepared:", {
      clientMutationId: variables.input.clientMutationId,
      transactionId: testTransactionId,
      email: variables.input.billing.email,
      lineItemCount: variables.input.lineItems.length,
    });

    // Make GraphQL request with Application Password authentication
    const graphqlUrl = `${config.public.wpBaseUrl}/graphql`;
    console.log("🌐 Making test GraphQL request to:", graphqlUrl);

    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "User-Agent": "WooNuxt-Test-GraphQL-Creator/1.0",
        Origin: config.public.wpBaseUrl, // Match the WordPress origin
        Referer: config.public.wpBaseUrl, // Set referrer to WordPress site
        "X-Requested-With": "XMLHttpRequest", // Indicate AJAX request
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ GraphQL HTTP Error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return {
        success: false,
        error: `GraphQL HTTP Error: ${response.status} - ${response.statusText}`,
        details: errorText,
        requestUrl: graphqlUrl,
        authMethod: "Application Password (Basic Auth)",
      };
    }

    const result = await response.json();

    // Check for GraphQL errors
    if (result.errors) {
      console.error("❌ GraphQL mutation errors:", result.errors);
      return {
        success: false,
        error: "GraphQL mutation failed",
        graphqlErrors: result.errors,
        requestUrl: graphqlUrl,
        authMethod: "Application Password (Basic Auth)",
      };
    }

    const orderData = result.data?.createOrder?.order;
    if (!orderData) {
      console.error("❌ No order data returned from GraphQL mutation");
      return {
        success: false,
        error: "Order creation failed - no order data returned from GraphQL",
        result: result,
        requestUrl: graphqlUrl,
        authMethod: "Application Password (Basic Auth)",
      };
    }

    console.log("✅ TEST ORDER created successfully via GraphQL:", {
      orderId: orderData.databaseId,
      orderNumber: orderData.orderNumber,
      orderKey: orderData.orderKey,
      status: orderData.status,
      total: orderData.total,
      globalId: orderData.id,
    });

    return {
      success: true,
      message: "🎉 GraphQL admin authentication test SUCCESSFUL!",
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
      testInfo: {
        testTransactionId: testTransactionId,
        requestUrl: graphqlUrl,
        authMethod: "Application Password (Basic Auth)",
        timestamp: new Date().toISOString(),
      },
      nextSteps: [
        "✅ GraphQL admin authentication working",
        "✅ createOrder mutation successful",
        "✅ Order data properly structured",
        "➡️ Ready to integrate with real checkout flow",
      ],
    };
  } catch (error: any) {
    console.error("💥 Test admin GraphQL order creation failed:", error);

    return {
      success: false,
      error:
        error.message || "Test failed - GraphQL admin authentication issue",
      details: error.stack || error.toString(),
      testInfo: {
        timestamp: new Date().toISOString(),
        authMethod: "Application Password (Basic Auth)",
        configStatus: {
          hasAdminUsername: !!config.wpAdminUsername,
          hasAdminAppPassword: !!config.wpAdminAppPassword,
          hasBaseUrl: !!config.public.wpBaseUrl,
        },
      },
    };
  }
});
