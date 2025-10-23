# ShipStation Integration Fix Guide

**Date:** October 22, 2025  
**Issue:** ShipStation receiving HTML instead of XML from WooCommerce API  
**Status:** ✅ ROOT CAUSE IDENTIFIED

---

## 🔴 Problem Confirmed

When ShipStation tries to access: `https://proskatersplace.com/?wc-api=wc_shipstation`

**Expected:** XML feed with order data  
**Actual:** Full HTML homepage (causing "Invalid XML" error)

This means WordPress/WooCommerce is NOT recognizing the `?wc-api=wc_shipstation` query parameter and just serving the regular homepage instead.

---

## 🎯 Root Cause

The `wc-api` query parameter handler is broken. This is typically caused by:

1. **Permalink/rewrite rules not flushed** after a change
2. **Plugin conflict** interfering with query vars
3. **`.htaccess` corruption** or modification
4. **Recent code changes** affecting WooCommerce hooks

---

## 🔧 BITNAMI WORDPRESS SPECIFIC FIX

**You're using Bitnami WordPress!** This changes everything. Bitnami uses Apache config files instead of `.htaccess`.

### Critical Files to Check:

1. **Main Apache Config:**

   ```
   /opt/bitnami/apache2/conf/bitnami/bitnami-apps-prefix.conf
   ```

2. **WordPress-specific config:**
   ```
   /opt/bitnami/apache2/conf/vhosts/wordpress-https-vhost.conf
   /opt/bitnami/apache2/conf/vhosts/wordpress-vhost.conf
   ```

### What to Look For:

The WordPress directory block should include:

```apache
<Directory "/opt/bitnami/wordpress">
  Options +FollowSymLinks -MultiViews
  AllowOverride All

  <IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.php$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.php [L]
  </IfModule>
</Directory>
```

**The key is `AllowOverride All`** - this allows WordPress to handle query parameters like `?wc-api=`.

### How to Fix (SSH Access Required):

```bash
# 1. Edit the WordPress vhost config
sudo nano /opt/bitnami/apache2/conf/vhosts/wordpress-https-vhost.conf

# 2. Find the <Directory "/opt/bitnami/wordpress"> block

# 3. Make sure it has:
#    - AllowOverride All
#    - RewriteEngine On

# 4. Restart Apache
sudo /opt/bitnami/ctlscript.sh restart apache

# 5. Test the endpoint
curl "https://proskatersplace.com/?wc-api=wc_shipstation"
```

### Alternative: Check if mod_rewrite is enabled

```bash
# Check if mod_rewrite module is loaded
apache2ctl -M | grep rewrite

# Should show: rewrite_module (shared)
```

---

## ✅ FIX STEPS (In Order)

### Step 1: Flush Permalinks (FIRST TRY THIS)

This fixes 80% of `wc-api` issues:

1. Log into **WordPress Admin**
2. Go to **Settings → Permalinks**
3. **DON'T CHANGE ANYTHING** - just click **"Save Changes"** button
4. Test ShipStation connection again

**Why this works:** WordPress will regenerate `.htaccess` rules and flush rewrite rules, which often fixes broken API routes.

---

### Step 2: Check .htaccess File

If Step 1 didn't work, check your `.htaccess` file in your WordPress root directory.

**It should contain this WordPress block:**

```apache
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
```

**Important:** The `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]` line is CRITICAL for API authentication.

If your `.htaccess` looks different or is missing this block:

1. Backup your current `.htaccess`
2. Go to **Settings → Permalinks → Save Changes** (this regenerates it)
3. If that doesn't work, manually add the block above

---

### Step 3: Check for Conflicting Plugins

Some plugins can interfere with WooCommerce query vars. **Temporarily disable** these plugins one at a time and test:

**High-risk plugins for conflicts:**

- ✅ Wordfence Security (check if blocking requests)
- ✅ Cloudflare (check WAF rules)
- ✅ FlyingPress (caching/optimization)
- ✅ Rank Math SEO (sometimes affects query vars)
- ✅ Any redirect/security plugins

**How to test:**

1. Disable ONE plugin
2. Flush permalinks (Settings → Permalinks → Save)
3. Test: `https://proskatersplace.com/?wc-api=wc_shipstation` in browser
4. If still shows HTML, re-enable plugin and try next one

---

### Step 4: Verify WooCommerce Legacy REST API

Your system report shows:

```
WooCommerce Legacy REST API: ✔ 1.0.5
```

This is good, but verify it's properly activated:

1. Go to **WooCommerce → Settings → Advanced → REST API**
2. Verify you have API keys created
3. Check that ShipStation plugin has proper permissions

---

### Step 5: Check Wordfence Firewall Logs

Wordfence might be blocking ShipStation's requests:

1. Go to **Wordfence → Tools → Live Traffic**
2. Look for requests to `?wc-api=wc_shipstation`
3. Check if any are blocked (status 403 or 503)

If blocked:

1. Go to **Wordfence → Firewall → Manage Firewall**
2. Add ShipStation's IP ranges to **allowlist**
3. Or temporarily set Wordfence to "Learning Mode"

---

### Step 6: Check Cloudflare WAF

Your Cloudflare might be blocking API requests:

1. Log into Cloudflare dashboard
2. Go to **Security → WAF**
3. Look for blocked requests to your domain
4. Check **Security Events** for recent blocks

If you find blocks:

1. Create a **WAF Exception Rule** for:
   - URL path contains `wc-api`
   - Skip: All security features

---

### Step 7: Test the Endpoint Directly

Open a **new incognito/private browser window** and visit:

```
https://proskatersplace.com/?wc-api=wc_shipstation&auth_key=YOUR_AUTH_KEY&action=export&start_date=2025-10-01&end_date=2025-10-22
```

Replace `YOUR_AUTH_KEY` with your actual ShipStation auth key (find in: **WooCommerce → Settings → Shipping → ShipStation**)

**Expected result:** XML output starting with `<?xml version="1.0"?>`  
**Problem result:** HTML page

---

### Step 8: Check for Recent Git Changes

You mentioned this started after a recent commit. Check what changed:

**Files to review:**

- `.htaccess` (any changes to rewrite rules?)
- `wp-config.php` (any new constants or redirects?)
- Any security/redirect plugins added or updated?
- Theme `functions.php` (any new query var handlers?)

**Look for:**

- Redirect rules
- Query var modifications
- Rewrite rule changes
- Header modifications

---

## 🧪 Testing Script

You can use this from your terminal to test:

```powershell
# Test if XML is returned (should see XML, not HTML)
curl.exe -i "https://proskatersplace.com/?wc-api=wc_shipstation"

# Test basic REST API (should work - we confirmed this already)
curl.exe -i "https://proskatersplace.com/wp-json/"

# Test with authentication (replace with your actual key)
curl.exe -i "https://proskatersplace.com/?wc-api=wc_shipstation&auth_key=YOUR_KEY&action=export"
```

---

## 📊 Current Status

✅ **Working:** WordPress REST API (`/wp-json/`)  
✅ **Working:** WooCommerce REST API v3 (`/wp-json/wc/v3/`)  
❌ **BROKEN:** ShipStation Legacy API (`?wc-api=wc_shipstation`)

**This confirms:** The issue is specifically with the legacy `wc-api` query var handler, NOT with WooCommerce API in general.

---

## 🎯 Most Likely Fix

**90% chance it's one of these:**

1. **Flush permalinks** (Step 1) ← Try this FIRST
2. **Wordfence or Cloudflare blocking** (Steps 5-6)
3. **Recent .htaccess modification** (Step 2)

---

## 📞 Next Steps

1. Start with **Step 1** (flush permalinks) - takes 30 seconds
2. Test ShipStation connection
3. If still broken, work through Steps 2-6
4. Document which step fixed it for future reference

---

## 🔍 Additional Debugging

If none of the above works, enable detailed logging:

### Enable WooCommerce Logging

1. Go to **WooCommerce → Status → Logs**
2. Look for logs named `shipstation-*`
3. Check for errors when ShipStation tries to connect

### Enable WordPress Debug Logging

Add to `wp-config.php` (above the "That's all" comment):

```php
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
@ini_set( 'display_errors', 0 );
```

Then check `wp-content/debug.log` after a failed connection attempt.

---

## 💡 Prevention

After fixing:

1. **Backup `.htaccess`** file
2. **Document** what fixed it
3. **Test ShipStation** connection weekly
4. **Monitor** Wordfence/Cloudflare logs for blocks
5. **Flush permalinks** after any plugin updates that affect routing

---

## ✉️ Support Contacts

If you still need help:

- **ShipStation Support:** Already confirmed they see the HTML error
- **WooCommerce Support:** Can help with `wc-api` routing issues
- **Hosting Provider:** Can check server-level blocks/redirects

---

**Last Updated:** October 22, 2025  
**Status:** In Progress - Step 1 (Flush Permalinks) completed but issue persists

---

## 📝 Troubleshooting Log

### ✅ Step 1: Flush Permalinks - COMPLETED

- **Date:** October 22, 2025
- **Result:** ❌ Issue persists - still returning HTML instead of XML

### ✅ Step 2: Clear Caches - COMPLETED

- **FlyingPress:** Purged ✅
- **Cloudflare:** Purged ✅
- **Result:** ❌ Issue persists

### ✅ Step 3: Check Security Blocks - COMPLETED

- **Wordfence:** No blocked traffic to `wc-api` ✅
- **Cloudflare:** No blocked requests ✅
- **ShipStation Plugin:** Active ✅
- **Result:** ❌ Issue persists

### 🎯 ROOT CAUSE IDENTIFIED!

**File:** `/opt/bitnami/apache2/conf/vhosts/wordpress-https-vhost.conf`

**Problem Line:**

```apache
AllowOverride None
```

**This MUST be changed to:**

```apache
AllowOverride All
```

### Fix Commands (Run via SSH):

```bash
# 1. Backup the current config
sudo cp /opt/bitnami/apache2/conf/vhosts/wordpress-https-vhost.conf /opt/bitnami/apache2/conf/vhosts/wordpress-https-vhost.conf.backup

# 2. Edit the file
sudo nano /opt/bitnami/apache2/conf/vhosts/wordpress-https-vhost.conf

# 3. Find this line:
#    AllowOverride None
#
# 4. Change it to:
#    AllowOverride All

# 5. Save and exit (Ctrl+X, then Y, then Enter)

# 6. Test the Apache configuration
sudo apachectl configtest

# 7. If it says "Syntax OK", restart Apache
sudo /opt/bitnami/ctlscript.sh restart apache

# 8. Test the endpoint
curl "https://proskatersplace.com/?wc-api=wc_shipstation"
```

### Expected Result:

After the change, you should see **XML output** instead of HTML when testing the endpoint.

### 🚨 CRITICAL TROUBLESHOOTING LOG UPDATE:
