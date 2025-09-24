#!/usr/bin/env node

// Test script for Turnstile integration
// Run with: node test-turnstile-integration.js

const https = require('https');
const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({status: res.statusCode, data: jsonData});
        } catch (e) {
          resolve({status: res.statusCode, data});
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testTurnstileVerification() {
  log('🔐 Testing Turnstile verification endpoint...', 'blue');

  try {
    // Test with invalid token
    const invalidResult = await makeRequest(`${BASE_URL}/api/verify-turnstile`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: {turnstileToken: 'invalid_token_12345'},
    });

    if (invalidResult.status === 200 && !invalidResult.data.success) {
      log('✅ Invalid token correctly rejected', 'green');
    } else {
      log('❌ Invalid token test failed', 'red');
      console.log('Response:', invalidResult);
    }

    // Test with missing token
    const missingResult = await makeRequest(`${BASE_URL}/api/verify-turnstile`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: {},
    });

    if (missingResult.status === 200 && !missingResult.data.success) {
      log('✅ Missing token correctly rejected', 'green');
    } else {
      log('❌ Missing token test failed', 'red');
      console.log('Response:', missingResult);
    }
  } catch (error) {
    log(`❌ Turnstile verification test failed: ${error.message}`, 'red');
  }
}

async function testOrderCreationWithoutToken() {
  log('🛒 Testing order creation without Turnstile token...', 'blue');

  try {
    const orderData = {
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
      transactionId: `test_${Date.now()}`,
      lineItems: [
        {
          productId: 1,
          quantity: 1,
          name: 'Test Product',
          total: '10.00',
        },
      ],
      cartTotals: {
        total: '10.00',
      },
      // Note: No turnstileToken provided
    };

    const result = await makeRequest(`${BASE_URL}/api/create-admin-order`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: orderData,
    });

    if (result.status === 200 && result.data.success === false) {
      log('✅ Order creation without token correctly rejected', 'green');
    } else {
      log('⚠️ Order creation without token - check if this is expected', 'yellow');
      console.log('Response:', result);
    }
  } catch (error) {
    log(`❌ Order creation test failed: ${error.message}`, 'red');
  }
}

async function testCheckoutPageLoad() {
  log('📄 Testing checkout page load...', 'blue');

  try {
    const result = await makeRequest(`${BASE_URL}/checkout`, {
      method: 'GET',
      headers: {Accept: 'text/html'},
    });

    if (result.status === 200) {
      const hasVueTurnstile = result.data.includes('VueTurnstile') || result.data.includes('turnstile') || result.data.includes('security check');

      if (hasVueTurnstile) {
        log('✅ Checkout page contains Turnstile integration', 'green');
      } else {
        log('⚠️ Checkout page may not have Turnstile integration', 'yellow');
      }
    } else {
      log(`❌ Checkout page returned status: ${result.status}`, 'red');
    }
  } catch (error) {
    log(`❌ Checkout page test failed: ${error.message}`, 'red');
  }
}

async function runAllTests() {
  log('🚀 Starting Turnstile Integration Tests', 'blue');
  log('=' * 50, 'blue');

  await testTurnstileVerification();
  log('');

  await testOrderCreationWithoutToken();
  log('');

  await testCheckoutPageLoad();
  log('');

  log('✨ Tests completed!', 'blue');
  log('');
  log('Manual testing steps:', 'yellow');
  log('1. Visit /checkout in your browser', 'yellow');
  log('2. Fill out the checkout form', 'yellow');
  log('3. Complete the Turnstile challenge', 'yellow');
  log('4. Submit the order', 'yellow');
  log('5. Verify the order is created successfully', 'yellow');
  log('');
  log('To test spam prevention:', 'yellow');
  log('1. Try submitting without completing Turnstile', 'yellow');
  log('2. Should see error message', 'yellow');
  log('3. Order should NOT be created', 'yellow');
}

// Run tests
runAllTests().catch(console.error);
