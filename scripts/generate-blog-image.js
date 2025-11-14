/**
 * Generate Blog Post Images using Google Gemini Imagen API
 *
 * This script generates images for blog posts using AI and saves them
 * to the appropriate folder following our naming conventions.
 *
 * Usage:
 *   node scripts/generate-blog-image.js "roller skates near me" --output roller-skates-near-me.jpg
 *   node scripts/generate-blog-image.js "best inline skates" --prompt "professional inline skates on a track"
 *
 * Environment Variables Required:
 *   GOOGLE_AI_API_KEY - Your Google AI Studio API key
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }
}

loadEnv();

// Configuration
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

// Image settings optimized for blog posts
const IMAGE_CONFIG = {
  width: 1200,
  height: 630, // Perfect for OG images (1.91:1 ratio)
  format: 'jpg',
  quality: 85,
};

/**
 * Make HTTPS request (replacement for fetch)
 * @param {string} url - The URL to request
 * @param {object} options - Request options
 * @returns {Promise<{data: any, buffer: Buffer}>}
 */
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
          // Try to parse as JSON, otherwise return buffer
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

/**
 * Convert keyword to filename with dashes
 * @param {string} keyword - The keyword phrase
 * @returns {string} - Filename with dashes
 */
function keywordToFilename(keyword) {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Remove duplicate dashes
    .trim();
}

/**
 * Generate an optimized prompt for blog post images
 * @param {string} keyword - The target keyword
 * @param {string} customPrompt - Optional custom prompt
 * @returns {string} - Optimized AI prompt
 */
function generatePrompt(keyword, customPrompt) {
  if (customPrompt) {
    return customPrompt;
  }

  // Auto-generate a good prompt based on keyword
  const basePrompt = `Professional, high-quality photograph for a blog post about "${keyword}". 
    Clean, modern composition with good lighting. 
    Suitable for a Canadian skating equipment website. 
    No text or watermarks in the image. 
    Photorealistic style, suitable for e-commerce and editorial use.`;

  // Add specific styling based on keyword content
  if (keyword.includes('toronto') || keyword.includes('canada')) {
    return basePrompt + ' Include Canadian elements or settings where appropriate.';
  }

  if (keyword.includes('beginner') || keyword.includes('learn')) {
    return basePrompt + ' Show approachable, friendly scene suitable for beginners.';
  }

  if (keyword.includes('professional') || keyword.includes('pro')) {
    return basePrompt + ' Show high-performance, professional-grade equipment in action.';
  }

  return basePrompt;
}

/**
 * Call Google Gemini API to generate image
 * @param {string} prompt - The image generation prompt
 * @returns {Promise<Buffer>} - Image data as buffer
 */
async function generateImageWithGemini(prompt) {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  }

  console.log('🎨 Generating image with Google Gemini (gemini-2.5-flash-image)...');
  console.log(`📝 Prompt: ${prompt}`);

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

  try {
    const url = `${GEMINI_API_ENDPOINT}?key=${GOOGLE_AI_API_KEY}`;
    const {data} = await httpsRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!data) {
      throw new Error('No response from Gemini API');
    }

    // Check for errors
    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Extract image from response
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      console.error('API Response:', JSON.stringify(data, null, 2));
      throw new Error('No image data in response');
    }

    // Find the image part
    let imageBase64 = null;
    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        imageBase64 = part.inlineData.data;
        break;
      }
    }

    if (!imageBase64) {
      console.error('API Response:', JSON.stringify(data, null, 2));
      throw new Error('No image data found in response parts');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    console.log('✅ Image generated successfully!');
    console.log(`📏 Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    return imageBuffer;
  } catch (error) {
    console.error('❌ Error generating image:', error.message);
    throw error;
  }
}

/**
 * Alternative: Use a free API like Unsplash or Pexels
 * @param {string} keyword - Search keyword
 * @returns {Promise<Buffer>} - Image data
 */
async function generateImageWithUnsplash(keyword) {
  const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error('UNSPLASH_ACCESS_KEY environment variable is not set');
  }

  console.log('🖼️  Fetching image from Unsplash...');

  const searchUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keyword)}&orientation=landscape&client_id=${UNSPLASH_ACCESS_KEY}`;

  try {
    const {data} = await httpsRequest(searchUrl);

    if (!data || !data.urls || !data.urls.full) {
      throw new Error('No suitable image found on Unsplash');
    }

    console.log(`📥 Downloading from: ${data.urls.full}`);

    const {buffer} = await httpsRequest(data.urls.full);

    console.log('✅ Image downloaded successfully!');
    console.log(`📸 Photo by ${data.user.name} on Unsplash`);

    return buffer;
  } catch (error) {
    console.error('❌ Error fetching from Unsplash:', error.message);
    throw error;
  }
}

/**
 * Save image to the images folder
 * @param {Buffer} imageBuffer - Image data
 * @param {string} filename - Output filename
 * @param {boolean} posted - Save to posted folder directly
 */
function saveImage(imageBuffer, filename, posted = false) {
  const projectRoot = path.resolve(__dirname, '..');
  const imagesDir = posted ? path.join(projectRoot, 'public', 'images', 'blog', 'posted') : path.join(projectRoot, 'public', 'images');

  // Ensure directory exists
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, {recursive: true});
  }

  const outputPath = path.join(imagesDir, filename);

  fs.writeFileSync(outputPath, imageBuffer);

  console.log(`💾 Image saved to: ${outputPath}`);
  console.log(`📁 Relative path: /images/${posted ? 'blog/posted/' : ''}${filename}`);

  return outputPath;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📸 Blog Image Generator - ProSkaters Place

Usage:
  node scripts/generate-blog-image.js <keyword> [options]

Options:
  --output <filename>      Specify output filename (auto-generated if not provided)
  --prompt <text>          Custom image generation prompt
  --posted                 Save directly to /images/blog/posted/ folder
  --method <api>           API to use: gemini (default), unsplash, pexels
  
Examples:
  node scripts/generate-blog-image.js "roller skates near me"
  node scripts/generate-blog-image.js "best inline skates" --output best-inline-skates-2025.jpg
  node scripts/generate-blog-image.js "toronto roller skating" --posted
  node scripts/generate-blog-image.js "kids skates" --method unsplash

Environment Variables:
  GOOGLE_AI_API_KEY        Required for Gemini Imagen
  UNSPLASH_ACCESS_KEY      Required for Unsplash (free alternative)
  PEXELS_API_KEY           Required for Pexels (free alternative)
    `);
    process.exit(0);
  }

  // Parse arguments
  const keyword = args[0];
  const outputIndex = args.indexOf('--output');
  const promptIndex = args.indexOf('--prompt');
  const methodIndex = args.indexOf('--method');
  const posted = args.includes('--posted');

  const filename = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : `${keywordToFilename(keyword)}.png`;

  const customPrompt = promptIndex !== -1 && args[promptIndex + 1] ? args[promptIndex + 1] : null;

  const method = methodIndex !== -1 && args[methodIndex + 1] ? args[methodIndex + 1] : 'gemini';

  console.log('');
  console.log('🚀 Starting Blog Image Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎯 Keyword: "${keyword}"`);
  console.log(`📝 Filename: ${filename}`);
  console.log(`🔧 Method: ${method}`);
  console.log(`📂 Save to posted: ${posted ? 'Yes' : 'No'}`);
  console.log('');

  try {
    let imageBuffer;

    // Generate image based on selected method
    switch (method.toLowerCase()) {
      case 'gemini':
      case 'imagen':
        const prompt = generatePrompt(keyword, customPrompt);
        imageBuffer = await generateImageWithGemini(prompt);
        break;

      case 'unsplash':
        imageBuffer = await generateImageWithUnsplash(keyword);
        break;

      case 'pexels':
        throw new Error('Pexels integration not yet implemented. Use --method unsplash or --method gemini');

      default:
        throw new Error(`Unknown method: ${method}. Use: gemini, unsplash`);
    }

    // Save the image
    const savedPath = saveImage(imageBuffer, filename, posted);

    console.log('');
    console.log('✨ Success! Image ready to use.');
    console.log('');
    console.log('Add to your blog post frontmatter:');
    console.log('---');
    console.log(`image: '/images/${posted ? 'blog/posted/' : ''}${filename}'`);
    console.log(`ogImage: '/images/${posted ? 'blog/posted/' : ''}${filename}'`);
    console.log('---');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

// Run the script
main();
