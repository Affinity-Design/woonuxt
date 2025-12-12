# Security Implementation Report

## 1. Overview

This document outlines the security measures implemented to protect the Headless WooCommerce environment. The strategy uses a **"Hybrid Defense"** model, leveraging Cloudflare for frontend protection, server-side PHP for backend API security, and WordPress plugins for login hardening and GraphQL access control.

This multi-layered approach ensures that while the Nuxt application and payment gateways function seamlessly, malicious bots and unauthorized users are blocked at multiple entry points.

---

## 2. Security Layers Implemented

### Layer A: Cloudflare Rate Limiting (Frontend Shield)

**Goal:** Protect public-facing pages from Card Testing, Brute Force attacks, and Spam.
**Mechanism:** A single Rate Limiting rule on the Cloudflare Edge.

- **Rule Name:** `Shield Checkout and Login`
- **Protection Logic:**
  - **Target:** Specific high-risk paths: `/my-account/`, `/wp-login.php`, `/checkout/`, and `wc-ajax=checkout`.
  - **Trigger:** If any IP address requests these pages more than **20 times in 1 minute**.
  - **Action:** **Block** the IP address for **1 hour**.
  - **Safety Net:** Office IPs have been globally whitelisted in Cloudflare tools to prevent accidental lockouts.

### Layer B: PHP API Restriction (Backend Shield)

**Goal:** Lock down the WooCommerce REST API (`/wp-json/wc/`) which is often exploited to enumerate users or test stolen credit cards.
**Mechanism:** A custom PHP snippet in `functions.php`.

- **Logic:**
  1.  **Allowlist Check:** Immediately **approves** requests from Office IPs, Development Team, and Server IPs (IPv4 & IPv6).
  2.  **Webhook Bypass:** Allows standard Stripe/PayPal webhooks (identified by `?wc-api=...`).
  3.  **App Bypass:** Allows the Nuxt application to create orders via a strict check:
      - Must be a `PUT` request.
      - Must target `/orders/`.
      - Must use the specific User-Agent: `WooNuxt-Test-GraphQL-Creator/1.0`.
  4.  **Block All Others:** Any other request to `/wp-json/wc/` returns a `403 Forbidden` error.

### Layer C: Wordfence Brute Force Protection (Login Shield)

**Goal:** Prevent attackers from guessing admin or customer passwords.
**Mechanism:** Wordfence Plugin Settings.

- **Configuration:**
  - **Lockout Condition:** Users are locked out after **4 failed login attempts**.
  - **Lockout Duration:** **1 day** (24 hours).
  - **Immediate Block:** Anyone trying to login with invalid usernames (like "admin" or "test") is instantly banned.
  - **Whitelist:** Office IP is added to the Wordfence "Allowlist" to bypass these checks.

### Layer D: Headless Access Control (GraphQL Shield)

**Goal:** Restrict data access to specific frontend domains.
**Mechanism:** "Headless Access Control" Plugin.

- **Configuration:**
  - **CORS Headers:** Configured to only allow requests from authorized domains (`proskatersplace.ca`, `dev.proskatersplace.ca`, `localhost:3000`).
  - _Note: While this prevents browser-based attacks, it does not stop non-browser bots (cURL/Python). That is why Layers A and B are critical._

---

## 3. Configuration Details for Maintenance

### 1. Cloudflare IP Access Rules (Whitelist)

- **Location:** Security > WAF > Tools > IP Access Rules.
- **Purpose:** Ensures the team is never blocked by Cloudflare.
- **Status:** Development IPs added as "Allow".

### 2. PHP Snippet (API Security)

- **Location:** Theme `functions.php` or WPCode Plugin.
- **Allowed IPs (Hardcoded):**
  - `142.90.237.152` (Paul)
  - `174.88.140.8` (Artem)
  - `50.47.244.102` (Pavel)
  - `2600:1f18:01d9:8700:f66d:7622:c62e:1daa` (Server IPv6)
  - `3.216.222.147` (Server IPv4)

**Snippet Code Reference:**

```php
add_filter( 'rest_authentication_errors', function( $result ) {
    // 1. Compatibility Check
    if ( ! empty( $result ) ) return $result;

    $uri     = $_SERVER['REQUEST_URI'];
    $ua      = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $method  = $_SERVER['REQUEST_METHOD'];
    $user_ip = $_SERVER['REMOTE_ADDR'];

    // *** ALLOWED IP LIST (Team & Server) ***
    $allowed_ips = array(
        '142.90.237.152',                          // Pauls new IP
        '174.88.140.8',                            // Artem Ip
        '50.47.244.102',                           // Pavel
        '2600:1f18:01d9:8700:f66d:7622:c62e:1daa', // Real Server IP (IPv6)
        '3.216.222.147'                            // Real Server IP (AWS)
    );

    // 2. CHECK: If IP is in the allowed list, BYPASS all other checks.
    if ( in_array( $user_ip, $allowed_ips ) ) {
        return $result;
    }

    // 3. TARGET: Only run security checks on WooCommerce REST API
    if ( strpos( $uri, '/wp-json/wc/' ) !== false ) {

        // ALLOW: Webhooks (Stripe/PayPal)
        if ( isset( $_GET['wc-api'] ) ) {
            return $result;
        }

        // ALLOW: Nuxt App (Strict User Agent Check)
        if ( $method === 'PUT' &&
             strpos( $uri, '/orders/' ) !== false &&
             $ua === 'WooNuxt-Test-GraphQL-Creator/1.0' ) {
            return $result;
        }

        // BLOCK: Everyone else
        return new WP_Error( 'rest_forbidden', 'REST API Restricted by Local Firewall', array( 'status' => 403 ) );
    }

    return $result;
});
```
