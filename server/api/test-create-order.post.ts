import { $fetch } from "ofetch";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  try {
    // Create order mutation for client-side session management (no cart dependency)
    const createOrderMutation = {
      query: `
        mutation CreateOrderTest(
          $billing: CustomerAddressInput!
          $shipping: CustomerAddressInput!
          $paymentMethod: String!
          $lineItems: [LineItemInput!]!
          $metaData: [MetaDataInput]
          $customerNote: String
          $isPaid: Boolean!
        ) {
          createOrder(
            input: {
              billing: $billing
              shipping: $shipping
              paymentMethod: $paymentMethod
              lineItems: $lineItems
              metaData: $metaData
              customerNote: $customerNote
              isPaid: $isPaid
              transactionId: "CREATE_ORDER_TEST"
            }
          ) {
            clientMutationId
            order {
              id
              databaseId
              orderKey
              status
              total
              paymentMethodTitle
              paymentMethod
              needsPayment
              needsProcessing
              customer {
                email
              }
              lineItems {
                nodes {
                  productId
                  quantity
                  total
                  product {
                    node {
                      name
                      databaseId
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        billing: body.billing || {
          firstName: "Test",
          lastName: "Customer",
          address1: "123 Test St",
          city: "Test City",
          country: "CA",
          postcode: "12345",
          email: "test@example.com",
          phone: "555-1234",
        },
        shipping: body.shipping || {
          firstName: "Test",
          lastName: "Customer",
          address1: "123 Test St",
          city: "Test City",
          country: "CA",
          postcode: "12345",
        },
        paymentMethod: body.paymentMethod || "cod",
        lineItems: body.lineItems || [
          {
            productId: 1, // You'll need to use a real product ID from your store
            quantity: 1,
          },
        ],
        isPaid: true, // Bypass payment processing
        metaData: [
          { key: "order_via", value: "WooNuxt" },
          { key: "test_order", value: "true" },
          { key: "create_order_test", value: "CREATE_ORDER_TEST" },
        ],
        customerNote: body.customerNote || "Test order - createOrder mutation",
      },
    };

    console.log("Testing createOrder mutation...");
    console.log("Variables:", createOrderMutation.variables);

    const response = await $fetch("https://test.proskatersplace.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-frontend-type": "woonuxt",
        "user-agent": "WooNuxt/1.0 Custom Frontend",
        "woocommerce-session": "Guest",
        Origin: "http://localhost:3000",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: createOrderMutation,
    });

    console.log("CreateOrder response:", response);

    return {
      success: true,
      endpoint: "https://test.proskatersplace.com/graphql",
      mutationType: "createOrder",
      testTransaction: true,
      isPaid: true,
      response: response,
      order: response?.data?.createOrder?.order || null,
      message: "CreateOrder test completed successfully",
    };
  } catch (error: any) {
    console.error("CreateOrder test failed:", error);

    return {
      success: false,
      endpoint: "https://test.proskatersplace.com/graphql",
      error: error.message || "Unknown error",
      statusCode: error.statusCode || 500,
      mutationType: "createOrder",
      testTransaction: true,
      message: "CreateOrder test failed",
    };
  }
});
