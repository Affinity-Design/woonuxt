<?php
/**
 * Helcim Refund Error Handler
 * 
 * Improves error messages for Helcim refund failures.
 * 
 * INSTALLATION OPTIONS:
 * 1. Code Snippets plugin: Copy everything below this comment block
 * 2. Custom plugin: Upload this file to wp-content/plugins/ and activate
 * 3. Must-use plugin: Upload to wp-content/mu-plugins/
 * 
 * Plugin Name: Helcim Refund Error Handler
 * Description: Shows detailed error messages when Helcim refunds fail
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// Capture Helcim API responses for better error messages
add_filter('http_response', function($response, $parsed_args, $url) {
    // Only capture Helcim API calls
    if (strpos($url, 'helcim.com') === false && strpos($url, 'api.helcim.com') === false) {
        return $response;
    }
    
    $body = wp_remote_retrieve_body($response);
    $status = wp_remote_retrieve_response_code($response);
    
    // Log for debugging
    error_log("[Helcim] API call to: $url | Status: $status");
    error_log("[Helcim] Response: $body");
    
    // Check for errors
    if ($status !== 200) {
        $error_msg = helcim_parse_error($body, $status);
        set_transient('helcim_refund_error', $error_msg, 120);
        set_transient('helcim_refund_error_raw', $body, 120);
    }
    
    return $response;
}, 10, 3);

// Parse Helcim error responses
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
    
    // Check for batch-related issues (most common refund failure)
    $body_lower = strtolower($body);
    if (strpos($body_lower, 'batch') !== false || $status === 422) {
        $messages[] = '⚠️ BATCH NOT SETTLED: The card batch may still be open. Refunds only work AFTER the batch closes (usually end of day). Use REVERSE in Helcim dashboard for same-day returns.';
    }
    
    // Status code hints
    if (empty($messages)) {
        switch ($status) {
            case 400: $messages[] = 'Bad Request - Check transaction ID format'; break;
            case 401: $messages[] = 'Unauthorized - Check Helcim API credentials in WooCommerce settings'; break;
            case 403: $messages[] = 'Forbidden - Account may not have refund permissions'; break;
            case 404: $messages[] = 'Transaction not found in Helcim - Verify transaction ID'; break;
            case 422: $messages[] = 'Cannot process - Batch may be open (use Reverse instead)'; break;
            default: $messages[] = "HTTP Error $status - Check Helcim dashboard";
        }
    }
    
    return implode(' | ', array_unique($messages));
}

// Show detailed error notice on order page
add_action('admin_notices', function() {
    if (!is_admin()) return;
    
    $screen = get_current_screen();
    if (!$screen || $screen->id !== 'shop_order') return;
    
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

// Add meta box showing Helcim transaction data on order page
add_action('add_meta_boxes', function() {
    add_meta_box(
        'helcim_debug',
        'Helcim Transaction Info',
        'helcim_debug_meta_box',
        'shop_order',
        'side',
        'default'
    );
});

function helcim_debug_meta_box($post) {
    $order = wc_get_order($post->ID);
    if (!$order) return;
    
    $fields = [
        'Payment Method' => $order->get_payment_method(),
        'Transaction ID' => $order->get_transaction_id() ?: '❌ Not set',
        '_transaction_id' => $order->get_meta('_transaction_id') ?: '❌ Not set',
        '_helcim_transaction_id' => $order->get_meta('_helcim_transaction_id') ?: '❌ Not set',
        'Card Token' => $order->get_meta('helcim-card-token') ? '✅ Present' : '❌ Not set',
    ];
    
    echo '<table style="width:100%; font-size:12px;">';
    foreach ($fields as $label => $value) {
        $color = strpos($value, '❌') !== false ? 'red' : 'inherit';
        echo "<tr><td><strong>$label:</strong></td><td style='color:$color'>" . esc_html($value) . "</td></tr>";
    }
    echo '</table>';
    
    // Warning if missing transaction ID
    if (!$order->get_transaction_id() && !$order->get_meta('_transaction_id')) {
        echo '<p style="color:red; margin-top:10px;"><strong>⚠️ Missing transaction ID - refunds will fail!</strong></p>';
    }
    
    echo '<hr style="margin:10px 0;">';
    echo '<p style="font-size:11px; color:#666;">';
    echo '<strong>Refund:</strong> After batch closes<br>';
    echo '<strong>Reverse:</strong> Same day, open batch';
    echo '</p>';
}
