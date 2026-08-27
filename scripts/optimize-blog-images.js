/**
 * Convert every local blog hero referenced in frontmatter to WebP.
 *
 * The 1024px asset serves article heroes and Open Graph previews. The 640px
 * sibling serves cards through srcset. Existing source originals stay intact.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const blogContentDirectory = path.join(projectRoot, 'content', 'blog');
const publicDirectory = path.join(projectRoot, 'public');
const localImagePattern = /^(?:image|ogImage):\s*['"](\/images\/[^'"]+\.(?:png|jpe?g))['"]/gim;

function findReferencedBlogImages() {
  const referencedImages = new Set();

  for (const blogDirectoryName of fs.readdirSync(blogContentDirectory)) {
    const postPath = path.join(blogContentDirectory, blogDirectoryName, 'index.md');
    if (!fs.existsSync(postPath)) continue;

    const postContent = fs.readFileSync(postPath, 'utf8');
    for (const match of postContent.matchAll(localImagePattern)) referencedImages.add(match[1]);
  }

  return [...referencedImages].sort();
}

function updateFrontmatterImageReferences() {
  for (const blogDirectoryName of fs.readdirSync(blogContentDirectory)) {
    const postPath = path.join(blogContentDirectory, blogDirectoryName, 'index.md');
    if (!fs.existsSync(postPath)) continue;

    const originalPostContent = fs.readFileSync(postPath, 'utf8');
    const updatedPostContent = originalPostContent.replace(localImagePattern, (frontmatterLine, imagePath) => {
      const optimizedPublicPath = buildOutputPath(imagePath);
      const optimizedFilePath = path.join(publicDirectory, optimizedPublicPath.replace(/^\//, ''));
      return fs.existsSync(optimizedFilePath) ? frontmatterLine.replace(imagePath, optimizedPublicPath) : frontmatterLine;
    });

    if (updatedPostContent !== originalPostContent) fs.writeFileSync(postPath, updatedPostContent);
  }
}

function buildOutputPath(sourcePath, suffix = '') {
  return sourcePath.replace(/\.(?:png|jpe?g)$/i, `${suffix}.webp`);
}

async function writeWebpVariant(sourcePath, outputPath, maximumWidth) {
  await sharp(sourcePath).rotate().resize({width: maximumWidth, withoutEnlargement: true}).webp({quality: 78, effort: 5}).toFile(outputPath);
}

async function optimizeReferencedBlogImages() {
  const referencedImages = findReferencedBlogImages();
  let originalBytes = 0;
  let optimizedBytes = 0;

  for (const publicImagePath of referencedImages) {
    const sourcePath = path.join(publicDirectory, publicImagePath.replace(/^\//, ''));
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing blog image: ${publicImagePath}`);

    const heroOutputPath = buildOutputPath(sourcePath);
    const cardOutputPath = buildOutputPath(sourcePath, '-640');
    await writeWebpVariant(sourcePath, heroOutputPath, 1024);
    await writeWebpVariant(sourcePath, cardOutputPath, 640);

    originalBytes += fs.statSync(sourcePath).size;
    optimizedBytes += fs.statSync(heroOutputPath).size;
  }

  updateFrontmatterImageReferences();

  const savedPercentage = originalBytes ? Math.round((1 - optimizedBytes / originalBytes) * 100) : 0;
  console.log(`Optimized ${referencedImages.length} blog heroes: ${savedPercentage}% smaller at 1024px.`);
}

optimizeReferencedBlogImages().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
