// Simple Admin Order Creation API - Basic version that works
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  try {
    console.log('🛠️ Creating basic admin order...');

    const {billing, transactionId, lineItems} = body;

    // Validate required configuration
    if (!config.wpAdminUsername || !config.wpAdminAppPassword || !config.public.wpBaseUrl) {
      throw new Error('Missing WordPress Application Password credentials in configuration');
    }

    // Create WordPress Application Password authentication
    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString('base64');

    // Simple GraphQL createOrder mutation
    const mutation = `
      mutation CreateAdminOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
          order {
            id
            databaseId
            orderNumber
            status
            total
          }
        }
      }
    `;

    const variables = {
      input: {
        clientMutationId: `admin-order-${transactionId}`,
        paymentMethod: 'helcim',
        paymentMethodTitle: 'Helcim Credit Card Payment',
        transactionId: transactionId,
        status: 'PROCESSING',
        isPaid: true,
        billing: {
          firstName: billing?.firstName || '',
          lastName: billing?.lastName || '',
          email: billing?.email || '',
        },
        lineItems: (lineItems || []).map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity || 1,
        })),
      },
    };

    console.log('📋 Making GraphQL request...');

    const graphqlUrl = `${config.public.wpBaseUrl}/graphql`;
    const response = await $fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: {
        query: mutation,
        variables: variables,
      },
    });

    if (response.errors) {
      console.error('❌ GraphQL errors:', response.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
    }

    const order = response.data?.createOrder?.order;
    console.log('✅ Order created:', order?.orderNumber);

    return {
      success: true,
      orderNumber: order?.orderNumber,
      orderId: order?.databaseId,
      total: order?.total,
    };
  } catch (error: any) {
    console.error('❌ Admin order creation failed:', error);
    throw createError({
      statusCode: 500,
      statusMessage: `Admin order creation failed: ${error.message}`,
    });
  }
});
