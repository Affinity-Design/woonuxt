<?php
/**
 * Plugin Name: Helcim Refund Error Handler
 * Description: Improves error messages for Helcim refund failures in WooCommerce
 * Version: 1.0.0
 * Author: ProSkatersPlace
 * 
 * This is a must-use plugin. Upload to: wp-content/mu-plugins/
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Hook into WooCommerce refund process to capture detailed Helcim errors
 */
class Helcim_Refund_Error_Handler {
    
    private static $instance = null;
    private $last_api_error = null;
    
    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Hook into HTTP API to capture Helcim API responses
        add_filter('http_response', array($this, 'capture_helcim_response'), 10, 3);
        
        // Hook into refund error to provide better messages
        add_filter('woocommerce_refund_failed', array($this, 'enhance_refund_error'), 10, 2);
        
        // Add admin notice with detailed error
        add_action('admin_notices', array($this, 'display_detailed_error'));
        
        // Store error in transient for display
        add_action('woocommerce_order_refunded', array($this, 'clear_error_transient'), 10, 2);
        
        // JavaScript to enhance the refund error display
        add_action('admin_footer', array($this, 'add_error_enhancement_script'));
    }
    
    /**
     * Capture Helcim API responses to extract error details
     */
    public function capture_helcim_response($response, $parsed_args, $url) {
        // Check if this is a Helcim API call
        if (strpos($url, 'helcim.com') !== false || strpos($url, 'api.helcim.com') !== false) {
            $body = wp_remote_retrieve_body($response);
            $status_code = wp_remote_retrieve_response_code($response);
            
            // Try to parse the response
            $data = json_decode($body, true);
            
            if ($status_code !== 200 || (isset($data['errors']) && !empty($data['errors']))) {
                error_log('[Helcim Refund] Provider request failed with HTTP status ' . absint($status_code) . '. Response details were withheld.');
                $error_message = $this->get_safe_error_message($status_code, $body);
                $this->last_api_error = $error_message;
                
                // Store in transient for display
                set_transient('helcim_last_refund_error', $error_message, 60);
                set_transient('helcim_last_refund_error_details', array(
                    'status_code' => absint($status_code),
                    'timestamp' => current_time('mysql')
                ), 60);
            }
        }
        
        return $response;
    }
    
    /**
     * Extract meaningful error message from Helcim response
     */
    private function get_safe_error_message($status_code, $raw_body) {
        // Check for batch-related errors
        if (strpos(strtolower($raw_body), 'batch') !== false) {
            if (strpos(strtolower($raw_body), 'open') !== false) {
                return 'The refund could not be completed because the card batch may still be open. Try a reversal or wait for settlement, then try again.';
            }
        }
        
        // Check for transaction not found
        if (strpos(strtolower($raw_body), 'not found') !== false || 
            strpos(strtolower($raw_body), 'invalid transaction') !== false) {
            return 'The payment transaction could not be found. Confirm the transaction in the Helcim dashboard and try again.';
        }
        
        // HTTP status code based messages
        switch ($status_code) {
            case 400:
                return 'The refund request could not be processed. Confirm the payment transaction and try again.';
            case 401:
            case 403:
                return 'The refund service could not authorize this request. Check the Helcim connection and try again.';
            case 404:
                return 'The payment transaction could not be found. Confirm it in the Helcim dashboard and try again.';
            case 422:
                return 'The refund could not be processed. The card batch may still be open; try a reversal or wait for settlement.';
            default:
                return 'The refund service could not complete this request. Check the Helcim dashboard and try again.';
        }
    }
    
    /**
     * Enhance the refund error message
     */
    public function enhance_refund_error($order_id, $refund_id) {
        if ($this->last_api_error) {
            return new WP_Error('helcim_refund_failed', $this->last_api_error);
        }
        return false;
    }
    
    /**
     * Display detailed error in admin notices
     */
    public function display_detailed_error() {
        $error = get_transient('helcim_last_refund_error');
        $details = get_transient('helcim_last_refund_error_details');
        
        if ($error && is_admin() && isset($_GET['post']) && get_post_type($_GET['post']) === 'shop_order') {
            ?>
            <div class="notice notice-error is-dismissible helcim-refund-error-notice">
                <p><strong>Helcim Refund Error Details:</strong></p>
                <p><?php echo esc_html($error); ?></p>
                <?php if ($details && current_user_can('manage_woocommerce')): ?>
                <details style="margin-top: 10px;">
                    <summary style="cursor: pointer; color: #0073aa;">Technical Details (click to expand)</summary>
                    <pre style="background: #f5f5f5; padding: 10px; margin-top: 10px; overflow-x: auto; font-size: 11px;"><?php 
                        echo esc_html(print_r($details, true)); 
                    ?></pre>
                </details>
                <?php endif; ?>
                <p style="margin-top: 10px;">
                    <strong>Common Solutions:</strong><br>
                    • If batch is open: Wait for daily batch close OR process a REVERSE in Helcim dashboard<br>
                    • If transaction not found: Verify the transaction ID in Helcim dashboard<br>
                    • If unauthorized: Check Helcim API credentials in WooCommerce settings
                </p>
            </div>
            <?php
            // Clear the transient after displaying
            delete_transient('helcim_last_refund_error');
            delete_transient('helcim_last_refund_error_details');
        }
    }
    
    /**
     * Clear error transient on successful refund
     */
    public function clear_error_transient($order_id, $refund_id) {
        delete_transient('helcim_last_refund_error');
        delete_transient('helcim_last_refund_error_details');
    }
    
    /**
     * Add JavaScript to enhance the alert box with more details
     */
    public function add_error_enhancement_script() {
        global $post;
        
        // Only on order edit pages
        if (!is_admin() || !current_user_can('manage_woocommerce') || !isset($post) || $post->post_type !== 'shop_order') {
            return;
        }
        ?>
        <script type="text/javascript">
        (function($) {
            // Store original alert
            var originalAlert = window.alert;
            
            // Override alert to enhance Helcim error messages
            window.alert = function(message) {
                if (message && message.indexOf('payment gateway API') !== -1) {
                    // This is the generic Helcim error - fetch better details
                    $.ajax({
                        url: ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'get_helcim_refund_error',
                            nonce: '<?php echo wp_create_nonce('helcim_error_nonce'); ?>'
                        },
                        async: false, // Need synchronous to replace alert
                        success: function(response) {
                            if (response.success && response.data.error) {
                                message = "Helcim Refund Failed:\n\n" + response.data.error + 
                                    "\n\n---\nCommon causes:\n" +
                                    "• Batch still open (wait for settlement or use Reverse)\n" +
                                    "• Transaction ID mismatch\n" +
                                    "• API credentials issue\n\n" +
                                    "Check the admin notice above for technical details.";
                            }
                        }
                    });
                }
                
                // Call original alert with enhanced message
                originalAlert.call(window, message);
            };
        })(jQuery);
        </script>
        <?php
    }
}

// Initialize the handler
add_action('plugins_loaded', function() {
    Helcim_Refund_Error_Handler::get_instance();
});

// AJAX handler to get detailed error
add_action('wp_ajax_get_helcim_refund_error', function() {
    check_ajax_referer('helcim_error_nonce', 'nonce');

    if (!current_user_can('manage_woocommerce')) {
        wp_send_json_error(array(
            'message' => 'You do not have permission to view refund diagnostics.'
        ), 403);
    }
    
    $error = get_transient('helcim_last_refund_error');
    $details = get_transient('helcim_last_refund_error_details');
    
    if ($error) {
        wp_send_json_success(array(
            'error' => $error,
            'details' => $details
        ));
    } else {
        wp_send_json_error(array(
            'message' => 'No detailed error available'
        ));
    }
});

/**
 * Add order meta box with Helcim transaction details
 */
add_action('add_meta_boxes', function() {
    add_meta_box(
        'helcim_transaction_details',
        'Helcim Transaction Details',
        function($post) {
            $order = wc_get_order($post->ID);
            if (!$order) return;
            
            $transaction_id = $order->get_transaction_id();
            $payment_method = $order->get_payment_method();
            $meta_transaction_id = $order->get_meta('_transaction_id');
            $helcim_transaction_id = $order->get_meta('_helcim_transaction_id');
            $card_token = $order->get_meta('helcim-card-token');
            $card_token_alt = $order->get_meta('_helcim_card_token');
            
            echo '<table class="widefat" style="border: none;">';
            echo '<tr><td><strong>Payment Method:</strong></td><td>' . esc_html($payment_method) . '</td></tr>';
            echo '<tr><td><strong>Transaction ID (order):</strong></td><td>' . esc_html($transaction_id ?: 'Not set') . '</td></tr>';
            echo '<tr><td><strong>_transaction_id meta:</strong></td><td>' . esc_html($meta_transaction_id ?: 'Not set') . '</td></tr>';
            echo '<tr><td><strong>_helcim_transaction_id:</strong></td><td>' . esc_html($helcim_transaction_id ?: 'Not set') . '</td></tr>';
            echo '<tr><td><strong>helcim-card-token:</strong></td><td>' . esc_html($card_token ? 'Present (' . strlen($card_token) . ' chars)' : 'Not set') . '</td></tr>';
            echo '<tr><td><strong>_helcim_card_token:</strong></td><td>' . esc_html($card_token_alt ? 'Present (' . strlen($card_token_alt) . ' chars)' : 'Not set') . '</td></tr>';
            echo '</table>';
            
            // Show warning if transaction ID is missing
            if (!$transaction_id && !$meta_transaction_id) {
                echo '<p style="color: red; margin-top: 10px;"><strong>Warning:</strong> No transaction ID found. Native refunds will not work.</p>';
            }
            
            // Show batch status info
            echo '<p style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-left: 4px solid #0073aa;">';
            echo '<strong>Refund vs Reverse:</strong><br>';
            echo '• <strong>Reverse</strong>: Same-day, before batch closes - No fees<br>';
            echo '• <strong>Refund</strong>: After batch settles (usually next day) - Original fees apply<br>';
            echo 'If refund fails, the batch may still be open. Check Helcim dashboard.';
            echo '</p>';
        },
        'shop_order',
        'side',
        'default'
    );
});
