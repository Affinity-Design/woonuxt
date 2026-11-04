<?php
/**
 * Plugin Name: PSP GraphQL Public Error Sanitizer
 * Description: Prevents WPGraphQL error responses from reflecting request variables, credentials, personal data, or debug traces.
 * Version: 1.2.1
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * True when the error says the operation is missing from the schema rather than
 * that the request data was wrong.
 *
 * Deliberately narrow: `Variable "$input" got invalid value {...}` also contains
 * "is not defined by type" and embeds submitted values (including passwords), so
 * it must never reach this branch or the log below.
 */
function psp_is_graphql_schema_mismatch($lowercased_message) {
    if (strpos($lowercased_message, 'got invalid value') !== false) {
        return false;
    }

    return (bool) preg_match('/cannot query field .* on type|unknown type|cannot represent|is not defined on type/', $lowercased_message);
}

/**
 * Classify an untrusted GraphQL error into fixed, customer-safe copy.
 * The original message is inspected only on the server and is never returned.
 */
function psp_get_safe_graphql_error_message($untrusted_message) {
    $message = strtolower((string) $untrusted_message);

    // A field the frontend depends on is absent from the schema — usually a
    // plugin deregistering it. Retrying never helps, and without this the real
    // cause is invisible to everyone. Safe to log: graphql-php's schema-
    // validation wording names types and fields, never submitted values.
    if (psp_is_graphql_schema_mismatch($message)) {
        error_log('[psp-graphql] schema mismatch: ' . substr((string) $untrusted_message, 0, 300));
        return 'This feature is temporarily unavailable. Please contact customer service.';
    }

    // WPGraphQL for eCommerce 1.0+ rejects a bad, expired or foreign woocommerce-session JWT as
    // "invalid_token: <reason>" (every 0.21.1 token fails once: 1.0.3 signs with a new key); 0.21.x
    // sent the bare reason. The storefront matches this exact copy to drop the dead session and
    // start a new one (shared/utils/wooSession.mjs SANITIZED_SESSION_TOKEN_REJECTION): keep them in
    // sync. Must precede the "session" and "not found" rules ("Customer ID not found in the token").
    if (preg_match('/^invalid_token:|^(?:failed to decode session token|customer id not found in the token|the iss do not match with this server|signature verification failed|expired token|wrong number of segments|invalid session token)$/', trim($message))) {
        return 'Your cart session expired. Refresh the page to start a new one.';
    }

    // Variable coercion (`Variable "$input" got invalid value {...}; Field "authenticate" is not defined by type ...`)
    // echoes the submitted values and can name fields like "authenticate" or "quantity", so it must be classified
    // here, before the 2FA and stock rules would match those words. Nothing ran when this error occurs.
    if (strpos($message, 'got invalid value') !== false) {
        return 'Some submitted information was invalid. Review the form and try again.';
    }

    if (preg_match('/2fa|two.?factor|authenticat|verification code|wfls/', $message)) {
        return 'A valid two-factor authentication code is required. Please try again.';
    }

    if (preg_match('/already (registered|exists)|existing_user|email address is already|username is already/', $message)) {
        return 'An account already exists for those details. Please sign in or reset your password.';
    }

    if (strpos($message, 'password') !== false && preg_match('/weak|strength|characters|minimum|too short/', $message)) {
        return 'The password does not meet the security requirements. Choose a stronger password and try again.';
    }

    if (preg_match('/invalid_username|incorrect_password|invalid credentials|unknown email|password you entered/', $message)) {
        return 'The email, username, or password is incorrect. Please try again.';
    }

    // WPGraphQL for eCommerce 1.0+ throws WooCommerce's own checkout notices as the error message.
    // Keep the actionable ones actionable without echoing the submitted address.
    if (preg_match('/\bp\.?\s?o\.?\s?box(?:es)?\b|post office box/', $message)) {
        return 'We do not ship to PO boxes. Please enter a physical street address.';
    }

    if (preg_match('/no shipping method has been selected|we do not ship|enter an address to continue/', $message)) {
        return 'Please check your shipping address and shipping method, then try again.';
    }

    if (preg_match('/out of stock|not in stock|not enough|do not have enough|only .* available|add that amount|quantity/', $message)) {
        return 'The requested quantity is not available. Update the quantity and try again.';
    }

    if (strpos($message, 'coupon') !== false) {
        return 'That coupon could not be applied. Check the code and try again.';
    }

    if (strpos($message, 'session') !== false) {
        return 'Your session expired. Refresh the page and try again.';
    }

    if (preg_match('/not authorized|unauthorized|forbidden|permission/', $message)) {
        return 'You do not have permission to complete that request.';
    }

    if (preg_match('/not found|invalid id/', $message)) {
        return 'The requested item could not be found.';
    }

    if (preg_match('/variable .*invalid value|expected type|field .* is not defined|bad user input/', $message)) {
        return 'Some submitted information was invalid. Review the form and try again.';
    }

    return 'The request could not be completed. Please try again. If the problem continues, contact customer service.';
}

function psp_sanitize_graphql_error_list($errors) {
    if (!is_array($errors)) {
        return array(array('message' => psp_get_safe_graphql_error_message($errors)));
    }

    $safe_errors = array();
    foreach ($errors as $error) {
        $untrusted_message = '';
        if (is_array($error) && isset($error['message'])) {
            $untrusted_message = $error['message'];
        } elseif (is_object($error) && method_exists($error, 'getMessage')) {
            $untrusted_message = $error->getMessage();
        } elseif (is_string($error)) {
            $untrusted_message = $error;
        }

        $safe_errors[] = array('message' => psp_get_safe_graphql_error_message($untrusted_message));
    }

    return $safe_errors;
}

function psp_graphql_response_is_list($value) {
    if (!is_array($value)) {
        return false;
    }

    if (function_exists('array_is_list')) {
        return array_is_list($value);
    }

    return $value === array_values($value);
}

function psp_sanitize_graphql_response($response) {
    if (is_object($response) && method_exists($response, 'toArray')) {
        $response = $response->toArray();
    }

    if (!is_array($response)) {
        return array(
            'errors' => array(
                array('message' => 'The request could not be completed. Please try again.'),
            ),
        );
    }

    // Be defensive if a WPGraphQL version passes a batch response through this filter.
    if (!array_key_exists('data', $response) && !array_key_exists('errors', $response) && psp_graphql_response_is_list($response)) {
        return array_map('psp_sanitize_graphql_response', $response);
    }

    if (array_key_exists('errors', $response)) {
        $response['errors'] = psp_sanitize_graphql_error_list($response['errors']);
    }

    // Debug extensions can contain exception messages, stack traces, or request context.
    if (isset($response['extensions']) && is_array($response['extensions'])) {
        unset($response['extensions']['debug']);
        if (empty($response['extensions'])) {
            unset($response['extensions']);
        }
    }

    return $response;
}

add_filter('graphql_request_results', 'psp_sanitize_graphql_response', PHP_INT_MAX, 1);

add_filter('graphql_http_request_response_errors', function($errors) {
    return psp_sanitize_graphql_error_list($errors);
}, PHP_INT_MAX, 1);

add_filter('graphql_debug_enabled', function($debug_enabled) {
    return wp_get_environment_type() === 'production' ? false : $debug_enabled;
}, PHP_INT_MAX, 1);

add_filter('graphql_debug_logs_enabled', function($debug_enabled) {
    return wp_get_environment_type() === 'production' ? false : $debug_enabled;
}, PHP_INT_MAX, 1);
