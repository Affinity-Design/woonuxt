# Blog Image Workflow Documentation

## Overview

This document describes the standardized workflow for managing blog post images to ensure proper organization and enable future AI assistants to efficiently manage visual assets.

## Image Directory Structure

```
public/images/
├── new images/        # Staging area for unused blog images
├── posted/           # Archive of images already used in blog posts
└── blog/            # Legacy folder (being phased out)
```

## Workflow for Writing New Blog Posts

### Step 1: Image Selection

1. **Always check** `public/images/new images/` folder first for available images
2. Review the content of the blog post you're writing
3. Select the most appropriate image based on:
   - Relevance to the article topic
   - Visual quality and appeal
   - Diversity (avoid reusing similar images)

### Step 2: Move Image to Posted Folder

1. Move the selected image from `public/images/new images/` to `public/images/posted/`
2. **Keep the original filename** - this helps track image history
3. Use PowerShell command:
   ```powershell
   Move-Item "e:\Documents\GitHub\woonuxt\public\images\new images\[filename]" "e:\Documents\GitHub\woonuxt\public\images\posted\[filename]"
   ```

### Step 3: Reference in Blog Post

1. In the blog post frontmatter, set the image path:
   ```yaml
   image: '/images/posted/[filename]'
   ogImage: '/images/posted/[filename]'
   ```
2. **Do NOT** use `/images/blog/posted/` - the correct path is `/images/posted/`

## Current Image Inventory

### Images in Posted Folder (Already Used)

As of October 23, 2025:

1. `preaty girl holding pair of white quadskates.png`

   - **Used in**: Complete Beginner's Guide to Inline & Quad Skating in Canada (2025 Edition)
   - **Date**: October 23, 2025

2. `girl indoor rollerskating.png`

   - **Used in**: How to Skate Backwards on Roller Skates & Inline Skates: 5-Minute Tutorial
   - **Date**: October 23, 2025

3. `inline speed skaters.png`

   - **Used in**: Best Inline Skates in Canada 2025: Expert Reviews & Buyer's Guide
   - **Date**: October 23, 2025

4. `girl rollerskating in park.png`
   - **Used in**: The Ultimate Roller Skating Guide for Toronto Beginners
   - **Date**: October 23, 2025 (fixed broken image)

### Images Still Available in New Images Folder

As of October 23, 2025:

1. `girl holding rollerskate wheel.png` - Good for: maintenance articles, parts guides
2. `girl shoping for rollerskates.png` - Good for: buying guides, shopping tips
3. `helmets-for-inline-skating3493_art.png` - Good for: safety articles, protection gear guides
4. `roller skate parts.png` - Good for: technical articles, maintenance guides

## Best Practices

### DO:

✅ Always scan the `new images/` folder before writing a new post
✅ Move images to `posted/` folder after use to track what's been used
✅ Keep original filenames for tracking purposes
✅ Update this documentation when new images are added or used
✅ Choose images that genuinely match the article content
✅ Consider diversity - don't use all similar images

### DON'T:

❌ Leave used images in the `new images/` folder
❌ Rename images when moving them (keep original names)
❌ Use placeholder or broken image paths
❌ Reuse the same image for multiple recent posts
❌ Skip updating this documentation

## For Future AI Assistants

When asked to write a blog post, follow this workflow:

1. **Before writing**: Use `list_dir` to check available images in `public/images/new images/`
2. **During writing**: Select the most appropriate image for the topic
3. **Before finishing**:
   - Move the selected image to `public/images/posted/` using `run_in_terminal`
   - Update the blog post frontmatter with the correct path
   - Update this documentation file with the new image usage

## Troubleshooting

### Image Not Displaying

- Check the path is `/images/posted/[filename]` (not `/images/blog/posted/`)
- Verify the image file exists in the posted folder
- Ensure filename matches exactly (case-sensitive)

### No Suitable Images Available

- Check if there are images in `new images/` that could work with different context
- Request new images from the content team
- Consider using existing images from the `posted/` folder if appropriate (avoid for recent posts)

## Migration Notes

### Legacy Images

- Old blog posts may still reference `/images/blog/posted/` or `/images/roller-skates.jpg`
- When updating old posts, move them to the new workflow
- The `/images/blog/` folder is being phased out

### Image Sourcing

- New images should be added to `public/images/new images/` by the content team
- All images should be properly licensed for commercial use
- Preferred format: PNG or JPG, optimized for web (under 500KB)

---

**Last Updated**: October 23, 2025
**Maintained By**: AI Assistant & ProSkaters Place Team
**Questions**: Refer to main documentation or contact development team
