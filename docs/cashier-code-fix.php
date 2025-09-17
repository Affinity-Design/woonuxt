/**
 * FIXED VERSION - Cashier Code That Allows Helcim Payments
 * 
 * Add this code to replace the existing cashier functionality
 * This version allows Helcim payments alongside COD for cashiers
 */

// 2. Change Payment Method For Cashier | Allows COD AND Helcim for cashiers
add_filter('woocommerce_available_payment_gateways', 'limit_payment_methods_for_specific_roles_and_ensure_cod_and_helcim');

function limit_payment_methods_for_specific_roles_and_ensure_cod_and_helcim($available_gateways) {
    // Check if the user is logged in
    if (is_user_logged_in()) {
        $user = wp_get_current_user();
        $allowed_roles = array('POS_Cashier', 'cashier', 'administrator');
        $user_has_allowed_role = array_intersect($allowed_roles, (array) $user->roles) ? true : false;

        if ($user_has_allowed_role) {
            // For cashiers: Allow only COD and Helcim payment methods
            $allowed_methods = array('cod', 'helcimjs', 'helcim');
            
            // Add COD if not already available
            if (!isset($available_gateways['cod'])) {
                $payment_gateways = WC()->payment_gateways->payment_gateways();
                if (isset($payment_gateways['cod'])) {
                    $available_gateways['cod'] = $payment_gateways['cod'];
                }
            }
            
            // Remove any payment methods not in the allowed list
            foreach ($available_gateways as $gateway_key => $gateway) {
                if (!in_array($gateway_key, $allowed_methods)) {
                    unset($available_gateways[$gateway_key]);
                }
            }
        } else {
            // For non-cashiers: Remove COD but allow Helcim
            if (isset($available_gateways['cod'])) {
                unset($available_gateways['cod']);
            }
            // Keep Helcim available for regular customers
        }
    } else {
        // No user logged in: Remove COD but allow Helcim
        if (isset($available_gateways['cod'])) {
            unset($available_gateways['cod']);
        }
    }

    return $available_gateways;
}

// 4. MODIFIED: Create new user account based on billing fields (only for POST requests, not GraphQL)
add_action('woocommerce_checkout_create_order', 'customize_order_for_cashier_safe', 10, 2);

function customize_order_for_cashier_safe($order, $data) {
    // Skip this for GraphQL requests to avoid interference
    if (defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST) {
        return;
    }
    
    // Skip if this is a Helcim payment to avoid interference
    $payment_method = $order->get_payment_method();
    if (in_array($payment_method, array('helcimjs', 'helcim'))) {
        return;
    }
    
    // Check if the current user is logged in and has the required roles
    $user = wp_get_current_user();
    $allowed_roles = array('POS_Cashier', 'cashier', 'administrator');
    
    if (is_user_logged_in() && array_intersect($allowed_roles, (array) $user->roles)) {
        // ... rest of the original function code ...
        // (keeping the original logic for COD orders only)
    }
}
