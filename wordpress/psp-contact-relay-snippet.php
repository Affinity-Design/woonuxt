<?php
/**
 * PSP Contact Relay — v1.1.1 (2026-08-05)
 *   v1.1.1: length cap counts characters (mb_strlen), not bytes — long
 *           CJK/Cyrillic messages passed the frontend's 10k-char cap but
 *           tripped the old 20k-BYTE check here.
 *
 * ============================ PASTE RULES ============================
 * v1.0.0 bricked prod (saved twice -> "Cannot redeclare" fatal). Rules:
 *   1. Code Snippets -> Add New -> paste as ONE new snippet, ONCE.
 *      Check the snippets list first — if "psp.ca email relay" already
 *      exists, EDIT that one instead of adding another.
 *   2. If the editor shows the opening `<?php` line after pasting,
 *      DELETE that line (the snippet editor is already in PHP mode).
 *   3. Scope: "Run snippet everywhere" (REST API runs outside wp-admin).
 *   4. Test on the TEST WordPress first, then production.
 *
 * v1.1.0 is also defensive: no named functions (closures cannot collide),
 * guarded defines, duplicate route registration is harmless — so even a
 * double paste cannot fatal the site again.
 * =====================================================================
 *
 * Purpose: lets the headless .ca frontend deliver store-to-self email
 * through this site's wp_mail() transport (same pipe as WooCommerce
 * order emails). Cloudflare Email Service is blocked by account-role
 * permissions and SendGrid is down — WordPress is the mail path we
 * fully control.
 *
 * Contract:
 *   POST /wp-json/psp/v1/contact-relay
 *   Auth: Application Password (Basic) — server-to-server only; caller
 *         is server/utils/emailSender.ts in the WooNuxt repo. Public
 *         traffic is Turnstile-gated on the frontend before this.
 *   Body: {subject, text, replyTo?, source?}
 *   Reply: {success: true} | {success: false, error}
 *
 * Cross-site impact (repo rule #8): additive REST route only — no SEO,
 * pricing, or checkout surface on either site is touched.
 */

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
        'callback'            => function (WP_REST_Request $request) {
            // sanitize_text_field strips newlines — the header-injection guard.
            $subject  = sanitize_text_field((string) $request->get_param('subject'));
            $text     = trim((string) $request->get_param('text'));
            $reply_to = sanitize_email((string) $request->get_param('replyTo'));
            $source   = sanitize_text_field((string) $request->get_param('source'));

            if ($subject === '' || $text === '') {
                return new WP_REST_Response(array('success' => false, 'error' => 'subject and text are required'), 400);
            }
            // Characters, not bytes — the frontend caps at 10k chars, and CJK text
            // is 3 bytes/char in UTF-8, so a byte-based cap would reject messages
            // the form already accepted.
            $text_length = function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
            if ($text_length > 20000) {
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

            // Plain text on purpose: wp_mail's default content type, no
            // HTML-injection surface.
            $sent = wp_mail(PSP_CONTACT_RELAY_TO, $subject, $body, $headers);

            if (!$sent) {
                // The transport (SMTP plugin / PHP mail) rejected the hand-off —
                // check the site's SMTP plugin if this persists.
                return new WP_REST_Response(array('success' => false, 'error' => 'wp_mail returned false'), 502);
            }

            return new WP_REST_Response(array('success' => true), 200);
        },
    ));
});
