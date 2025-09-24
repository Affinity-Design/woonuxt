#!/usr/bin/env node

/**
 * Test script to verify User-Agent whitelist functionality
 * This script tests if the whitelisted User-Agent bypasses Turnstile challenges
 */

console.log('🧪 Testing User-Agent Whitelist Configuration...\n');

// Test configuration
const GRAPHQL_URL = process.env.GQL_HOST || 'https://test.proskatersplace.com/graphql';
const WHITELISTED_USER_AGENT = 'ProSkatersPlaceFrontend/1.0;';
const NON_WHITELISTED_USER_AGENT = 'Mozilla/5.0 (compatible; TestBot/1.0)';

// Simple GraphQL query for testing
const TEST_QUERY = `
  query TestQuery {
    generalSettings {
      title
      url
    }
  }
`;

async function testUserAgent(userAgent, description) {
  console.log(`📡 Testing: ${description}`);
  console.log(`   User-Agent: ${userAgent}`);

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'X-Frontend-Type': 'woonuxt',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        query: TEST_QUERY,
      }),
    });

    const responseText = await response.text();

    console.log(`   Status: ${response.status} ${response.statusText}`);

    // Check if response contains Turnstile challenge
    if (responseText.includes('cf-turnstile') || responseText.includes('turnstile')) {
      console.log('   ❌ BLOCKED: Turnstile challenge detected');
      return false;
    } else if (response.ok) {
      console.log('   ✅ SUCCESS: Request allowed through');
      try {
        const data = JSON.parse(responseText);
        if (data.data) {
          console.log('   📊 GraphQL Response: Valid data received');
        }
      } catch (e) {
        console.log('   📊 Response: Non-JSON content (possibly HTML)');
      }
      return true;
    } else {
      console.log('   ⚠️  HTTP Error:', response.status);
      return false;
    }
  } catch (error) {
    console.log('   ❌ ERROR:', error.message);
    return false;
  }
}

async function runTests() {
  console.log(`🎯 Target GraphQL URL: ${GRAPHQL_URL}\n`);

  // Test 1: Whitelisted User-Agent
  const whitelistedResult = await testUserAgent(WHITELISTED_USER_AGENT, 'Whitelisted User-Agent (should pass)');

  console.log('');

  // Test 2: Non-whitelisted User-Agent
  const nonWhitelistedResult = await testUserAgent(NON_WHITELISTED_USER_AGENT, 'Non-whitelisted User-Agent (may be blocked)');

  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST RESULTS SUMMARY:');
  console.log('='.repeat(60));

  if (whitelistedResult) {
    console.log('✅ Whitelisted User-Agent: WORKING - Requests bypass Turnstile');
  } else {
    console.log('❌ Whitelisted User-Agent: FAILED - Still being challenged');
  }

  if (!nonWhitelistedResult) {
    console.log('✅ Non-whitelisted User-Agent: BLOCKED - Turnstile is active');
  } else {
    console.log('⚠️  Non-whitelisted User-Agent: ALLOWED - Check Turnstile config');
  }

  console.log('\n🎯 RECOMMENDATION:');
  if (whitelistedResult) {
    console.log('   Your User-Agent whitelist is working correctly!');
    console.log('   You can safely keep TURNSTILE_ENABLED=false');
    console.log('   Your checkout should work without Turnstile challenges.');
  } else {
    console.log('   User-Agent whitelist may not be working properly.');
    console.log('   Consider checking your Turnstile configuration.');
    console.log('   You may need to keep session-based verification active.');
  }
}

// Run the tests
runTests().catch(console.error);
