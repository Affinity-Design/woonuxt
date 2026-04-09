/**
 * @snippet       Canadian Traffic Redirect (Strict Product Mapping Only)
 * @compatible    WordPress 6.0+ / Code Snippets Plugin / FlyingPress
 * @version       2.6.0
 * @description   Redirects ONLY Product/Category pages for non-logged-in CA visitors.
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Determine if request should be completely excluded from redirect logic
 */
function is_api_or_webhook_request() {
    // REST API requests
    if (defined('REST_REQUEST') && REST_REQUEST) return true;
    
    // AJAX requests
    if (wp_doing_ajax()) return true;
    
    // WooCommerce API endpoints
    if (defined('WC_API_REQUEST') && WC_API_REQUEST) return true;
    
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';
    
    // Check for API/Webhook paths
    if (strpos($request_uri, '/wp-json/') !== false) return true;
    if (strpos($request_uri, '/wc-api/') !== false) return true;
    if (strpos($request_uri, '/shipstation') !== false) return true;
    
    // Added 'helcim' to patterns to prevent refund callback issues
    $webhook_patterns = ['/webhook', '/callback', '/api/', '/ipn', '/stripe-webhook', '/square-webhook', '/helcim', '/?wc-api='];
    foreach ($webhook_patterns as $pattern) {
        if (stripos($request_uri, $pattern) !== false) return true;
    }
    
    // Check User Agents
    $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $webhook_agents = ['ShipStation', 'Zapier', 'Webhooks', 'PayPal', 'Stripe', 'Square', 'Google-HTTP-Java-Client', 'APIs-Google', 'python-requests', 'curl', 'PostmanRuntime', 'Helcim'];
    foreach ($webhook_agents as $agent) {
        if (stripos($user_agent, $agent) !== false) return true;
    }
    
    return false;
}

/**
 * Helper: Map .com URL structure to .ca URL structure (PHP Version)
 * RETURNS FALSE if no specific rule matches (keeping user on current site)
 * 
 * URL Structure Differences:
 * - .com products: /shop/category/sub-cat/product-slug/
 * - .ca products:  /product/product-slug/
 * 
 * - .com categories: /products/parent-term/child-term/grandchild-term/  (nested)
 * - .ca categories:  /product-category/last-term-only/  (flat - only deepest term)
 */
function get_canadian_target_url($request_uri) {
    $base_domain = 'https://proskatersplace.ca';
    
    // Parse the URI to separate path and query string
    $parsed = parse_url($request_uri);
    $path = $parsed['path'] ?? '/';
    $query = isset($parsed['query']) ? '?' . $parsed['query'] : '';
    
    // 1. PRODUCT PAGE MAPPING
    // Matches: /shop/category/sub-cat/product-slug/
    if (preg_match('#^/shop/(.+)/([^/]+)/?$#', $path, $matches)) {
        return $base_domain . '/product/' . $matches[2] . '/' . $query;
    }

    // 2. CATEGORY PAGE MAPPING
    // .com uses nested: /products/parent/child/grandchild/
    // .ca uses flat:    /product-category/grandchild/  (only the LAST term)
    if (strpos($path, '/products/') === 0) {
        // Remove /products/ prefix and trailing slashes
        $category_path = trim(str_replace('/products/', '', $path), '/');
        
        // Split by / and get only the LAST segment (deepest child term)
        $segments = array_filter(explode('/', $category_path));
        
        if (!empty($segments)) {
            $last_term = end($segments);
            return $base_domain . '/product-category/' . $last_term . '/' . $query;
        }
    }

    // 3. NO MATCH - Return false to stop redirect
    return false;
}

/**
 * Add JavaScript redirect to frontend (Primary method for Cached Sites)
 */
add_action('wp_footer', 'canadian_redirect_js_inject', 1);

function canadian_redirect_js_inject() {
    // Skip injection completely if admin, api, logged in, or on excluded page
    if (is_admin() || is_api_or_webhook_request() || should_skip_canadian_redirect()) {
        return;
    }
    ?>
    <script id="canadian-redirect-script">
    (function() {
        'use strict';
        
        const config = {
            cookieName: 'ca_redirect_checked',
            cookieExpiry: 24, // hours
            debug: false
        };
        
        function log(msg) { if (config.debug) console.log('[CA Redirect] ' + msg); }

        function getTargetUrl() {
            const path = window.location.pathname;
            const search = window.location.search; 
            const baseDomain = 'https://proskatersplace.ca';

            // 1. Product Pages: /shop/category/slug
            if (path.startsWith('/shop/')) {
                const segments = path.replace(/^\/|\/$/g, '').split('/');
                
                // Strict check: Must have at least 3 segments (shop, category, slug)
                // This prevents redirecting /shop/ or /shop/category/
                if (segments.length >= 3) {
                    const productSlug = segments[segments.length - 1];
                    return baseDomain + '/product/' + productSlug + '/' + search;
                }
            }

            // 2. Category Pages: /products/parent/child/grandchild/
            // .com uses nested structure, .ca uses flat (only last term)
            // Example: /products/inline-skating/inline-skates/ → /product-category/inline-skates/
            if (path.startsWith('/products/')) {
                // Remove /products/ prefix and split into segments
                const categoryPath = path.replace(/^\/products\/|\/$/g, '');
                const segments = categoryPath.split('/').filter(s => s.length > 0);
                
                if (segments.length > 0) {
                    // Get ONLY the last segment (deepest child term)
                    const lastTerm = segments[segments.length - 1];
                    return baseDomain + '/product-category/' + lastTerm + '/' + search;
                }
            }

            // 3. Fallback: Return NULL (Do not redirect homepage/other pages)
            return null;
        }

        function hasCheckedSession() {
            return document.cookie.split(';').some((c) => {
                return c.trim().startsWith(config.cookieName + '=');
            });
        }
        
        function setSessionCookie() {
            const date = new Date();
            date.setTime(date.getTime() + (config.cookieExpiry * 60 * 60 * 1000));
            document.cookie = config.cookieName + "=1; expires=" + date.toUTCString() + "; path=/; SameSite=Lax";
        }
        
        async function checkCanadianVisitor() {
            try {
                // Get Potential Target First
                const target = getTargetUrl();
                
                // If this page isn't a product/category, stop immediately. 
                // Don't even check GeoIP to save resources.
                if (!target) {
                    log('Page not in redirect rules. Staying here.');
                    return; 
                }

                const response = await fetch('/cdn-cgi/trace');
                const data = await response.text();
                const match = data.match(/loc=([A-Z]+)/);
                const country = match ? match[1] : null;
                
                if (country === 'CA') {
                    log('Redirecting to: ' + target);
                    window.location.href = target;
                } else {
                    log('Not Canada (' + country + ')');
                    setSessionCookie();
                }
            } catch (e) {
                console.error('Geo check failed', e);
                setSessionCookie(); 
            }
        }
        
        if (!hasCheckedSession()) {
            checkCanadianVisitor();
        }
    })();
    </script>
    <?php
}

/**
 * Determine if redirect should be skipped
 */
function should_skip_canadian_redirect() {
    // 1. GLOBAL LOGGED-IN CHECK
    // If user is logged in (Admin, Customer, Shop Manager), NEVER redirect.
    if (is_user_logged_in()) {
        return true;
    }

    // 2. Check for Emergency Disable Cookie
    if (isset($_COOKIE['disable_ca_redirect']) && $_COOKIE['disable_ca_redirect'] === '1') return true;

    // 3. Exclude Specific Pages (Login, Account, Reset Password)
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';
    
    // List of strings to check in URL
    $excluded_paths = [
        '/my-account',
        '/lost-password',
        '/reset-password',
        '/wp-login.php',
        '/cart',
        '/checkout',
        'customer-logout'
    ];

    foreach ($excluded_paths as $path) {
        if (strpos($request_uri, $path) !== false) return true;
    }
    
    // Check for reset link parameters
    if (isset($_GET['key']) && isset($_GET['login'])) return true;

    return false;
}

/**
 * Add PHP-level redirect for non-cached requests (fallback)
 */
add_action('template_redirect', 'canadian_redirect_php_fallback', 1);

function canadian_redirect_php_fallback() {
    // Run all exclusion checks first
    if (is_admin() || is_api_or_webhook_request() || should_skip_canadian_redirect()) return;
    
    if (isset($_COOKIE['ca_redirect_checked'])) return;
    
    // Check CloudFlare header
    if (isset($_SERVER['HTTP_CF_IPCOUNTRY']) && strtoupper($_SERVER['HTTP_CF_IPCOUNTRY']) === 'CA') {
        // Get target URL
        $target_url = get_canadian_target_url($_SERVER['REQUEST_URI']);
        
        // ONLY redirect if get_canadian_target_url returned a valid URL
        if ($target_url) {
            wp_redirect($target_url, 302);
            exit;
        }
    }
}

/**
 * Emergency disable function (?disable_ca_redirect=1)
 */
add_action('init', 'canadian_redirect_emergency_disable');
function canadian_redirect_emergency_disable() {
    if (isset($_GET['disable_ca_redirect']) && $_GET['disable_ca_redirect'] === '1') {
        setcookie('disable_ca_redirect', '1', time() + 3600, '/');
        wp_die('Redirect disabled for 1 hour.');
    }
}

/**
 * Exclude from FlyingPress/Optimization
 */
add_filter('flying_press_exclude_js', 'exclude_canadian_redirect_from_optimization');
function exclude_canadian_redirect_from_optimization($excluded_scripts) {
    $excluded_scripts[] = 'canadian-redirect-script';
    return $excluded_scripts;
}