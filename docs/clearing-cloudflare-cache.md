# Cloudflare KV Cache Management

## When to Clear Cache

Clear the Cloudflare KV cache when:

- ✅ **After major code updates** (like our recent SEO/image changes)
- ✅ **Changed data structures** (modified product/category schemas)
- ✅ **Cache corruption** (pages not loading, images broken)
- ✅ **After WordPress content updates** that aren't reflecting
- ✅ **Testing new features** that depend on cached data

## Quick Commands

### 1. **Clear Page Cache Only** (Recommended for most cases)

```bash
npm run clear-page-cache
```

Clears: Cached HTML pages (homepage, products, categories, blog posts)
Use when: Pages are showing old content or not loading correctly

### 2. **Clear Data Cache Only**

```bash
npm run clear-data-cache
```

Clears: Product lists, category lists (used by cache warmer)
Use when: Product/category metadata is outdated

### 3. **Clear Everything** (Nuclear option)

```bash
npm run clear-cache-all
```

Clears: Both page cache AND data cache
Use when: Major updates or complete reset needed

### 4. **Full Cache Reset** (Clear + Rebuild)

```bash
npm run reset-cache
```

Does:

1. Clears all KV data
2. Repopulates product/category lists from WordPress
3. **Does NOT warm pages** - you need to do that separately

## Complete Workflow After Major Updates

When you've made extensive code changes (like today's SEO/image updates):

```bash
# Step 1: Clear everything
npm run clear-cache-all

# Step 2: Rebuild data caches (products/categories from WordPress)
npm run setup-cache

# Step 3: Build and deploy
npm run build
# Then deploy to Cloudflare Pages

# Step 4: Warm the page cache (after deploy)
npm run warm-cache
```

## For Your Current Situation

Since you've made extensive updates and images aren't loading:

### Option A: Quick Fix (Recommended)

```bash
npm run clear-page-cache
```

Then redeploy. This clears cached HTML but keeps product/category data.

### Option B: Full Reset (If Quick Fix doesn't work)

```bash
npm run reset-cache
```

Then rebuild and redeploy.

## What Each KV Namespace Contains

### `NUXT_CACHE` (Page Cache)

- `/` (homepage HTML)
- `/product-category/*` (category pages HTML)
- `/product/*` (product pages HTML)
- `/blog/*` (blog post HTML)
- ISR-cached route data

**Size**: ~500-1000 keys depending on products/categories

### `NUXT_SCRIPT_DATA` (Data Cache)

- `cached-products` (list of all products with metadata)
- `cached-categories` (list of all categories)
- Used by cache warmer and product lookup scripts

**Size**: ~2-5 keys (just data structures)

## Troubleshooting

### "Keys still showing old data after clearing"

- Wait 60 seconds for Cloudflare propagation
- Clear browser cache (Ctrl+Shift+R)
- Try incognito mode

### "Script fails with 401 Unauthorized"

Check `.env.local` has:

```
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token
```

### "Images still not loading after cache clear"

This is likely NOT a cache issue. Check:

- `nuxt.config.ts` image provider settings
- NuxtImg vs regular `<img>` tags
- Browser console for 404 errors

## Manual Clearing (Cloudflare Dashboard)

If scripts don't work:

1. Go to Cloudflare Dashboard
2. Workers & Pages → KV
3. Find `NUXT_CACHE` namespace
4. Click "View" → Select all keys → Delete

## Performance Impact

**Clearing page cache**:

- ❌ First visitors after clear: Slow (pages regenerate)
- ✅ Run `npm run warm-cache` to pre-generate pages
- ⏱️ Takes 5-10 minutes to warm all pages

**Clearing data cache**:

- ❌ Minimal impact (only affects cache warmer)
- ✅ Rebuild with `npm run setup-cache` (2-3 minutes)

## Automated Clearing (Future Enhancement)

Consider adding cache clearing to your CI/CD:

```yaml
# .github/workflows/deploy.yml
- name: Clear cache before deploy
  run: npm run clear-page-cache

- name: Build and deploy
  run: npm run build

- name: Warm cache after deploy
  run: npm run warm-cache
```

---

**Last Updated**: November 14, 2025
**For**: WooNuxt Cloudflare Pages deployment
