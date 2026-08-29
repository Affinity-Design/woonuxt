<?php
/**
 * Plugin Name: PSP GraphQL Public Error Sanitizer
 * Description: Prevents WPGraphQL error responses from reflecting request variables, credentials, personal data, or debug traces.
 * Version: 1.1.0
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

    if (preg_match('/out of stock|not enough|only .* available|add that amount|quantity/', $message)) {
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
