# Turnstile Integration for WooNuxt

This document outlines the Cloudflare Turnstile integration to prevent spam orders while maintaining checkout functionality.

## Overview

We've implemented Cloudflare Turnstile integration that:

- ✅ Prevents spam orders on checkout
- ✅ Maintains full checkout functionality
- ✅ Works with all payment methods (Helcim, COD, etc.)
- ✅ Server-side verification for security
- ✅ Graceful error handling

## Components Added/Modified

### 1. Server-Side API Endpoints

**`/server/api/verify-turnstile.post.ts`**

- Dedicated Turnstile verification endpoint
- Validates tokens with Cloudflare's API
- Includes IP verification for enhanced security

**`/server/api/create-admin-order.post.ts`** (Modified)

- Now verifies Turnstile tokens before order creation
- Rejects orders without valid tokens
- Logs security verification attempts

### 2. Frontend Components

**`/pages/checkout.vue`** (Modified)

- Added Turnstile widget to checkout form
- Integrated verification into payment flow
- Shows appropriate error messages
- Prevents checkout without verification

**`/composables/useTurnstile.ts`** (New)

- Reusable Turnstile functionality
- Centralized token management
- Error handling and state management

**`/components/generalElements/TurnstileWidget.vue`** (New)

- Reusable Vue component for Turnstile
- Auto-verification options
- Event handling and state management

### 3. Configuration

**Required Environment Variables:**

```bash
TURNSTYLE_SITE_KEY="your_site_key_here"
TURNSTYLE_SECRET_KEY="your_secret_key_here"
```

**`nuxt.config.ts`** (Already configured)

- Site key configuration
- Runtime config setup

## How It Works

### Checkout Flow with Turnstile

1. **User loads checkout page**

   - Turnstile widget loads automatically
   - User must complete challenge before proceeding

2. **User submits checkout form**

   - Frontend verifies Turnstile token exists
   - Calls `verifyTurnstile()` function
   - Prevents submission if verification fails

3. **Server processes order**

   - `create-admin-order.post.ts` verifies token with Cloudflare
   - Rejects order if token is invalid or missing
   - Proceeds with order creation if verification passes

4. **Order completion**
   - Standard order processing continues
   - User receives confirmation as normal

### Security Features

- **Client-side validation**: Prevents unnecessary server calls
- **Server-side verification**: Authoritative security check
- **IP validation**: Additional security layer
- **Token expiration**: Automatic token refresh
- **Error handling**: Graceful degradation

## Testing the Integration

### 1. Enable Turnstile

Make sure you have the environment variables set:

```bash
TURNSTYLE_SITE_KEY="your_actual_site_key"
TURNSTYLE_SECRET_KEY="your_actual_secret_key"
```

### 2. Test Checkout Process

1. Go to `/checkout` page
2. Fill out checkout form
3. Complete Turnstile challenge
4. Submit order
5. Verify order is created successfully

### 3. Test Without Turnstile

1. Try to submit without completing challenge
2. Should see error: "Please complete the security verification"
3. Order should NOT be created

### 4. Test API Directly

```powershell
# Test verification endpoint
Invoke-RestMethod -Uri "https://localhost:3000/api/verify-turnstile" -Method Post -ContentType "application/json" -Body '{"turnstileToken":"test_token"}'

# Should return error for invalid token
```

## Troubleshooting

### Common Issues

**1. "Security check failed"**

- Check environment variables are set correctly
- Verify site key matches domain
- Check secret key is valid

**2. Turnstile not loading**

- Verify VueTurnstile package is installed: `npm install vue-turnstile`
- Check browser console for JavaScript errors
- Ensure site key is configured correctly

**3. Orders still being created without Turnstile**

- Check server logs for verification messages
- Verify API endpoint is being called
- Check that `turnstileToken` is being passed to backend

### Debug Mode

Enable debug logging in browser console:

```javascript
// In browser console
localStorage.debug = 'turnstile:*';
```

## Configuration Options

### Turnstile Widget Options

```vue
<VueTurnstile
  :site-key="siteKey"
  :theme="'light'" // or 'dark', 'auto'
  :size="'normal'" // or 'compact'
  :reset-interval="30000" // 30 seconds
/>
```

### Server Configuration

```typescript
// In nuxt.config.ts
runtimeConfig: {
  public: {
    turnstyleSiteKey: process.env.TURNSTYLE_SITE_KEY,
    turnstyleSecretKey: process.env.TURNSTYLE_SECRET_KEY, // Server-only
  }
}
```

## Maintenance

### Regular Tasks

1. Monitor failed verification attempts in logs
2. Update Turnstile package periodically
3. Check Cloudflare dashboard for analytics
4. Test checkout flow after deployments

### Monitoring

- Server logs show verification attempts
- Cloudflare dashboard shows challenge statistics
- Order creation logs indicate successful prevention

## Next Steps

Once tested and confirmed working:

1. Deploy to staging environment
2. Test with real traffic
3. Monitor spam reduction metrics
4. Deploy to production
5. Update monitoring dashboards

## Impact on User Experience

**Positive:**

- Eliminates spam orders
- Clean order management
- Reduced manual review needed

**Minimal Negative:**

- Adds ~2-3 seconds to checkout
- One additional step for users
- Requires JavaScript enabled

The security benefits far outweigh the minor UX impact, and legitimate customers should have no issues completing the verification.
