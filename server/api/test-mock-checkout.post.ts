import { $fetch } from "ofetch";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  try {
    // Mock checkout mutation with isPaid: true to bypass payment processing
    const mockCheckoutMutation = {
      query: `
        mutation MockCheckout(
          $billing: CustomerAddressInput!
          $shipping: CustomerAddressInput!
          $paymentMethod: String!
          $isPaid: Boolean!
          $metaData: [MetaDataInput]
          $customerNote: String
        ) {
          checkout(
            input: {
              billing: $billing
              shipping: $shipping
              paymentMethod: $paymentMethod
              isPaid: $isPaid
              metaData: $metaData
              customerNote: $customerNote
              transactionId: "MOCK_TEST_TRANSACTION"
            }
          ) {
            result
            redirect
            messages
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
        isPaid: true, // This bypasses payment processing
        metaData: [
          { key: "order_via", value: "WooNuxt" },
          { key: "test_order", value: "true" },
          { key: "mock_transaction", value: "MOCK_TEST_TRANSACTION" },
        ],
        customerNote: body.customerNote || "Test order - mock transaction",
      },
    };

    console.log("Testing mock checkout with isPaid: true...");
    console.log("Variables:", mockCheckoutMutation.variables);

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
      body: mockCheckoutMutation,
    });

    console.log("Mock checkout response:", response);

    return {
      success: true,
      endpoint: "https://test.proskatersplace.com/graphql",
      mockTransaction: true,
      isPaid: true,
      response: response,
      order: response?.data?.checkout?.order || null,
      result: response?.data?.checkout?.result || null,
      message: "Mock checkout completed successfully",
    };
  } catch (error: any) {
    console.error("Mock checkout failed:", error);

    return {
      success: false,
      endpoint: "https://test.proskatersplace.com/graphql",
      error: error.message || "Unknown error",
      statusCode: error.statusCode || 500,
      mockTransaction: true,
      message: "Mock checkout failed",
    };
  }
});
