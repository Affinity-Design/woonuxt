# Environment Variable Mismatch Issue

## Problem
Build scripts use `CF_KV_NAMESPACE_ID_*` environment variables, but Cloudflare Pages might not have these set correctly, causing:
- Categories loading slowly (not cached)
- Products not cached properly
- Build scripts failing silently

## Current Script Configuration

### build-categories-cache.js
```javascript
CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA
```

### build-products-cache.js
```javascript
CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA
```

### clear-kv-cache-safe.js
Uses environment-specific variables:
- Test: `CF_KV_NAMESPACE_ID_CACHE_TEST`, `CF_KV_NAMESPACE_ID_SCRIPT_DATA_TEST`
- Prod: `CF_KV_NAMESPACE_ID_CACHE_PROD`, `CF_KV_NAMESPACE_ID_SCRIPT_DATA_PROD`

## Required Environment Variables in Cloudflare Pages

### For TEST Branch (test.proskatersplace.ca)
```
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token
CF_KV_NAMESPACE_ID_SCRIPT_DATA=<test-script-data-namespace-id>
CF_KV_NAMESPACE_ID_CACHE=<test-cache-namespace-id>

# Optional: For clear-kv-cache-safe.js
CF_KV_NAMESPACE_ID_CACHE_TEST=<test-cache-namespace-id>
CF_KV_NAMESPACE_ID_SCRIPT_DATA_TEST=<test-script-data-namespace-id>
```

### For MASTER Branch (proskatersplace.ca)
```
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token
CF_KV_NAMESPACE_ID_SCRIPT_DATA=e342d1fa4ddf42f485846a1086ad3523
CF_KV_NAMESPACE_ID_CACHE=269504c9557467b950653d5a21f9434

# Optional: For clear-kv-cache-safe.js
CF_KV_NAMESPACE_ID_CACHE_PROD=e342d1fa4ddf42f485846a1086ad3523
CF_KV_NAMESPACE_ID_SCRIPT_DATA_PROD=269504c9557467b950653d5a21f9434
```

## How to Verify

### In Cloudflare Dashboard
1. Go to **Pages** → Your project (woonuxt)
2. Click **Settings** → **Environment variables**
3. Check both **Production** and **Preview** tabs
4. Ensure ALL required variables are set

### Expected Variables:
- ✅ `CF_ACCOUNT_ID` - Your Cloudflare account ID
- ✅ `CF_API_TOKEN` - API token with KV write permissions
- ✅ `CF_KV_NAMESPACE_ID_SCRIPT_DATA` - Script data namespace ID
- ✅ `CF_KV_NAMESPACE_ID_CACHE` - Cache namespace ID (not used by build scripts, but needed by runtime)
- ✅ `GQL_HOST` - WordPress GraphQL endpoint
- ✅ `NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE` - Exchange rate for pricing

## How Build Process Works

1. **npm run build** runs:
   ```bash
   node scripts/build-sitemap.js && nuxt build
   ```

2. **nuxt build** triggers:
   ```bash
   node scripts/build-all-routes.js  # (via package.json build script)
   ```

3. **build-all-routes.js** calls:
   - `build-blog-routes.js` (generates blog routes)
   - Does NOT call category/product cache scripts!

4. **Problem**: Category and product cache scripts are NOT being run during build!

## Missing Step in Build Chain

The build process should run:
```bash
npm run build
  ↓
node scripts/build-sitemap.js
  ↓
nuxt build (prerender happens here)
  ↓
MISSING: node scripts/setup-script.js  ← This populates KV cache!
```

## Solution

### Option 1: Update package.json build command
```json
"build": "node scripts/build-sitemap.js && nuxt build && node scripts/setup-script.js"
```

### Option 2: Update Cloudflare Pages build command
In Cloudflare Pages settings, change build command to:
```bash
npm run build && node scripts/setup-script.js
```

### Option 3: Create a new unified build script
```json
"build": "node scripts/build-complete.js"
```

Create `scripts/build-complete.js`:
```javascript
const {execSync} = require('child_process');

console.log('1️⃣ Generating sitemap...');
execSync('node scripts/build-sitemap.js', {stdio: 'inherit'});

console.log('2️⃣ Building Nuxt app...');
execSync('nuxt build', {stdio: 'inherit'});

console.log('3️⃣ Populating KV cache...');
execSync('node scripts/setup-script.js', {stdio: 'inherit'});

console.log('✅ Build complete!');
```

## Current Status
- ❌ Categories NOT cached (no prerendering happening)
- ❌ Products NOT cached (scripts not running)
- ❌ KV namespaces might be empty
- ❌ Slow page loads because nothing is cached

## Immediate Fix
Run this manually after deployment:
```bash
npm run setup-cache
npm run warm-cache
```

Or trigger via API:
```bash
POST /api/trigger-cache-warming
Authorization: Bearer $REVALIDATION_SECRET
```
