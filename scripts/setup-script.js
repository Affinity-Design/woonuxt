// scripts/setup-cache.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up caching system during build phase...');

// Create the cache directory if it doesn't exist
const cacheDir = path.join(process.cwd(), '.cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

try {
  // 1. Build only the product search cache with a limited number of products
  // This is faster and keeps us under the 20-minute limit
  console.log('📦 Building initial product search cache (limited to recent/popular products)...');
  
  // Set environment variable to limit the number of products fetched during build
  process.env.LIMIT_PRODUCTS = 'true';
  process.env.MAX_PRODUCTS = '200'; // Adjust based on your build time constraints
  
  execSync('node scripts/build-products-cache.js --build-mode', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      LIMIT_PRODUCTS: 'true',
      MAX_PRODUCTS: '200'
    }
  });

  // 2. Create a flag file to signal that post-deployment actions are needed
  console.log('🏁 Creating signal file for post-deployment cache warming...');
  const deploymentData = {
    buildTime: new Date().toISOString(),
    needsFullCacheWarming: true,
    needsFullProductCache: true
  };
  fs.writeFileSync(
    path.join(cacheDir, 'deployment-data.json'),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log('✅ Build-time cache setup complete! Full caching will run post-deployment.');
} catch (error) {
  console.error('❌ Error in build-time cache setup:', error);
  console.log('⚠️ Continuing with deployment despite caching error...');
  // Don't fail the build process if caching fails
}
