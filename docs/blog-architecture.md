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
title: "Post Title"
description: "Post description for SEO"
category: "Product Reviews"
date: 2025-06-30
author: "Author Name"
authorBio: "Author bio"
image: "/images/post-image.jpg"
ogImage: "/images/post-image.jpg"
tags: ["tag1", "tag2"]
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
  modules: ["@nuxt/content"],
  content: {
    // Content module configuration
  },
  routeRules: {
    "/blog": { prerender: true },
    // Individual blog posts prerendered automatically
  },
});
```

### Content Queries

```typescript
// Get all posts for archive
const { data: posts } = await useAsyncData("blog-posts", () =>
  queryContent("blog").sort({ date: -1 }).find()
);

// Get single post
const { data: post } = await useAsyncData(`blog-${slug}`, () =>
  queryContent("blog")
    .where({ _path: { $contains: slug } })
    .findOne()
);

// Get related posts
const { data: relatedPosts } = await useAsyncData(`related-${slug}`, () =>
  queryContent("blog")
    .where({
      category: post.value?.category,
      _path: { $ne: post.value?._path },
    })
    .sort({ date: -1 })
    .limit(3)
    .find()
);
```

## ➕ How to Add New Blog Posts

### 1. Create Post Directory

```bash
mkdir content/blog/your-post-slug
```

### 2. Create index.md File

```bash
touch content/blog/your-post-slug/index.md
```

### 3. Add Frontmatter and Content

```markdown
---
title: "Your Post Title"
description: "SEO-friendly description (150-160 characters)"
category: "Product Reviews" # or "Beginner Guides", "Maintenance Tips", etc.
date: 2025-06-30
author: "Proskaters Place Team"
authorBio: "Professional skating instructor with 15+ years experience"
image: "/images/your-image.jpg"
ogImage: "/images/your-image.jpg"
tags: ["tag1", "tag2", "tag3"]
---

# Your Post Title

Your content here in markdown format...

## Section Headers

Content with [links](/product/some-product) to products.

### Subsections

More content...
```

### 4. Add Images

Place images in `public/images/` and reference them as `/images/filename.jpg`

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
