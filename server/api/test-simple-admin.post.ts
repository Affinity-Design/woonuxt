// Test Simple Admin Mutation - Try a basic admin operation to isolate the issue

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  try {
    console.log('🧪 Testing simple admin mutation...');

    if (!config.wpAdminUsername || !config.wpAdminAppPassword || !config.public.wpBaseUrl) {
      return {
        success: false,
        error: 'Missing WordPress Application Password credentials',
      };
    }

    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString('base64');

    // Try a simpler mutation first - updating user profile (should require less permissions)
    const mutation = `
      mutation TestAdminCapability {
        updateUser(input: {
          id: "dXNlcjox"
          clientMutationId: "test-admin-capability"
          description: "Testing admin capabilities via GraphQL"
        }) {
          clientMutationId
          user {
            id
            databaseId
            username
            description
          }
        }
      }
    `;

    console.log('🌐 Testing with updateUser mutation...');

    const response = await fetch(`${config.public.wpBaseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'WooNuxt-Simple-Admin-Test/1.0',
        Origin: config.public.wpBaseUrl,
        Referer: config.public.wpBaseUrl,
      },
      body: JSON.stringify({query: mutation}),
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
      console.log('❌ updateUser mutation failed, trying a query instead...');

      // If mutation fails, try a simple query that requires admin
      const queryTest = `
        query TestAdminQuery {
          users(first: 1) {
            nodes {
              id
              username
              email
              roles {
                nodes {
                  name
                }
              }
            }
          }
        }
      `;

      const queryResponse = await fetch(`${config.public.wpBaseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
          'User-Agent': 'WooNuxt-Query-Test/1.0',
          Origin: config.public.wpBaseUrl,
          Referer: config.public.wpBaseUrl,
        },
        body: JSON.stringify({query: queryTest}),
      });

      const queryResult = await queryResponse.json();

      return {
        success: false,
        mutationError: result.errors,
        queryTest: {
          success: !queryResult.errors,
          errors: queryResult.errors || null,
          data: queryResult.data || null,
        },
        message: 'updateUser mutation failed, but tested admin query capability',
        authMethod: 'WordPress Application Password',
      };
    }

    return {
      success: true,
      message: '✅ Admin mutation successful!',
      result: result.data,
      authMethod: 'WordPress Application Password',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Simple admin test failed',
      details: error.stack || error.toString(),
    };
  }
});
