// Debug Authentication Test - Check what user we're authenticating as and their capabilities

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  try {
    console.log("🔍 Testing WordPress authentication and user capabilities...");

    // Validate configuration
    if (
      !config.wpAdminUsername ||
      !config.wpAdminAppPassword ||
      !config.public.wpBaseUrl
    ) {
      return {
        success: false,
        error: "Missing WordPress Application Password credentials",
      };
    }

    // Create WordPress Application Password authentication
    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString("base64");

    // Simple GraphQL query to check current user and capabilities
    const query = `
      query CheckCurrentUser {
        viewer {
          id
          databaseId
          username
          email
          name
          roles {
            nodes {
              name
            }
          }
          capabilities
        }
      }
    `;

    console.log("🔐 Making authentication test request...");

    const response = await fetch(`${config.public.wpBaseUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "User-Agent": "WooNuxt-Auth-Test/1.0",
        Origin: config.public.wpBaseUrl,
        Referer: config.public.wpBaseUrl,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP Error: ${response.status} - ${response.statusText}`,
        details: errorText,
      };
    }

    const result = await response.json();

    if (result.errors) {
      return {
        success: false,
        error: "GraphQL authentication failed",
        graphqlErrors: result.errors,
      };
    }

    const viewer = result.data?.viewer;

    return {
      success: true,
      message: "✅ Authentication successful!",
      user: {
        id: viewer?.id,
        databaseId: viewer?.databaseId,
        username: viewer?.username,
        email: viewer?.email,
        name: viewer?.name,
        roles: viewer?.roles?.nodes?.map((role: any) => role.name) || [],
        capabilityCount: viewer?.capabilities?.length || 0,
        hasEditShopOrderCap:
          viewer?.capabilities?.includes("edit_shop_orders") || false,
        hasManageWoocommerceCap:
          viewer?.capabilities?.includes("manage_woocommerce") || false,
        // Check some key capabilities
        keyCapabilities: {
          edit_posts: viewer?.capabilities?.includes("edit_posts") || false,
          edit_shop_orders:
            viewer?.capabilities?.includes("edit_shop_orders") || false,
          manage_woocommerce:
            viewer?.capabilities?.includes("manage_woocommerce") || false,
          manage_options:
            viewer?.capabilities?.includes("manage_options") || false,
          administrator:
            viewer?.roles?.nodes?.some(
              (role: any) => role.name === "administrator"
            ) || false,
          shop_manager:
            viewer?.roles?.nodes?.some(
              (role: any) => role.name === "shop_manager"
            ) || false,
        },
      },
      authMethod: "WordPress Application Password",
      testInfo: {
        username: config.wpAdminUsername,
        baseUrl: config.public.wpBaseUrl,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error("💥 Authentication test failed:", error);

    return {
      success: false,
      error: error.message || "Authentication test failed",
      details: error.stack || error.toString(),
    };
  }
});
