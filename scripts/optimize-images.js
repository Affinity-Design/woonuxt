/**
 * Image Optimization Script
 *
 * This script optimizes images in the public/images directory using Sharp.
 * Run before deployment to reduce image sizes and improve page load times.
 *
 * Usage: node scripts/optimize-images.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images', 'optimized');

// Image optimization settings
const QUALITY = 80;
const MAX_WIDTH = 1920;

// Specific optimizations for different image types
const IMAGE_CONFIGS = {
  'inline-skates.jpg': {width: 1920, height: 550, quality: 75},
  'roller-skates.jpg': {width: 1920, height: 550, quality: 75},
  'hero-4.jpg': {width: 1400, height: 800, quality: 80},
  // Category images
  'Inline-Skates.jpeg': {width: 440, height: 496, quality: 85}, // 2x for retina
  'Roller-Skates.jpeg': {width: 440, height: 496, quality: 85},
  'Skate-Parts.jpeg': {width: 440, height: 496, quality: 85},
  'Skate-Tools.jpeg': {width: 440, height: 496, quality: 85},
  'Protection-Gear.jpeg': {width: 440, height: 496, quality: 85},
  'Scooters.jpeg': {width: 440, height: 496, quality: 85},
};

async function optimizeImage(inputPath, outputPath, config) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    console.log(`\n📸 Processing: ${path.basename(inputPath)}`);
    console.log(`   Original: ${metadata.width}x${metadata.height} (${metadata.format})`);

    let pipeline = image;

    // Resize if needed
    if (config.width || config.height) {
      pipeline = pipeline.resize(config.width, config.height, {
        fit: 'cover',
        position: 'center',
      });
    } else if (metadata.width > MAX_WIDTH) {
      pipeline = pipeline.resize(MAX_WIDTH, null, {
        withoutEnlargement: true,
      });
    }

    // Convert to WebP and save
    const webpPath = outputPath.replace(/\.(jpe?g|png)$/i, '.webp');
    await pipeline.webp({quality: config.quality || QUALITY}).toFile(webpPath);

    const webpStats = fs.statSync(webpPath);
    const originalStats = fs.statSync(inputPath);
    const savings = ((1 - webpStats.size / originalStats.size) * 100).toFixed(1);

    console.log(`   ✅ WebP: ${config.width || 'auto'}x${config.height || 'auto'}`);
    console.log(`   💾 Size: ${(originalStats.size / 1024).toFixed(0)}KB → ${(webpStats.size / 1024).toFixed(0)}KB (${savings}% smaller)`);

    // Also save optimized JPEG as fallback
    const jpegPath = outputPath.replace(/\.webp$/i, '.jpg');
    await sharp(inputPath)
      .resize(config.width, config.height, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({quality: config.quality || QUALITY, progressive: true})
      .toFile(jpegPath);

    console.log(`   ✅ JPEG fallback created`);
  } catch (error) {
    console.error(`   ❌ Error optimizing ${path.basename(inputPath)}:`, error.message);
  }
}

async function optimizeAllImages() {
  console.log('🚀 Starting image optimization...\n');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  }

  const files = fs.readdirSync(IMAGES_DIR);
  const imageFiles = files.filter((file) => /\.(jpe?g|png)$/i.test(file) && !file.startsWith('.'));

  console.log(`📁 Found ${imageFiles.length} images to optimize\n`);

  for (const file of imageFiles) {
    const inputPath = path.join(IMAGES_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, file);
    const config = IMAGE_CONFIGS[file] || {};

    await optimizeImage(inputPath, outputPath, config);
  }

  console.log('\n\n✨ Optimization complete!');
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Review optimized images in: public/images/optimized/`);
  console.log(`   2. Replace original images with optimized versions`);
  console.log(`   3. Update NuxtImg components to use WebP with JPEG fallback`);
  console.log(`   4. Test the site to ensure images load correctly\n`);
}

// Run optimization
optimizeAllImages().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
