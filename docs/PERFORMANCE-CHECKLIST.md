# Mobile Performance - Quick Action Checklist

## ✅ Completed (Already Applied)

1. **Fixed Hero Images** - Converted inline CSS backgrounds to NuxtImg components

   - `inline-skates.jpg` now uses NuxtImg with WebP conversion
   - `roller-skates.jpg` now uses NuxtImg with WebP conversion
   - Added lazy loading and placeholders

2. **Optimized Category Cards** - Updated CategoryCard.vue

   - Added `format="webp"` for automatic WebP conversion
   - Added `fit="cover"` for proper image cropping
   - Fixed sizes attribute for proper responsive sizing
   - Quality set to 85 for good balance

3. **Added Nuxt Image Configuration** - Enhanced nuxt.config.ts

   - Configured quality presets (category, hero, product)
   - Added responsive breakpoints
   - Enabled WebP, AVIF, and JPEG fallbacks
   - Set up 1x and 2x density support

4. **Added Resource Hints** - Improved connection timing

   - Preconnect to WordPress backend (proskatersplace.com)
   - DNS prefetch for Cloudflare Insights
   - Saves 200-400ms on first connection

5. **Implemented Code Splitting** - Reduced main bundle size

   - Separated Stripe, Vue, and vendor chunks
   - Smaller initial JavaScript payload
   - Faster page load times

6. **Created Documentation**
   - `docs/mobile-performance-optimization.md` - Full guide
   - Includes troubleshooting section
   - Performance budget recommendations

---

## 🔄 Next Steps (Do These Now)

### 1. Install Sharp (if not already installed)

```bash
npm install sharp@0.32.6 --save-dev
```

**Why:** Required for image optimization to work

### 2. Run Image Optimization Script

```bash
npm run optimize-images
```

**What it does:**

- Resizes hero images to 1920x550px
- Resizes category images to 440x496px (2x for retina)
- Converts all to WebP
- Creates JPEG fallbacks
- Outputs to `public/images/optimized/`

**Expected savings:** ~2MB reduction

### 3. Replace Original Images

```bash
# Review optimized images first
# Then replace originals with optimized versions
# Keep backups just in case!
```

### 4. Build and Test Locally

```bash
npm run build
npm run preview
```

Then test:

- Open http://localhost:3000
- Check Network tab (images should be ~40-50KB each, not 200KB+)
- Verify WebP images are loading
- Check mobile view (Chrome DevTools > Device Mode)

### 5. Run Lighthouse Audit

```bash
# Install Lighthouse CLI if you don't have it
npm install -g lighthouse

# Run mobile audit
lighthouse http://localhost:3000 --preset=mobile --view

# Expected results:
# - Performance: 85-95 (up from 62)
# - LCP: <3s (down from 17s)
# - FCP: <2s (down from 4.6s)
```

### 6. Deploy to Production

```bash
npm run build
# Deploy to Cloudflare Pages
```

### 7. Warm Cache

```bash
# After deployment
npm run warm-cache

# Or via API:
curl -X POST https://proskatersplace.ca/api/trigger-cache-warming \
  -H "Authorization: Bearer $REVALIDATION_SECRET"
```

### 8. Test Production Site

```bash
# Run Lighthouse on production
lighthouse https://proskatersplace.ca --preset=mobile --view
```

---

## 📊 Expected Improvements

| Metric            | Before | Expected After | Target |
| ----------------- | ------ | -------------- | ------ |
| Performance Score | 62     | 85-95          | 90+    |
| LCP               | 17.0s  | 2-3s           | <2.5s  |
| FCP               | 4.6s   | 1.5-2s         | <1.8s  |
| Total Page Size   | 13.8MB | <2MB           | <2MB   |
| Images Total      | 3.4MB  | <500KB         | <1MB   |

---

## 🚨 Critical Warnings

### DO NOT:

- ❌ Skip the image optimization step (biggest impact!)
- ❌ Deploy without testing locally first
- ❌ Forget to warm the cache after deployment
- ❌ Delete original images before backing them up

### DO:

- ✅ Keep backups of original images
- ✅ Test on real mobile device (not just DevTools)
- ✅ Monitor PageSpeed Insights after deployment
- ✅ Check image quality on retina displays

---

## 🐛 Common Issues & Fixes

### Issue: "Sharp not found"

```bash
# Fix:
npm install sharp@0.32.6 --save-dev
npm run optimize-images
```

### Issue: Images still large after optimization

```bash
# Fix 1: Clear Nuxt cache
rm -rf .nuxt
npm run dev

# Fix 2: Clear browser cache
# Chrome DevTools > Network > Disable cache (checkbox)
```

### Issue: WebP not loading

```bash
# Fix: Check browser console for errors
# If fallback needed, NuxtImg automatically serves JPEG
```

### Issue: Build fails

```bash
# Fix: Check Node version (should be 18+)
node --version

# Update if needed:
nvm install 18
nvm use 18
```

---

## 📈 Monitoring

After deployment, monitor these:

1. **Google Search Console** - Core Web Vitals report
2. **Cloudflare Analytics** - Bandwidth usage (should decrease)
3. **PageSpeed Insights** - Run weekly audits
4. **Real Device Testing** - Test on actual mobile devices

---

## 🎯 Success Criteria

You've succeeded when:

- ✅ Mobile Performance Score: 85+
- ✅ LCP: <3s on mobile
- ✅ Total page size: <2MB
- ✅ All images: WebP format
- ✅ Category images: ~40-50KB each
- ✅ Hero images: ~200-300KB each
- ✅ No console errors

---

## 📞 Need Help?

If you encounter issues:

1. Check `docs/mobile-performance-optimization.md` for detailed troubleshooting
2. Review console errors in browser DevTools
3. Check build logs for errors
4. Verify all environment variables are set

---

## 🚀 Quick Commands Reference

```bash
# Image optimization
npm run optimize-images

# Build & preview
npm run build && npm run preview

# Lighthouse audit (local)
lighthouse http://localhost:3000 --preset=mobile --view

# Lighthouse audit (production)
lighthouse https://proskatersplace.ca --preset=mobile --view

# Cache warming
npm run warm-cache

# Debug cache
npm run debug:cache
```

---

**Last Updated:** November 13, 2025
**Estimated Time to Complete:** 30-45 minutes
**Expected Performance Gain:** +23-33 points (62 → 85-95)
