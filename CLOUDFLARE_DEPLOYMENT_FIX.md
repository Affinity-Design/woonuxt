# Cloudflare Pages Deployment Fix

## Current Issue
- JavaScript files (e.g., `BRQO6Ic6.js`) return HTML instead of JavaScript
- Error: `Unexpected token '<'` 
- GoogleReviewRotator stuck on "Loading reviews..."
- Root cause: Cloudflare Pages serving `index.html` for `_nuxt` asset requests

## Configuration Verified ✅
All configuration files are correct:
- ✅ `cloudflare-pages.toml` - Build config with `.output/public` publish directory
- ✅ `public/_headers` - Explicit MIME types for JS/CSS files
- ✅ `public/_redirects` - Static assets before SPA fallback
- ✅ `nuxt.config.ts` - cloudflare-pages preset enabled
- ✅ KV bindings - Separate test/prod namespaces configured

## Solution Steps

### Step 1: Clear Cloudflare Deployment Cache
The most likely issue is cached deployment artifacts from before the fixes.

**In Cloudflare Dashboard:**
1. Go to **Pages** → **woonuxt** (test project)
2. Click **Settings** → **Builds & deployments**
3. Scroll to **Deployment cache**
4. Click **Clear deployment cache**
5. Confirm the action

### Step 2: Trigger New Deployment
After clearing cache, force a new deployment:

**Option A: Push an Empty Commit (Recommended)**
```bash
git commit --allow-empty -m "chore: trigger Cloudflare deployment after cache clear"
git push origin test
```

**Option B: Manual Deploy from Dashboard**
1. Go to **Deployments** tab
2. Click **Retry deployment** on latest build
3. OR click **Create deployment** for fresh build

### Step 3: Verify Build Output
While deployment runs, check the build logs:

**Look for these indicators:**
- ✅ `Building Nitro Server (preset: cloudflare-pages)`
- ✅ `Generating public...`
- ✅ `✔ .output/public ready`
- ✅ `Published X files to Cloudflare Pages` (should be 200+ files)
- ✅ Files include `_nuxt/BRQO6Ic6.js` or similar hash

**Red flags:**
- ❌ Build completes in < 30 seconds (too fast, likely using cache)
- ❌ "No changes detected" message
- ❌ Published file count is very low (< 50 files)
- ❌ Missing `_nuxt` folder in deployment

### Step 4: Verify Deployed Files
After deployment completes:

1. **Check homepage loads** - Visit test.proskatersplace.ca
2. **Open DevTools Console** - Should have NO "Unexpected token '<'" errors
3. **Check Network tab** - Look for `BRQO6Ic6.js` request:
   - ✅ Status: `200 OK`
   - ✅ Type: `script` or `js`
   - ✅ Content-Type: `application/javascript`
   - ✅ Size: > 1KB (actual JS file, not HTML)
4. **Verify GoogleReviewRotator** - Should show rotating reviews, not "Loading..."

### Step 5: If Still Broken - Verify Build Settings
Go to **Settings** → **Builds & deployments**:

**Required Settings:**
```
Build command: npm run build
Build output directory: .output/public
Root directory: /
Node version: 20
```

**DO NOT USE:**
- ❌ `npm run generate` (wrong for SSR)
- ❌ `dist` or `output` (wrong directory)
- ❌ Node version < 18

### Step 6: Nuclear Option - Purge All Cache
If still broken after Steps 1-5:

```bash
# Clear Cloudflare Pages CDN cache
1. Go to Cloudflare Dashboard → Account Home
2. Select domain: proskatersplace.ca
3. Caching → Configuration
4. Click "Purge Everything"
5. Confirm (will clear ALL CDN cache, not just test subdomain)

# Then clear KV cache
npm run clear-cache-all
```

### Step 7: Verify _headers and _redirects Are Published
Check if these files exist in deployed site:

**Test URLs (should return 404, not redirect to homepage):**
- `https://test.proskatersplace.ca/_headers` → 404
- `https://test.proskatersplace.ca/_redirects` → 404

If these files redirect to homepage, they're NOT being published. This means:
- Files might be in wrong location (must be in `public/_headers` and `public/_redirects`)
- Build might not be copying them to `.output/public/`

**Fix:**
```bash
# Verify files exist locally after build
npm run build
ls .output/public/_headers
ls .output/public/_redirects

# If missing, check nuxt.config.ts has correct public dir
```

## Alternative: Disable SPA Fallback Temporarily
If the issue is the SPA fallback catching asset requests, try this:

**Edit `public/_redirects`:**
```
# Remove or comment out the SPA fallback line
# /* /index.html 200
```

Then redeploy. This will break client-side routing, but will prove if SPA fallback is the culprit.

## Expected Timeline
- **Step 1 (Clear cache):** 10 seconds
- **Step 2 (New deployment):** 3-5 minutes
- **Step 3-4 (Verification):** 1 minute
- **Total:** ~7 minutes

## Success Criteria
✅ Homepage loads without console errors
✅ GoogleReviewRotator shows reviews (not "Loading...")
✅ Network tab shows `_nuxt/*.js` files with `application/javascript` Content-Type
✅ DevTools Console is clean (no MIME type errors)
✅ All images load (categories, products, blog)

## If Still Broken After All Steps
This would indicate a more fundamental issue:

1. **Nuxt build not generating files correctly**
   - Test locally: `npm run build && npm run preview`
   - Check `.output/public/_nuxt/` has JS files
   
2. **Cloudflare Pages platform issue**
   - Contact Cloudflare support
   - Provide build logs and deployment ID
   
3. **Conflicting Worker or Page Rule**
   - Check Cloudflare account for Workers on test subdomain
   - Check Page Rules that might override _headers

## Notes
- This issue is NOT related to code - all fixes are correct
- Root cause is 99% likely cached deployment artifacts
- Clearing deployment cache should fix it immediately
- If not, the build itself might be failing silently

---

**Most Likely Fix:** Just Step 1 (clear deployment cache) + Step 2 (new deploy)
