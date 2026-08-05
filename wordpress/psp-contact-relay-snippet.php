<?php
/**
 * PSP Contact Relay — v1.0.0 (2026-08-05)
 *
 * Lets the headless .ca frontend deliver store-to-self email through this
 * WordPress site's wp_mail() transport (same pipe as WooCommerce order emails).
 * Added because the Cloudflare account role can't enable Email Service and
 * SendGrid is down — WordPress is the mail path we fully control.
 *
 * Deploy: paste into Code Snippets (PHP, "Run snippet everywhere") on the TEST
 * WordPress first, then production proskatersplace.com. No settings needed.
 *
 * Contract:
 *   POST /wp-json/psp/v1/contact-relay
 *   Auth: Application Password (Basic) — server-to-server only; the caller is
 *         server/utils/emailSender.ts in the WooNuxt repo. Public traffic is
 *         Turnstile-gated on the frontend before it ever reaches this.
 *   Body: {subject, text, replyTo?, source?}
 *   Reply: {success: true} | {success: false, error}
 *
 * Cross-site impact (per repo rule #8): additive REST route only — no SEO,
 * pricing, or checkout surface on either site is touched.
 */

if (!defined('ABSPATH')) {
    return;
}

if (!defined('PSP_CONTACT_RELAY_TO')) {
    define('PSP_CONTACT_RELAY_TO', 'info@proskatersplace.com');
}

// Safety valve: even an authenticated-but-buggy caller can't flood the inbox.
if (!defined('PSP_CONTACT_RELAY_HOURLY_CAP')) {
    define('PSP_CONTACT_RELAY_HOURLY_CAP', 30);
}

add_action('rest_api_init', function () {
    register_rest_route('psp/v1', '/contact-relay', array(
        'methods'             => 'POST',
        // Application Password Basic auth resolves the user before this runs.
        // Same credential the admin-order flow uses; browsers can never pass it.
        'permission_callback' => function () {
            return current_user_can('manage_woocommerce') || current_user_can('manage_options');
        },
        'callback'            => 'psp_contact_relay_handle',
    ));
});

function psp_contact_relay_handle(WP_REST_Request $request) {
    // sanitize_text_field strips newlines — that is the header-injection guard.
    $subject  = sanitize_text_field((string) $request->get_param('subject'));
    $text     = trim((string) $request->get_param('text'));
    $reply_to = sanitize_email((string) $request->get_param('replyTo'));
    $source   = sanitize_text_field((string) $request->get_param('source'));

    if ($subject === '' || $text === '') {
        return new WP_REST_Response(array('success' => false, 'error' => 'subject and text are required'), 400);
    }
    if (strlen($text) > 20000) {
        return new WP_REST_Response(array('success' => false, 'error' => 'message too long'), 400);
    }

    $cap_key = 'psp_contact_relay_count_' . gmdate('YmdH');
    $count   = (int) get_transient($cap_key);
    if ($count >= PSP_CONTACT_RELAY_HOURLY_CAP) {
        return new WP_REST_Response(array('success' => false, 'error' => 'hourly relay cap reached'), 429);
    }
    set_transient($cap_key, $count + 1, HOUR_IN_SECONDS);

    $headers = array();
    if ($reply_to !== '' && is_email($reply_to)) {
        $headers[] = 'Reply-To: ' . $reply_to;
    }

    $body = $text;
    if ($source !== '') {
        $body .= "\n\n--\nSubmitted via: " . $source;
    }

    // Plain text on purpose: wp_mail's default content type, no HTML-injection surface.
    $sent = wp_mail(PSP_CONTACT_RELAY_TO, $subject, $body, $headers);

    if (!$sent) {
        // Means the transport (SMTP plugin / PHP mail) rejected the hand-off —
        // check the site's SMTP plugin if this persists.
        return new WP_REST_Response(array('success' => false, 'error' => 'wp_mail returned false'), 502);
    }

    return new WP_REST_Response(array('success' => true), 200);
}
