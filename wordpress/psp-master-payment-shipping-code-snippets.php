/**
 * @snippet        Master Payment & Shipping Logic (Country + Staff + POS)
 * @author         Paul Giovanatto
 * @compatible     WooCommerce 10.6+ / HPOS & Store API Ready
 * @company        https://affinitydesign.ca
 * @version        2.5.0 (Code Snippets Compatible)
 * @Modified       2026/06/16
 * @Description    Combines:
 * 1. Country-based gateway logic (CA/US/World).
 * 2. Tariff Tax logic for US.
 * 3. WooNuxt "Helcim via COD" logic.
 * 4. POS/Cashier permissions for COD & Local Shipping.
 * 5. POS customer profile assignment from collected billing email.
 * 6. Master toggles for PayPal and Stripe (Includes Apple/Google Pay).
 * * INSTALLATION: Copy this entire code into Code Snippets plugin
 * Set to "Run snippet everywhere" or "Only run on site front-end"
 */

// ============================================================================
// 1. CONFIGURATION
// ============================================================================
if (!defined('PSP_ALLOW_US_CHECKOUT')) define('PSP_ALLOW_US_CHECKOUT', true);
if (!defined('PSP_ENABLE_TARIFF_TAX')) define('PSP_ENABLE_TARIFF_TAX', false);
if (!defined('PSP_SHOW_TARIFF_NOTICE')) define('PSP_SHOW_TARIFF_NOTICE', false);
if (!defined('PSP_DEBUG_MODE')) define('PSP_DEBUG_MODE', false); // Set to true to debug

// Gateway Master Toggles
if (!defined('PSP_ENABLE_PAYPAL')) define('PSP_ENABLE_PAYPAL', false); // Set false to disable PayPal globally
if (!defined('PSP_ENABLE_STRIPE')) define('PSP_ENABLE_STRIPE', true); // Set false to disable Stripe globally

// POS Shipping Method Configuration
if (!defined('PSP_POS_SHIPPING_INSTANCE_ID')) define('PSP_POS_SHIPPING_INSTANCE_ID', 8); // Your POS shipping instance ID
if (!defined('PSP_POS_SHIPPING_ZONE_ID')) define('PSP_POS_SHIPPING_ZONE_ID', 3); // Your POS shipping zone ID

// ============================================================================
// 2. HELPER: DETECT STAFF (Admin, Manager, Cashier) - IMPROVED FOR AJAX/API
// ============================================================================
if (!function_exists('psp_is_pos_staff')) {
    function psp_is_pos_staff() {
        // For AJAX or REST requests, ensure we have user loaded
        if ((defined('DOING_AJAX') && DOING_AJAX) || (defined('REST_REQUEST') && REST_REQUEST)) {
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
        
        $allowed_roles = apply_filters('psp_pos_staff_roles', array('administrator', 'shop_manager', 'cashier', 'POS_Cashier'));
        
        // Direct role check
        foreach ($allowed_roles as $role) {
            if (in_array($role, (array) $user->roles, true)) {
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
// 3. POS CUSTOMER PROFILE ASSIGNMENT
// ============================================================================
add_action('woocommerce_checkout_create_order', 'psp_attach_pos_order_to_customer_profile', 20, 2);
add_action('woocommerce_store_api_checkout_update_order_from_request', 'psp_attach_pos_order_to_customer_profile', 20, 2);
add_action('woocommerce_new_order', 'psp_attach_saved_pos_order_to_customer_profile', 20, 2);

function psp_attach_saved_pos_order_to_customer_profile($order_id, $order = null) {
    if (!$order instanceof WC_Order && function_exists('wc_get_order')) {
        $order = wc_get_order($order_id);
    }

    if (!$order instanceof WC_Order) {
        return;
    }

    if (psp_attach_pos_order_to_customer_profile($order)) {
        $order->save();
    }
}

function psp_attach_pos_order_to_customer_profile($order, $source_data = null) {
    if (!$order instanceof WC_Order) {
        return false;
    }

    if (!psp_order_looks_like_pos_purchase($order, $source_data)) {
        return false;
    }

    $billing_email = psp_get_clean_order_billing_email($order);
    if (empty($billing_email)) {
        psp_log_pos_customer_profile_message('Skipped POS customer assignment because the order has no valid billing email.');
        return false;
    }

    $current_customer_id = absint($order->get_customer_id());
    if ($current_customer_id > 0 && !psp_user_is_pos_staff_account($current_customer_id)) {
        $current_user = get_user_by('id', $current_customer_id);
        $current_email = $current_user ? strtolower((string) $current_user->user_email) : '';

        if ($current_email === strtolower($billing_email)) {
            return false;
        }

        $allow_reassign = apply_filters('psp_reassign_non_staff_pos_order_customer', false, $order, $current_customer_id, $billing_email);
        if (!$allow_reassign) {
            return false;
        }
    }

    $target_customer_id = psp_get_or_create_pos_customer_id($order, $billing_email);
    if ($target_customer_id <= 0 || $target_customer_id === $current_customer_id) {
        return false;
    }

    $order->set_customer_id($target_customer_id);
    $order->update_meta_data('_psp_pos_customer_profile_attached', 'yes');
    $order->update_meta_data('_psp_pos_customer_profile_email', $billing_email);

    psp_fill_customer_profile_from_pos_order($target_customer_id, $order);
    psp_log_pos_customer_profile_message(sprintf('Assigned POS order to customer #%d for %s.', $target_customer_id, $billing_email));

    return true;
}

function psp_order_looks_like_pos_purchase($order, $source_data = null) {
    $is_staff_context = psp_is_pos_staff();

    if (psp_order_has_pos_shipping_method($order)) {
        return true;
    }

    $created_via = strtolower((string) $order->get_created_via());
    foreach (array('pos', 'point-of-sale', 'point_of_sale', 'in-store', 'instore') as $pos_source) {
        if ($created_via !== '' && strpos($created_via, $pos_source) !== false) {
            return true;
        }
    }

    if (psp_current_request_looks_like_pos_checkout()) {
        return true;
    }

    if (!$is_staff_context) {
        return false;
    }

    $payment_method = strtolower((string) $order->get_payment_method());
    $payment_title = strtolower((string) $order->get_payment_method_title());
    if ($payment_method === 'cod' || strpos($payment_method, 'cash') !== false || strpos($payment_title, 'cash') !== false) {
        return true;
    }

    if (is_array($source_data)) {
        $posted_payment_method = strtolower((string) ($source_data['payment_method'] ?? ''));
        if ($posted_payment_method === 'cod' || strpos($posted_payment_method, 'cash') !== false) {
            return true;
        }

        $posted_shipping_methods = $source_data['shipping_method'] ?? array();
        foreach ((array) $posted_shipping_methods as $posted_shipping_method) {
            if (psp_shipping_method_value_is_pos((string) $posted_shipping_method)) {
                return true;
            }
        }
    }

    return false;
}

function psp_order_has_pos_shipping_method($order) {
    if (!$order instanceof WC_Order) {
        return false;
    }

    foreach ($order->get_items('shipping') as $shipping_item) {
        $shipping_label = strtolower((string) $shipping_item->get_name());
        $method_id = strtolower((string) $shipping_item->get_method_id());
        $instance_id = (int) $shipping_item->get_instance_id();
        $method_value = $method_id . ':' . $instance_id;

        if (psp_shipping_method_value_is_pos($method_value) || psp_shipping_label_is_pos($shipping_label)) {
            return true;
        }
    }

    return false;
}

function psp_shipping_method_value_is_pos($method_value) {
    $method_value = strtolower($method_value);
    $pos_instance_id = defined('PSP_POS_SHIPPING_INSTANCE_ID') ? (int) PSP_POS_SHIPPING_INSTANCE_ID : 8;

    if (strpos($method_value, ':' . $pos_instance_id) !== false &&
        (strpos($method_value, 'local_pickup') !== false || strpos($method_value, 'flat_rate') !== false)) {
        return true;
    }

    return psp_shipping_label_is_pos($method_value);
}

function psp_shipping_label_is_pos($label) {
    $label = strtolower($label);

    return strpos($label, 'pos |') !== false
        || strpos($label, 'local store purchase') !== false
        || strpos($label, 'pos local') !== false
        || strpos($label, 'in-store purchase') !== false
        || strpos($label, 'instore purchase') !== false;
}

function psp_current_request_looks_like_pos_checkout() {
    $request_text = strtolower(implode(' ', array(
        $_SERVER['REQUEST_URI'] ?? '',
        $_SERVER['HTTP_REFERER'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? '',
    )));

    foreach (array('/pos/', '/pos?', 'pos-app', 'wc-pos', 'woocommerce-pos', 'point-of-sale', 'point_of_sale', 'wepos', 'foosales', 'yith-pos') as $pos_hint) {
        if ($request_text !== '' && strpos($request_text, $pos_hint) !== false) {
            return true;
        }
    }

    return false;
}

function psp_get_clean_order_billing_email($order) {
    if (!$order instanceof WC_Order) {
        return '';
    }

    $billing_email = sanitize_email((string) $order->get_billing_email());
    return is_email($billing_email) ? $billing_email : '';
}

function psp_get_or_create_pos_customer_id($order, $billing_email) {
    $customer_id = 0;

    if (function_exists('wc_get_customer_id_by_email')) {
        $customer_id = absint(wc_get_customer_id_by_email($billing_email));
    }

    if ($customer_id <= 0) {
        $user = get_user_by('email', $billing_email);
        if ($user) {
            $customer_id = absint($user->ID);
        }
    }

    if ($customer_id > 0) {
        return $customer_id;
    }

    $create_customer = apply_filters('psp_create_customer_for_pos_order', true, $order, $billing_email);
    if (!$create_customer || !function_exists('wc_create_new_customer')) {
        return 0;
    }

    $first_name = trim((string) $order->get_billing_first_name());
    $last_name = trim((string) $order->get_billing_last_name());
    $display_name = trim($first_name . ' ' . $last_name);

    $customer_data = array_filter(array(
        'first_name' => $first_name,
        'last_name' => $last_name,
        'display_name' => $display_name,
        'role' => 'customer',
    ));

    $new_customer_id = wc_create_new_customer($billing_email, '', '', $customer_data);
    if (is_wp_error($new_customer_id)) {
        psp_log_pos_customer_profile_message(sprintf('Could not create POS customer for %s: %s', $billing_email, $new_customer_id->get_error_message()));
        return 0;
    }

    return absint($new_customer_id);
}

function psp_fill_customer_profile_from_pos_order($customer_id, $order) {
    if (!$order instanceof WC_Order || !class_exists('WC_Customer')) {
        return;
    }

    $customer = new WC_Customer($customer_id);
    $fields_to_fill = array(
        array('get_first_name', 'set_first_name', $order->get_billing_first_name()),
        array('get_last_name', 'set_last_name', $order->get_billing_last_name()),
        array('get_billing_first_name', 'set_billing_first_name', $order->get_billing_first_name()),
        array('get_billing_last_name', 'set_billing_last_name', $order->get_billing_last_name()),
        array('get_billing_company', 'set_billing_company', $order->get_billing_company()),
        array('get_billing_address_1', 'set_billing_address_1', $order->get_billing_address_1()),
        array('get_billing_address_2', 'set_billing_address_2', $order->get_billing_address_2()),
        array('get_billing_city', 'set_billing_city', $order->get_billing_city()),
        array('get_billing_state', 'set_billing_state', $order->get_billing_state()),
        array('get_billing_postcode', 'set_billing_postcode', $order->get_billing_postcode()),
        array('get_billing_country', 'set_billing_country', $order->get_billing_country()),
        array('get_billing_phone', 'set_billing_phone', $order->get_billing_phone()),
        array('get_shipping_first_name', 'set_shipping_first_name', $order->get_shipping_first_name()),
        array('get_shipping_last_name', 'set_shipping_last_name', $order->get_shipping_last_name()),
        array('get_shipping_company', 'set_shipping_company', $order->get_shipping_company()),
        array('get_shipping_address_1', 'set_shipping_address_1', $order->get_shipping_address_1()),
        array('get_shipping_address_2', 'set_shipping_address_2', $order->get_shipping_address_2()),
        array('get_shipping_city', 'set_shipping_city', $order->get_shipping_city()),
        array('get_shipping_state', 'set_shipping_state', $order->get_shipping_state()),
        array('get_shipping_postcode', 'set_shipping_postcode', $order->get_shipping_postcode()),
        array('get_shipping_country', 'set_shipping_country', $order->get_shipping_country()),
    );

    foreach ($fields_to_fill as $field) {
        list($getter, $setter, $order_value) = $field;
        $order_value = trim((string) $order_value);

        if ($order_value === '' || !method_exists($customer, $getter) || !method_exists($customer, $setter)) {
            continue;
        }

        if (trim((string) $customer->{$getter}()) === '') {
            $customer->{$setter}($order_value);
        }
    }

    $customer->save();
}

function psp_user_is_pos_staff_account($user_id) {
    $user = get_userdata($user_id);
    if (!$user) {
        return false;
    }

    $allowed_roles = apply_filters('psp_pos_staff_roles', array('administrator', 'shop_manager', 'cashier', 'POS_Cashier'));
    foreach ($allowed_roles as $role) {
        if (in_array($role, (array) $user->roles, true)) {
            return true;
        }
    }

    return user_can($user_id, 'manage_woocommerce') || user_can($user_id, 'edit_shop_orders');
}

function psp_log_pos_customer_profile_message($message) {
    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
        error_log('PSP POS Customer Assignment - ' . $message);
    }
}

// ============================================================================
// 4. SHIPPING FILTER: Handle "POS | Local Store Purchase"
// ============================================================================
add_filter('woocommerce_package_rates', 'psp_filter_shipping_methods_by_role', 10, 2);

function psp_filter_shipping_methods_by_role($rates, $package) {
    if (empty($rates) || !is_array($rates)) {
        return $rates;
    }

    $is_staff = psp_is_pos_staff();
    
    // Debug logging
    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
        error_log('PSP Shipping Filter - Is Staff: ' . ($is_staff ? 'YES' : 'NO'));
        error_log('PSP Shipping Filter - Available Rates: ' . print_r(array_keys($rates), true));
    }
    
    // If user is Staff/Cashier, SHOW ALL (return everything)
    if ($is_staff) {
        return $rates;
    }

    // POS Shipping Instance ID to hide from non-staff
    $pos_instance_id = defined('PSP_POS_SHIPPING_INSTANCE_ID') ? PSP_POS_SHIPPING_INSTANCE_ID : 8;
    
    // POS method types that should be hidden (NOT table_rate, free_shipping, etc.)
    $pos_method_types = array('local_pickup', 'flat_rate');

    // For regular customers, HIDE POS methods only
    foreach ($rates as $rate_id => $rate) {
        $label = strtolower($rate->label ?? '');
        $instance_id = isset($rate->instance_id) ? (int) $rate->instance_id : 0;
        $method_id = isset($rate->method_id) ? $rate->method_id : '';
        
        // Extract method type from rate_id (e.g., "local_pickup:8" -> "local_pickup")
        $rate_method_type = '';
        if (strpos($rate_id, ':') !== false) {
            $rate_method_type = explode(':', $rate_id)[0];
        }
        
        // IMPORTANT: Skip table_rate methods entirely - never hide them based on instance ID
        if ($method_id === 'table_rate' || $rate_method_type === 'table_rate') {
            // Only check label-based hiding for table rates (very specific POS keywords)
            if (strpos($label, 'pos |') !== false || strpos($label, 'local store purchase') !== false) {
                unset($rates[$rate_id]);
            }
            continue;
        }
        
        // Detect if this is a POS-specific label
        // Only labels explicitly marked as POS should be hidden from regular customers.
        // A customer-facing "Local Pickup" ($0) must NEVER be hidden just because it
        // shares instance ID 8 with the POS method.
        $is_pos_label = strpos($label, 'pos |') !== false
            || strpos($label, 'local store purchase') !== false
            || strpos($label, 'pos local') !== false;

        // For non-table-rate local_pickup / flat_rate methods, hide ONLY when the label
        // is explicitly a POS label AND the instance ID matches the configured POS instance.
        if (in_array($rate_method_type, $pos_method_types) || in_array($method_id, $pos_method_types)) {
            if ($is_pos_label) {
                if ($instance_id === $pos_instance_id || strpos($rate_id, ':' . $pos_instance_id) !== false) {
                    unset($rates[$rate_id]);
                    continue;
                }
            }
        }

        // Fallback: hide any method (regardless of type) whose label is explicitly POS
        if ($is_pos_label) {
            unset($rates[$rate_id]);
        }
    }

    return $rates;
}

// ============================================================================
// 5. GATEWAY FILTER: The "Mega Merge"
// ============================================================================
add_filter('woocommerce_available_payment_gateways', 'psp_master_gateway_logic', 15);

function psp_master_gateway_logic($available_gateways) {
    if (empty($available_gateways)) {
        return $available_gateways;
    }

    // --- CONTEXT DETECTION ---
    $is_staff   = psp_is_pos_staff();
    $is_woonuxt = false;

    // Detect WooNuxt / Headless (Store API / GraphQL / Frontend headers)
    if ((isset($_SERVER['HTTP_X_FRONTEND_TYPE']) && $_SERVER['HTTP_X_FRONTEND_TYPE'] === 'woonuxt') ||
        (defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST) ||
        (isset($_SERVER['HTTP_USER_AGENT']) && strpos($_SERVER['HTTP_USER_AGENT'], 'WooNuxt') !== false) ||
        (strpos($_SERVER['REQUEST_URI'] ?? '', '/wp-json/wc/store/') !== false)) {
        $is_woonuxt = true;
    }

    // Determine Country safely
    $country = '';
    if (function_exists('WC') && isset(WC()->customer)) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }

    // Debug logging
    if (defined('PSP_DEBUG_MODE') && PSP_DEBUG_MODE) {
        error_log('PSP Gateway Filter - Is Staff: ' . ($is_staff ? 'YES' : 'NO'));
        error_log('PSP Gateway Filter - Is WooNuxt: ' . ($is_woonuxt ? 'YES' : 'NO'));
        error_log('PSP Gateway Filter - Country: ' . $country);
    }

    // --- LOGIC BRANCH 1: WOONUXT FRONTEND ---
    if ($is_woonuxt) {
        if ($country === 'US') {
            return array();
        }

        if ($country === 'CA') {
            $organized = array();
            if (isset($available_gateways['cod'])) {
                $available_gateways['cod']->title = 'Helcim Payment';
                $available_gateways['cod']->description = 'Secure payment processing via Helcim';
                $organized['cod'] = $available_gateways['cod'];
            }
            
            if (PSP_ENABLE_PAYPAL) {
                $pp_gateways = ['ppcp-gateway', 'ppcp-credit-card-gateway', 'ppcp-card-button-gateway', 'ppcp-googlepay', 'ppcp-applepay'];
                foreach ($pp_gateways as $gw) {
                    if (isset($available_gateways[$gw])) $organized[$gw] = $available_gateways[$gw];
                }
            }
            
            if (PSP_ENABLE_STRIPE) {
                foreach ($available_gateways as $id => $gateway) {
                    if ($id === 'stripe' || strpos($id, 'stripe_') === 0) {
                        $organized[$id] = $gateway;
                    }
                }
            }
            
            unset($organized['helcimjs']); // Remove native Helcim plugin
            return !empty($organized) ? $organized : $available_gateways;
        }

        // Rest of World (WooNuxt)
        $organized = array();
        if (PSP_ENABLE_PAYPAL) {
            $pp_gateways = ['ppcp-credit-card-gateway', 'ppcp-gateway', 'ppcp-card-button-gateway', 'ppcp-googlepay', 'ppcp-applepay'];
            foreach ($pp_gateways as $gw) {
                if (isset($available_gateways[$gw])) $organized[$gw] = $available_gateways[$gw];
            }
        }
        
        if (PSP_ENABLE_STRIPE) {
            foreach ($available_gateways as $id => $gateway) {
                if ($id === 'stripe' || strpos($id, 'stripe_') === 0) {
                    $organized[$id] = $gateway;
                }
            }
        }
        
        return $organized;
    }

    // --- LOGIC BRANCH 2: STANDARD WORDPRESS (+ Staff Override) ---

    if ($country === 'CA') {
        $organized = array();
        if (isset($available_gateways['helcimjs'])) {
            $organized['helcimjs'] = $available_gateways['helcimjs'];
        }
        if ($is_staff && isset($available_gateways['cod'])) {
            $organized['cod'] = $available_gateways['cod'];
        }
        return !empty($organized) ? $organized : $available_gateways;
    }

    if ($country === 'US') {
        if (isset($available_gateways['helcimjs'])) unset($available_gateways['helcimjs']);
        if (isset($available_gateways['cod']) && !$is_staff) unset($available_gateways['cod']);
        if (!PSP_ALLOW_US_CHECKOUT) unset($available_gateways['cod']); 
        return $available_gateways;
    }

    // Rest of World
    $global_allowed = array();
    if (PSP_ENABLE_PAYPAL) {
        $pp_gateways = ['ppcp-gateway', 'ppcp-credit-card-gateway', 'ppcp-card-button-gateway', 'ppcp-googlepay', 'ppcp-applepay', 'wpg_paypal_checkout'];
        foreach ($pp_gateways as $gw) {
            if (isset($available_gateways[$gw])) $global_allowed[$gw] = $available_gateways[$gw];
        }
    }

    if (PSP_ENABLE_STRIPE) {
        foreach ($available_gateways as $id => $gateway) {
            if ($id === 'stripe' || strpos($id, 'stripe_') === 0) {
                $global_allowed[$id] = $gateway;
            }
        }
    }

    if ($is_staff && isset($available_gateways['cod'])) {
        $global_allowed['cod'] = $available_gateways['cod'];
    }

    return $global_allowed;
}

// ============================================================================
// 6. ENSURE COD LOADED FOR WOONUXT
// ============================================================================
add_filter('woocommerce_payment_gateways', 'psp_ensure_cod_enabled_for_woonuxt', 5);

function psp_ensure_cod_enabled_for_woonuxt($payment_gateways) {
    $is_woonuxt = false;
    if ((isset($_SERVER['HTTP_X_FRONTEND_TYPE']) && $_SERVER['HTTP_X_FRONTEND_TYPE'] === 'woonuxt') ||
        (defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST) || 
        (strpos($_SERVER['REQUEST_URI'] ?? '', '/wp-json/wc/store/') !== false)) {
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
// 7. FORCE COD AVAILABILITY FOR STAFF (Bypass shipping method restriction)
// ============================================================================
add_filter('woocommerce_available_payment_gateways', 'psp_force_cod_for_staff', 99);

function psp_force_cod_for_staff($gateways) {
    if (!psp_is_pos_staff()) return $gateways;
    
    if (!isset($gateways['cod']) && class_exists('WC_Gateway_COD')) {
        $gateways['cod'] = new WC_Gateway_COD();
    }
    
    return $gateways;
}

// ============================================================================
// 8. BYPASS COD SHIPPING METHOD RESTRICTION FOR STAFF
// ============================================================================
add_filter('woocommerce_cod_process_payment_order_status', 'psp_cod_allow_any_shipping_for_staff', 10, 2);

function psp_cod_allow_any_shipping_for_staff($status, $order) {
    if (psp_is_pos_staff()) return $status;
    return $status;
}

add_filter('woocommerce_available_payment_gateways', 'psp_override_cod_shipping_restriction', 100);

function psp_override_cod_shipping_restriction($gateways) {
    if (!psp_is_pos_staff()) return $gateways;
    
    if (!isset($gateways['cod']) && class_exists('WC_Gateway_COD')) {
        $gateways['cod'] = new WC_Gateway_COD();
    }
    
    return $gateways;
}

// ============================================================================
// 9. TARIFF TAX SYSTEM
// ============================================================================
if (!function_exists('psp_is_checkout_context')) {
    function psp_is_checkout_context() {
        if (function_exists('is_checkout') && is_checkout()) return true;
        if (defined('DOING_AJAX') && DOING_AJAX && isset($_REQUEST['wc-ajax']) && $_REQUEST['wc-ajax'] === 'update_order_review') return true;
        if (strpos($_SERVER['REQUEST_URI'] ?? '', '/wp-json/wc/store/') !== false) return true; // Store API Support
        return false;
    }
}

if (!function_exists('psp_calc_tariff')) {
    function psp_calc_tariff($subtotal) {
        if ($subtotal >= 0 && $subtotal < 50) return 15;
        if ($subtotal >= 50 && $subtotal < 300) return 20;
        if ($subtotal >= 300 && $subtotal <= 10000) return 10;
        return 0;
    }
}

add_action('woocommerce_cart_calculate_fees', 'psp_add_tariff_fee');

function psp_add_tariff_fee() {
    if (!defined('PSP_ENABLE_TARIFF_TAX') || PSP_ENABLE_TARIFF_TAX !== true) return;
    if (is_admin() && !(defined('DOING_AJAX') && DOING_AJAX)) return;
    if (!psp_is_checkout_context()) return;

    // Safety check for Headless environments where cart might not be instantiated yet
    if ( ! function_exists('WC') || ! isset(WC()->cart) || empty(WC()->cart) ) {
        return;
    }

    $country = '';
    if (isset(WC()->customer)) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }
    
    if ($country !== 'US' || !PSP_ALLOW_US_CHECKOUT) return;

    $cart_subtotal = WC()->cart->get_subtotal();
    $tariff_amount = psp_calc_tariff($cart_subtotal);

    if ($tariff_amount > 0) {
        WC()->cart->add_fee(__('Tariff Tax', 'woocommerce'), $tariff_amount, true);
    }
}

add_action('woocommerce_review_order_before_payment', 'psp_display_tariff_notice');

function psp_display_tariff_notice() {
    if (!defined('PSP_ENABLE_TARIFF_TAX') || PSP_ENABLE_TARIFF_TAX !== true) return;
    if (!defined('PSP_SHOW_TARIFF_NOTICE') || PSP_SHOW_TARIFF_NOTICE !== true) return;
    if (!function_exists('is_checkout') || !is_checkout()) return;

    $country = '';
    if (function_exists('WC') && isset(WC()->customer)) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }
    if ($country !== 'US' || !PSP_ALLOW_US_CHECKOUT) return;

    // Safety check
    if ( ! isset(WC()->cart) || empty(WC()->cart) ) return;

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
// 10. DEBUG OUTPUT ON CHECKOUT PAGE (Only when PSP_DEBUG_MODE is true)
// ============================================================================
add_action('wp_footer', 'psp_debug_checkout_info');

function psp_debug_checkout_info() {
    if (!defined('PSP_DEBUG_MODE') || PSP_DEBUG_MODE !== true) return;
    if (!function_exists('is_checkout') || !is_checkout()) return;
    
    $is_staff = psp_is_pos_staff();
    $user = wp_get_current_user();
    $country = '';
    if (function_exists('WC') && isset(WC()->customer)) {
        $ship = WC()->customer->get_shipping_country();
        $bill = WC()->customer->get_billing_country();
        $country = strtoupper($ship ? $ship : $bill);
    }
    
    echo '';
}

// ============================================================================
// 11. CLEAR WOOCOMMERCE SHIPPING CACHE (Run once on admin init)
// ============================================================================
add_action('admin_init', 'psp_clear_shipping_cache_once');

function psp_clear_shipping_cache_once() {
    if (get_transient('psp_shipping_cache_cleared')) return;
    
    if (class_exists('WC_Cache_Helper')) {
        WC_Cache_Helper::get_transient_version('shipping', true);
    }
    
    set_transient('psp_shipping_cache_cleared', true, HOUR_IN_SECONDS);
}

// ============================================================================
// 11b. FORCE POS SHIPPING FOR STAFF (Add method even if zone doesn't match)
// ============================================================================
add_filter('woocommerce_package_rates', 'psp_force_pos_shipping_for_staff', 100, 2);

function psp_force_pos_shipping_for_staff($rates, $package) {
    if (!psp_is_pos_staff()) return $rates;
    if (!is_array($rates)) $rates = [];
    
    $pos_instance_id = defined('PSP_POS_SHIPPING_INSTANCE_ID') ? PSP_POS_SHIPPING_INSTANCE_ID : 8;
    
    $pos_exists = false;
    foreach ($rates as $rate_id => $rate) {
        $instance_id = isset($rate->instance_id) ? (int) $rate->instance_id : 0;
        $method_id = isset($rate->method_id) ? $rate->method_id : '';
        
        if ($instance_id === $pos_instance_id && in_array($method_id, array('local_pickup', 'flat_rate'))) {
            $pos_exists = true;
            break;
        }
    }
    
    if (!$pos_exists) {
        $pos_zone_id = defined('PSP_POS_SHIPPING_ZONE_ID') ? PSP_POS_SHIPPING_ZONE_ID : 3;
        
        if (class_exists('WC_Shipping_Zone')) {
            $zone = new WC_Shipping_Zone($pos_zone_id);
            $shipping_methods = $zone->get_shipping_methods(true); 
            
            foreach ($shipping_methods as $method) {
                if ((int) $method->instance_id === $pos_instance_id) {
                    if (!in_array($method->id, array('local_pickup', 'flat_rate'))) continue;
                    
                    $rate = new WC_Shipping_Rate(
                        $method->id . ':' . $method->instance_id,
                        $method->title,
                        0, 
                        array(), 
                        $method->id,
                        $method->instance_id
                    );
                    
                    $rates[$method->id . ':' . $method->instance_id] = $rate;
                    break;
                }
            }
        }
    }
    
    return $rates;
}

// ============================================================================
// 12. ADMIN NOTICE FOR DEBUG MODE
// ============================================================================
add_action('admin_notices', 'psp_debug_mode_notice');

function psp_debug_mode_notice() {
    if (!defined('PSP_DEBUG_MODE') || PSP_DEBUG_MODE !== true) return;
    if (!current_user_can('manage_options')) return;
    
    echo '<div class="notice notice-warning is-dismissible">';
    echo '<p><strong>PSP Master Payment/Shipping:</strong> Debug mode is enabled. ';
    echo 'Check your browser\'s View Source on checkout for debug info, and wp-content/debug.log for detailed logs. ';
    echo 'Set <code>PSP_DEBUG_MODE</code> to <code>false</code> in production.</p>';
    echo '</div>';
}
