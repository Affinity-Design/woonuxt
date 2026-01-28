/**
 * @snippet        Master Payment & Shipping Logic (Country + Staff + POS)
 * @author         Paul Giovanatto
 * @compatible     WooCommerce 10.0+
 * @company        https://affinitydesign.ca
 * @version        2.1.0 (Code Snippets Compatible)
 * @Modified       2026/01/25
 * @Description    Combines:
 * 1. Country-based gateway logic (CA/US/World).
 * 2. Tariff Tax logic for US.
 * 3. WooNuxt "Helcim via COD" logic.
 * 4. POS/Cashier permissions for COD & Local Shipping.
 * 
 * INSTALLATION: Copy this entire code into Code Snippets plugin
 * Set to "Run snippet everywhere" or "Only run on site front-end"
 */

// ============================================================================
// 1. CONFIGURATION
// ============================================================================
if (!defined('PSP_ALLOW_US_CHECKOUT')) define('PSP_ALLOW_US_CHECKOUT', true);
if (!defined('PSP_ENABLE_TARIFF_TAX')) define('PSP_ENABLE_TARIFF_TAX', false);
if (!defined('PSP_SHOW_TARIFF_NOTICE')) define('PSP_SHOW_TARIFF_NOTICE', false);
if (!defined('PSP_DEBUG_MODE')) define('PSP_DEBUG_MODE', false); // Set to true to debug

// POS Shipping Method Configuration
if (!defined('PSP_POS_SHIPPING_INSTANCE_ID')) define('PSP_POS_SHIPPING_INSTANCE_ID', 8); // Your POS shipping instance ID
if (!defined('PSP_POS_SHIPPING_ZONE_ID')) define('PSP_POS_SHIPPING_ZONE_ID', 3); // Your POS shipping zone ID

// ============================================================================
// 2. HELPER: DETECT STAFF (Admin, Manager, Cashier) - IMPROVED FOR AJAX
// ============================================================================
if (!function_exists('psp_is_pos_staff')) {
    function psp_is_pos_staff() {
        // For AJAX requests, ensure we have user loaded
        if (defined('DOING_AJAX') && DOING_AJAX) {
            if (!is_user_logged_in()) {
                return false;
            }
        }
        
        if (!is_user_logged_in()) {
            return false;
        }
        
        $user = wp_get_current_user();
        if (!$user || !$user->ID) {
            return false;
        }
        
        $allowed_roles = array('administrator', 'shop_manager', 'cashier');
        
        // Direct role check
        foreach ($allowed_roles as $role) {
            if (in_array($role, (array) $user->roles)) {
                return true;
            }
        }
        
        // Fallback capability check
        if (current_user_can('manage_woocommerce') || current_user_can('edit_shop_orders')) {
            return true;
        }
        
        return false;
    }
}

// ============================================================================
// 3. SHIPPING FILTER: Handle "POS | Local Store Purchase"
// ============================================================================
add_filter('woocommerce_package_rates', 'psp_filter_shipping_methods_by_role', 10, 2);

function psp_filter_shipping_methods_by_role($rates, $package) {
    $is_staff = psp_is_pos_staff();
    
    // Debug logging
    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
        error_log('PSP Shipping Filter - Is Staff: ' . ($is_staff ? 'YES' : 'NO'));
        error_log('PSP Shipping Filter - Available Rates: ' . print_r(array_keys($rates), true));
        foreach ($rates as $rate_id => $rate) {
            error_log('PSP Rate: ' . $rate_id . ' | Label: ' . $rate->label . ' | Instance: ' . $rate->instance_id);
        }
    }
    
    // If user is Staff/Cashier, SHOW ALL (return everything)
    if ($is_staff) {
        return $rates;
    }

    // POS Shipping Instance ID to hide from non-staff
    $pos_instance_id = defined('PSP_POS_SHIPPING_INSTANCE_ID') ? PSP_POS_SHIPPING_INSTANCE_ID : 8;

    // For regular customers, HIDE POS methods
    foreach ($rates as $rate_id => $rate) {
        $label = strtolower($rate->label);
        $instance_id = isset($rate->instance_id) ? (int) $rate->instance_id : 0;
        
        // Hide by instance ID (most reliable)
        if ($instance_id === $pos_instance_id) {
            unset($rates[$rate_id]);
            continue;
        }
        
        // Also hide by rate_id pattern (e.g., local_pickup:8, flat_rate:8)
        if (strpos($rate_id, ':' . $pos_instance_id) !== false) {
            unset($rates[$rate_id]);
            continue;
        }
        
        // Fallback: Check for keywords in label
        if (strpos($label, 'pos') !== false || strpos($label, 'local store') !== false) {
            unset($rates[$rate_id]);
        }
    }

    return $rates;
}

// ============================================================================
// 4. GATEWAY FILTER: The "Mega Merge"
// ============================================================================
add_filter('woocommerce_available_payment_gateways', 'psp_master_gateway_logic', 15);

function psp_master_gateway_logic($available_gateways) {
    if (empty($available_gateways)) {
        return $available_gateways;
    }

    // --- CONTEXT DETECTION ---
    $is_staff   = psp_is_pos_staff();
    $is_woonuxt = false;

    // Detect WooNuxt / Headless
    if ((isset($_SERVER['HTTP_X_FRONTEND_TYPE']) && $_SERVER['HTTP_X_FRONTEND_TYPE'] === 'woonuxt') ||
        (defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST) ||
        (isset($_SERVER['HTTP_USER_AGENT']) && strpos($_SERVER['HTTP_USER_AGENT'], 'WooNuxt') !== false)) {
        $is_woonuxt = true;
    }

    // Determine Country
    $country = '';
    if (function_exists('WC') && WC()->customer) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }

    // Debug logging
    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
        error_log('PSP Gateway Filter - Is Staff: ' . ($is_staff ? 'YES' : 'NO'));
        error_log('PSP Gateway Filter - Is WooNuxt: ' . ($is_woonuxt ? 'YES' : 'NO'));
        error_log('PSP Gateway Filter - Country: ' . $country);
        error_log('PSP Gateway Filter - Available Gateways: ' . print_r(array_keys($available_gateways), true));
    }

    // --- LOGIC BRANCH 1: WOONUXT FRONTEND ---
    if ($is_woonuxt) {
        // If US, return nothing
        if ($country === 'US') {
            return array();
        }

        // If Canada, Rename COD to "Helcim" and return list
        if ($country === 'CA') {
            $organized = array();
            // Enable COD as Helcim
            if (isset($available_gateways['cod'])) {
                $available_gateways['cod']->title = 'Helcim Payment';
                $available_gateways['cod']->description = 'Secure payment processing via Helcim';
                $organized['cod'] = $available_gateways['cod'];
            }
            // Add Fallbacks
            if (isset($available_gateways['ppcp-gateway'])) {
                $organized['ppcp-gateway'] = $available_gateways['ppcp-gateway'];
            }
            if (isset($available_gateways['ppcp-credit-card-gateway'])) {
                $organized['ppcp-credit-card-gateway'] = $available_gateways['ppcp-credit-card-gateway'];
            }
            if (isset($available_gateways['ppcp-card-button-gateway'])) {
                $organized['ppcp-card-button-gateway'] = $available_gateways['ppcp-card-button-gateway'];
            }
            if (isset($available_gateways['ppcp-googlepay'])) {
                $organized['ppcp-googlepay'] = $available_gateways['ppcp-googlepay'];
            }
            if (isset($available_gateways['ppcp-applepay'])) {
                $organized['ppcp-applepay'] = $available_gateways['ppcp-applepay'];
            }
            
            // Remove native Helcim plugin to avoid duplicates
            unset($organized['helcimjs']);
            
            return !empty($organized) ? $organized : $available_gateways;
        }

        // Rest of World (WooNuxt) -> PayPal Only
        $organized = array();
        if (isset($available_gateways['ppcp-credit-card-gateway'])) {
            $organized['ppcp-credit-card-gateway'] = $available_gateways['ppcp-credit-card-gateway'];
        }
        if (isset($available_gateways['ppcp-gateway'])) {
            $organized['ppcp-gateway'] = $available_gateways['ppcp-gateway'];
        }
        if (isset($available_gateways['ppcp-card-button-gateway'])) {
            $organized['ppcp-card-button-gateway'] = $available_gateways['ppcp-card-button-gateway'];
        }
        if (isset($available_gateways['ppcp-googlepay'])) {
            $organized['ppcp-googlepay'] = $available_gateways['ppcp-googlepay'];
        }
        if (isset($available_gateways['ppcp-applepay'])) {
            $organized['ppcp-applepay'] = $available_gateways['ppcp-applepay'];
        }
        return $organized;
    }

    // --- LOGIC BRANCH 2: STANDARD WORDPRESS (+ Staff Override) ---

    // 1. CANADA - Helcim Only (No PayPal)
    if ($country === 'CA') {
        $organized = array();
        
        // Helcim (Native) - Primary for Canada
        if (isset($available_gateways['helcimjs'])) {
            $organized['helcimjs'] = $available_gateways['helcimjs'];
        }
        
        // STAFF OVERRIDE: Add COD (POS Cashout)
        if ($is_staff && isset($available_gateways['cod'])) {
            $organized['cod'] = $available_gateways['cod'];
        }

        return !empty($organized) ? $organized : $available_gateways;
    }

    // 2. UNITED STATES
    if ($country === 'US') {
        // Always remove Helcim
        if (isset($available_gateways['helcimjs'])) {
            unset($available_gateways['helcimjs']);
        }
        
        // Remove COD (Unless Staff)
        if (isset($available_gateways['cod']) && !$is_staff) {
            unset($available_gateways['cod']);
        }
        
        // Disable Checkout Check
        if (!PSP_ALLOW_US_CHECKOUT) {
            unset($available_gateways['cod']); 
        }
        return $available_gateways;
    }

    // 3. REST OF WORLD (Strict PayPal Only)
    $global_allowed = array();

    if (isset($available_gateways['ppcp-gateway'])) {
        $global_allowed['ppcp-gateway'] = $available_gateways['ppcp-gateway'];
    }
    if (isset($available_gateways['ppcp-credit-card-gateway'])) {
        $global_allowed['ppcp-credit-card-gateway'] = $available_gateways['ppcp-credit-card-gateway'];
    }
    if (isset($available_gateways['ppcp-card-button-gateway'])) {
        $global_allowed['ppcp-card-button-gateway'] = $available_gateways['ppcp-card-button-gateway'];
    }
    if (isset($available_gateways['ppcp-googlepay'])) {
        $global_allowed['ppcp-googlepay'] = $available_gateways['ppcp-googlepay'];
    }
    if (isset($available_gateways['ppcp-applepay'])) {
        $global_allowed['ppcp-applepay'] = $available_gateways['ppcp-applepay'];
    }
    if (isset($available_gateways['wpg_paypal_checkout'])) {
        $global_allowed['wpg_paypal_checkout'] = $available_gateways['wpg_paypal_checkout'];
    }

    // STAFF OVERRIDE: Add COD (POS Cashout)
    if ($is_staff && isset($available_gateways['cod'])) {
        $global_allowed['cod'] = $available_gateways['cod'];
    }

    return $global_allowed;
}

// ============================================================================
// 5. ENSURE COD LOADED FOR WOONUXT
// ============================================================================
add_filter('woocommerce_payment_gateways', 'psp_ensure_cod_enabled_for_woonuxt', 5);

function psp_ensure_cod_enabled_for_woonuxt($payment_gateways) {
    $is_woonuxt = false;
    if ((isset($_SERVER['HTTP_X_FRONTEND_TYPE']) && $_SERVER['HTTP_X_FRONTEND_TYPE'] === 'woonuxt') ||
        (defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST)) {
        $is_woonuxt = true;
    }

    if ($is_woonuxt) {
        if (!in_array('WC_Gateway_COD', $payment_gateways)) {
            $payment_gateways[] = 'WC_Gateway_COD';
        }
    }
    return $payment_gateways;
}

// ============================================================================
// 6. FORCE COD AVAILABILITY FOR STAFF (Bypass shipping method restriction)
// ============================================================================
add_filter('woocommerce_available_payment_gateways', 'psp_force_cod_for_staff', 99);

function psp_force_cod_for_staff($gateways) {
    if (!psp_is_pos_staff()) {
        return $gateways;
    }
    
    // If COD isn't in the list but should be for staff, load it
    if (!isset($gateways['cod'])) {
        if (class_exists('WC_Gateway_COD')) {
            $cod_gateway = new WC_Gateway_COD();
            if ($cod_gateway) {
                $gateways['cod'] = $cod_gateway;
            }
        }
    }
    
    // Debug logging
    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
        error_log('PSP Force COD - Staff detected, COD available: ' . (isset($gateways['cod']) ? 'YES' : 'NO'));
    }
    
    return $gateways;
}

// ============================================================================
// 7. BYPASS COD SHIPPING METHOD RESTRICTION FOR STAFF
// ============================================================================
add_filter('woocommerce_cod_process_payment_order_status', 'psp_cod_allow_any_shipping_for_staff', 10, 2);

function psp_cod_allow_any_shipping_for_staff($status, $order) {
    // Allow COD regardless of shipping method for staff
    if (psp_is_pos_staff()) {
        return $status;
    }
    return $status;
}

// Override COD availability check for staff
add_filter('woocommerce_available_payment_gateways', 'psp_override_cod_shipping_restriction', 100);

function psp_override_cod_shipping_restriction($gateways) {
    if (!psp_is_pos_staff()) {
        return $gateways;
    }
    
    // For staff, ensure COD is available regardless of shipping method selected
    if (!isset($gateways['cod']) && class_exists('WC_Gateway_COD')) {
        $cod = new WC_Gateway_COD();
        // Force it to be available
        $gateways['cod'] = $cod;
        
        if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
            error_log('PSP Override COD Restriction - Forced COD for staff');
        }
    }
    
    return $gateways;
}

// ============================================================================
// 8. TARIFF TAX SYSTEM
// ============================================================================
if (!function_exists('psp_is_checkout_context')) {
    function psp_is_checkout_context() {
        if (function_exists('is_checkout') && is_checkout()) {
            return true;
        }
        if (defined('DOING_AJAX') && DOING_AJAX) {
            if (isset($_REQUEST['wc-ajax']) && $_REQUEST['wc-ajax'] === 'update_order_review') {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('psp_calc_tariff')) {
    function psp_calc_tariff($subtotal) {
        if ($subtotal >= 0 && $subtotal < 50) {
            return 15;
        } elseif ($subtotal >= 50 && $subtotal < 300) {
            return 20;
        } elseif ($subtotal >= 300 && $subtotal <= 10000) {
            return 10;
        } else {
            return 0;
        }
    }
}

add_action('woocommerce_cart_calculate_fees', 'psp_add_tariff_fee');

function psp_add_tariff_fee() {
    if (!defined('PSP_ENABLE_TARIFF_TAX') || PSP_ENABLE_TARIFF_TAX !== true) {
        return;
    }
    if (is_admin() && !(defined('DOING_AJAX') && DOING_AJAX)) {
        return;
    }
    if (!psp_is_checkout_context()) {
        return;
    }

    $country = '';
    if (function_exists('WC') && WC()->customer) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }
    
    if ($country !== 'US' || !PSP_ALLOW_US_CHECKOUT) {
        return;
    }

    $cart_subtotal = WC()->cart->get_subtotal();
    $tariff_amount = psp_calc_tariff($cart_subtotal);

    if ($tariff_amount > 0) {
        WC()->cart->add_fee(__('Tariff Tax', 'woocommerce'), $tariff_amount, true);
    }
}

add_action('woocommerce_review_order_before_payment', 'psp_display_tariff_notice');

function psp_display_tariff_notice() {
    if (!defined('PSP_ENABLE_TARIFF_TAX') || PSP_ENABLE_TARIFF_TAX !== true) {
        return;
    }
    if (!defined('PSP_SHOW_TARIFF_NOTICE') || PSP_SHOW_TARIFF_NOTICE !== true) {
        return;
    }
    if (!function_exists('is_checkout') || !is_checkout()) {
        return;
    }

    $country = '';
    if (function_exists('WC') && WC()->customer) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }
    if ($country !== 'US' || !PSP_ALLOW_US_CHECKOUT) {
        return;
    }

    $cart_subtotal = WC()->cart->get_subtotal();
    $tariff_amount = psp_calc_tariff($cart_subtotal);

    if ($tariff_amount > 0) {
        echo '<div class="woocommerce-info" style="margin-bottom:20px">';
        echo '<strong>' . esc_html__('Tariff Tax Information:', 'woocommerce') . '</strong><br>';
        echo esc_html__('A tariff tax applies to orders shipped to the United States:', 'woocommerce') . '<br>';
        echo sprintf(esc_html__('Your current tariff: $%s', 'woocommerce'), esc_html(number_format($tariff_amount, 2)));
        echo '</div>';
    }
}

// ============================================================================
// 9. DEBUG OUTPUT ON CHECKOUT PAGE (Only when PSP_DEBUG_MODE is true)
// ============================================================================
add_action('wp_footer', 'psp_debug_checkout_info');

function psp_debug_checkout_info() {
    if (!defined('PSP_DEBUG_MODE') || PSP_DEBUG_MODE !== true) {
        return;
    }
    if (!function_exists('is_checkout') || !is_checkout()) {
        return;
    }
    
    $is_staff = psp_is_pos_staff();
    $user = wp_get_current_user();
    $country = '';
    if (function_exists('WC') && WC()->customer) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }
    
    echo '<!-- PSP DEBUG INFO:
    =====================
    Logged In: ' . (is_user_logged_in() ? 'YES' : 'NO') . '
    User ID: ' . $user->ID . '
    User Roles: ' . implode(', ', (array) $user->roles) . '
    Is Staff (psp_is_pos_staff): ' . ($is_staff ? 'YES' : 'NO') . '
    Can manage_woocommerce: ' . (current_user_can('manage_woocommerce') ? 'YES' : 'NO') . '
    Can edit_shop_orders: ' . (current_user_can('edit_shop_orders') ? 'YES' : 'NO') . '
    Shipping Country: ' . $country . '
    =====================
    -->';
}

// ============================================================================
// 10. CLEAR WOOCOMMERCE SHIPPING CACHE (Run once on admin init)
// ============================================================================
add_action('admin_init', 'psp_clear_shipping_cache_once');

function psp_clear_shipping_cache_once() {
    // Only run once per hour
    if (get_transient('psp_shipping_cache_cleared')) {
        return;
    }
    
    // Clear shipping transients
    if (class_exists('WC_Cache_Helper')) {
        WC_Cache_Helper::get_transient_version('shipping', true);
    }
    
    // Set flag to prevent repeated clearing
    set_transient('psp_shipping_cache_cleared', true, HOUR_IN_SECONDS);
}

// ============================================================================
// 10b. FORCE POS SHIPPING FOR STAFF (Add method even if zone doesn't match)
// ============================================================================
add_filter('woocommerce_package_rates', 'psp_force_pos_shipping_for_staff', 100, 2);

function psp_force_pos_shipping_for_staff($rates, $package) {
    // Only for staff
    if (!psp_is_pos_staff()) {
        return $rates;
    }
    
    $pos_instance_id = defined('PSP_POS_SHIPPING_INSTANCE_ID') ? PSP_POS_SHIPPING_INSTANCE_ID : 8;
    
    // Check if POS method is already in the rates
    $pos_exists = false;
    foreach ($rates as $rate_id => $rate) {
        $instance_id = isset($rate->instance_id) ? (int) $rate->instance_id : 0;
        if ($instance_id === $pos_instance_id) {
            $pos_exists = true;
            break;
        }
    }
    
    // If POS method not found, try to add it
    if (!$pos_exists) {
        // Get the shipping method from the database
        $pos_zone_id = defined('PSP_POS_SHIPPING_ZONE_ID') ? PSP_POS_SHIPPING_ZONE_ID : 3;
        
        if (class_exists('WC_Shipping_Zone')) {
            $zone = new WC_Shipping_Zone($pos_zone_id);
            $shipping_methods = $zone->get_shipping_methods(true); // true = enabled only
            
            foreach ($shipping_methods as $method) {
                if ((int) $method->instance_id === $pos_instance_id) {
                    // Create a rate from this method
                    $rate = new WC_Shipping_Rate(
                        $method->id . ':' . $method->instance_id,
                        $method->title,
                        0, // Cost - adjust if your POS method has a cost
                        array(), // Taxes
                        $method->id,
                        $method->instance_id
                    );
                    
                    $rates[$method->id . ':' . $method->instance_id] = $rate;
                    
                    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
                        error_log('PSP Force POS Shipping - Added method: ' . $method->id . ':' . $method->instance_id);
                    }
                    break;
                }
            }
        }
    }
    
    return $rates;
}

// ============================================================================
// 11. ADMIN NOTICE FOR DEBUG MODE
// ============================================================================
add_action('admin_notices', 'psp_debug_mode_notice');

function psp_debug_mode_notice() {
    if (!defined('PSP_DEBUG_MODE') || PSP_DEBUG_MODE !== true) {
        return;
    }
    if (!current_user_can('manage_options')) {
        return;
    }
    
    echo '<div class="notice notice-warning is-dismissible">';
    echo '<p><strong>PSP Master Payment/Shipping:</strong> Debug mode is enabled. ';
    echo 'Check your browser\'s View Source on checkout for debug info, and wp-content/debug.log for detailed logs. ';
    echo 'Set <code>PSP_DEBUG_MODE</code> to <code>false</code> in production.</p>';
    echo '</div>';
}
