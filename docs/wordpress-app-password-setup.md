# WordPress Application Password Setup for Admin GraphQL Operations

## Why We Need This

The WooCommerce Consumer Key/Secret you have are for REST API operations. For GraphQL admin operations (like creating orders), we need WordPress Application Password credentials.

## How to Create WordPress Application Password

1. **Login to WordPress Admin**: Go to `https://test.proskatersplace.com/wp-admin/`

2. **Navigate to User Profile**:

   - Go to **Users** → **All Users**
   - Click on your admin user account
   - OR go to **Users** → **Profile** if editing your own account

3. **Scroll to Application Passwords Section**:

   - Look for "Application Passwords" section (usually near the bottom)
   - If you don't see it, make sure you're using WordPress 5.6+ and Application Passwords are enabled

4. **Create New Application Password**:

   - In the "New Application Password Name" field, enter: `WooNuxt Admin API`
   - Click "Add New Application Password"

5. **Copy the Generated Password**:
   - WordPress will show you a password like: `abcd efgh ijkl mnop qrst uvwx`
   - **IMPORTANT**: Copy this immediately - you can't see it again!

## Add to .env File

Add these lines to your `.env` file:

```
# WordPress Application Password for admin GraphQL operations
WP_ADMIN_USERNAME="your_wordpress_username"
WP_ADMIN_APP_PASSWORD="abcd efgh ijkl mnop qrst uvwx"
```

Replace:

- `your_wordpress_username` with your actual WordPress admin username
- `abcd efgh ijkl mnop qrst uvwx` with the actual application password generated

## Current Status

✅ **Code Updated**: All endpoints now use proper WordPress Application Password format
✅ **Configuration Ready**: Runtime config updated to handle new credentials
✅ **Fallback in Place**: System will gracefully handle missing credentials

⏳ **Needs Setup**: WordPress Application Password credentials in `.env`

## Test After Setup

Once you add the credentials, test with:

```powershell
Invoke-RestMethod -Uri "https://localhost:3000/api/test-admin-order" -Method Post -ContentType "application/json" -Body "{}"
```

You should see a successful order creation instead of the permission error.

## Difference Between Credentials

| Credential Type        | Format                  | Used For                 | Current Status    |
| ---------------------- | ----------------------- | ------------------------ | ----------------- |
| WooCommerce API        | `ck_xxx:cs_xxx`         | REST API operations      | ✅ Already have   |
| WordPress App Password | `username:app_password` | GraphQL admin operations | ⏳ Need to create |

The WooCommerce credentials you have are perfect for REST API but GraphQL needs the WordPress Application Password format for admin operations.
