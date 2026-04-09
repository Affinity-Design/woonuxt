/**
 * @snippet        Checkout Enhancements: PO Box Restriction, Force Account Creation, Required Phone, Hide Shipping Rates, Mobile Fix
 * @author         Affinity Design (Updated by Claude & GitHub Copilot)
 * @website        https://affinitydesign.ca
 * @version        WooCommerce 10.4.5
 * @tested         WooCommerce 10.4.3
 * @description    Enhanced checkout functionality with PO BOX prevention, conditional account creation, 
 * required phone number, shipping rate visibility control (Cart & Checkout), and Mobile/Cloudflare AJAX fixes.
 * @changelog      
 * 1.2.2 - Added AFFINITY_HIDE_SHIPPING_ON_CHECKOUT toggle and logic.
 */

// Prevent direct file access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * ============================================================================
 * FEATURE TOGGLES
 * ============================================================================
 */
define('AFFINITY_HIDE_SHIPPING_ON_CART', true);
define('AFFINITY_HIDE_SHIPPING_ON_CHECKOUT', false); // Set to false to show rates immediately on checkout

/**
 * Force account creation when specific coupon is applied
 */
function affinity_force_create_account_on_coupon($fields) {
    if (!function_exists('WC') || !WC()->cart) {
        return $fields;
    }

    $applied_coupons = WC()->cart->get_applied_coupons();
    
    if (!empty($applied_coupons) && 
        in_array('getskating05', $applied_coupons, true) &&
        !is_user_logged_in()) {

        if (isset($fields['account']['createaccount'])) {
            $fields['account']['createaccount']['required'] = true; 
            $fields['account']['createaccount']['default'] = true;  
        }
    }
    return $fields;
}
add_filter('woocommerce_checkout_fields', 'affinity_force_create_account_on_coupon');

/**
 * Prevent shipping to PO BOX addresses
 */
add_action('woocommerce_after_checkout_validation', 'affinity_disallow_pobox_shipping', 10, 2);

function affinity_disallow_pobox_shipping($data, $errors) {
    if (empty($data) || !is_array($data)) {
        return;
    }

    $use_shipping = !empty($data['ship_to_different_address']);
    
    $address1_key = $use_shipping ? 'shipping_address_1' : 'billing_address_1';
    $address2_key = $use_shipping ? 'shipping_address_2' : 'billing_address_2';
    $postcode_key = $use_shipping ? 'shipping_postcode' : 'billing_postcode';

    $address = isset($data[$address1_key]) ? sanitize_text_field($data[$address1_key]) : '';
    $address2 = isset($data[$address2_key]) ? sanitize_text_field($data[$address2_key]) : '';
    $postcode = isset($data[$postcode_key]) ? sanitize_text_field($data[$postcode_key]) : '';

    $replace = array(' ', '.', ',', '-', '#');
    $address_cleaned = strtolower(str_replace($replace, '', $address));
    $address2_cleaned = strtolower(str_replace($replace, '', $address2));
    $postcode_cleaned = strtolower(str_replace($replace, '', $postcode));

    $po_box_terms = array('pobox', 'p.o.box', 'po.box', 'postbox', 'postoffice', 'postofficebox', 'pob', 'box#', 'lockbox', 'pmb', 'privatebag');

    foreach ($po_box_terms as $term) {
        $term_cleaned = str_replace($replace, '', $term);
        if ((!empty($address_cleaned) && strpos($address_cleaned, $term_cleaned) !== false) ||
            (!empty($address2_cleaned) && strpos($address2_cleaned, $term_cleaned) !== false) ||
            (!empty($postcode_cleaned) && strpos($postcode_cleaned, $term_cleaned) !== false)) {
            
            $errors->add('shipping', __('Sorry, we do not ship to PO BOX addresses. Please provide a physical street address.', 'woocommerce'));
            break;
        }
    }
}

/**
 * Make phone number field required for regular customers
 */
function affinity_force_phone_required_woocommerce() {
    add_filter('woocommerce_billing_fields', function($fields) {
        $user = wp_get_current_user();
        $cashier_roles = apply_filters('affinity_cashier_roles_for_phone_requirement', array('POS_Cashier', 'cashier', 'administrator'));
        $is_cashier = !empty(array_intersect($cashier_roles, (array) $user->roles));

        if (!$is_cashier && isset($fields['billing_phone'])) {
            $fields['billing_phone']['required'] = true;
            $fields['billing_phone']['label'] = __('Phone', 'woocommerce') . ' <span class="required">*</span>';
            $fields['billing_phone']['placeholder'] = __('Enter your phone number (required)', 'woocommerce');
        }
        return $fields;
    }, 20);

    add_action('woocommerce_checkout_process', function() {
        if ((defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST) || (defined('REST_REQUEST') && REST_REQUEST)) {
            return;
        }

        $user = wp_get_current_user();
        $cashier_roles = apply_filters('affinity_cashier_roles_for_phone_requirement', array('POS_Cashier', 'cashier', 'administrator'));
        $is_cashier = !empty(array_intersect($cashier_roles, (array) $user->roles));
        $billing_phone = filter_input(INPUT_POST, 'billing_phone', FILTER_SANITIZE_FULL_SPECIAL_CHARS);
        
        if (!$is_cashier && empty($billing_phone)) {
            wc_add_notice(__('Phone number is a required field.', 'woocommerce'), 'error');
        }
    });
}
affinity_force_phone_required_woocommerce();

/**
 * SHIPPING RATE VISIBILITY CONTROL
 */

add_action('woocommerce_before_cart', 'affinity_clear_shipping_if_no_address', 5);
function affinity_clear_shipping_if_no_address() {
    if (!AFFINITY_HIDE_SHIPPING_ON_CART || !function_exists('WC') || !WC()->customer || !WC()->session) return;
    $address = WC()->customer->get_shipping_address_1();
    if (empty($address)) {
        WC()->session->set('shipping_for_package_0', false);
        WC()->session->set('chosen_shipping_methods', array());
        if (WC()->cart) {
            WC()->cart->set_shipping_total(0);
            WC()->cart->set_shipping_taxes(array());
        }
    }
}

add_filter('woocommerce_cart_ready_to_calc_shipping', 'affinity_check_address_before_shipping_calc', 1);
function affinity_check_address_before_shipping_calc($ready) {
    $hide_on_cart = (AFFINITY_HIDE_SHIPPING_ON_CART && is_cart());
    $hide_on_checkout = (AFFINITY_HIDE_SHIPPING_ON_CHECKOUT && is_checkout());

    if (!$hide_on_cart && !$hide_on_checkout) return $ready;
    if (!$ready || !WC()->customer) return $ready;

    return !empty(WC()->customer->get_shipping_address_1());
}

add_filter('woocommerce_package_rates', 'affinity_hide_shipping_until_address_complete', 9999, 2);
function affinity_hide_shipping_until_address_complete($rates, $package) {
    $hide_on_cart = (AFFINITY_HIDE_SHIPPING_ON_CART && is_cart());
    $hide_on_checkout = (AFFINITY_HIDE_SHIPPING_ON_CHECKOUT && is_checkout());

    if (!$hide_on_cart && !$hide_on_checkout) return $rates;
    if (empty($package) || !isset($package['destination']['address']) || empty($package['destination']['address'])) return array();
    
    return $rates;
}

add_filter('woocommerce_shipping_packages', 'affinity_filter_shipping_packages', 9999);
function affinity_filter_shipping_packages($packages) {
    $hide_on_cart = (AFFINITY_HIDE_SHIPPING_ON_CART && is_cart());
    $hide_on_checkout = (AFFINITY_HIDE_SHIPPING_ON_CHECKOUT && is_checkout());

    if (!$hide_on_cart && !$hide_on_checkout) return $packages;
    if (!WC()->customer) return $packages;

    return empty(WC()->customer->get_shipping_address_1()) ? array() : $packages;
}

add_action('woocommerce_customer_save_address', 'affinity_clear_shipping_cache');
add_action('woocommerce_checkout_update_order_review', 'affinity_clear_shipping_cache');
function affinity_clear_shipping_cache() {
    if (!WC()->session) return;
    WC()->session->set('shipping_for_package_0', false);
    if (WC()->shipping()) WC()->shipping()->reset_shipping();
}

add_action('woocommerce_cart_totals_before_shipping', 'affinity_shipping_address_notice');
function affinity_shipping_address_notice() {
    if (!AFFINITY_HIDE_SHIPPING_ON_CART || is_checkout() || !WC()->cart || !WC()->cart->needs_shipping()) return;
    static $notice_shown = false;
    if ($notice_shown || !WC()->customer) return;
    if (empty(WC()->customer->get_shipping_address_1())) {
        echo '<tr class="shipping-notice"><td colspan="2"><div class="woocommerce-info">' . esc_html__('Enter your shipping address to see available options.', 'woocommerce') . '</div></td></tr>';
        $notice_shown = true;
    }
}

/**
 * BLOCK-BASED CHECKOUT SUPPORT
 */
add_action('woocommerce_store_api_checkout_update_order_from_request', 'affinity_validate_pobox_store_api', 10, 2);
function affinity_validate_pobox_store_api($order, $request) {
    $addr1 = $order->get_shipping_address_1() ?: $order->get_billing_address_1();
    $addr2 = $order->get_shipping_address_2() ?: $order->get_billing_address_2();
    $replace = array(' ', '.', ',', '-', '#');
    $c1 = strtolower(str_replace($replace, '', $addr1));
    $c2 = strtolower(str_replace($replace, '', $addr2));
    $terms = array('pobox', 'postbox', 'postoffice', 'postofficebox', 'pob', 'lockbox', 'pmb', 'privatebag');
    foreach ($terms as $t) {
        if ((!empty($c1) && strpos($c1, $t) !== false) || (!empty($c2) && strpos($c2, $t) !== false)) {
            throw new \Exception(__('Sorry, we do not ship to PO BOX addresses.', 'woocommerce'));
        }
    }
}

/**
 * ============================================================================
 * MOBILE & CLOUDFLARE COMPATIBILITY FIXES
 * ============================================================================
 */

/**
 * Force mobile & desktop browsers to trigger a checkout refresh.
 * Targeted specifically at Address, Postal Code, and Country fields.
 */
add_action('wp_footer', 'affinity_force_mobile_checkout_refresh');
function affinity_force_mobile_checkout_refresh() {
    if (is_checkout()) {
        ?>
        <script type="text/javascript">
            jQuery(function($){
                // Use a debounce to prevent firing 50 times while someone types a zip code
                var timeout;
                
                $(document.body).on('input change keyup', 
                    'input[name^="shipping_address_1"], input[name^="billing_address_1"], \
                     input[name^="shipping_postcode"], input[name^="billing_postcode"], \
                     select[name^="shipping_country"], select[name^="billing_country"], \
                     select[name^="shipping_state"], select[name^="billing_state"]', 
                    function() {
                        
                        // Clear the timeout if it's already set
                        clearTimeout(timeout);

                        // Set a small delay (500ms) so it doesn't lag while typing
                        timeout = setTimeout(function() {
                            console.log('Affinity Fix: Forcing Checkout Update via field change.');
                            $('body').trigger('update_checkout');
                        }, 500);
                    }
                );
            });
        </script>
        <?php
    }
}

