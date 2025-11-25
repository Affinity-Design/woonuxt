// scripts/verify-env.js
// Run this to verify all required environment variables are set

require('dotenv').config();

const REQUIRED_VARS = {
  'Build & Deploy': [
    'GQL_HOST',
    'CF_ACCOUNT_ID',
    'CF_API_TOKEN',
    'CF_KV_NAMESPACE_ID_SCRIPT_DATA',
    'NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE',
  ],
  'Runtime (Cloudflare Bindings)': ['NUXT_CACHE', 'NUXT_SCRIPT_DATA'],
  'Optional (Clear Cache Script)': [
    'CF_KV_NAMESPACE_ID_CACHE_TEST',
    'CF_KV_NAMESPACE_ID_SCRIPT_DATA_TEST',
    'CF_KV_NAMESPACE_ID_CACHE_PROD',
    'CF_KV_NAMESPACE_ID_SCRIPT_DATA_PROD',
  ],
};

console.log('🔍 Environment Variables Check\n');

let missingCount = 0;
let foundCount = 0;

for (const [category, vars] of Object.entries(REQUIRED_VARS)) {
  console.log(`\n📦 ${category}:`);
  console.log('─'.repeat(60));

  for (const varName of vars) {
    const value = process.env[varName];
    const exists = !!value;

    if (exists) {
      foundCount++;
      // Mask sensitive values
      const displayValue = varName.includes('TOKEN') || varName.includes('SECRET') ? '****' : value.substring(0, 20) + (value.length > 20 ? '...' : '');

      console.log(`✅ ${varName.padEnd(45)} = ${displayValue}`);
    } else {
      missingCount++;
      console.log(`❌ ${varName.padEnd(45)} = NOT SET`);
    }
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`\n📊 Summary: ${foundCount} found, ${missingCount} missing\n`);

if (missingCount > 0) {
  console.log('⚠️  Missing variables detected!');
  console.log('   Set these in Cloudflare Pages:');
  console.log('   Dashboard → Pages → Settings → Environment variables\n');
  process.exit(1);
} else {
  console.log('✅ All required variables are set!\n');
  process.exit(0);
}
