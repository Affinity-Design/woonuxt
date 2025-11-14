# Advanced Performance Optimizations

## Additional Improvements Beyond Core Changes

This document covers **optional advanced optimizations** to push your mobile score from 85-95 to **95-100**.

---

## 1. 🎥 Video Optimization

### Problem

Your homepage has a 9.7MB video (`/videos/Inline-Skating.mp4`) that significantly impacts load time.

### Solutions

#### Option A: Compress Video (Recommended)

```bash
# Install ffmpeg (if not installed)
# Windows: choco install ffmpeg
# Mac: brew install ffmpeg

# Compress video (9.7MB → ~2MB)
ffmpeg -i public/videos/Inline-Skating.mp4 \
  -vcodec h264 \
  -crf 28 \
  -preset slow \
  -movflags +faststart \
  -vf scale=1280:720 \
  -b:v 1M \
  public/videos/Inline-Skating-optimized.mp4
```

**Parameters explained:**

- `-crf 28`: Quality (18-28 range, 28 = smaller size)
- `-preset slow`: Better compression (takes longer)
- `-movflags +faststart`: Progressive loading
- `-vf scale=1280:720`: Resize to HD (from 1920x1080)
- `-b:v 1M`: Target bitrate 1 Mbps

**Expected result:** 9.7MB → 1.5-2MB (80% reduction)

#### Option B: Lazy Load Video

```vue
<!-- Update HeroBanner.vue or wherever video is used -->
<video autoplay loop muted playsinline preload="none" loading="lazy" poster="/images/video-poster.webp">
  <source src="/videos/Inline-Skating-optimized.mp4" type="video/mp4">
</video>
```

**Impact:** Video doesn't load until scrolled into view

#### Option C: Replace with Animated WebP/GIF

```bash
# Convert video to animated WebP (much smaller)
ffmpeg -i input.mp4 \
  -vf "fps=15,scale=1280:-1:flags=lanczos" \
  -c:v libwebp \
  -lossless 0 \
  -quality 75 \
  -loop 0 \
  output.webp
```

**Pros:** Much smaller file size (500KB-1MB)
**Cons:** Lower frame rate, no audio

---

## 2. 📦 JavaScript Bundle Optimization

### Current Issue

Main JavaScript bundle: 533KB (exceeds 500KB budget)

### Solution A: Dynamic Imports

**Example - Lazy load heavy components:**

```vue
<script setup>
// Instead of:
// import GoogleReviewRotator from '@/components/GoogleReviewRotator.vue'

// Use dynamic import:
const GoogleReviewRotator = defineAsyncComponent(() => import('@/components/GoogleReviewRotator.vue'));
</script>
```

**Apply to these components:**

- GoogleReviewRotator (only visible below fold)
- ProductCard (if not above fold)
- BlogPostCard (if not above fold)

### Solution B: Remove Unused Dependencies

**Audit dependencies:**

```bash
# Install depcheck
npm install -g depcheck

# Run audit
depcheck

# Remove unused packages
npm uninstall [package-name]
```

**Check these packages:**

- `algoliasearch` (5.21.0) - Are you using it?
- `fuse.js` (7.1.0) - Duplicate of Algolia?
- `vue-spinner` (1.0.4) - Can use CSS loader instead?

### Solution C: Tree-Shaking

Ensure imports are tree-shakeable:

```javascript
// ❌ Bad (imports everything)
import _ from 'lodash-es';

// ✅ Good (imports only what's needed)
import {debounce, throttle} from 'lodash-es';
```

---

## 3. 🎨 CSS Optimization

### Solution A: Purge Unused CSS

**Install PurgeCSS:**

```bash
npm install -D @fullhuman/postcss-purgecss
```

**Configure in `nuxt.config.ts`:**

```typescript
export default defineNuxtConfig({
  postcss: {
    plugins: {
      '@fullhuman/postcss-purgecss': {
        content: ['./components/**/*.{vue,js}', './layouts/**/*.vue', './pages/**/*.vue', './plugins/**/*.{js,ts}', './nuxt.config.{js,ts}'],
        safelist: ['html', 'body', 'nuxt-icon', 'iconify'],
      },
    },
  },
});
```

**Expected savings:** 17KB → 8-10KB CSS

### Solution B: Inline Critical CSS

For absolute fastest render:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  hooks: {
    'build:before': () => {
      // Extract critical CSS for above-fold content
      // Inline it in <head>
    },
  },
});
```

---

## 4. 🔤 Font Optimization

### Current Status

✅ No web fonts detected (using system fonts)

### Recommendation

If you add custom fonts in the future:

```typescript
// nuxt.config.ts
app: {
  head: {
    link: [
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/fonts/your-font.woff2',
        crossorigin: 'anonymous',
      },
    ],
  },
}
```

**Use font-display: swap:**

```css
@font-face {
  font-family: 'YourFont';
  src: url('/fonts/your-font.woff2') format('woff2');
  font-display: swap; /* Show fallback immediately */
  font-weight: 400;
}
```

---

## 5. 🌐 CDN & Edge Optimization

### Cloudflare Settings

**Polish (Image Optimization):**

1. Go to Cloudflare Dashboard > Speed > Optimization
2. Enable **Polish** → "Lossy"
3. Enable **WebP**

**Rocket Loader (Async JS):**

- ⚠️ Can cause issues with some apps
- Test thoroughly before enabling

**Mirage (Lazy Load Images):**

- Enable for automatic lazy loading
- Works alongside your Nuxt Image setup

**Auto Minify:**

- ✅ Enable JavaScript
- ✅ Enable CSS
- ✅ Enable HTML

---

## 6. 📊 Resource Prioritization

### Add fetchpriority Attribute

**Update HeroBanner.vue:**

```vue
<NuxtImg
  src="/images/hero-4.jpg"
  width="1400"
  height="800"
  loading="eager"
  fetchpriority="high"  <!-- Add this -->
  preload
  ...
/>
```

**Update index.vue (first category image):**

```vue
<CategoryCard
  v-for="(category, i) in productCategories"
  :key="category.slug"
  :node="category"
  :image-loading="i === 0 ? 'eager' : 'lazy'"
  :fetchpriority="i === 0 ? 'high' : 'low'"  <!-- Add this -->
/>
```

---

## 7. 🔄 Service Worker & Offline Support

### Install PWA Module

```bash
npm install @vite-pwa/nuxt
```

### Configure

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vite-pwa/nuxt'],
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'ProSkaters Place Canada',
      short_name: 'ProSkaters',
      theme_color: '#ffffff',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,webp}'],
    },
  },
});
```

**Benefits:**

- Offline support
- Faster repeat visits
- Install as app prompt

---

## 8. 📱 Mobile-Specific Optimizations

### Reduce Mobile Image Sizes Further

```typescript
// nuxt.config.ts - image.presets
presets: {
  categoryMobile: {
    modifiers: {
      format: 'webp',
      quality: 80,  // Lower for mobile
      width: 110,   // Mobile size only
      height: 124,
      fit: 'cover',
    },
  },
}
```

**Usage:**

```vue
<NuxtImg :src="imageSrc" :preset="isMobile ? 'categoryMobile' : 'category'" ... />
```

### Viewport Meta Optimization

```typescript
// nuxt.config.ts
app: {
  head: {
    meta: [
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
    ],
  },
}
```

---

## 9. 🎯 Third-Party Script Optimization

### Current Third-Party Scripts

- Cloudflare Turnstile (challenges.cloudflare.com)
- Cloudflare Insights (static.cloudflareinsights.com)
- YouTube embeds (if any)

### Optimization Strategy

**Defer Cloudflare Insights:**

```typescript
// nuxt.config.ts - app.head.script
{
  src: '/beacon.min.js/vcd15cbe...',
  defer: true,
  // or
  async: true,
}
```

**Facade Pattern for YouTube:**

```vue
<!-- Instead of embedding iframe directly -->
<template>
  <div class="youtube-facade" @click="loadYouTube">
    <img :src="thumbnailUrl" alt="Video thumbnail" />
    <button>Play Video</button>
  </div>
</template>

<script setup>
const loadYouTube = () => {
  // Only load iframe when user clicks
  // Saves ~700KB per video
};
</script>
```

---

## 10. 🔍 Monitoring & Analytics

### Install Performance Monitoring

**Option A: SpeedCurve (Free tier available)**

```typescript
// nuxt.config.ts
app: {
  head: {
    script: [
      {
        src: 'https://cdn.speedcurve.com/js/lux.js?id=YOUR_ID',
        defer: true,
      },
    ],
  },
}
```

**Option B: Web Vitals API (Self-hosted)**

```typescript
// plugins/web-vitals.client.ts
import {onCLS, onFID, onLCP, onFCP, onTTFB} from 'web-vitals';

export default defineNuxtPlugin(() => {
  onCLS(console.log);
  onFID(console.log);
  onLCP(console.log);
  onFCP(console.log);
  onTTFB(console.log);
});
```

Install:

```bash
npm install web-vitals
```

---

## 11. 📈 Advanced Caching Strategies

### HTTP/2 Server Push

**Create `public/_headers` with push directives:**

```
/
  Link: </images/hero-4.webp>; rel=preload; as=image; type=image/webp
  Link: </_nuxt/entry.css>; rel=preload; as=style
  Link: </_nuxt/entry.js>; rel=preload; as=script

/product-category/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
```

### Stale-While-Revalidate

```typescript
// nuxt.config.ts - routeRules
routeRules: {
  '/': {
    prerender: true,
    cache: {
      maxAge: 60 * 60 * 24, // 24 hours
      staleMaxAge: 60 * 60 * 24 * 7, // 7 days stale
      swr: true,
    },
  },
}
```

---

## 12. 🧪 A/B Testing Performance

### Test Different Strategies

**Create variants:**

```bash
# Variant A: Current implementation
# Variant B: Lazy load everything below fold
# Variant C: No video at all
# Variant D: Animated WebP instead of video
```

**Measure with Lighthouse CI:**

```bash
npm install -g @lhci/cli

# Run tests
lhci autorun --config=lighthouserc.js
```

**Example `lighthouserc.js`:**

```javascript
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000'],
      numberOfRuns: 5,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', {minScore: 0.9}],
        'first-contentful-paint': ['error', {maxNumericValue: 2000}],
        'largest-contentful-paint': ['error', {maxNumericValue: 2500}],
      },
    },
  },
};
```

---

## Implementation Priority

### High Impact, Low Effort (Do These First)

1. ✅ **Video compression** - 80% size reduction, 30min effort
2. ✅ **Lazy load components** - Reduces initial JS, 1hr effort
3. ✅ **Add fetchpriority** - Prioritizes critical resources, 15min effort

### Medium Impact, Medium Effort

4. 🔄 **PurgeCSS** - Removes unused CSS, 1-2hr effort
5. 🔄 **Service Worker** - Caching for repeat visits, 2-3hr effort
6. 🔄 **YouTube facades** - If you have YouTube embeds, 1hr effort

### Low Impact, High Effort (Optional)

7. 🔄 **Remove unused dependencies** - Smaller bundle, 2-4hr effort
8. 🔄 **Advanced monitoring** - Long-term insights, 3-5hr effort

---

## Expected Results After All Optimizations

| Metric          | Baseline | After Core | After Advanced | Target |
| --------------- | -------- | ---------- | -------------- | ------ |
| **Performance** | 62       | 85-90      | **95-100**     | 90+    |
| **FCP**         | 4.6s     | 1.8s       | **<1.2s**      | <1.8s  |
| **LCP**         | 17.0s    | 2.5s       | **<1.8s**      | <2.5s  |
| **TBT**         | 50ms     | 40ms       | **<30ms**      | <200ms |
| **SI**          | 5.5s     | 3.0s       | **<2.5s**      | <3.4s  |
| **Page Size**   | 13.8MB   | 2MB        | **<1.5MB**     | <2MB   |

---

## Testing Checklist

After implementing advanced optimizations:

- [ ] Run Lighthouse (Mobile) - Score 95+
- [ ] Test on real 3G connection (Chrome DevTools)
- [ ] Test on real device (iPhone, Android)
- [ ] Check video loads correctly
- [ ] Verify lazy loading works (scroll test)
- [ ] Check service worker registers (if implemented)
- [ ] Monitor memory usage (Chrome DevTools > Performance)
- [ ] Test offline functionality (if PWA enabled)

---

## Resources

- [Web.dev - Optimize LCP](https://web.dev/optimize-lcp/)
- [Web.dev - Lazy Loading](https://web.dev/lazy-loading/)
- [FFmpeg Compression Guide](https://trac.ffmpeg.org/wiki/Encode/H.264)
- [PurgeCSS Documentation](https://purgecss.com/)
- [PWA Best Practices](https://web.dev/pwa/)

---

**Last Updated:** November 13, 2025
**Estimated Additional Time:** 4-8 hours
**Expected Gain:** +5-10 performance points (90 → 95-100)
