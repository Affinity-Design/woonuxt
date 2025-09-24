// GraphQL Checkout Test - Verify Turnstile integration with GraphQL checkout
// Run with: node test-graphql-checkout.js

const https = require('https');
const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = BASE_URL.startsWith('https');
    const protocol = isHttps ? https : http;

    const postData = JSON.stringify({
      query,
      variables,
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = protocol.request(`${BASE_URL}/api/graphql`, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({status: res.statusCode, data: result});
        } catch (e) {
          resolve({status: res.statusCode, data: data});
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testCheckoutWithoutTurnstile() {
  console.log('🧪 Testing GraphQL checkout without Turnstile token...');

  const checkoutMutation = `
    mutation TestCheckout(
      $billing: CustomerAddressInput!
      $paymentMethod: String!
      $turnstileToken: String
    ) {
      checkout(
        input: {
          billing: $billing
          paymentMethod: $paymentMethod
          turnstileToken: $turnstileToken
          isPaid: false
        }
      ) {
        result
        redirect
        order {
          databaseId
          status
        }
      }
    }
  `;

  const variables = {
    billing: {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '1234567890',
      address1: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postcode: '12345',
      country: 'CA',
    },
    paymentMethod: 'cod',
    turnstileToken: '', // Empty token should trigger verification error
  };

  try {
    const result = await makeGraphQLRequest(checkoutMutation, variables);

    if (result.data.errors) {
      const error = result.data.errors[0];
      if (error.message.includes('Please verify that you are human')) {
        console.log('✅ GraphQL correctly requires Turnstile verification');
        return true;
      } else {
        console.log('❌ Unexpected GraphQL error:', error.message);
        return false;
      }
    } else {
      console.log('⚠️ GraphQL checkout succeeded without Turnstile - this may indicate the verification is not properly configured');
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testCheckoutWithInvalidTurnstile() {
  console.log('🧪 Testing GraphQL checkout with invalid Turnstile token...');

  const checkoutMutation = `
    mutation TestCheckout(
      $billing: CustomerAddressInput!
      $paymentMethod: String!
      $turnstileToken: String
    ) {
      checkout(
        input: {
          billing: $billing
          paymentMethod: $paymentMethod
          turnstileToken: $turnstileToken
          isPaid: false
        }
      ) {
        result
        redirect
        order {
          databaseId
          status
        }
      }
    }
  `;

  const variables = {
    billing: {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '1234567890',
      address1: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postcode: '12345',
      country: 'CA',
    },
    paymentMethod: 'cod',
    turnstileToken: 'invalid_token_12345',
  };

  try {
    const result = await makeGraphQLRequest(checkoutMutation, variables);

    if (result.data.errors) {
      const error = result.data.errors[0];
      if (error.message.includes('Please verify that you are human') || error.message.includes('verification failed')) {
        console.log('✅ GraphQL correctly rejects invalid Turnstile token');
        return true;
      } else {
        console.log('❌ Unexpected GraphQL error:', error.message);
        return false;
      }
    } else {
      console.log('⚠️ GraphQL checkout succeeded with invalid Turnstile - verification may not be working');
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function runGraphQLTests() {
  console.log('🚀 Starting GraphQL Checkout Turnstile Tests');
  console.log('=' * 50);

  const test1 = await testCheckoutWithoutTurnstile();
  console.log('');

  const test2 = await testCheckoutWithInvalidTurnstile();
  console.log('');

  if (test1 && test2) {
    console.log('✅ All GraphQL tests passed - Turnstile verification is working!');
  } else {
    console.log('❌ Some tests failed - check GraphQL configuration');
  }

  console.log('');
  console.log('Next steps:');
  console.log('1. Test with a real Turnstile token from the frontend');
  console.log('2. Verify orders can be created with valid tokens');
  console.log('3. Check WordPress backend logs for verification attempts');
}

runGraphQLTests().catch(console.error);
