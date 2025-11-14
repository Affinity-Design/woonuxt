# Blog Image Generator Tool

Automatically generate AI-powered images for blog posts using Google Gemini Imagen API.

## Setup (One-Time)

1. **API Key Already Configured** ✅

   - Your Google AI API key is stored in `.env.local` (git-ignored)
   - This file is LOCAL ONLY and will NOT be committed to the repository

2. **Install Dependencies** (if needed)
   ```bash
   npm install
   ```

## Usage

### Basic Usage

Generate an image based on your blog post keyword:

```bash
node scripts/generate-blog-image.js "roller skates near me"
```

This will:

- Generate an AI image based on the keyword
- Auto-create filename: `roller-skates-near-me.jpg`
- Save to `/public/images/`
- Display the path to use in your blog post

### Specify Custom Filename

```bash
node scripts/generate-blog-image.js "roller skates near me" --output where-to-buy-roller-skates.jpg
```

### Save Directly to Posted Folder

```bash
node scripts/generate-blog-image.js "best inline skates 2025" --posted
```

Saves to `/public/images/blog/posted/` instead of `/public/images/`

### Custom Image Prompt

```bash
node scripts/generate-blog-image.js "toronto skating" --prompt "Toronto skyline with roller skates in foreground, sunset lighting, professional photography"
```

### Use Free Alternative (Unsplash)

If you want to use stock photos instead of AI generation:

```bash
node scripts/generate-blog-image.js "roller skates" --method unsplash
```

**Note:** You'll need to sign up for a free Unsplash API key and add it to `.env.local`:

```
UNSPLASH_ACCESS_KEY=your_key_here
```

## Workflow Integration

### For New Blog Posts

1. **Write your blog post** following the guidelines
2. **Generate the image:**
   ```bash
   node scripts/generate-blog-image.js "your keyword here"
   ```
3. **Copy the output path** and paste into your blog post frontmatter:
   ```markdown
   ---
   title: 'Your Post Title'
   image: '/images/your-keyword-here.jpg'
   ogImage: '/images/your-keyword-here.jpg'
   ---
   ```
4. **After publishing**, move the image:
   ```bash
   move public\images\your-keyword-here.jpg public\images\blog\posted\
   ```
5. **Update the blog post** with new path:
   ```markdown
   image: "/images/blog/posted/your-keyword-here.jpg"
   ```

### Quick Example

```bash
# Generate image for "roller skates near me" post
node scripts/generate-blog-image.js "roller skates near me"

# Output will show:
# ✨ Success! Image ready to use.
#
# Add to your blog post frontmatter:
# ---
# image: '/images/roller-skates-near-me.jpg'
# ogImage: '/images/roller-skates-near-me.jpg'
# ---
```

## Troubleshooting

### "GOOGLE_AI_API_KEY environment variable is not set"

Make sure `.env.local` exists in the project root with your API key.

### "Gemini API error: 403"

Your API key may be invalid or you've hit rate limits. Check your Google AI Studio dashboard.

### "No image data returned"

The prompt may have triggered safety filters. Try a more generic prompt or use `--method unsplash`.

## Image Specifications

Generated images are optimized for blog posts:

- **Size:** 1200x630px (perfect for Open Graph social sharing)
- **Format:** JPG
- **Quality:** 85%
- **Aspect Ratio:** 16:9 (great for blog headers)

## Command Reference

```bash
# Basic generation
node scripts/generate-blog-image.js "<keyword>"

# With options
node scripts/generate-blog-image.js "<keyword>" [options]

Options:
  --output <filename>      Custom output filename
  --prompt <text>          Custom AI generation prompt
  --posted                 Save to /images/blog/posted/ folder
  --method <api>           API to use: gemini, unsplash
  --help                   Show help message
```

## Cost & Rate Limits

**Google Gemini Imagen:**

- Check your Google AI Studio dashboard for pricing
- Free tier typically includes limited requests per month
- Development use should stay within free limits

**Unsplash (Free Alternative):**

- 50 requests per hour (free tier)
- Unlimited downloads
- Must credit photographer (done automatically)

## Security Notes

- ✅ `.env.local` is git-ignored (API keys stay local)
- ✅ API keys never committed to repository
- ✅ Safe for local development only
- ⚠️ Never share your `.env.local` file
- ⚠️ Never commit API keys to GitHub

## Future Enhancements

Possible additions:

- [ ] Pexels API integration
- [ ] Batch generation for multiple keywords
- [ ] Automatic image optimization/compression
- [ ] Style presets (photographic, illustrated, abstract)
- [ ] Automatic blog post frontmatter updating

---

**Created:** November 13, 2025  
**For:** ProSkaters Place Blog Development  
**Status:** Ready to Use ✅
