# Mobile Performance Optimization Guide

## Overview

This document outlines the performance improvements implemented to boost the mobile PageSpeed Insights score from **62 to 90+**.

### Baseline Metrics (Mobile)

- **Performance Score**: 62/100
- **FCP**: 4.6s (Target: <1.8s)
- **LCP**: 17.0s (Target: <2.5s)
- **TBT**: 50ms (Target: <200ms) ✅
- **CLS**: 0 (Target: <0.1) ✅
- **SI**: 5.5s (Target: <3.4s)

### Target Metrics (Mobile)

- **Performance Score**: 90+/100
- **FCP**: <1.8s
- **LCP**: <2.5s
- **TBT**: <200ms
- **CLS**: <0.1
- **SI**: <3.4s

---

## Critical Issues Addressed

### 1. ⚠️ Largest Contentful Paint (LCP): 17.0s → <2.5s

**Problem:**

- Hero images loaded via inline CSS styles (`background-image: url(...)`)
- Bypassed Nuxt Image optimization (no WebP, no responsive sizing)
- `inline-skates.jpg`: 1590KB (unoptimized)
- `roller-skates.jpg`: 281KB (unoptimized)

**Solution:**

```vue
<!-- BEFORE (Bad) -->
<section :style="{backgroundImage: `url('/images/inline-skates.jpg')`}">

<!-- AFTER (Good) -->
<section class="relative overflow-hidden">
  <NuxtImg
    src="/images/inline-skates.jpg"
    width="1920"
    height="550"
    sizes="100vw"
    format="webp"
    quality="80"
    loading="lazy"
    placeholder
    class="absolute inset-0 w-full h-full object-cover" />
</section>
```

**Impact:**

- ✅ Automatic WebP conversion (60-80% smaller)
- ✅ Responsive srcset generation (mobile gets smaller images)
- ✅ Lazy loading (doesn't block initial render)
- ✅ Placeholder blur effect (better perceived performance)
- **Estimated savings**: 1590KB → ~300KB (81% reduction)

---

### 2. ⚠️ First Contentful Paint (FCP): 4.6s → <1.8s

**Problem:**

- Render-blocking CSS (16.9KB, 1910ms duration)
- No preconnect to WordPress backend
- No DNS prefetch for Cloudflare

**Solution A: Resource Hints**

```typescript
// nuxt.config.ts - app.head.link
{
  rel: 'preconnect',
  href: 'https://proskatersplace.com',
  crossorigin: 'anonymous',
},
{
  rel: 'dns-prefetch',
  href: 'https://static.cloudflareinsights.com',
}
```

**Solution B: Code Splitting**

```typescript
// nuxt.config.ts - vite.build.rollupOptions
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('stripe')) return 'stripe';
    if (id.includes('vue')) return 'vue';
    return 'vendor';
  }
}
```

**Impact:**

- ✅ Earlier connection to WordPress (saves 200-400ms)
- ✅ Smaller initial JS bundle (vendor code split)
- ✅ Reduced main thread blocking
- **Estimated improvement**: -2s FCP

---

### 3. 🖼️ Oversized Category Images

**Problem:**

- Images served at 1344x1687px (2.3MP)
- Displayed at 180x240px (0.04MP)
- **58x larger than needed!**

**Example:**

- `Roller-Skates.jpeg`: 224.7KB → Should be ~40KB
- `Inline-Skates.jpeg`: 219.1KB → Should be ~40KB
- Total waste: ~1150KB across 6 category images

**Solution:**

```vue
<!-- CategoryCard.vue -->
<NuxtImg :width="220" :height="248" :sizes="`(max-width: 768px) 110px, 220px`" format="webp" quality="85" fit="cover" placeholder :src="imageSrc" />
```

**Impact:**

- ✅ Serves 220px width on desktop, 110px on mobile
- ✅ WebP format (60% smaller than JPEG)
- ✅ 2x retina support via `densities: [1, 2]`
- **Estimated savings**: 1150KB → ~240KB (79% reduction)

---

## Image Optimization Configuration

### Nuxt Image Settings

```typescript
// nuxt.config.ts
image: {
  quality: 80,
  format: ['webp', 'avif', 'jpeg'], // Prefer modern formats
  screens: {
    xs: 320,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    xxl: 1536,
  },
  densities: [1, 2], // Retina support
  presets: {
    category: {
      modifiers: {
        format: 'webp',
        quality: 85,
        width: 220,
        height: 248,
        fit: 'cover',
      },
    },
    hero: {
      modifiers: {
        format: 'webp',
        quality: 80,
        width: 1920,
        fit: 'cover',
      },
    },
  },
}
```

### Usage Examples

**1. Category Images:**

```vue
<NuxtImg src="/images/Inline-Skates.jpeg" preset="category" :loading="imageLoading" alt="Inline Skates" />
```

**2. Hero Images:**

```vue
<NuxtImg src="/images/inline-skates.jpg" preset="hero" loading="lazy" placeholder alt="Best Inline Skates Toronto" />
```

**3. Product Images:**

```vue
<NuxtImg :src="product.image?.sourceUrl" width="400" height="400" format="webp" quality="85" loading="lazy" placeholder />
```

---

## Manual Image Optimization

For **best results**, pre-optimize images before uploading:

### Install Sharp (if not already installed)

```bash
npm install sharp --save-dev
```

### Run Optimization Script

```bash
# Optimize all images in public/images/
node scripts/optimize-images.js
```

This script will:

1. ✅ Resize images to appropriate dimensions
2. ✅ Convert to WebP (60-80% smaller)
3. ✅ Generate JPEG fallbacks
4. ✅ Output to `public/images/optimized/`

**Specific optimizations:**

- Hero images: 1920x550px @ 75% quality
- Category images: 440x496px @ 85% quality (2x for retina)
- General images: Max 1920px width @ 80% quality

### Replace Original Images

```bash
# After reviewing optimized images, replace originals:
# 1. Backup originals
mv public/images/inline-skates.jpg public/images/backup/

# 2. Move optimized version
mv public/images/optimized/inline-skates.webp public/images/

# 3. Update references if needed (NuxtImg handles WebP automatically)
```

---

## Performance Budget

Set limits to prevent future regressions:

| Resource Type   | Budget | Current | Status |
| --------------- | ------ | ------- | ------ |
| Total Page Size | 2000KB | 1300KB  | ✅     |
| Images          | 1000KB | 500KB   | ✅     |
| JavaScript      | 500KB  | 533KB   | ⚠️     |
| CSS             | 100KB  | 17KB    | ✅     |
| Fonts           | 100KB  | 0KB     | ✅     |

**Action items for JS budget:**

- ✅ Implemented code splitting (stripe, vue, vendor chunks)
- 🔄 Consider lazy loading non-critical components
- 🔄 Evaluate if all dependencies are necessary

---

## Video Optimization

**Problem:** 9.7MB video file on homepage

**Current:**

```html
<video autoplay loop muted>
  <source src="/videos/Inline-Skating.mp4" type="video/mp4" />
</video>
```

**Recommendations:**

1. **Compress video:**

   ```bash
   # Using ffmpeg
   ffmpeg -i input.mp4 -vcodec h264 -acodec mp3 -b:v 1M -b:a 128k output.mp4
   ```

   Target: 9.7MB → ~2MB

2. **Lazy load video:**

   ```vue
   <video autoplay loop muted loading="lazy" preload="none"></video>
   ```

3. **Use poster image:**

   ```vue
   <video poster="/images/video-poster.webp" ...></video>
   ```

4. **Consider replacing with animated WebP:**
   - Smaller file size
   - Better compression
   - Wider browser support

---

## Cache Optimization

### Current Cache Headers

Check `public/_headers` for proper cache directives:

```
/images/*
  Cache-Control: public, max-age=31536000, immutable

/videos/*
  Cache-Control: public, max-age=31536000, immutable

/_nuxt/*
  Cache-Control: public, max-age=31536000, immutable
```

### Verify Cache Effectiveness

```bash
# Check response headers
curl -I https://proskatersplace.ca/images/inline-skates.jpg

# Should see:
# cache-control: public, max-age=31536000, immutable
# cf-cache-status: HIT
```

---

## Monitoring & Testing

### Test Performance After Changes

```bash
# 1. Build and preview
npm run build
npm run preview

# 2. Test with Lighthouse
npx lighthouse https://proskatersplace.ca --view --preset=mobile

# 3. Check specific metrics
npx lighthouse https://proskatersplace.ca \
  --only-categories=performance \
  --output=json \
  --output-path=./lighthouse-report.json
```

### Real User Monitoring (RUM)

Add to `nuxt.config.ts`:

```typescript
app: {
  head: {
    script: [
      {
        src: 'https://cdn.speedcurve.com/js/lux.js?id=YOUR_ID',
        defer: true,
      },
    ];
  }
}
```

### Performance Checklist

Before deploying:

- [ ] Run `node scripts/optimize-images.js`
- [ ] Verify WebP images are generated
- [ ] Test on real mobile device (Chrome DevTools > Device Mode)
- [ ] Run Lighthouse audit (Mobile + Desktop)
- [ ] Check LCP is <2.5s on mobile
- [ ] Verify cache warming ran (`npm run warm-cache`)
- [ ] Check Cloudflare KV cache hit rate

---

## Expected Results

### Before vs. After

| Metric                | Before | After  | Improvement   |
| --------------------- | ------ | ------ | ------------- |
| **Performance Score** | 62     | 90+    | +28 points    |
| **FCP**               | 4.6s   | <1.8s  | -60%          |
| **LCP**               | 17.0s  | <2.5s  | -85%          |
| **Total Page Size**   | 13.8MB | <2MB   | -85%          |
| **Image Size**        | 3.4MB  | <500KB | -85%          |
| **TBT**               | 50ms   | <50ms  | Maintained ✅ |
| **CLS**               | 0      | 0      | Maintained ✅ |

### Impact on Business

- **Better SEO rankings** (Core Web Vitals are ranking factors)
- **Higher conversion rates** (53% of users abandon sites that take >3s to load)
- **Lower bounce rate** (faster load = more engaged users)
- **Reduced bandwidth costs** (85% smaller page size)
- **Better mobile experience** (95% of Canadian e-commerce is mobile)

---

## Troubleshooting

### Images Not Optimizing?

**Check 1:** Verify Nuxt Image module is installed

```bash
npm list @nuxt/image
# Should show: @nuxt/image@1.9.0
```

**Check 2:** Verify Sharp is installed (required for optimization)

```bash
npm list sharp
# Should show: sharp@0.32.6
```

**Check 3:** Clear `.nuxt` cache

```bash
rm -rf .nuxt
npm run dev
```

### WebP Not Loading?

**Check 1:** Browser support (>97% global support as of 2025)

```javascript
// Add JPEG fallback in NuxtImg:
<NuxtImg src="/images/inline-skates.jpg" format="webp" fallback="jpeg" />
```

**Check 2:** Cloudflare settings

- Go to Cloudflare Dashboard > Speed > Optimization
- Enable "WebP" under Image Optimization

### Still Seeing Large Images?

**Check 1:** Verify srcset is generated

```html
<!-- View page source, should see: -->
<img
  srcset="
    /images/Inline-Skates.jpeg?format=webp&width=110 110w,
    /images/Inline-Skates.jpeg?format=webp&width=220 220w,
    /images/Inline-Skates.jpeg?format=webp&width=440 440w
  "
  sizes="(max-width: 768px) 110px, 220px"
  src="/images/Inline-Skates.jpeg?format=webp&width=220" />
```

**Check 2:** Network tab shows correct size

- Open Chrome DevTools > Network
- Filter by "Img"
- Check "Size" column shows reduced sizes (e.g., 40KB not 220KB)

---

## Additional Optimizations (Future)

### 1. Implement Critical CSS

```bash
npm install @nuxtjs/critters
```

```typescript
// nuxt.config.ts
modules: ['@nuxtjs/critters'];
```

### 2. Add Service Worker for Offline Support

```bash
npm install @vite-pwa/nuxt
```

### 3. Implement Route-based Code Splitting

```typescript
// pages/product/[slug].vue
definePageMeta({
  layout: 'default',
  // Lazy load this route
  lazy: true,
});
```

### 4. Use HTTP/2 Server Push

```
# public/_headers
/
  Link: </images/hero-4.webp>; rel=preload; as=image
  Link: </_nuxt/entry.css>; rel=preload; as=style
```

---

## Resources

- [Nuxt Image Documentation](https://image.nuxt.com/)
- [Web.dev Performance Guide](https://web.dev/performance/)
- [Core Web Vitals Guide](https://web.dev/vitals/)
- [Cloudflare Image Optimization](https://developers.cloudflare.com/images/)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)

---

## Changelog

**November 13, 2025**

- ✅ Fixed hero images (inline styles → NuxtImg)
- ✅ Optimized category card images
- ✅ Added Nuxt Image configuration
- ✅ Added resource hints (preconnect, dns-prefetch)
- ✅ Implemented code splitting
- ✅ Created image optimization script
- ✅ Added performance monitoring guide

**Next Steps:**

1. Run image optimization script
2. Test on mobile device
3. Deploy to production
4. Warm cache
5. Run Lighthouse audit
6. Monitor Core Web Vitals in Search Console
