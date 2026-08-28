/**
 * Import the visually approved category images into the frontend.
 *
 * Usage:
 *   node scripts/import-category-images.js
 *   node scripts/import-category-images.js --verify-only
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PROJECT_ROOT = path.join(__dirname, '..');
const SOURCE_MANIFEST_PATH = path.join(PROJECT_ROOT, 'data', 'category-image-sources.json');
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'public', 'images', 'psp.com');
const IMAGE_SIZE = 1024;
const IMAGE_QUALITY = 85;
const VERIFY_ONLY = process.argv.includes('--verify-only');
const sourceDirectoryArgument = process.argv.find((argument) => argument.startsWith('--source-directory='));
const SOURCE_DIRECTORY = sourceDirectoryArgument ? path.resolve(sourceDirectoryArgument.split('=').slice(1).join('=')) : null;

function loadCategoryImageSources() {
  if (!fs.existsSync(SOURCE_MANIFEST_PATH)) {
    throw new Error(`Category image manifest not found: ${SOURCE_MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
    throw new Error('Category image manifest does not contain any categories');
  }

  return manifest.categories;
}

async function loadSourceImageBuffer(category) {
  if (SOURCE_DIRECTORY) {
    const supportedExtensions = ['webp', 'jpg', 'jpeg', 'png'];
    const sourcePath = supportedExtensions.map((extension) => path.join(SOURCE_DIRECTORY, `${category.slug}.${extension}`)).find(fs.existsSync);

    if (!sourcePath) {
      throw new Error(`Approved source image not found for ${category.slug} in ${SOURCE_DIRECTORY}`);
    }

    return fs.readFileSync(sourcePath);
  }

  const response = await fetch(category.sourceUrl);
  if (!response.ok) {
    throw new Error(`Image download failed for ${category.slug}: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Image download returned ${contentType || 'an unknown content type'} for ${category.slug}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function importCategoryImage(category) {
  const sourceImageBuffer = await loadSourceImageBuffer(category);
  const outputPath = path.join(OUTPUT_DIRECTORY, `${category.slug}.jpg`);

  await sharp(sourceImageBuffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({quality: IMAGE_QUALITY, progressive: true})
    .toFile(outputPath);

  console.log(`Imported ${category.slug}`);
}

async function verifyImportedImages(categories) {
  const failures = [];

  for (const category of categories) {
    const imagePath = path.join(OUTPUT_DIRECTORY, `${category.slug}.jpg`);
    if (!fs.existsSync(imagePath)) {
      failures.push(`${category.slug}: missing file`);
      continue;
    }

    const metadata = await sharp(imagePath).metadata();
    if (metadata.format !== 'jpeg' || metadata.width !== IMAGE_SIZE || metadata.height !== IMAGE_SIZE) {
      failures.push(`${category.slug}: expected a ${IMAGE_SIZE}x${IMAGE_SIZE} JPEG`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Category image verification failed:\n${failures.join('\n')}`);
  }

  console.log(`Verified ${categories.length} category images`);
}

async function main() {
  const categories = loadCategoryImageSources();
  fs.mkdirSync(OUTPUT_DIRECTORY, {recursive: true});

  if (!VERIFY_ONLY) {
    for (const category of categories) {
      await importCategoryImage(category);
    }
  }

  await verifyImportedImages(categories);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
