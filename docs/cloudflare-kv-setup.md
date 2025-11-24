# Cloudflare KV Setup for Test & Production Environments

## Overview

This guide explains how to set up **separate Cloudflare KV namespaces** for test and production environments to prevent cache conflicts.

## Problem

Currently, both `proskatersplace.ca` (production) and `test.proskatersplace.ca` (test) share the same KV namespaces:

- `proskatersplace_cache` (ID: e342d1fa4ddf42f485846a1086ad3523)
- `NUXT_SCRIPT_DATA` (ID: 269504c9557467b950653d5a21f9434)

**Risk:** Clearing cache for test would also clear production cache! ❌

## Solution: Separate Namespaces

### Step 1: Create 4 KV Namespaces in Cloudflare

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **KV**
2. Click **Create namespace**
3. Create these 4 namespaces:

| Namespace Name                     | Environment | Purpose                                         |
| ---------------------------------- | ----------- | ----------------------------------------------- |
| `proskatersplace-prod-cache`       | Production  | Route/page caching                              |
| `proskatersplace-prod-script-data` | Production  | Build artifacts (products, categories, sitemap) |
| `proskatersplace-test-cache`       | Test        | Route/page caching                              |
| `proskatersplace-test-script-data` | Test        | Build artifacts (products, categories, sitemap) |

4. **Write down the Namespace IDs** for each (looks like: `e342d1fa4ddf42f485846a1086ad3523`)

### Step 2: Configure Cloudflare Pages Environment Variables

#### For **Production** (proskatersplace.ca - master branch):

1. Go to **Cloudflare Dashboard** → **Pages** → **proskatersplace**
2. Click **Settings** → **Environment Variables**
3. Under **Production** tab, add:

```
CF_KV_NAMESPACE_ID_CACHE=<prod-cache-namespace-id>
CF_KV_NAMESPACE_ID_SCRIPT_DATA=<prod-script-data-namespace-id>
```

4. Also add these if not already present:

```
CF_ACCOUNT_ID=<your-cloudflare-account-id>
CF_API_TOKEN=<your-cloudflare-api-token>
```

#### For **Test** (test.proskatersplace.ca - test branch):

1. Same location, but under **Preview** tab (or branch-specific)
2. Add:

```
CF_KV_NAMESPACE_ID_CACHE=<test-cache-namespace-id>
CF_KV_NAMESPACE_ID_SCRIPT_DATA=<test-script-data-namespace-id>
```

3. Also add:

```
CF_ACCOUNT_ID=<your-cloudflare-account-id>
CF_API_TOKEN=<your-cloudflare-api-token>
```

### Step 3: Configure KV Bindings in Cloudflare Pages

Cloudflare Pages needs to **bind** the KV namespaces to your application.

1. Go to **Settings** → **Functions** → **KV namespace bindings**
2. For **Production**:

   - Binding name: `NUXT_CACHE` → Select `proskatersplace-prod-cache`
   - Binding name: `NUXT_SCRIPT_DATA` → Select `proskatersplace-prod-script-data`

3. For **Preview/Test**:
   - Binding name: `NUXT_CACHE` → Select `proskatersplace-test-cache`
   - Binding name: `NUXT_SCRIPT_DATA` → Select `proskatersplace-test-script-data`

### Step 4: Update Local Environment Variables

Create separate `.env` files for each environment:

**`.env.production`** (for production builds):

```bash
CF_ACCOUNT_ID=your_account_id
CF_API_TOKEN=your_api_token
CF_KV_NAMESPACE_ID_CACHE=<prod-cache-namespace-id>
CF_KV_NAMESPACE_ID_SCRIPT_DATA=<prod-script-data-namespace-id>
```

**`.env.test`** (for test builds):

```bash
CF_ACCOUNT_ID=your_account_id
CF_API_TOKEN=your_api_token
CF_KV_NAMESPACE_ID_CACHE=<test-cache-namespace-id>
CF_KV_NAMESPACE_ID_SCRIPT_DATA=<test-script-data-namespace-id>
```

### Step 5: Update Package.json Scripts

Add environment-specific cache clearing commands:

```json
{
  "scripts": {
    "clear-cache-test": "node scripts/clear-kv-cache.js --env test",
    "clear-cache-prod": "node scripts/clear-kv-cache.js --env prod",
    "rebuild-cache-test": "npm run setup-cache && npm run warm-cache",
    "rebuild-cache-prod": "npm run setup-cache && npm run warm-cache"
  }
}
```

## How to Clear Cache Safely

### For Test Environment ONLY:

```bash
# Option 1: Use environment file
node scripts/clear-kv-cache.js --all

# Option 2: Specify namespace IDs directly
CF_KV_NAMESPACE_ID_CACHE=<test-cache-id> CF_KV_NAMESPACE_ID_SCRIPT_DATA=<test-script-data-id> node scripts/clear-kv-cache.js --all
```

### For Production (use with caution!):

```bash
CF_KV_NAMESPACE_ID_CACHE=<prod-cache-id> CF_KV_NAMESPACE_ID_SCRIPT_DATA=<prod-script-data-id> node scripts/clear-kv-cache.js --all
```

## Verification

After setup, verify the correct namespaces are being used:

1. Check **Cloudflare Dashboard** → **KV** → Each namespace should show activity
2. Check **Cloudflare Pages Deployment Logs** for KV-related messages
3. Test clearing cache on test environment - production should be unaffected

## Current Namespace IDs (from screenshot)

| Name                    | Current ID                         | Recommended Use     |
| ----------------------- | ---------------------------------- | ------------------- |
| `proskatersplace_cache` | `e342d1fa4ddf42f485846a1086ad3523` | Keep for production |
| `NUXT_SCRIPT_DATA`      | `269504c9557467b950653d5a21f9434`  | Keep for production |

**Action Required:** Create 2 NEW namespaces for test environment.

## Troubleshooting

### Issue: "Namespace not found"

- Verify KV bindings are set correctly in Cloudflare Pages settings
- Check that namespace IDs match in environment variables

### Issue: "Cache still shared between environments"

- Double-check environment variables are set for correct branch/environment
- Verify KV bindings point to different namespaces

### Issue: "Build fails with KV errors"

- Ensure API token has KV write permissions
- Check account ID is correct

## References

- [Cloudflare KV Documentation](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Cloudflare Pages Environment Variables](https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables)
- [Nuxt Cloudflare Storage](https://nuxt.com/docs/getting-started/deployment#cloudflare)
