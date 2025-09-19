import { $fetch } from "ofetch";

export default defineEventHandler(async (event) => {
  try {
    // Simple introspection query to test GraphQL endpoint
    const introspectionQuery = {
      query: `
        query {
          __schema {
            queryType {
              name
            }
            mutationType {
              name
            }
          }
        }
      `,
    };

    console.log("Testing GraphQL endpoint connectivity...");

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
      body: introspectionQuery,
    });

    console.log("GraphQL introspection response:", response);

    return {
      success: true,
      endpoint: "https://test.proskatersplace.com/graphql",
      response: response,
      message: "GraphQL endpoint is accessible",
    };
  } catch (error: any) {
    console.error("GraphQL endpoint test failed:", error);

    return {
      success: false,
      endpoint: "https://test.proskatersplace.com/graphql",
      error: error.message || "Unknown error",
      statusCode: error.statusCode || 500,
      message: "GraphQL endpoint test failed",
    };
  }
});
