# Blog System Architecture - WooNuxt Blog

## Overview

This blog system is built using **Nuxt 3** with **@nuxt/content** for file-based content management, deployed on **Cloudflare Pages**. It provides clean URLs, full-text search, automatic SEO optimization, and a modern responsive design.

## 🏗️ Architecture Components

### Core Technologies

- **Nuxt 3** - Vue.js framework for server-side rendering
- **@nuxt/content v2** - File-based CMS with markdown support
- **Vue 3 Composition API** - Component logic and state management
- **Tailwind CSS** - Utility-first styling framework
- **TypeScript** - Type safety and better developer experience

### Key Features

- ✅ **Clean URLs** - Posts accessible at `/post-slug` (no `/blog/` prefix)
- ✅ **File-based Content** - Markdown files with frontmatter metadata
- ✅ **Automatic SEO** - Meta tags, Open Graph, Twitter Cards
- ✅ **Responsive Design** - Mobile-first responsive layouts
- ✅ **Table of Contents** - Auto-generated from headings
- ✅ **Related Posts** - Automatic category-based recommendations
- ✅ **Product Integration** - CategoryCard components for e-commerce
- ✅ **Search & Filtering** - Category-based filtering on archive page

## 📁 File Structure

```
content/
└── blog/
    ├── best-inline-skates-2025/
    │   └── index.md
    ├── roller-skating-toronto-guide/
    │   └── index.md
    └── skate-maintenance-winter/
        └── index.md

pages/
├── blog/
│   └── index.vue          # Blog archive page
└── [...slug].vue          # Catch-all route for blog posts

components/
└── BlogPost.vue           # Main blog post component

nuxt.config.ts             # Configuration with @nuxt/content
```

## 🚀 How It Works

### 1. Content Management

Blog posts are stored as markdown files in `content/blog/[post-slug]/index.md` with frontmatter metadata:

```markdown
---
title: 'Post Title'
description: 'Post description for SEO'
category: 'Product Reviews'
date: 2025-06-30
author: 'Author Name'
authorBio: 'Author bio'
image: '/images/post-image.jpg'
ogImage: '/images/post-image.jpg'
tags: ['tag1', 'tag2']
---

# Post Content Here
```

### 2. Routing System

- **Blog Archive**: `/blog` → `pages/blog/index.vue`
- **Individual Posts**: `/post-slug` → `pages/[...slug].vue` → `BlogPost.vue`
- **Clean URLs**: Posts are accessible without `/blog/` prefix

### 3. Post Rendering Flow

1. User visits `/post-slug`
2. `[...slug].vue` catches the route
3. Queries content using `queryContent("blog").where({ _path: { $contains: slug } })`
4. If blog post found, renders `BlogPost.vue` component
5. If not found, shows 404 error

### 4. Blog Post Component Features

- **Two-column layout** (3fr article + 1fr sidebar on desktop)
- **Responsive design** (single column on mobile)
- **Sticky Table of Contents** (desktop only)
- **Recommended article card** (from same category)
- **Shop by Category section** (e-commerce integration)
- **Related posts section** (bottom of page)
- **Author information** (if provided)

## 🛠️ Configuration

### Nuxt Config (`nuxt.config.ts`)

```typescript
export default defineNuxtConfig({
  modules: ['@nuxt/content'],
  content: {
    // Content module configuration
  },
  routeRules: {
    '/blog': {prerender: true},
    // Individual blog posts prerendered automatically
  },
});
```

### Content Queries

```typescript
// Get all posts for archive
const {data: posts} = await useAsyncData('blog-posts', () => queryContent('blog').sort({date: -1}).find());

// Get single post
const {data: post} = await useAsyncData(`blog-${slug}`, () =>
  queryContent('blog')
    .where({_path: {$contains: slug}})
    .findOne(),
);

// Get related posts
const {data: relatedPosts} = await useAsyncData(`related-${slug}`, () =>
  queryContent('blog')
    .where({
      category: post.value?.category,
      _path: {$ne: post.value?._path},
    })
    .sort({date: -1})
    .limit(3)
    .find(),
);
```

## 📝 Blog Writing Rules & Guidelines

### RULE 1: Keyword Selection from CSV

**CRITICAL:** Only use keywords from the official keyword list CSV file.

**Keyword List Location:** `data/seo_Keywordlist.csv`

**Process:**

1. **Review Available Keywords**

   - Open `data/seo_Keywordlist.csv`
   - Find keywords with high search volume (sv) and low difficulty (kd)
   - Prioritize keywords with commercial/transactional intent
   - Consider CPC (cost per click) for commercial value

2. **Select Target Keyword**

   ```csv
   Example from CSV:
   - "inline skates" (3600 sv, 55 kd, $0.42 cpc)
   - "roller skates near me" (5400 sv, 0 kd, $1.09 cpc)
   - "toronto roller skating" (2900 sv, 13 kd, $1.31 cpc)
   ```

3. **Track Keyword Usage**
   - Create/update `data/blog-keywords-used.md` checklist
   - Mark keyword as used with blog post URL
   - Date when keyword was used
   - Prevent keyword cannibalization (same keyword on multiple posts)

**Keyword Usage Checklist Format:**

```markdown
# Blog Keywords Used - Tracking

Last Updated: 2025-11-13

## Used Keywords

- [x] **inline skates canada** (390 sv, 31 kd)

  - Post: `/blog/best-inline-skates-canada-2025`
  - Date: 2025-11-10
  - Status: Published

- [x] **roller skates for beginners** (estimated 14.8k sv)

  - Post: `/blog/complete-beginners-guide-inline-quad-skating`
  - Date: 2025-11-10
  - Status: Published

- [x] **how to skate backwards** (Featured snippet opportunity)
  - Post: `/blog/how-to-skate-backwards-tutorial`
  - Date: 2025-11-10
  - Status: Published

## Available Keywords (Not Yet Used)

- [ ] **roller skates near me** (5400 sv, 0 kd, $1.09 cpc)
- [ ] **toronto roller skating** (2900 sv, 13 kd, $1.31 cpc)
- [ ] **skate store toronto** (880 sv, 14 kd, $0.36 cpc)
- [ ] **inline skates** (3600 sv, 55 kd, $0.42 cpc)
- [ ] **roller skates for women** (480 sv, 0 kd, $0.42 cpc)
```

**Before Writing:**

- ✅ Check keyword is available in CSV
- ✅ Verify keyword not already used in another post
- ✅ Update checklist marking keyword as "in progress"
- ✅ After publishing, mark as "published" with post URL

### RULE 2: Internal Linking from Sitemap

**CRITICAL:** Use `data/sitemap-data.json` for all internal links.

**Sitemap Location:** `data/sitemap-data.json`

**Available Link Types:**

```json
{
  "routes": [
    // Static pages
    {"url": "/", "type": "static"},
    {"url": "/blog", "type": "static"},
    {"url": "/categories", "type": "static"},
    {"url": "/products", "type": "static"},
    {"url": "/contact", "type": "static"},

    // Blog posts
    {"url": "/blog/best-inline-skates-2025", "type": "blog"},
    {"url": "/blog/roller-skating-toronto-guide", "type": "blog"},

    // Product categories
    {"url": "/product-category/inline-skates", "type": "category"},
    {"url": "/product-category/roller-skates", "type": "category"},
    {"url": "/product-category/protective-helmets", "type": "category"},

    // Products
    {"url": "/product/product-slug", "type": "product"}
  ]
}
```

**Linking Strategy:**

1. **Link to Relevant Product Categories**

   ```markdown
   Check out our [inline skates collection](/product-category/inline-skates).
   Browse [protective gear](/product-category/protection-gear-and-apparel).
   ```

2. **Link to Specific Products** (when relevant)

   ```markdown
   We recommend the [FR Neo 2 skates](/product/fr-neo-2-80-black-inline-skates).
   ```

3. **Link to Related Blog Posts**

   ```markdown
   Learn more in our [beginner's guide](/blog/complete-beginners-guide-inline-quad-skating).
   ```

4. **Internal Link Requirements**
   - **Minimum 5-10 internal links per post**
   - Link to at least 2-3 product categories
   - Link to 1-2 related blog posts
   - Use descriptive anchor text (not "click here")
   - Open product links in same tab (blog links in same tab)

**How to Find Links:**

```javascript
// Parse sitemap-data.json
const sitemap = JSON.parse(fs.readFileSync('data/sitemap-data.json'));

// Filter by type
const blogPosts = sitemap.routes.filter((r) => r.type === 'blog');
const categories = sitemap.routes.filter((r) => r.type === 'category');
const products = sitemap.routes.filter((r) => r.type === 'product');

// Search for relevant links
const skateCategories = categories.filter((c) => c.url.includes('skate') || c.url.includes('roller'));
```

### RULE 3: Writing Guidelines

#### Word Count

- **Target:** 1,000 - 2,500 words total
- **Method:** Write in 500-word sections at a time
- **Paragraph Length:** Maximum 120 words per paragraph
- **Why:** Improves readability and reduces cognitive load

#### Forbidden Words/Phrases

**NEVER USE:**

- ❌ "Introduction"
- ❌ "In Conclusion"
- ❌ "Historically"
- ❌ "In This Section"
- ❌ "Comprehensive Guide" (unless in title)

**Instead Use:**

- ✅ Start directly with engaging content
- ✅ "Let's wrap up..." or "To summarize..."
- ✅ Specific dates/years ("In 2020..." instead of "Historically")
- ✅ Descriptive subheadings instead of "In This Section"

#### Content Structure

**Required Elements:**

1. **Engaging Opening** (No "Introduction" heading)

   - Start with a question, statistic, or bold statement
   - Hook reader in first 2 sentences
   - Promise what they'll learn

2. **H2 and H3 Headings** (Must include target keyword)

   ```markdown
   ## Best Inline Skates for Beginners (H2 - includes keyword)

   ### Top 5 Inline Skates Under $200 (H3 - includes keyword)

   ### Choosing the Right Inline Skate Size (H3 - includes keyword)
   ```

3. **Keyword Density**

   - Use target keyword **5-15 times** throughout article
   - Include in: Title, H2 headings, first paragraph, last paragraph
   - Use naturally - avoid keyword stuffing
   - Include related keywords/synonyms

4. **Formatting Variety**

   ```markdown
   ## Use Lists

   - Bullet points for quick scanning
   - Numbered lists for steps/rankings

   ## Use Tables

   | Feature | Beginner | Advanced |
   | ------- | -------- | -------- |
   | Price   | $100-200 | $300-500 |

   ## Use Blockquotes

   > "Inline skating burns 425 calories per hour." - Fitness Journal

   ## Use Bold/Italic

   **Important points** in bold
   _Emphasis_ in italic
   ```

5. **No HTML** - Use Markdown Only
   - ✅ `## Heading`
   - ❌ `<h2>Heading</h2>`

#### Writing as a Persona

**Identify Your Persona:**

```markdown
Persona Examples:

- "Experienced skating instructor with 15+ years teaching beginners"
- "Professional inline speed skater and product reviewer"
- "Roller derby coach and safety equipment expert"
- "Toronto-based skating enthusiast and community organizer"
```

**Match Writing Style:**

- **Instructor:** Patient, detailed explanations, step-by-step guidance
- **Pro Skater:** Technical terminology, performance-focused, data-driven
- **Coach:** Encouraging tone, safety-conscious, community-focused
- **Enthusiast:** Passionate, local insights, personal experiences

**Context Integration:**

```markdown
## Example Context to Match

"As a skating instructor, I've seen hundreds of beginners make the same mistakes.
The key is starting with proper-fitting skates and focusing on balance before speed.
Here's my proven method for teaching adults to skate in just 30 days..."
```

### RULE 4: SEO Title & Meta Description

**Title Requirements:**

1. **Focus Keyword at Beginning**

   - ✅ "Inline Skates Canada: 10 Best Models 2025"
   - ❌ "The 10 Best Models of Inline Skates in Canada for 2025"

2. **Positive or Negative Sentiment**

   - ✅ "Best Inline Skates" (positive)
   - ✅ "Worst Skating Mistakes" (negative)
   - ❌ "Inline Skates Overview" (neutral)

3. **Power Word** (at least one)

   ```
   Power Words:
   - Ultimate, Essential, Complete, Proven, Secret
   - Amazing, Stunning, Incredible, Shocking
   - Easy, Simple, Quick, Fast, Instant
   - Expert, Professional, Master, Advanced
   - New, Latest, Updated, Fresh, Modern
   ```

4. **Number in Title**

   - ✅ "7 Best Inline Skates"
   - ✅ "2025 Guide"
   - ✅ "Top 10 Mistakes"

5. **Maximum 60 Characters**
   ```
   ✅ "Best Inline Skates Canada: Top 10 Models 2025" (48 chars)
   ❌ "The Complete and Comprehensive Guide to Finding the Best Inline Skates in Canada for the Year 2025" (100 chars)
   ```

**Meta Description Requirements:**

1. **Focus Keyword Included**

   ```
   ✅ "Find the best inline skates in Canada with our expert reviews of 10 top models.
       Compare prices, features, and Canadian availability."
   ```

2. **Maximum 155 Characters**

   - Include call-to-action
   - Mention benefit/value
   - Create urgency or curiosity

3. **Format Example:**
   ```markdown
   ---
   title: 'Best Inline Skates Canada: Top 10 Models 2025'
   description: 'Expert reviews of the best inline skates in Canada. Compare 10 top models with prices, features, and where to buy. Updated 2025.'
   ---
   ```

### RULE 5: Outbound Links (Authority Sites)

**Required:** Link to high-authority domains (DA 60+) at least once per article.

**Approved Authority Domains:**

**Health & Fitness:**

- healthline.com
- mayoclinic.org
- webmd.com
- nih.gov (National Institutes of Health)

**Research & Studies:**

- ncbi.nlm.nih.gov (PubMed)
- scholar.google.com
- sciencedirect.com

**Sports & Recreation:**

- redbull.com (extreme sports)
- outsideonline.com
- active.com

**Safety & Standards:**

- cpsc.gov (Consumer Product Safety Commission)
- astm.org (Safety standards)
- ccohs.ca (Canadian Centre for Occupational Health & Safety)

**Wikipedia:**

- wikipedia.org (for general concepts/history)

**Linking Strategy:**

```markdown
## Example Outbound Links

"According to [research from the National Institutes of Health](https://www.nih.gov/...),
inline skating burns approximately 425 calories per hour."

"The Consumer Product Safety Commission [recommends wearing helmets](https://www.cpsc.gov/...)
for all wheeled sports activities."

"Roller skating has a rich history dating back to the 1700s, as documented on
[Wikipedia's roller skating page](https://en.wikipedia.org/wiki/Roller_skating)."
```

**Best Practices:**

- Use `rel="noopener noreferrer"` for external links (automatic in Nuxt)
- Link to specific pages, not just homepages
- Use descriptive anchor text
- Verify links work before publishing
- 2-4 outbound links per 1000 words

### RULE 6: Internal Links from Sitemap JSON

**Process for Finding Internal Links:**

1. **Open sitemap-data.json**
2. **Identify Relevant Links by Type:**

```javascript
// Product Categories (type: "category")
- /product-category/inline-skates
- /product-category/roller-skates
- /product-category/protective-helmets
- /product-category/knee-and-elbow-pads

// Blog Posts (type: "blog")
- /blog/complete-beginners-guide-inline-quad-skating
- /blog/how-to-skate-backwards-tutorial
- /blog/roller-skating-toronto-guide

// Products (type: "product")
- /product/fr-neo-2-80-black-inline-skates
- /product/powerslide-next-core-90-inline-skates
```

3. **Link Naturally in Content:**

```markdown
## Example Internal Linking

"If you're just starting out, check out our [complete beginner's guide to inline skating](/blog/complete-beginners-guide-inline-quad-skating)."

"We carry a wide selection of [inline skates](/product-category/inline-skates) suitable for all skill levels."

"Don't forget [protective gear](/product-category/protection-gear-and-apparel) - safety should always be your top priority."

"The [FR Neo 2 skates](/product/fr-neo-2-80-black-inline-skates) are an excellent choice for intermediate skaters."
```

4. **Link Distribution:**
   - **2-3 links** in first 500 words
   - **2-3 links** in middle sections
   - **1-2 links** in conclusion
   - **5-10 total** per article

### Content Writing Checklist

**Before Writing:**

- [ ] Selected keyword from CSV (`data/seo_Keywordlist.csv`)
- [ ] Checked keyword not already used (keyword tracking checklist)
- [ ] Identified 5-10 internal links from `sitemap-data.json`
- [ ] Found 2-4 high-authority outbound links
- [ ] Defined writing persona and style
- [ ] Generated blog post image using AI tool

**During Writing:**

- [ ] Writing in 500-word sections
- [ ] Paragraphs under 120 words each
- [ ] Using H2/H3 headings with keywords
- [ ] Avoided forbidden words (Introduction, In Conclusion, etc.)
- [ ] Including lists, tables, bold/italic formatting
- [ ] Using target keyword 5-15 times naturally
- [ ] Adding internal links from sitemap
- [ ] Including authority outbound links

**After Writing:**

- [ ] Title: 60 characters or less
- [ ] Title: Keyword at beginning
- [ ] Title: Has power word
- [ ] Title: Has number
- [ ] Title: Positive or negative sentiment
- [ ] Meta description: 155 characters or less
- [ ] Meta description: Includes focus keyword
- [ ] Word count: 1,000 - 2,500 words
- [ ] Updated keyword tracking checklist
- [ ] Images named with dashes (not spaces)
- [ ] Image paths updated in frontmatter

---

## 🎨 AI Image Generation Tool

### RULE 7: Generate Blog Post Images with AI

**CRITICAL:** Use the AI image generator to create custom images for every blog post.

**Tool Location:** `scripts/generate-blog-image.js`

**Full Documentation:** `scripts/README-image-generator.md`

### Quick Start

Generate an AI image for your blog post keyword:

```bash
node scripts/generate-blog-image.js "your keyword here" --posted
```

The `--posted` flag automatically saves the image to `/public/images/blog/posted/` so it's ready to use immediately.

### Complete Workflow

#### Step 1: Generate Image (BEFORE Writing Post)

```bash
# Generate image directly into posted folder
node scripts/generate-blog-image.js "roller skates near me" --posted

# Output shows:
# ✨ Success! Image ready to use.
#
# Add to your blog post frontmatter:
# ---
# image: '/images/blog/posted/roller-skates-near-me.jpg'
# ogImage: '/images/blog/posted/roller-skates-near-me.jpg'
# ---
```

#### Step 2: Create Blog Post with Image Path

```markdown
---
title: 'Roller Skates Near Me: 7 Best Places to Buy in Canada 2025'
description: 'Find roller skates near me with our guide...'
image: '/images/blog/posted/roller-skates-near-me.jpg'
ogImage: '/images/blog/posted/roller-skates-near-me.jpg'
---
```

#### Step 3: Write Content

Follow all writing guidelines with the image already in place.

### Image Generator Options

**Basic Generation:**

```bash
node scripts/generate-blog-image.js "keyword" --posted
```

**Custom Filename:**

```bash
node scripts/generate-blog-image.js "keyword" --output custom-name.jpg --posted
```

**Custom AI Prompt:**

```bash
node scripts/generate-blog-image.js "keyword" --posted --prompt "Professional roller skates on track, sunset lighting, photorealistic"
```

**Use Stock Photos (Unsplash):**

```bash
node scripts/generate-blog-image.js "keyword" --posted --method unsplash
```

### Image Specifications

AI-generated images are optimized for blog posts:

- **Size:** 1200x630px (perfect for Open Graph)
- **Format:** JPG (web-optimized)
- **Quality:** 85%
- **Aspect Ratio:** 16:9 (ideal for headers)
- **Naming:** Auto-converts to dash-separated lowercase

### Why Use `--posted` Flag?

**Always use `--posted` when generating blog images:**

✅ **Saves directly to correct folder** (`/public/images/blog/posted/`)  
✅ **No need to move files later**  
✅ **Prevents image reuse** (organized separately)  
✅ **Ready to reference in frontmatter immediately**

### AI Image Generation Rules

1. **Generate BEFORE writing** - Have the image ready before creating the blog post
2. **Always use `--posted` flag** - Save directly to final destination
3. **Match keyword to blog topic** - Image should represent the article content
4. **Use custom prompts for specific needs** - Add `--prompt` for precise control
5. **Check image quality** - Review generated image before using
6. **Fallback to Unsplash** - If AI generation fails, use `--method unsplash`

### Environment Setup

**API Key Required:** Google AI Studio API key

Already configured in `.env.local` (git-ignored):

```env
GOOGLE_AI_API_KEY=your_key_here
```

**Getting Your API Key:**

1. Visit https://aistudio.google.com/
2. Sign in with Google account
3. Create new API key
4. Add to `.env.local` file

**Alternative (Free):** Unsplash API

- Sign up at https://unsplash.com/developers
- Create app and get Access Key
- Add to `.env.local`: `UNSPLASH_ACCESS_KEY=your_key_here`

### Troubleshooting

**Error: "GOOGLE_AI_API_KEY environment variable is not set"**

- Ensure `.env.local` exists in project root
- Check API key is correctly formatted
- Restart terminal after adding env variable

**Error: "Gemini API error: 403"**

- API key invalid or expired
- Rate limits exceeded (wait and try again)
- Check Google AI Studio dashboard

**Image quality not good enough:**

- Use custom `--prompt` for better control
- Try `--method unsplash` for stock photos
- Regenerate with different prompt variations

### Example: Complete New Blog Post Workflow

```bash
# Step 1: Generate image first
node scripts/generate-blog-image.js "best inline skates 2025" --posted

# Step 2: Create blog post directory
mkdir content/blog/best-inline-skates-2025

# Step 3: Create index.md with image path from Step 1
# (Copy path from generator output)

# Step 4: Write content following all guidelines

# Step 5: Test locally
npm run dev

# Step 6: Deploy
git add .
git commit -m "Add: Best Inline Skates 2025 blog post"
git push
```

### Advanced Options

**Batch Generation (Future Feature):**

```bash
# Generate images for multiple keywords at once
node scripts/generate-blog-image.js --batch keywords.txt --posted
```

**Custom Styles (Future Feature):**

```bash
# Use predefined style presets
node scripts/generate-blog-image.js "keyword" --posted --style photographic
node scripts/generate-blog-image.js "keyword" --posted --style illustrated
```

### Cost Considerations

**Google Gemini Imagen:**

- Free tier: Limited requests per month
- Paid tier: Check Google AI Studio pricing
- Development use should stay within free limits

**Unsplash (Free Alternative):**

- 50 requests/hour (free tier)
- No cost for downloads
- Must credit photographer (automatic)

---

## ➕ How to Add New Blog Posts

### 0. Generate AI Image First (NEW STEP)

**Before creating your blog post, generate the image:**

```bash
node scripts/generate-blog-image.js "your keyword here" --posted
```

**Example:**

```bash
node scripts/generate-blog-image.js "roller skates near me" --posted

# Output:
# 💾 Image saved to: e:\Documents\GitHub\woonuxt\public\images\blog\posted\roller-skates-near-me.jpg
# 📁 Relative path: /images/blog/posted/roller-skates-near-me.jpg
#
# Add to your blog post frontmatter:
# ---
# image: '/images/blog/posted/roller-skates-near-me.jpg'
# ogImage: '/images/blog/posted/roller-skates-near-me.jpg'
# ---
```

**Copy the image path** from the output - you'll need it in Step 3.

### 1. Create Post Directory

```bash
mkdir content/blog/your-post-slug
```

### 2. Create index.md File

```bash
touch content/blog/your-post-slug/index.md
```

### 3. Add Frontmatter and Content

**Use the AI-generated image path from Step 0:**

```markdown
---
title: 'Your Post Title'
description: 'SEO-friendly description (150-160 characters)'
category: 'Product Reviews' # or "Beginner Guides", "Maintenance Tips", etc.
date: 2025-11-13
author: 'Proskaters Place Team'
authorBio: 'Professional skating instructor with 15+ years experience'
image: '/images/blog/posted/your-keyword-here.jpg' # ← FROM AI GENERATOR
ogImage: '/images/blog/posted/your-keyword-here.jpg' # ← FROM AI GENERATOR
tags: ['tag1', 'tag2', 'tag3']
---

# Your Post Title

Your content here in markdown format...

## Section Headers

Content with [links](/product/some-product) to products.

### Subsections

More content...
```

**Important:** Use the EXACT path provided by the AI image generator in Step 0.

### 4. Manual Image Alternative (If AI Generation Fails)

#### Image Naming Convention

**IMPORTANT:** Always use dashes (hyphens) in image filenames, never spaces.

```bash
# ✅ CORRECT
toronto-rollerblade-club.jpg
best-inline-skates-2025.png
how-to-skate-backwards.png

# ❌ WRONG
toronto rollerblade club.jpg
Best Inline Skates 2025.png
how to skate backwards.png
```

**Why this matters:**

- URLs with spaces become encoded (`%20`) which looks unprofessional
- Dashes are SEO-friendly and improve readability
- Prevents broken links and image loading issues
- Maintains consistency across the site

#### Image Workflow

**PREFERRED METHOD: Use AI Image Generator (Step 0)**

Always generate images using the AI tool BEFORE creating the blog post:

```bash
node scripts/generate-blog-image.js "your keyword" --posted
```

This automatically:

- Creates optimized 1200x630px image
- Names with dashes (SEO-friendly)
- Saves to `/public/images/blog/posted/`
- Provides exact path for frontmatter

**FALLBACK METHOD: Manual Images**

If AI generation fails or you have a specific image, follow this workflow:

**Step 1: Store Unused Images**
Place new images for upcoming blog posts in: `public/images/`

```bash
# Example: Preparing images for future posts
public/images/
  ├── speed-skating-guide.png          # Ready for future post
  ├── beginner-roller-derby.png        # Ready for future post
  ├── winter-maintenance-tips.jpg      # Ready for future post
```

**Step 2: Use Images in Blog Post**
Reference images in your markdown frontmatter:

```markdown
---
title: 'Your Post Title'
image: '/images/speed-skating-guide.png'
ogImage: '/images/speed-skating-guide.png'
---
```

**Step 3: Move to Posted Folder After Publishing**
Once the blog post is written and images are used, move them to prevent reuse:

```bash
# Move used images
public/images/
  └── blog/
      └── posted/
          ├── speed-skating-guide.png      # ✅ Used in published post
          ├── beginner-roller-derby.png    # ✅ Used in published post
          ├── inline-vs-rollerskates.png   # ✅ Already posted
```

**Update image paths in markdown after moving:**

```markdown
---
title: 'Your Post Title'
image: '/images/blog/posted/speed-skating-guide.png'
ogImage: '/images/blog/posted/speed-skating-guide.png'
---
```

#### Image Organization Structure

```
public/images/
  ├── [available-images.png]           # Unused, available for new posts
  ├── [available-images.jpg]
  └── blog/
      └── posted/
          ├── [used-image-1.png]       # Used in published posts
          ├── [used-image-2.jpg]       # Won't be used twice
          └── [used-image-3.png]
```

**Benefits of this workflow:**

1. **Prevent duplicate usage** - Posted images are clearly separated
2. **Visual inventory** - See available images at a glance
3. **Asset management** - Track which images have been used
4. **SEO consistency** - All images follow naming conventions

#### Image Best Practices

**Naming:**

- Use lowercase letters
- Separate words with dashes (hyphens)
- Keep names descriptive but concise
- Include primary keyword when relevant

**Optimization:**

- Use WebP format when possible
- Compress images before upload
- Recommended sizes: 1200x630px for social sharing
- Keep file sizes under 200KB

**SEO:**

- Include descriptive filenames
- Alt text is auto-generated from post title
- OG images for social media previews
- Lazy loading for performance

### 5. Test Locally

- Start dev server: `npm run dev`
- Visit: `http://localhost:3000/your-post-slug`
- Check archive: `http://localhost:3000/blog`

### 6. Deploy

- Commit changes to Git
- Cloudflare Pages will automatically rebuild and deploy

## 🎨 Styling Guidelines

### Component Structure

- **Dark background** (`#f3f4f6`) for visual hierarchy
- **White cards** with subtle shadows for content
- **Responsive typography** using `clamp()` functions
- **Mobile-first** approach with `lg:` breakpoints

### Content Styling

- **Article content** limited to `72ch` width for readability
- **Headings** with proper hierarchy and spacing
- **Code blocks** with syntax highlighting
- **Images** with rounded corners and responsive sizing

## 🔧 Maintenance

### Regular Tasks

1. **Update dependencies** monthly
2. **Optimize images** before adding new posts
3. **Check broken links** quarterly
4. **Monitor performance** with Lighthouse
5. **Update metadata** for SEO improvements

### Troubleshooting

- **Posts not showing**: Check frontmatter syntax
- **Images not loading**: Verify path starts with `/`
- **Broken links**: Use relative paths for internal links
- **TOC not working**: Ensure proper heading structure

## 📈 SEO Best Practices

### Content

- Use descriptive titles (50-60 characters)
- Write compelling meta descriptions (150-160 characters)
- Include target keywords naturally
- Use proper heading hierarchy (H1 → H2 → H3)
- Add alt text to all images

### Technical

- Automatic sitemap generation via @nuxt/content
- Structured data for articles
- Open Graph and Twitter Card meta tags
- Clean, semantic URLs
- Fast loading times with prerendering

## 🚀 Future Enhancements

### Potential Additions

- [ ] Full-text search functionality
- [ ] Comment system integration
- [ ] Newsletter signup forms
- [ ] Social media sharing buttons
- [ ] Reading time estimation
- [ ] Dark mode toggle
- [ ] RSS feed generation
- [ ] Multi-author support
- [ ] Content scheduling
- [ ] Analytics integration

---

**Last Updated**: June 30, 2025  
**Next Review**: July 30, 2025  
**Maintained By**: Development Team
