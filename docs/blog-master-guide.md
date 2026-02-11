# Blog Master Guide for WooNuxt

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Components](#architecture--components)
3. [File Structure](#file-structure)
4. [Content Management](#content-management)
5. [Keyword Strategy & Selection](#keyword-strategy--selection)
6. [Image Workflow](#image-workflow)
7. [Template Features & SEO](#template-features--seo)
8. [Writing Guidelines](#writing-guidelines)

---

## Overview

The WooNuxt blog system is built using **Nuxt 3** with **@nuxt/content** for file-based content management, deployed on **Cloudflare Pages**. It provides clean URLs, full-text search, automatic SEO optimization, and a modern responsive design.

### Key Features

- **Canonical URLs**: Posts live at `/blog/post-slug` (always include the `/blog/` prefix).
- **Safety Redirects**: `/post-slug` automatically redirects to `/blog/post-slug` (301) as a fallback.
- **File-based Content**: Markdown files with frontmatter metadata.
- **Automatic SEO**: Meta tags, Open Graph, Twitter Cards, and Schema.org.
- **Responsive Design**: Mobile-first responsive layouts.
- **Product Integration**: Shop by Category sections and product cards.

---

## Architecture & Components

### Core Technologies

- **Nuxt 3**: Vue.js framework for server-side rendering.
- **@nuxt/content v2**: File-based CMS with markdown support.
- **Vue 3 Composition API**: Component logic and state management.
- **Tailwind CSS**: Utility-first styling framework.

### Routing System

- **Blog Archive**: `/blog` → `pages/blog/index.vue`
- **Individual Posts**: `/blog/post-slug` → `pages/blog/[slug].vue`
- **Fallback Route**: `/post-slug` → `pages/[...slug].vue` → redirects or renders `BlogPost.vue`
- **Redirects**: `/post-slug` → `/blog/post-slug` (301) via `data/blog-redirects.json` in `nuxt.config.ts`

### Post Rendering Flow

1.  User visits `/blog/post-slug` (canonical) or `/post-slug` (redirected).
2.  `pages/blog/[slug].vue` renders the post directly.
3.  If visited without `/blog/` prefix, `nuxt.config.ts` routeRules redirect to `/blog/post-slug`.
4.  Fallback: `[...slug].vue` catches unmatched routes, queries content, renders `BlogPost.vue`.
5.  If not found, shows 404 error.

### URL Rules (CRITICAL)

- **All internal links to blog posts MUST use `/blog/post-slug`** — never link to `/post-slug` directly.
- **NEVER** use `.replace('/blog/', '/')` to strip the prefix from `_path` in templates.
- `BlogPostCard.vue` has built-in normalization to always ensure the `/blog/` prefix.
- Redirects exist as a **safety net for external/typed URLs**, not as the primary link target.
- After adding a new post, run `npm run build-all-routes` to generate the redirect entry.

---

## File Structure

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

---

## Content Management

Blog posts are stored as markdown files in `content/blog/[post-slug]/index.md` with frontmatter metadata:

```yaml
---
title: 'Post Title'
description: 'Post description for SEO'
category: 'Product Reviews'
date: 2025-06-30
author: 'Author Name'
authorBio: 'Author bio'
image: '/images/posted/post-image.jpg'
ogImage: '/images/posted/post-image.jpg'
tags: ['tag1', 'tag2']
---
```

---

## Keyword Strategy & Selection

Our SEO strategy relies on targeting high-volume, low-competition keywords and tracking them to prevent cannibalization.

### The Process

1.  **Consult the Master List**: Open `data/seo_Keywordlist.csv` to find potential keywords.

    - Prioritize keywords with **High Search Volume** (>1000) and **Low Difficulty** (<30).
    - Look for "Commercial" or "Informational" intent.

2.  **Check Availability**: Open `data/blog-keywords-used.md`.

    - Verify the keyword is NOT in the "✅ Used Keywords" list.
    - Check the "📋 Available Keywords" section for prioritized suggestions.

3.  **Select & Track**:
    - Pick your keyword.
    - **Immediately** mark it as "In Progress" or move it to the "Used" section in `data/blog-keywords-used.md`.
    - Add the post slug and date.

**Example Tracking Entry:**

```markdown
- [x] **roller skates** (9900 sv, 0 kd)
  - Post: `/blog/roller-skates-complete-guide-2025`
  - Published: 2025-12-15
  - Status: ✅ Live
```

---

## Image Workflow

We use an automated AI image generation tool to ensure consistent, high-quality, and SEO-optimized images for all blog posts.

### 1. AI Image Generation (Preferred Method)

We have a custom script that uses Google's Gemini 2.5 Flash Image model to generate photorealistic images.

**Command:**

```bash
node scripts/generate-blog-image.js "your keyword here" --posted
```

**What this does:**

1.  Generates a high-quality 1200x630px image (perfect for OG tags).
2.  Optimizes the prompt for Canadian e-commerce context.
3.  Saves the file directly to `public/images/blog/posted/`.
4.  Returns the exact path to use in your frontmatter.

**Example Output:**

```
✅ Image generated successfully!
💾 Image saved to: .../public/images/blog/posted/roller-skates.png
✨ Success! Image ready to use.
```

### 2. Manual Workflow (Fallback)

If the AI tool is unavailable or you need a specific product photo:

1.  **Selection**: Choose a high-quality landscape image (1200x630px).
2.  **Move**: Place image in `public/images/blog/posted/`.
3.  **Naming**: Rename to match your keyword (e.g., `roller-skates-canada.jpg`).
4.  **Reference**: In frontmatter, use `image: '/images/blog/posted/your-filename.jpg'`.

### Best Practices

- ✅ **ALWAYS** generate the image before writing the post.
- ✅ Use the exact path provided by the script.
- ✅ Ensure images are under 200KB if adding manually.
- ✅ **Every blog post MUST have a unique image** — never reuse an image from another post.
- ✅ Check `public/images/blog/posted/` and `public/images/posted/` for existing filenames before saving.
- ❌ Do not use generic stock photos if AI generation is available.
- ❌ Do not copy another post's image path into your frontmatter.

---

## Template Features & SEO

The blog post template (`pages/blog/[slug].vue`) includes comprehensive Canadian SEO optimization.

### Canadian SEO

- **Composable**: Uses `useCanadianSEO()` for consistent metadata.
- **Hreflang**: Automatic bilingual tags (en-CA, fr-CA).
- **Geo-Targeting**: Toronto, ON, Canada location data.
- **Currency**: CAD currency metadata.

### Structured Data (Schema.org)

- **Article Schema**: Full metadata including author, publisher, and dates.
- **Breadcrumb Schema**: Proper navigation hierarchy.
- **Author Bio**: Enhanced bio section with Canadian location and expertise.

### Layout Features

- **Two-column layout**: Article + Sidebar (desktop).
- **Sticky Table of Contents**: Auto-generated from headings.
- **Shop by Category**: Integrated product discovery.
- **Related Posts**: Automatic category-based recommendations.

---

## Writing Guidelines

### Rules

1.  **Keywords**: Select from `data/seo_Keywordlist.csv` and **MUST** log in `data/blog-keywords-used.md`.
2.  **Images**: Generate AI images BEFORE writing the post (see Image Workflow).
3.  **Internal Links**: Use `data/sitemap-data.json` for all internal links.
4.  **Word Count**: 1,000 - 2,500 words total.
5.  **Formatting**: Use markdown only (no HTML). H1, H2, H3 headings.

### SEO Title & Meta

- **Title**: Max 60 chars, keyword at start, power word, number, sentiment.
- **Description**: Max 155 chars, includes keyword.
- **Links**: 5-10 internal links, 2-4 outbound links to authority sites.
