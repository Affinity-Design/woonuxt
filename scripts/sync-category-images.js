/**
 * Sync Category Images
 *
 * - Matches category slugs to existing images in public/images/optimized
 * - Generates missing images via Gemini (GOOGLE_AI_API_KEY)
 * - Crops each image to a perfect square and saves to public/images/psp.com
 * - Uploads each square image to WordPress and sets it as the category image
 *
 * Usage:
 *   node scripts/sync-category-images.js
 *   node scripts/sync-category-images.js --dry-run
 *   node scripts/sync-category-images.js --skip-upload
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const fetch = global.fetch || require('node-fetch');

const ROOT = path.join(__dirname, '..');
const CATEGORY_FILE = path.join(ROOT, 'data', 'catagoy.json');
const OPTIMIZED_DIR = path.join(ROOT, 'public', 'images', 'optimized');
const OUTPUT_DIR = path.join(ROOT, 'public', 'images', 'psp.com');

const IMAGE_QUALITY = 85;
const SQUARE_SIZE = 1024;

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_UPLOAD = process.argv.includes('--skip-upload') || DRY_RUN;

function loadEnv() {
  const envFiles = ['.env.local', '.env'];

  envFiles.forEach((file) => {
    const envPath = path.join(ROOT, file);
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            if (!process.env[key.trim()]) {
              process.env[key.trim()] = valueParts.join('=').trim();
            }
          }
        }
      });
    }
  });
}

loadEnv();

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const LIVE_SITE = process.env.LIVE_site;
const LIVE_AUTH_KEY = process.env.LIVE_AuthKey;
const LIVE_USERNAME = process.env.LIVE_USERNAME || 'proskatersplace.ca';
const CK_LIVE = process.env.CK_LIVE;
const SC_LIVE = process.env.SC_LIVE;

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

function ensureRequiredEnv() {
  if (!LIVE_SITE) {
    throw new Error('LIVE_site is not set in .env');
  }
  if (!CK_LIVE || !SC_LIVE) {
    throw new Error('CK_LIVE and SC_LIVE are required for WooCommerce API');
  }
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('FormData/Blob not available. Use Node 18+ with fetch enabled.');
  }
  if (!SKIP_UPLOAD && !LIVE_AUTH_KEY) {
    console.warn('⚠️ LIVE_AuthKey is missing. Media upload may fail if the server requires Bearer auth.');
  }
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function removeStopWords(value) {
  const stopWords = new Set(['and', 'for', 'the', 'of', 'to', 'with']);
  return value
    .split('-')
    .filter((part) => part && !stopWords.has(part))
    .join('-');
}

function getNameVariants(value) {
  const normalized = normalizeName(value);
  const noStop = removeStopWords(normalized);
  return Array.from(new Set([normalized, noStop].filter(Boolean)));
}

function getAuthHeaderBasic() {
  const token = Buffer.from(`${CK_LIVE}:${SC_LIVE}`).toString('base64');
  return `Basic ${token}`;
}

function getWpMediaAuthHeader() {
  if (!LIVE_AUTH_KEY) {
    return null;
  }
  const token = Buffer.from(`${LIVE_USERNAME}:${LIVE_AUTH_KEY}`).toString('base64');
  return `Basic ${token}`;
}

function getAuthHeaderBearer() {
  return LIVE_AUTH_KEY ? `Bearer ${LIVE_AUTH_KEY}` : null;
}

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const buffer = Buffer.concat(chunks);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (res.headers['content-type']?.includes('application/json')) {
            try {
              const data = JSON.parse(buffer.toString());
              resolve({data, buffer});
            } catch (e) {
              resolve({data: null, buffer});
            }
          } else {
            resolve({data: null, buffer});
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

async function generateImageWithGemini(slug) {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  }

  const keyword = slug.replace(/-/g, ' ');
  const prompt = `Professional, high-quality square product category image for "${keyword}". Clean, modern composition with good lighting. Photorealistic style suitable for e-commerce. No text or watermarks. Square framing.`;

  console.log(`🎨 Generating image for ${slug}...`);

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      response_modalities: ['TEXT', 'IMAGE'],
    },
  };

  const url = `${GEMINI_API_ENDPOINT}?key=${GOOGLE_AI_API_KEY}`;
  const {data} = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const imagePart = data?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
  if (!imagePart) {
    throw new Error('No image data returned from Gemini');
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
  return imageBuffer;
}

function getImageMap() {
  const files = fs.readdirSync(OPTIMIZED_DIR);
  const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const extPriority = {'.jpg': 3, '.jpeg': 3, '.png': 2, '.webp': 1};
  const map = new Map();

  files
    .filter((file) => allowedExt.has(path.extname(file).toLowerCase()))
    .forEach((file) => {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, ext);
      const variants = getNameVariants(base);

      variants.forEach((variant) => {
        const existing = map.get(variant);
        if (!existing || extPriority[ext] > extPriority[existing.ext]) {
          map.set(variant, {file, ext});
        }
      });
    });

  return map;
}

function findBestMatch(slug, imageMap) {
  const variants = getNameVariants(slug);
  for (const variant of variants) {
    if (imageMap.has(variant)) {
      return imageMap.get(variant).file;
    }
  }
  return null;
}

async function ensureSquareImage(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(SQUARE_SIZE, SQUARE_SIZE, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({quality: IMAGE_QUALITY, progressive: true})
    .toFile(outputPath);
}

async function uploadMedia(filePath, slug) {
  const buffer = fs.readFileSync(filePath);
  const fileName = `${slug}.jpg`;
  const form = new FormData();
  form.append('file', new Blob([buffer], {type: 'image/jpeg'}), fileName);
  form.append('title', slug.replace(/-/g, ' '));
  form.append('alt_text', slug.replace(/-/g, ' '));

  const url = `${LIVE_SITE.replace(/\/$/, '')}/wp-json/wp/v2/media`;
  const mediaAuth = getWpMediaAuthHeader();
  const fallbackAuth = getAuthHeaderBearer();

  const headers = mediaAuth ? {Authorization: mediaAuth} : fallbackAuth ? {Authorization: fallbackAuth} : {};

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
  });

  if (response.status === 401 || response.status === 403) {
    const fallbackHeaders = mediaAuth ? {Authorization: fallbackAuth} : {Authorization: mediaAuth};
    if (fallbackHeaders.Authorization) {
      response = await fetch(url, {
        method: 'POST',
        headers: fallbackHeaders,
        body: form,
      });
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Media upload failed: ${response.status} ${errorText}`);
  }

  const media = await response.json();
  return media?.id;
}

async function updateCategoryImage(categoryId, mediaId) {
  const url = `${LIVE_SITE.replace(/\/$/, '')}/wp-json/wc/v3/products/categories/${categoryId}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeaderBasic(),
    },
    body: JSON.stringify({
      image: {
        id: mediaId,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Category update failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function main() {
  ensureRequiredEnv();

  if (!fs.existsSync(CATEGORY_FILE)) {
    throw new Error(`Category file not found: ${CATEGORY_FILE}`);
  }

  if (!fs.existsSync(OPTIMIZED_DIR)) {
    throw new Error(`Optimized images folder not found: ${OPTIMIZED_DIR}`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  }

  const categories = JSON.parse(fs.readFileSync(CATEGORY_FILE, 'utf8'));
  const imageMap = getImageMap();

  console.log(`📦 Categories found: ${categories.length}`);
  console.log(`🖼️  Optimized images scanned: ${imageMap.size}`);

  const results = [];

  for (const category of categories) {
    const slug = category.slug;
    const categoryId = category.id;

    console.log(`\n➡️  Processing ${slug} (ID: ${categoryId})`);

    let matchedFile = findBestMatch(slug, imageMap);
    let inputPath;

    if (!matchedFile) {
      console.log('⚠️  No matching image found. Generating...');
      if (DRY_RUN) {
        console.log('🧪 Dry run: skipping generation');
      } else {
        const buffer = await generateImageWithGemini(slug);
        const generatedPath = path.join(OPTIMIZED_DIR, `${slug}.jpg`);
        fs.writeFileSync(generatedPath, buffer);
        matchedFile = `${slug}.jpg`;
        imageMap.set(normalizeName(slug), {file: matchedFile, ext: '.jpg'});
        console.log(`✅ Generated image saved: ${generatedPath}`);
      }
    }

    if (!matchedFile) {
      console.log('❌ Skipping (no image available)');
      results.push({slug, categoryId, status: 'skipped', reason: 'no-image'});
      continue;
    }

    inputPath = path.join(OPTIMIZED_DIR, matchedFile);
    const outputPath = path.join(OUTPUT_DIR, `${slug}.jpg`);

    if (!DRY_RUN) {
      await ensureSquareImage(inputPath, outputPath);
      console.log(`✅ Square image created: ${outputPath}`);
    } else {
      console.log('🧪 Dry run: skipping square crop');
    }

    if (!SKIP_UPLOAD) {
      const mediaId = await uploadMedia(outputPath, slug);
      console.log(`✅ Uploaded media ID: ${mediaId}`);
      await updateCategoryImage(categoryId, mediaId);
      console.log('✅ Category image updated');
    } else {
      console.log('⏭️  Upload skipped');
    }

    results.push({slug, categoryId, status: 'ok', image: matchedFile});
  }

  console.log('\n✨ Done');
  const missing = results.filter((item) => item.status !== 'ok');
  if (missing.length) {
    console.log(`⚠️  ${missing.length} categories skipped or failed`);
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
