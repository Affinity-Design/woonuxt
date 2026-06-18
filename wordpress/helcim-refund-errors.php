<?php
/**
 * Helcim Refund Error Handler
 *
 * Improves error messages for Helcim refund failures.
 * Compatible with both legacy (post-based) order storage and
 * High-Performance Order Storage (HPOS).
 *
 * INSTALLATION OPTIONS:
 * 1. Code Snippets plugin: Copy everything below this comment block  <-- LIVE METHOD
 * 2. Custom plugin: Upload this file to wp-content/plugins/ and activate
 * 3. Must-use plugin: Upload to wp-content/mu-plugins/
 *
 * Plugin Name: Helcim Refund Error Handler
 * Description: Shows detailed error messages when Helcim refunds fail
 * Version: 1.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Helper: screen ID of the order admin screen (HPOS-aware).
 * Returns 'shop_order' on legacy storage, 'woocommerce_page_wc-orders' on HPOS.
 */
function helcim_order_screen_id() {
    return function_exists('wc_get_page_screen_id') ? wc_get_page_screen_id('shop-order') : 'shop_order';
}

/**
 * 1. Capture Helcim API responses for better error debugging
 */
add_filter('http_response', function($response, $parsed_args, $url) {
    // Only capture Helcim API calls
    if (strpos($url, 'helcim.com') === false && strpos($url, 'api.helcim.com') === false) {
        return $response;
    }

    $body = wp_remote_retrieve_body($response);
    $status = wp_remote_retrieve_response_code($response);

    // Log for debugging (Optional: Check WooCommerce > Status > Logs)
    // error_log("[Helcim] API call to: $url | Status: $status");

    // Check for errors and store them temporarily
    if ($status !== 200) {
        $error_msg = helcim_parse_error($body, $status);
        set_transient('helcim_refund_error', $error_msg, 120);
        set_transient('helcim_refund_error_raw', $body, 120);
    }

    return $response;
}, 10, 3);

/**
 * 2. Helper: Parse Helcim error responses into readable text
 */
function helcim_parse_error($body, $status) {
    $data = json_decode($body, true);
    $messages = [];

    // Extract error messages from response
    if (isset($data['errors'])) {
        foreach ((array)$data['errors'] as $err) {
            $messages[] = is_string($err) ? $err : ($err['message'] ?? json_encode($err));
        }
    }
    if (isset($data['error'])) {
        $messages[] = is_string($data['error']) ? $data['error'] : json_encode($data['error']);
    }
    if (isset($data['message'])) {
        $messages[] = $data['message'];
    }

    // Check for batch-related issues (Common refund failure)
    $body_lower = strtolower($body);
    if (strpos($body_lower, 'batch') !== false || $status === 422) {
        $messages[] = '⚠️ BATCH NOT SETTLED: The card batch may still be open. Refunds only work AFTER the batch closes (usually end of day). Use REVERSE in Helcim dashboard for same-day returns.';
    }

    // Fallback status code hints
    if (empty($messages)) {
        switch ($status) {
            case 400: $messages[] = 'Bad Request - Check transaction ID format'; break;
            case 401: $messages[] = 'Unauthorized - Check Helcim API credentials'; break;
            case 403: $messages[] = 'Forbidden - Account may not have refund permissions'; break;
            case 404: $messages[] = 'Transaction not found in Helcim - Verify transaction ID'; break;
            case 422: $messages[] = 'Cannot process - Batch may be open (use Reverse instead)'; break;
            default: $messages[] = "HTTP Error $status - Check Helcim dashboard";
        }
    }

    return implode(' | ', array_unique($messages));
}

/**
 * 3. Display detailed error notice on the Order Admin Page
 *    (HPOS order screen is 'woocommerce_page_wc-orders', legacy is 'shop_order')
 */
add_action('admin_notices', function() {
    if (!is_admin()) return;

    $screen = get_current_screen();
    if (!$screen || !in_array($screen->id, ['shop_order', helcim_order_screen_id()], true)) return;

    $error = get_transient('helcim_refund_error');
    if (!$error) return;

    $raw = get_transient('helcim_refund_error_raw');
    ?>
    <div class="notice notice-error is-dismissible">
        <p><strong>🔴 Helcim Refund Failed:</strong></p>
        <p><?php echo esc_html($error); ?></p>
        <?php if ($raw): ?>
        <details style="margin: 10px 0;">
            <summary style="cursor:pointer; color:#0073aa;">Show raw API response</summary>
            <pre style="background:#f5f5f5; padding:10px; font-size:11px; overflow:auto;"><?php echo esc_html($raw); ?></pre>
        </details>
        <?php endif; ?>
        <p><strong>Quick Fix Options:</strong></p>
        <ul style="list-style:disc; margin-left:20px;">
            <li>If batch is open → Use <strong>Reverse</strong> in Helcim dashboard (same-day)</li>
            <li>If batch is closed → Retry refund here (next day)</li>
            <li>If transaction not found → Check transaction ID in order meta</li>
        </ul>
    </div>
    <?php
    delete_transient('helcim_refund_error');
    delete_transient('helcim_refund_error_raw');
});

/**
 * 4. Add "Helcim Transaction Info" Meta Box to Order Page
 *    Registered against the HPOS-aware screen ID so it shows on both
 *    legacy (post editor) and HPOS (wc-orders) order pages.
 */
add_action('add_meta_boxes', function() {
    add_meta_box(
        'helcim_debug',
        'Helcim Transaction Info',
        'helcim_debug_meta_box',
        helcim_order_screen_id(),
        'side',
        'default'
    );
});

function helcim_debug_meta_box($post_or_order) {
    // Legacy storage passes a WP_Post; HPOS passes the WC_Order object directly
    $order = ($post_or_order instanceof WC_Order) ? $post_or_order : wc_get_order($post_or_order->ID);
    if (!$order) return;

    // --- Logic for "Refundable" Status ---
    $card_token = $order->get_meta('helcim-card-token');
    $date_paid  = $order->get_date_paid(); // Returns WC_DateTime object

    // Default state
    $refundable_text = 'False';
    $refundable_color = 'red';

    if ($date_paid && $card_token) {
        // Calculate time difference: Current Server Time (UTC) - Paid Time (UTC)
        $seconds_diff = time() - $date_paid->getTimestamp();
        $hours_diff   = $seconds_diff / 3600;

        if ($hours_diff >= 24) {
            $refundable_text = 'True (Batch likely closed)';
            $refundable_color = 'green';
        } else {
            $refundable_text = 'Pending (Batch open)';
            $refundable_color = 'orange';
        }
    } elseif (!$card_token) {
        $refundable_text = 'False (No Token)';
    } else {
        $refundable_text = 'False (Not Paid)';
    }
    // -------------------------------------

    $fields = [
        'Payment Method' => $order->get_payment_method(),
        'Transaction ID' => $order->get_transaction_id() ?: '❌ Not set',
        'Card Token'     => $card_token ? '✅ Present' : '❌ Not set',
        'Refundable'     => "<strong style='color:$refundable_color;'>$refundable_text</strong>",
    ];

    echo '<table style="width:100%; font-size:12px;">';
    foreach ($fields as $label => $value) {
        // Simple HTML rendering (note: $value for Refundable contains HTML)
        echo "<tr><td style='padding:4px 0;'><strong>$label:</strong></td><td>" . $value . "</td></tr>";
    }
    echo '</table>';

    // Warning if missing transaction ID
    if (!$order->get_transaction_id()) {
        echo '<p style="color:red; margin-top:10px; font-size:11px;"><strong>⚠️ Missing Transaction ID - Automatic refunds will fail.</strong></p>';
    }

    echo '<hr style="margin:10px 0; border-bottom: 1px solid #eee;">';
    echo '<p style="font-size:11px; color:#666; margin:0;">';
    echo '<strong>Pending:</strong> Wait 24h for batch to close.<br>';
    echo '<strong>True:</strong> Safe to Refund.<br>';
    echo '<strong>False:</strong> Manual action required.';
    echo '</p>';
}
