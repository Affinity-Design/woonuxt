/**
 * Clean Build Script
 *
 * Removes all build artifacts and caches to ensure a fresh build.
 * Run this before deploying to fix MIME type errors and cache issues.
 *
 * Usage: node scripts/clean-build.js
 */

const fs = require('fs');
const path = require('path');

const foldersToDelete = ['.nuxt', '.output', 'dist', 'node_modules/.cache', '.nitro'];

console.log('🧹 Starting clean build process...\n');

foldersToDelete.forEach((folder) => {
  const folderPath = path.resolve(__dirname, '..', folder);

  if (fs.existsSync(folderPath)) {
    console.log(`🗑️  Removing ${folder}...`);
    try {
      fs.rmSync(folderPath, {recursive: true, force: true});
      console.log(`   ✅ Deleted ${folder}`);
    } catch (error) {
      console.log(`   ⚠️  Could not delete ${folder}: ${error.message}`);
    }
  } else {
    console.log(`   ⏭️  ${folder} doesn't exist, skipping`);
  }
});

console.log('\n✨ Clean complete! Now run:');
console.log('   npm install');
console.log('   npm run build');
console.log('   npm run preview  (to test locally)\n');
