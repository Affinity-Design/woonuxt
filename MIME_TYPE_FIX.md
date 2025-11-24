# 🚨 MIME Type Error Fix - Cloudflare Pages

## Problem

```
Failed to load module script: Expected a JavaScript module script
but the server responded with a MIME type of "text/html".
```

**Root Cause:** Cloudflare Pages is serving `index.html` instead of actual JS/CSS files because:

1. Build artifacts are missing or corrupted
2. Cloudflare cache is serving stale/incorrect content
3. `_redirects` file wasn't explicit enough about asset routing

---

## ✅ Fixes Applied

### 1. Updated `public/_redirects`

- Added explicit rules for `.js`, `.mjs`, `.css`, `.json`, `.wasm` files
- Added image asset rules
- Ensures `_nuxt` assets are served BEFORE SPA fallback

### 2. Updated `public/_headers`

- Added explicit `Content-Type` headers for all asset types
- JavaScript files: `application/javascript; charset=utf-8`
- CSS files: `text/css; charset=utf-8`
- JSON files: `application/json; charset=utf-8`
- Proper cache headers: `immutable` for hashed assets

---

## 🔧 Required Actions

### Step 1: Clear Cloudflare KV Cache

```bash
node scripts/clear-kv-cache.js
```

### Step 2: Clear Local Build

```bash
# Remove old build artifacts
rm -rf .nuxt
rm -rf .output
rm -rf dist
rm -rf node_modules/.cache
```

### Step 3: Clean Rebuild

```bash
npm install
npm run build
```

### Step 4: Test Locally

```bash
npm run preview
```

Open http://localhost:3000/product/mesmer-throne-levi-van-rijn-pro-skates
Check console for errors - should be clean!

### Step 5: Deploy to Cloudflare Pages

**Option A: Via Git Push (Recommended)**

```bash
git add .
git commit -m "fix: MIME type errors - explicit asset routing and headers"
git push origin master
```

**Option B: Manual Deploy**

1. Go to Cloudflare Pages dashboard
2. Navigate to your project
3. Click "Create deployment"
4. Upload `.output/public` folder
5. Wait for deployment

### Step 6: Clear Cloudflare Cache

**Via Cloudflare Dashboard:**

1. Go to your domain in Cloudflare
2. Click "Caching" → "Configuration"
3. Click "Purge Everything"
4. Confirm

**Via API (if you have access):**

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

### Step 7: Verify Fix

1. Wait 2-3 minutes after cache purge
2. Open https://test.proskatersplace.ca/product/mesmer-throne-levi-van-rijn-pro-skates
3. Open DevTools Console (F12)
4. Refresh with cache clear (Ctrl+Shift+R or Cmd+Shift+R)
5. Should see NO MIME type errors!

---

## 🔍 Debugging

### Check if Files Exist on Server

Open these URLs in browser:

- https://test.proskatersplace.ca/_nuxt/entry.KChg6YqY.css
- https://test.proskatersplace.ca/_nuxt/CPfbRG0m.js

**Expected:** File downloads or shows content
**If you see:** HTML page → Files are missing from build!

### Check MIME Types

```bash
curl -I https://test.proskatersplace.ca/_nuxt/entry.KChg6YqY.css
```

Look for:

```
Content-Type: text/css; charset=utf-8   ✅ CORRECT
Content-Type: text/html                 ❌ WRONG
```

### Common Issues

**1. Files Still Returning HTML**

- Cloudflare cache not cleared
- Old deployment still active
- `_redirects` file not deployed correctly

**2. 404 on \_nuxt Files**

- Build failed or incomplete
- `.output/public/_nuxt` folder is empty
- Deployment didn't include all files

**3. JS Files Load But Still Get Error**

- Mixed old/new files (partial cache clear)
- Browser cache not cleared
- Service worker interfering

---

## 📝 Prevention

### Always Do After Major Updates:

1. Clear KV cache: `node scripts/clear-kv-cache.js`
2. Clean build: `rm -rf .nuxt .output && npm run build`
3. Clear Cloudflare cache after deploy
4. Test in incognito mode

### Build Verification Checklist:

- [ ] `.output/public/_nuxt` folder exists
- [ ] Contains `.js`, `.css`, `.json` files
- [ ] `index.html` exists in `.output/public`
- [ ] `_redirects` file is in `.output/public`
- [ ] `_headers` file is in `.output/public`

---

## 🆘 If Issue Persists

1. **Check Cloudflare Pages Build Logs**

   - Look for build failures
   - Check if all assets were uploaded

2. **Try Different Product Pages**

   - If only some pages fail: cache issue
   - If all pages fail: build/deployment issue

3. **Rollback**

   ```bash
   # Go to previous working commit
   git log --oneline
   git checkout <previous-commit-hash>
   git push origin master --force
   ```

4. **Contact Cloudflare Support**
   - Provide: deployment ID, error logs, affected URLs
   - Ask them to check: routing, MIME types, asset delivery

---

## 📊 Success Criteria

✅ All `.js` files load with `Content-Type: application/javascript`
✅ All `.css` files load with `Content-Type: text/css`
✅ No console errors about MIME types
✅ Product pages load completely with images and functionality
✅ Network tab shows 200 status for all `_nuxt/*` assets

---

**Created:** November 24, 2025
**Issue:** MIME type errors on test.proskatersplace.ca
**Status:** FIXES APPLIED - AWAITING DEPLOYMENT
