import {$fetch} from 'ofetch';

export default defineEventHandler(async (event) => {
  try {
    // Query to get available payment methods
    const paymentMethodsQuery = {
      query: `
        query GetPaymentMethods {
          paymentGateways {
            nodes {
              id
              title
              description
              enabled
            }
          }
        }
      `,
    };

    console.log('Testing available payment methods...');

    const response = await $fetch('https://test.proskatersplace.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-frontend-type': 'woonuxt',
        'user-agent': 'WooNuxt/1.0 Custom Frontend',
        'woocommerce-session': 'Guest',
        Origin: 'http://localhost:3000',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: paymentMethodsQuery,
    });

    console.log('Payment methods response:', response);

    return {
      success: true,
      endpoint: 'https://test.proskatersplace.com/graphql',
      paymentMethods: response?.data?.paymentGateways?.nodes || [],
      message: 'Successfully retrieved payment methods',
    };
  } catch (error: any) {
    console.error('Payment methods query failed:', error);

    return {
      success: false,
      endpoint: 'https://test.proskatersplace.com/graphql',
      error: error.message || 'Unknown error',
      statusCode: error.statusCode || 500,
      message: 'Payment methods query failed',
    };
  }
});
